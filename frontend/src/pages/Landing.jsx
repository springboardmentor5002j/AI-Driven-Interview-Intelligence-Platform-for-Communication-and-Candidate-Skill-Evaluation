function Landing({ onGetStarted }) {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <span className="brand">SmartHire AI</span>
        <button className="generate-btn landing-nav-btn" onClick={onGetStarted}>
          Get Started
        </button>
      </nav>

      <section className="hero">
        <span className="hero-badge">AI-Powered Interview Prep</span>
        <h1>Walk into your next interview already prepared.</h1>
        <p className="hero-subtitle">
          Upload your resume, get AI-generated questions matched to your skills,
          and practice out loud with a live voice interview — then get real,
          actionable feedback on how you did.
        </p>
        <button className="generate-btn hero-cta" onClick={onGetStarted}>
          Get Started — It's Free
        </button>
      </section>

      <section className="features">
        <div className="feature-card">
          <span className="feature-icon">📄</span>
          <h3>Resume-Aware Questions</h3>
          <p>Upload your resume and our AI extracts your skills to generate questions tailored specifically to you.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">🎙️</span>
          <h3>Live Voice Interview</h3>
          <p>Practice speaking your answers out loud to an AI interviewer that asks natural follow-up questions.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">📊</span>
          <h3>Detailed Feedback</h3>
          <p>Get scored on communication, technical depth, and professionalism — with specific tips to improve.</p>
        </div>
        <div className="feature-card">
          <span className="feature-icon">🎯</span>
          <h3>Choose Your Difficulty</h3>
          <p>Practice at Easy, Medium, or Hard difficulty depending on how much of a challenge you want.</p>
        </div>
      </section>

      <section className="how-it-works">
        <h2>How it works</h2>
        <div className="steps-row">
          <div className="step-item"><span className="step-num">1</span><p>Sign up and upload your resume</p></div>
          <div className="step-item"><span className="step-num">2</span><p>Get AI-generated questions from your skills</p></div>
          <div className="step-item"><span className="step-num">3</span><p>Answer out loud in a live voice interview</p></div>
          <div className="step-item"><span className="step-num">4</span><p>Get your score and feedback instantly</p></div>
        </div>
      </section>

      <footer className="landing-footer">
        <button className="generate-btn hero-cta" onClick={onGetStarted}>
          Get Started
        </button>
      </footer>
    </div>
  )
}

export default Landing