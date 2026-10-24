import React, { forwardRef, useImperativeHandle } from "react";
import useEyeContact from "./useEyeContact";

const LABEL = {
  loading: ["Starting camera…", "#5B6180"],
  good: ["Good eye contact", "#12B886"],
  away: ["Look at the camera", "#FFB020"],
  "no-face": ["Face not visible", "#E5484D"],
};

/* Usage:
   const monitor = useRef();
   <CameraMonitor ref={monitor} />
   monitor.current.reset()       -> when a question starts
   monitor.current.getSummary()  -> when the answer ends (returns metrics, then resets)
*/
const CameraMonitor = forwardRef(function CameraMonitor(_, ref) {
  const { videoRef, ready, error, status, getSummary, reset } = useEyeContact();
  useImperativeHandle(ref, () => ({ getSummary, reset, ready }), [getSummary, reset, ready]);

  const [text, color] = LABEL[status] ?? LABEL.loading;

  if (error) {
    return (
      <div role="alert" style={{ padding: 16, border: "2px solid #E5484D", borderRadius: 12 }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ width: 320 }}>
      <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: "#000" }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: "100%", display: "block", transform: "scaleX(-1)" }} /* mirror for the user only */
        />
        <span
          style={{
            position: "absolute", left: 8, bottom: 8, padding: "4px 10px",
            borderRadius: 99, background: "#fff", color: "#14183A",
            fontSize: 13, fontWeight: 600, borderLeft: `6px solid ${color}`,
          }}
        >
          {text}
        </span>
      </div>
      <p style={{ fontSize: 12, color: "#5B6180", margin: "8px 0 0" }}>
        Video is analysed in your browser. Only summary numbers are saved, not the video.
      </p>
    </div>
  );
});

export default CameraMonitor;