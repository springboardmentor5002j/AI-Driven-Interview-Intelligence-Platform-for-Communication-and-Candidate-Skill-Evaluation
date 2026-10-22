import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { completeInterview, evaluateInterview, getInterviewQuestions, startInterview, submitAnswer, uploadAnswerAudio } from "../services/interviewApi";
import PreInterviewSetup from "../components/PreInterviewSetup";

function statusForDeviceError(error) {
  if (["NotAllowedError", "SecurityError"].includes(error?.name)) return "denied";
  if (error?.name === "NotFoundError") return "unavailable";
  return "error";
}

function deviceErrorText(label, status, error) {
  if (status === "denied") return `${label} permission was denied.`;
  if (status === "unavailable") return `No ${label.toLowerCase()} was detected. Please connect one and try again.`;
  if (error?.name === "NotReadableError") return `${label} could not be used. It may already be in use by another app.`;
  if (error?.name === "OverconstrainedError") return `${label} does not support the requested settings.`;
  return `${label} could not be started. Check the device and browser permissions, then try again.`;
}

function DeviceIndicator({ label, status }) {
  return <div className="active-device-indicator">
    <span className={`active-device-dot${status === "connected" ? " is-active" : ""}`} aria-hidden="true" />
    <span>{label}</span><strong>{status === "connected" ? "Active" : "Unavailable"}</strong>
  </div>;
}

function Interview() {
  const { interviewId } = useParams();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answers, setAnswers] = useState({});
  const [interviewType, setInterviewType] = useState("Mock");
  const [stage, setStage] = useState("setup");
  const [starting, setStarting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [mediaStream, setMediaStream] = useState(null);
  const [cameraStatus, setCameraStatus] = useState("required");
  const [microphoneStatus, setMicrophoneStatus] = useState("required");
  const [microphoneLevel, setMicrophoneLevel] = useState(0);
  const [mediaError, setMediaError] = useState("");
  const [speechAnalyses, setSpeechAnalyses] = useState({});
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const recorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);
  const recordedDurationRef = useRef(0);
  const recordedUrlRef = useRef("");
  const videoRef = useRef(null);
  const mediaRef = useRef(null);
  const audioContextRef = useRef(null);
  const animationRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!startedAt) return undefined;
    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    mediaRef.current = mediaStream;
    if (videoRef.current) videoRef.current.srcObject = mediaStream;
  }, [mediaStream, stage]);

  useEffect(() => {
    const audioTracks = mediaStream?.getAudioTracks().filter((track) => track.readyState === "live") || [];
    if (!audioTracks.length) return undefined;
    let context;
    let source;
    let analyser;
    let running = true;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return undefined;
      context = new AudioContextClass();
      audioContextRef.current = context;
      source = context.createMediaStreamSource(new MediaStream(audioTracks));
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const sampleLevel = () => {
        if (!running) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        setMicrophoneLevel(Math.min(100, Math.round(Math.sqrt(sum / samples.length) * 360)));
        animationRef.current = window.requestAnimationFrame(sampleLevel);
      };
      context.resume().then(() => { if (running) sampleLevel(); }).catch(() => {});
    } catch { /* Audio level analysis is optional; keep the granted microphone track. */ }
    return () => {
      running = false;
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      try { source?.disconnect(); } catch { /* already disconnected */ }
      try { analyser?.disconnect(); } catch { /* already disconnected */ }
      if (context && context.state !== "closed") context.close().catch(() => {});
      if (audioContextRef.current === context) audioContextRef.current = null;
    };
  }, [mediaStream]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        recorderRef.current.ondataavailable = null;
        if (recorderRef.current.state === "recording") recorderRef.current.stop();
      }
      if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current);
      if (animationRef.current) window.cancelAnimationFrame(animationRef.current);
      mediaRef.current?.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current && audioContextRef.current.state !== "closed") audioContextRef.current.close().catch(() => {});
    };
  }, []);

  const currentQuestion = questions[currentIndex];
  const progress = questions.length ? ((currentIndex + 1) / questions.length) * 100 : 0;
  const wordCount = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const savedCount = Object.values(answers).filter((value) => value?.trim()).length;

  const stopMedia = () => {
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    setMediaStream(null);
    setMicrophoneLevel(0);
  };

  const clearRecordedAudio = () => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    recordedUrlRef.current = "";
    setRecordedUrl("");
    setRecordedBlob(null);
    setRecordingSeconds(0);
  };

  const startRecording = () => {
    const audioTracks = mediaRef.current?.getAudioTracks().filter((track) => track.readyState === "live") || [];
    if (!audioTracks.length || !window.MediaRecorder) {
      setError("Audio recording is unavailable. Please type your answer instead.");
      return;
    }
    clearRecordedAudio();
    setError("");
    audioChunksRef.current = [];
    try {
      const stream = new MediaStream(audioTracks);
      const preferredType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = preferredType ? new MediaRecorder(stream, { mimeType: preferredType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => { if (event.data?.size) audioChunksRef.current.push(event.data); };
      recorder.onerror = () => { setRecording(false); setError("Recording failed. Please try again or type your answer."); };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size) {
          recordedDurationRef.current = duration;
          setRecordingSeconds(duration);
          setRecordedBlob(blob);
          const url = URL.createObjectURL(blob);
          recordedUrlRef.current = url;
          setRecordedUrl(url);
        } else setError("No audio was captured. Check your microphone and try again.");
        setRecording(false);
      };
      recorder.start(250);
      setRecording(true);
      setRecordingSeconds(0);
    } catch {
      setError("This browser could not start audio recording. You can type your answer instead.");
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  useEffect(() => {
    if (!recording) return undefined;
    const timerId = window.setInterval(() => {
      const duration = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
      setRecordingSeconds(duration);
      if (duration >= 600) stopRecording();
    }, 500);
    return () => window.clearInterval(timerId);
  }, [recording]);

  const uploadRecording = async () => {
    if (!recordedBlob || !currentQuestion) return;
    setUploadingAudio(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const result = await uploadAnswerAudio(interviewId, currentQuestion.id, recordedBlob, recordedDurationRef.current, token);
      const transcript = result.analysis;
      handleAnswerChange(result.answer_text);
      setSpeechAnalyses((existing) => ({ ...existing, [currentQuestion.id]: transcript }));
      clearRecordedAudio();
    } catch (err) {
      setError(`${err.message} Your recording is still available to retry.`);
    } finally {
      setUploadingAudio(false);
    }
  };

  const testDevices = async () => {
    setMediaError("");
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("error");
      setMicrophoneStatus("error");
      setMediaError("Camera and microphone access is unavailable here. Open this page in a supported browser over HTTPS or localhost.");
      return;
    }

    setTesting(true);
    stopMedia();
    setCameraStatus("required");
    setMicrophoneStatus("required");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      mediaRef.current = stream;
      setMediaStream(stream);
      setCameraStatus(stream.getVideoTracks().some((track) => track.readyState === "live") ? "connected" : "error");
      setMicrophoneStatus(stream.getAudioTracks().some((track) => track.readyState === "live") ? "connected" : "error");
      if (!stream.getVideoTracks().length || !stream.getAudioTracks().length) setMediaError("Both a working camera and microphone are needed to start.");
    } catch {
      if (!mountedRef.current) return;
      // Recheck separately so a working device remains available if the other device is missing or denied.
      const [cameraResult, microphoneResult] = await Promise.allSettled([
        navigator.mediaDevices.getUserMedia({ video: true, audio: false }),
        navigator.mediaDevices.getUserMedia({ video: false, audio: true }),
      ]);
      if (!mountedRef.current) {
        for (const result of [cameraResult, microphoneResult]) {
          if (result.status === "fulfilled") result.value.getTracks().forEach((track) => track.stop());
        }
        return;
      }
      const cameraOk = cameraResult.status === "fulfilled";
      const microphoneOk = microphoneResult.status === "fulfilled";
      const cameraError = cameraOk ? null : cameraResult.reason;
      const microphoneError = microphoneOk ? null : microphoneResult.reason;
      const tracks = [
        ...(cameraOk ? cameraResult.value.getVideoTracks() : []),
        ...(microphoneOk ? microphoneResult.value.getAudioTracks() : []),
      ];
      if (tracks.length) {
        const stream = new MediaStream(tracks);
        mediaRef.current = stream;
        setMediaStream(stream);
      }
      const cameraState = cameraOk ? "connected" : statusForDeviceError(cameraError);
      const microphoneState = microphoneOk ? "connected" : statusForDeviceError(microphoneError);
      setCameraStatus(cameraState);
      setMicrophoneStatus(microphoneState);
      const messages = [];
      if (!cameraOk) messages.push(deviceErrorText("Camera", cameraState, cameraError));
      if (!microphoneOk) messages.push(cameraOk
        ? "Microphone unavailable. Voice recording is optional; you can type your answers."
        : deviceErrorText("Microphone", microphoneState, microphoneError));
      if (cameraState === "denied") messages.push("Allow camera access in your browser settings to continue.");
      setMediaError(messages.join(" "));
    } finally {
      if (mountedRef.current) setTesting(false);
    }
  };

  const canStart = cameraStatus === "connected" && (microphoneStatus === "connected" || microphoneStatus !== "required")
    && mediaStream?.getVideoTracks().some((track) => track.readyState === "live")
    && (microphoneStatus !== "connected" || mediaStream?.getAudioTracks().some((track) => track.readyState === "live"));

  const beginInterview = async () => {
    if (!canStart) return;
    setStarting(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      await startInterview(interviewId, token);
      const data = await getInterviewQuestions(interviewId, token);
      if (!data.questions?.length) throw new Error("No questions found for this interview");
      const storageKey = `smarthire-interview-${interviewId}`;
      let localAnswers = {};
      try { localAnswers = JSON.parse(localStorage.getItem(storageKey) || "{}"); } catch { localAnswers = {}; }
      const savedAnswers = {};
      for (const question of data.questions) savedAnswers[question.id] = localAnswers[question.id] ?? question.answer_text ?? "";
      setAnswers(savedAnswers);
      setSpeechAnalyses(Object.fromEntries(data.questions.filter((question) => question.communication_analysis?.source === "speech").map((question) => [question.id, question.communication_analysis])));
      setQuestions(data.questions);
      setAnswer(savedAnswers[data.questions[0].id] || "");
      setInterviewType(data.interview_type || "Mock");
      const localStart = localStorage.getItem(`${storageKey}-started`);
      const start = data.started_at || localStart || new Date().toISOString();
      if (!data.started_at && !localStart) localStorage.setItem(`${storageKey}-started`, start);
      setStartedAt(start);
      setStage("interview");
    } catch (err) { setError(err.message); }
    finally { setStarting(false); }
  };

  const handleAnswerChange = (value) => {
    setAnswer(value);
    setError("");
    const updated = { ...answers, [currentQuestion.id]: value };
    setAnswers(updated);
    localStorage.setItem(`smarthire-interview-${interviewId}`, JSON.stringify(updated));
    setSpeechAnalyses((existing) => {
      const next = { ...existing };
      delete next[currentQuestion.id];
      return next;
    });
  };

  const handleNext = async () => {
    if (!answer.trim()) { setError("Please enter an answer before continuing."); return; }
    setError("");
    setSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      const updatedAnswers = { ...answers, [currentQuestion.id]: answer };
      setAnswers(updatedAnswers);
      localStorage.setItem(`smarthire-interview-${interviewId}`, JSON.stringify(updatedAnswers));
      if (speechAnalyses[currentQuestion.id]?.source !== "speech") {
        await submitAnswer(interviewId, currentQuestion.id, answer, token);
      }
      if (currentIndex < questions.length - 1) {
        const nextQuestion = questions[currentIndex + 1];
        setCurrentIndex(currentIndex + 1);
        setAnswer(updatedAnswers[nextQuestion.id] || "");
        clearRecordedAudio();
      } else {
        await completeInterview(interviewId, token);
        await evaluateInterview(interviewId, token);
        localStorage.removeItem(`smarthire-interview-${interviewId}`);
        localStorage.removeItem(`smarthire-interview-${interviewId}-started`);
        stopMedia();
        setStage("completed");
      }
    } catch (err) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const handlePrevious = () => {
    if (currentIndex === 0) return;
    const previousQuestion = questions[currentIndex - 1];
    setCurrentIndex(currentIndex - 1);
    setAnswer(answers[previousQuestion.id] || "");
    clearRecordedAudio();
    setError("");
  };

  const timer = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  if (stage === "setup") return <PreInterviewSetup
    videoRef={videoRef}
    cameraStatus={cameraStatus}
    microphoneStatus={microphoneStatus}
    microphoneLevel={microphoneLevel}
    mediaError={mediaError || error}
    testing={testing}
    starting={starting}
    canStart={Boolean(canStart)}
    onTestDevices={testDevices}
    onStartInterview={beginInterview}
  />;
  if (stage === "completed") return <main className="page-shell"><section className="card empty-state"><span className="empty-icon" aria-hidden="true">✓</span><h2>Interview completed</h2><p className="muted">You answered all {questions.length} questions. Your assessment is ready.</p><div className="result-actions"><button className="button" onClick={() => navigate(`/interview-result/${interviewId}`)}>View Result</button><button className="button button-secondary" onClick={() => navigate("/my-interviews")}>Back to My Interviews</button></div></section></main>;
  if (!currentQuestion) return <main className="page-shell"><section className="card empty-state">No question available.</section></main>;

  return <main className="page-shell interview-shell">
    <div className="interview-topline">
      <div><p className="eyebrow">Interview room</p><h1>{interviewType} Interview</h1><p className="page-subtitle">Take your time and give a clear, complete answer.</p></div>
      <div className="question-count">Question <strong>{currentIndex + 1}</strong> of {questions.length}</div>
    </div>
    <div className="interview-progress" role="progressbar" aria-label="Interview progress" aria-valuemin="0" aria-valuemax={questions.length} aria-valuenow={currentIndex + 1}><span style={{ width: `${progress}%` }} /></div>

    <div className="interview-layout">
      <section className="card question-card interview-main">
        <p className="question-kicker">QUESTION {currentQuestion.question_number}</p>
        <h2 className="question-title">{currentQuestion.question_text}</h2>
        <div className="field"><label htmlFor="answer">Your answer</label><textarea id="answer" value={answer} onChange={(event) => handleAnswerChange(event.target.value)} placeholder="Share your answer here. Include specific examples where you can." rows={10} disabled={submitting} /></div>
        <div className="answer-footer"><span>{wordCount} {wordCount === 1 ? "word" : "words"}</span><span>Answers save as you type</span></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <section className="card speech-answer-card" aria-label="Voice answer recording">
          <div className="speech-answer-heading"><div><p className="eyebrow">Optional voice answer</p><h3>Record a spoken response</h3><p className="muted small">Audio is kept locally until you upload it for transcription (15 MB limit, 10 minutes max).</p></div><span className={`recording-state${recording ? " is-recording" : ""}`}>{recording ? "Recording" : recordedBlob ? "Ready to submit" : "Not recording"}</span></div>
          {microphoneStatus !== "connected" || !window.MediaRecorder ? <p className="muted small">Voice recording is unavailable in this browser or microphone session. Type your answer above to continue.</p> : <>
            {recording && <p className="recording-clock" aria-live="polite">● {String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:{String(recordingSeconds % 60).padStart(2, "0")} <span>Recording…</span></p>}
            <div className="speech-actions">
              {!recording ? <button type="button" className="button button-secondary" onClick={startRecording} disabled={submitting || uploadingAudio}>{recordedBlob ? "Record again" : "Start recording"}</button> : <button type="button" className="button button-danger" onClick={stopRecording}>Stop recording</button>}
              {recordedBlob && <><audio controls src={recordedUrl} aria-label="Recorded answer playback" /><button type="button" className="button button-secondary" onClick={clearRecordedAudio} disabled={uploadingAudio}>Discard</button><button type="button" className="button" onClick={uploadRecording} disabled={uploadingAudio || submitting}>{uploadingAudio ? <><span className="button-spinner" aria-hidden="true" />Uploading & transcribing…</> : "Upload & transcribe"}</button></>}
            </div>
          </>}
          {speechAnalyses[currentQuestion.id]?.source === "speech" && <div className="transcript-preview"><strong>Transcription saved</strong><p>{speechAnalyses[currentQuestion.id].transcript}</p><span>{speechAnalyses[currentQuestion.id].word_count} words · {speechAnalyses[currentQuestion.id].filler_count} filler words · {speechAnalyses[currentQuestion.id].speaking_rate_wpm ?? "—"} WPM</span></div>}
        </section>
        <div className="room-actions">
          <button className="button button-secondary" onClick={handlePrevious} disabled={currentIndex === 0 || submitting || uploadingAudio || recording || Boolean(recordedBlob)}>Previous</button>
          <button className="button" onClick={handleNext} disabled={submitting || uploadingAudio || recording || Boolean(recordedBlob)}>{submitting ? <><span className="button-spinner" aria-hidden="true" />Saving…</> : currentIndex === questions.length - 1 ? "Submit Interview" : "Next Question"}</button>
        </div>
      </section>

      <aside className="interview-sidebar">
        <section className="card room-sidebar-card">
          <p className="eyebrow">Session timer</p><div className="room-clock" aria-live="off">{timer}</div><p className="muted small">Elapsed time</p>
        </section>
        <section className="card room-sidebar-card">
          <h3>Device status</h3>
          <div className="active-device-list">
            <DeviceIndicator label="Camera" status={cameraStatus} />
            <DeviceIndicator label="Microphone" status={microphoneStatus} />
          </div>
          <video ref={videoRef} autoPlay playsInline muted className="camera-preview" aria-label="Camera preview" />
        </section>
        <section className="card room-sidebar-card session-progress-card">
          <h3>Your progress</h3><p><strong>{savedCount}</strong> of {questions.length} answers drafted</p><div className="score-track"><span style={{ width: `${questions.length ? savedCount / questions.length * 100 : 0}%` }} /></div><p className="muted small">Your work is saved on this device while you practice.</p>
        </section>
      </aside>
    </div>
  </main>;
}

export default Interview;
