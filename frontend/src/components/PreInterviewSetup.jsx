import PageHeader from "./PageHeader";

const statusLabel = {
  required: "Permission required",
  connected: "Connected",
  denied: "Permission denied",
  unavailable: "Device not found",
  error: "Could not connect",
};

function DeviceStatus({ label, status }) {
  const symbol = status === "connected" ? "✓" : status === "required" ? "!" : "×";
  return <div className={`device-status device-status-${status}`}>
    <span className="device-status-icon" aria-hidden="true">{symbol}</span>
    <div><strong>{label}</strong><span>{statusLabel[status]}</span></div>
  </div>;
}

function PreInterviewSetup({
  videoRef,
  cameraStatus,
  microphoneStatus,
  microphoneLevel,
  mediaError,
  testing,
  starting,
  canStart,
  onTestDevices,
  onStartInterview,
}) {
  return <main className="page-shell setup-shell">
    <PageHeader
      eyebrow="Before you begin"
      title="Get Ready for Your Interview"
      subtitle="Check your camera before starting. Voice answers are optional; you can type if your microphone is unavailable."
    />
    <div className="setup-grid">
      <section className="card setup-preview-card">
        <div className="setup-card-heading"><div><h2>Camera preview</h2><p className="muted small">Make sure you’re visible and comfortably positioned.</p></div><span className={`live-indicator${cameraStatus === "connected" ? " is-live" : ""}`}>{cameraStatus === "connected" ? "Preview active" : "Preview off"}</span></div>
        <div className="setup-video-wrap">
          {cameraStatus === "connected"
            ? <video ref={videoRef} autoPlay playsInline muted className="setup-video" aria-label="Live camera preview" />
            : <div className="camera-placeholder"><span aria-hidden="true">▣</span><strong>Camera preview will appear here</strong><span>Allow access to check your framing</span></div>}
        </div>
        <p className="privacy-note"><span aria-hidden="true">◇</span> Device checks stay in this browser. Voice recordings stay local until you choose Upload & transcribe.</p>
      </section>

      <section className="card setup-controls-card">
        <div><p className="eyebrow">Device check</p><h2>Ready when you are</h2><p className="muted small">Allow camera access. A microphone is optional for voice answers.</p></div>
        <div className="device-status-list">
          <DeviceStatus label="Camera" status={cameraStatus} />
          <DeviceStatus label="Microphone" status={microphoneStatus} />
        </div>
        <div className="mic-meter-section">
          <div className="mic-meter-label"><strong>Microphone level</strong><span className="muted small">{microphoneStatus === "connected" ? (microphoneLevel > 8 ? "Activity detected" : "Speak to test") : "Not active"}</span></div>
          <div className="mic-meter" role="meter" aria-label="Microphone input level" aria-valuemin="0" aria-valuemax="100" aria-valuenow={microphoneStatus === "connected" ? microphoneLevel : 0}>
            {Array.from({ length: 16 }, (_, index) => <span key={index} className={microphoneStatus === "connected" && microphoneLevel >= (index + 1) * 6 ? "meter-bar active" : "meter-bar"} />)}
          </div>
        </div>
        {mediaError && <p className="form-error" role="alert">{mediaError}</p>}
        <button className="button button-secondary setup-test-button" type="button" disabled={testing || starting} onClick={onTestDevices}>
          {testing ? <><span className="button-spinner spinner-dark" aria-hidden="true" />Testing devices…</> : "Test Camera & Mic"}
        </button>
        <p className="setup-requirement">Camera access is required. You can type answers without a microphone.</p>
        <button className="button setup-start-button" type="button" disabled={!canStart || starting || testing} onClick={onStartInterview}>
          {starting ? <><span className="button-spinner" aria-hidden="true" />Starting interview…</> : "Start Interview"}
        </button>
        {!canStart && <p className="setup-disabled-hint">Connect a camera and run the device check to enable the start button.</p>}
        {(cameraStatus === "denied" || microphoneStatus === "denied" || cameraStatus === "unavailable" || microphoneStatus === "unavailable" || cameraStatus === "error" || microphoneStatus === "error") && !testing && <button className="try-again-button" type="button" onClick={onTestDevices}>Try Again</button>}
      </section>
    </div>
  </main>;
}

export default PreInterviewSetup;
