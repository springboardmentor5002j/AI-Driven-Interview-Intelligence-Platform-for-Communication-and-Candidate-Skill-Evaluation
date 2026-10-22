import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";

const SECONDS_PER_QUESTION = 90;

function getSupportedVideoMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const types = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function getSupportedAudioMimeType() {
  if (typeof MediaRecorder === "undefined") return "";

  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];

  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

/**
 * Stop a MediaRecorder and wait for its final dataavailable/stop events.
 */
function stopRecorder(recorder, chunksRef, fallbackType) {
  if (!recorder) {
    return Promise.resolve(
      new Blob([], { type: fallbackType })
    );
  }

  if (recorder.state === "inactive") {
    return Promise.resolve(
      new Blob(chunksRef.current, {
        type: recorder.mimeType || fallbackType,
      })
    );
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      recorder.removeEventListener("stop", onStop);
      recorder.removeEventListener("error", onError);
    };

    const onStop = () => {
      cleanup();

      resolve(
        new Blob(chunksRef.current, {
          type: recorder.mimeType || fallbackType,
        })
      );
    };

    const onError = (event) => {
      cleanup();
      reject(event.error || new Error("Recording failed."));
    };

    recorder.addEventListener("stop", onStop, { once: true });
    recorder.addEventListener("error", onError, { once: true });

    try {
      recorder.stop();
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export default function InterviewRoom() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [permissionError, setPermissionError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(SECONDS_PER_QUESTION);
  const [phase, setPhase] = useState("loading");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const videoRef = useRef(null);
  const motionCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const motionRef = useRef({
    sampleCount: 0, motionFrameCount: 0, totalDelta: 0, previous: null,
  });

  // Combined camera + microphone recording.
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  // Separate microphone recording for speech analysis.
  const audioRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const timerRef = useRef(null);
  const timerDeadlineRef = useRef(0);
  const finishingRef = useRef(false);
  const phaseRef = useRef("loading");
  const indexRef = useRef(0);
  const sessionRef = useRef(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Lightweight motion detection stays in the browser: only aggregate frame-difference
  // statistics are sent to the backend, never webcam frames. It is observational only.
  useEffect(() => {
    if (phase !== "recording") return undefined;
    const video = videoRef.current;
    const canvas = motionCanvasRef.current;
    const context = canvas?.getContext("2d", { willReadFrequently: true });
    if (!video || !canvas || !context) return undefined;
    canvas.width = 80;
    canvas.height = 45;
    const timer = window.setInterval(() => {
      if (video.readyState < 2 || video.videoWidth === 0) return;
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const gray = new Uint8Array(canvas.width * canvas.height);
        for (let i = 0, j = 0; i < pixels.length; i += 4, j += 1) {
          gray[j] = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
        }
        const state = motionRef.current;
        state.sampleCount += 1;
        if (state.previous) {
          let delta = 0;
          for (let i = 0; i < gray.length; i += 1) delta += Math.abs(gray[i] - state.previous[i]);
          const mean = delta / gray.length;
          state.totalDelta += mean;
          if (mean >= 5) state.motionFrameCount += 1;
        }
        state.previous = gray;
      } catch (motionError) {
        // Motion monitoring is optional; a camera/browser restriction must not stop an interview.
        console.debug("Motion sampling skipped:", motionError);
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Load interview details and questions.
  useEffect(() => {
    let cancelled = false;

    async function loadInterview() {
      try {
        const response = await api.get(`/interviews/${id}/`);

        if (!cancelled) {
          setSession(response.data);
        }
      } catch (err) {
        console.error("Could not load interview:", err);

        if (!cancelled) {
          setError("Could not load this interview.");
        }
      }
    }

    loadInterview();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Initialize the camera and microphone.
  useEffect(() => {
    if (!session) return undefined;

    let cancelled = false;

    async function initializeMedia() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error(
            "Camera access is unavailable. Use localhost or HTTPS."
          );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }

        const audioTracks = stream.getAudioTracks();

        if (!audioTracks.length) {
          setPermissionError(
            "No microphone was detected. Check your browser's microphone permissions."
          );
        } else {
          console.log(
            "Microphone initialized:",
            audioTracks.map((track) => ({
              label: track.label,
              enabled: track.enabled,
              muted: track.muted,
              state: track.readyState,
            }))
          );
        }

        setPhase("ready");
      } catch (err) {
        console.error("Media initialization failed:", err);

        if (!cancelled) {
          setPermissionError(
            err.message ||
              "Camera or microphone access failed. Check browser permissions."
          );
        }
      }
    }

    initializeMedia();

    return () => {
      cancelled = true;

      clearInterval(timerRef.current);
      window.speechSynthesis?.cancel();

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [session]);

  // Speak interview questions aloud.
  const speakQuestion = useCallback((text) => {
    if (!("speechSynthesis" in window)) {
      setError(
        "Speech synthesis is not supported in this browser. You can still read the questions."
      );
      return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);

    utterance.onerror = (event) => {
      console.error("Question speech error:", event.error);
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  // Start video and audio recordings independently.
  const startRecording = useCallback(() => {
    const stream = streamRef.current;

    if (!stream || !stream.active) {
      throw new Error("Camera and microphone are not available.");
    }

    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder is not supported by this browser.");
    }

    const videoTrack = stream
      .getVideoTracks()
      .find((track) => track.readyState === "live" && track.enabled);

    const audioTrack = stream
      .getAudioTracks()
      .find((track) => track.readyState === "live" && track.enabled);

    if (!videoTrack) {
      throw new Error(
        "No active camera track was found. Check camera permissions."
      );
    }

    if (!audioTrack) {
      throw new Error(
        "No active microphone track was found. Check microphone permissions."
      );
    }

    // Reset the previous recording data.
    chunksRef.current = [];
    audioChunksRef.current = [];

    const videoMimeType = getSupportedVideoMimeType();

    const videoRecorder = new MediaRecorder(
      stream,
      videoMimeType ? { mimeType: videoMimeType } : undefined
    );

    videoRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    videoRecorder.onerror = (event) => {
      console.error("Video recorder error:", event.error);
      setError("An error occurred while recording video.");
    };

    const audioStream = new MediaStream([audioTrack]);
    const audioMimeType = getSupportedAudioMimeType();

    const audioRecorder = new MediaRecorder(
      audioStream,
      audioMimeType ? { mimeType: audioMimeType } : undefined
    );

    audioRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    audioRecorder.onerror = (event) => {
      console.error("Audio recorder error:", event.error);
      setError("An error occurred while recording microphone audio.");
    };

    mediaRecorderRef.current = videoRecorder;
    audioRecorderRef.current = audioRecorder;

    try {
      videoRecorder.start(1000);
      audioRecorder.start(1000);

      console.log("Video recording started:", videoRecorder.mimeType);
      console.log("Audio recording started:", audioRecorder.mimeType);
    } catch (err) {
      if (videoRecorder.state !== "inactive") {
        videoRecorder.stop();
      }

      if (audioRecorder.state !== "inactive") {
        audioRecorder.stop();
      }

      throw err;
    }
  }, []);

  // Stop both recorders and collect their final data.
  const stopRecording = useCallback(async () => {
    const videoRecorder = mediaRecorderRef.current;
    const audioRecorder = audioRecorderRef.current;

    const [videoBlob, audioBlob] = await Promise.all([
      stopRecorder(videoRecorder, chunksRef, "video/webm"),
      stopRecorder(audioRecorder, audioChunksRef, "audio/webm"),
    ]);

    console.log("Final video recording size:", videoBlob.size);
    console.log("Final audio recording size:", audioBlob.size);

    if (!videoBlob.size) {
      throw new Error(
        "The video recording is empty. Please try the interview again."
      );
    }

    if (!audioBlob.size) {
      throw new Error(
        "The microphone recording is empty. Check your microphone permissions and try again."
      );
    }

    return { videoBlob, audioBlob };
  }, []);

  // Upload both files before asking Django to complete the interview.
  const finishInterview = useCallback(async () => {
    if (finishingRef.current) return;

    finishingRef.current = true;
    phaseRef.current = "submitting";

    clearInterval(timerRef.current);
    window.speechSynthesis?.cancel();

    setIsSpeaking(false);
    setError("");
    setPhase("submitting");

    try {
      const { videoBlob, audioBlob } = await stopRecording();

      const videoType =
        videoBlob.type ||
        mediaRecorderRef.current?.mimeType ||
        "video/webm";

      const audioType =
        audioBlob.type ||
        audioRecorderRef.current?.mimeType ||
        "audio/webm";

      const videoExtension = videoType.includes("mp4")
        ? "mp4"
        : "webm";

      const audioExtension = audioType.includes("ogg")
        ? "ogg"
        : "webm";

      const formData = new FormData();

      formData.append(
        "recording",
        videoBlob,
        `interview-${id}.${videoExtension}`
      );

      formData.append(
        "audio_recording",
        audioBlob,
        `interview-${id}-audio.${audioExtension}`
      );

      console.log("Uploading recordings:", {
        videoSize: videoBlob.size,
        videoType,
        audioSize: audioBlob.size,
        audioType,
      });

      // Send only aggregate motion counts; raw frames remain in the recording upload.
      const motion = motionRef.current;
      if (motion.sampleCount > 1) {
        try {
          await api.post(`/interviews/${id}/motion-metrics/`, {
            sample_count: motion.sampleCount,
            motion_frame_count: motion.motionFrameCount,
            motion_ratio: motion.motionFrameCount / Math.max(1, motion.sampleCount - 1),
            mean_delta: motion.totalDelta / Math.max(1, motion.sampleCount - 1),
          });
        } catch (motionError) {
          console.warn("Motion summary could not be saved; continuing interview completion.", motionError);
        }
      }

      // Do not manually set Content-Type here.
      // Axios/browser needs to add the multipart boundary.
      const uploadResponse = await api.post(
        `/interviews/${id}/upload-recording/`,
        formData
      );

      console.log("Upload response:", uploadResponse.data);

      const completeResponse = await api.post(
        `/interviews/${id}/complete/`
      );

      console.log("Interview analysis response:", completeResponse.data);

      phaseRef.current = "done";
      setPhase("done");
    } catch (err) {
      console.error("Interview completion failed:", err);

      phaseRef.current = "recording";
      setPhase("recording");

      setError(
        err.response?.data?.detail ||
          err.message ||
          "Could not save the interview. Please try again."
      );

      finishingRef.current = false;
    } finally {
      if (phaseRef.current === "done") {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [id, stopRecording]);

  // Start or reset the question timer. Side effects happen in the interval,
  // not inside a React state updater (which StrictMode may invoke twice).
  const startQuestionTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerDeadlineRef.current = Date.now() + SECONDS_PER_QUESTION * 1000;
    setTimeLeft(SECONDS_PER_QUESTION);

    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((timerDeadlineRef.current - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining > 0) return;

      clearInterval(timerRef.current);
      if (phaseRef.current !== "recording") return;
      const currentSession = sessionRef.current;
      const nextIndex = indexRef.current + 1;
      if (currentSession && nextIndex < currentSession.questions.length) {
        indexRef.current = nextIndex;
        setCurrentIndex(nextIndex);
        speakQuestion(currentSession.questions[nextIndex].question_text);
        startQuestionTimer();
      } else {
        finishInterview();
      }
    }, 250);
  }, [finishInterview, speakQuestion]);

  // Begin the interview.
  const startInterview = async () => {
    if (phaseRef.current !== "ready") return;

    try {
      setError("");

      const stream = streamRef.current;

      if (
        !stream ||
        !stream.getAudioTracks().some(
          (track) =>
            track.readyState === "live" &&
            track.enabled &&
            !track.muted
        )
      ) {
        throw new Error(
          "The microphone is not active. Check browser permissions and try again."
        );
      }

      await api.post(`/interviews/${id}/start/`);

      motionRef.current = { sampleCount: 0, motionFrameCount: 0, totalDelta: 0, previous: null };
      startRecording();

      indexRef.current = 0;
      setCurrentIndex(0);

      phaseRef.current = "recording";
      setPhase("recording");

      const currentSession = sessionRef.current;

      if (currentSession?.questions?.length) {
        speakQuestion(currentSession.questions[0].question_text);
      }

      startQuestionTimer();
    } catch (err) {
      console.error("Could not start interview:", err);
      setError(err.message || "Could not start the interview.");
    }
  };

  // Move to the next question or finish.
  const goToNextQuestion = () => {
    if (phaseRef.current !== "recording") return;

    const currentSession = sessionRef.current;
    const nextIndex = indexRef.current + 1;

    window.speechSynthesis?.cancel();
    setIsSpeaking(false);

    if (!currentSession || nextIndex >= currentSession.questions.length) {
      finishInterview();
      return;
    }

    clearInterval(timerRef.current);

    indexRef.current = nextIndex;
    setCurrentIndex(nextIndex);

    speakQuestion(currentSession.questions[nextIndex].question_text);
    startQuestionTimer();
  };

  if (error && phase === "loading") {
    return <div className="page error-text">{error}</div>;
  }

  if (!session) {
    return <div className="page">Loading interview...</div>;
  }

  return (
    <div className="page" style={{ maxWidth: 800 }}>
      <Link to="/dashboard" className="back-link">
        &larr; Back to Dashboard
      </Link>

      <h2>
        {session.interview_type.toUpperCase()} Interview —{" "}
        {session.difficulty}
      </h2>

      {permissionError && (
        <div className="card error-text">{permissionError}</div>
      )}

      {error && (
        <div className="card error-text" role="alert">
          {error}
        </div>
      )}

      <div className="card">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{
            width: "100%",
            borderRadius: 8,
            background: "#000",
          }}
        />
        <canvas ref={motionCanvasRef} aria-hidden="true" style={{ display: "none" }} />
      </div>

      {phase === "ready" && (
        <div className="card">
          <p>
            Your camera and microphone are ready. There are{" "}
            {session.questions.length} questions, with{" "}
            {SECONDS_PER_QUESTION} seconds per question.
          </p>

          <p>The interviewer will read each question aloud.</p>
          <p className="muted">Optional motion monitoring compares low-resolution frames locally. Only aggregate motion statistics are saved; they do not affect your score.</p>

          <button onClick={startInterview}>
            Start Interview
          </button>
        </div>
      )}

      {phase === "recording" && (
        <div className="card">
          <p className="muted">
            Question {currentIndex + 1} of {session.questions.length} —{" "}
            {timeLeft}s left
          </p>

          <h3>
            {session.questions[currentIndex]?.question_text}
          </h3>

          <p className="muted">
            {isSpeaking
              ? "Interviewer is speaking..."
              : "Your camera and microphone are recording your answer."}
          </p>

          <button
            onClick={() =>
              speakQuestion(
                session.questions[currentIndex].question_text
              )
            }
          >
            Repeat Question
          </button>

          {" "}

          <button onClick={goToNextQuestion}>
            {currentIndex === session.questions.length - 1
              ? "Finish Interview"
              : "Next Question"}
          </button>
        </div>
      )}

      {phase === "submitting" && (
        <div className="card">
          <p>
            Saving your interview recordings and running AI analysis.
            This may take a minute.
          </p>
        </div>
      )}

      {phase === "done" && (
        <div className="card">
          <p>
            Interview recordings uploaded and completion request sent.
            Check the summary for speech-analysis results.
          </p>

          <button onClick={() => navigate(`/interviews/${id}`)}>
            View Interview Summary
          </button>
        </div>
      )}
    </div>
  );
}