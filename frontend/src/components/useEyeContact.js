import { useCallback, useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const SAMPLE_MS = 200; // ~5 samples per second is plenty
const AWAY_MIN_MS = 1500; // looking away shorter than this is not counted as an "event"

// Tunable thresholds (0.5 = perfectly centered)
const IRIS_H_TOL = 0.13; // how far the iris may sit from the eye centre horizontally
const IRIS_V_MIN = 0.25; // vertical iris range that still counts as "looking at screen"
const IRIS_V_MAX = 0.75;
const YAW_MIN = 0.36; // head turn range (nose position between cheeks)
const YAW_MAX = 0.64;
const BLINK_APERTURE = 0.012; // eyelid gap below this = blink, skip the sample

// MediaPipe face mesh landmark indices (478 points with iris)
const EYE_A = { outer: 33, inner: 133, top: 159, bottom: 145, iris: 468 };
const EYE_B = { outer: 263, inner: 362, top: 386, bottom: 374, iris: 473 };
const NOSE = 1, CHEEK_L = 234, CHEEK_R = 454;

const clamp01 = (n) => Math.max(0, Math.min(1, n));

function eyeRatios(lm, e) {
  const w = lm[e.inner].x - lm[e.outer].x;
  const h = lm[e.bottom].y - lm[e.top].y;
  return {
    horiz: (lm[e.iris].x - lm[e.outer].x) / w,
    vert: h !== 0 ? (lm[e.iris].y - lm[e.top].y) / h : 0.5,
    aperture: Math.abs(h),
  };
}

function blend(blendshapes, name) {
  const c = blendshapes?.categories?.find((x) => x.categoryName === name);
  return c ? c.score : 0;
}

const freshStats = () => ({
  start: performance.now(),
  samples: 0,
  present: 0,
  looking: 0,
  awayEvents: 0,
  awayStart: null,
  awayCounted: false,
  smile: 0,
  brow: 0,
});

export default function useEyeContact() {
  const videoRef = useRef(null);
  const landmarkerRef = useRef(null);
  const streamRef = useRef(null);
  const stats = useRef(freshStats());
  const recent = useRef([]);
  const lastVideoTime = useRef(-1);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  // "loading" | "good" | "away" | "no-face"
  const [status, setStatus] = useState("loading");

  // 1) Start camera + load model
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false, // your existing recorder handles the mic
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const fileset = await FilesetResolver.forVisionTasks(WASM);
        const landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
          outputFaceBlendshapes: true,
        });
        if (cancelled) return landmarker.close();
        landmarkerRef.current = landmarker;
        stats.current = freshStats();
        setReady(true);
      } catch (e) {
        if (e.name === "NotAllowedError") setError("Camera permission was denied. Allow camera access in your browser and reload.");
        else if (e.name === "NotFoundError") setError("No camera found on this device.");
        else setError("Could not start the camera or load the face model.");
        console.error(e);
      }
    }
    init();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      landmarkerRef.current?.close();
    };
  }, []);

  // 2) Sampling loop
  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const video = videoRef.current;
      const lmk = landmarkerRef.current;
      if (!video || !lmk || video.readyState < 2 || video.currentTime === lastVideoTime.current) return;
      lastVideoTime.current = video.currentTime;

      const now = performance.now();
      const result = lmk.detectForVideo(video, now);
      const s = stats.current;
      s.samples++;

      const lm = result.faceLandmarks?.[0];
      let state = "no-face";

      if (lm) {
        s.present++;
        const a = eyeRatios(lm, EYE_A);
        const b = eyeRatios(lm, EYE_B);
        const blink = a.aperture < BLINK_APERTURE || b.aperture < BLINK_APERTURE;
        const yaw = (lm[NOSE].x - lm[CHEEK_L].x) / (lm[CHEEK_R].x - lm[CHEEK_L].x);
        const horiz = (a.horiz + b.horiz) / 2;
        const vert = (a.vert + b.vert) / 2;

        const bs = result.faceBlendshapes?.[0];

        const looking =
          Math.abs(horiz - 0.5) < IRIS_H_TOL &&
          vert > IRIS_V_MIN && vert < IRIS_V_MAX &&
          yaw > YAW_MIN && yaw < YAW_MAX;

        if (blink) {
          state = recent.current.at(-1) ?? "good"; // ignore blinks entirely
          s.present--; s.samples--;
        } else if (looking) {
          state = "good";
          s.looking++;
          s.awayStart = null;
          s.awayCounted = false;
        } else {
          state = "away";
          if (s.awayStart === null) s.awayStart = now;
          if (!s.awayCounted && now - s.awayStart >= AWAY_MIN_MS) {
            s.awayEvents++;
            s.awayCounted = true;
          }
        }

        if (!blink) {
          s.smile += (blend(bs, "mouthSmileLeft") + blend(bs, "mouthSmileRight")) / 2;
          s.brow += blend(bs, "browInnerUp");
        }
      }

      // UI status = majority of last 5 samples (avoids flicker)
      recent.current.push(state);
      if (recent.current.length > 5) recent.current.shift();
      const counts = recent.current.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});
      setStatus(Object.entries(counts).sort((x, y) => y[1] - x[1])[0][0]);
    }, SAMPLE_MS);

    return () => clearInterval(id);
  }, [ready]);

  const reset = useCallback(() => {
    stats.current = freshStats();
  }, []);

  // Returns metrics since the last reset (call once per answer), then resets.
  const getSummary = useCallback(() => {
    const s = stats.current;
    const summary = {
      duration_s: Math.round((performance.now() - s.start) / 1000),
      samples: s.samples,
      face_present_pct: s.samples ? Math.round((100 * s.present) / s.samples) : 0,
      eye_contact_pct: s.present ? Math.round((100 * s.looking) / s.present) : 0,
      look_away_events: s.awayEvents,
      avg_smile: s.present ? +(s.smile / s.present).toFixed(3) : 0,
      avg_brow_raise: s.present ? +(s.brow / s.present).toFixed(3) : 0,
    };
    stats.current = freshStats();
    return summary;
  }, []);

  return { videoRef, ready, error, status, getSummary, reset };
}