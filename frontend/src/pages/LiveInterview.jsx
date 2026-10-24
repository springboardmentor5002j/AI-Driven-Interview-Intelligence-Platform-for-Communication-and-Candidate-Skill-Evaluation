import { useState, useRef, useEffect } from 'react'
import {
  transcribeAnswer,
  getNextQuestion,
  getInterviewFeedback,
  fetchSpeech,
} from '../api.js'
import CameraMonitor from '../components/CameraMonitor.jsx'

const MAX_QUESTIONS = 5
const INTERVIEW_DURATION = 15 * 60 // 15 minutes


function LiveInterview({ skills, firstQuestion, difficulty, roundType, onExit }) {
  const [currentQuestion, setCurrentQuestion] = useState(firstQuestion)
  const [isRecording, setIsRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [history, setHistory] = useState([])
  const [allAnswered, setAllAnswered] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [feedbackError, setFeedbackError] = useState('')

  // 15-minute countdown
  const [timeLeft, setTimeLeft] = useState(INTERVIEW_DURATION)

  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const audioRef = useRef(null)
  const speakIdRef = useRef(0)
  const cameraRef = useRef(null)
  const confidenceLogRef = useRef([])

  // Speak the first question when the interview screen opens
  useEffect(() => {
    speakQuestion(firstQuestion)

    return () => {
      stopSpeaking()

      // Stop microphone if the user exits
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop()
      }

      streamRef.current?.getTracks().forEach((track) => track.stop())
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --------------------------------------------------
  // 15-MINUTE COUNTDOWN TIMER
  // --------------------------------------------------

  useEffect(() => {
    if (feedback || allAnswered) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }

        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [feedback, allAnswered])

  // --------------------------------------------------
  // HANDLE TIME UP
  // --------------------------------------------------

  useEffect(() => {
    if (timeLeft !== 0 || feedback || allAnswered) return

    stopSpeaking()

    // Stop recording if candidate is currently answering
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    // Stop microphone
    streamRef.current?.getTracks().forEach((track) => track.stop())

    setIsRecording(false)
    setAllAnswered(true)

    // Time ran out — generate feedback from whatever was answered so far.
    // Without this call the screen would say "Generating your feedback..."
    // forever, since finishInterview() is otherwise only triggered from
    // inside handleRecordingStop() when all 5 questions are answered.
    finishInterview(history)

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, feedback, allAnswered])

  // --------------------------------------------------
  // TIMER DISPLAY HELPERS
  // --------------------------------------------------

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  const formattedTime =
    `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`

  function stopSpeaking() {
    speakIdRef.current++
    audioRef.current?.pause()
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

  async function speakQuestion(text) {
    stopSpeaking()

    cameraRef.current?.reset()

    const myId = ++speakIdRef.current
    setSpeaking(true)

    try {
      const blob = await fetchSpeech(text)

      if (myId !== speakIdRef.current) return

      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)

      audioRef.current = audio

      audio.onended = () => {
        setSpeaking(false)
        URL.revokeObjectURL(url)
      }

      await audio.play()

    } catch (err) {
      console.error(
        'Deepgram TTS failed, falling back to browser voice:',
        err.message
      )

      if (myId !== speakIdRef.current) return

      const utterance = new SpeechSynthesisUtterance(text)

      const en = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang.startsWith('en'))

      if (en) utterance.voice = en

      utterance.onend = () => setSpeaking(false)

      window.speechSynthesis.speak(utterance)
    }
  }

  async function startRecording() {
    stopSpeaking()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      streamRef.current = stream

      const recorder = new MediaRecorder(stream)

      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        chunksRef.current.push(e.data)
      }

      recorder.onstop = handleRecordingStop

      mediaRecorderRef.current = recorder

      recorder.start()

      setIsRecording(true)

    } catch (err) {
      alert(`Could not access microphone: ${err.message}`)
    }
  }

  function stopRecording() {
    if (!mediaRecorderRef.current) return

    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())

    setIsRecording(false)
  }

  async function finishInterview(finalHistory) {
    setFeedbackError('')
    setProcessing(true)

    try {
      const data = await getInterviewFeedback(
        finalHistory,
        skills,
        difficulty,
        confidenceLogRef.current,
        roundType
      )

      setFeedback(data)

    } catch (err) {
      setFeedbackError(err.message)

    } finally {
      setProcessing(false)
    }
  }

  async function handleRecordingStop() {
    // If the timer expired, don't process a new answer
    if (timeLeft <= 0) {
      setProcessing(false)
      return
    }

    // Pull eye-contact / engagement numbers
    const eyeContactSummary = cameraRef.current?.getSummary()

    if (eyeContactSummary) {
      const {
        eye_contact_pct,
        look_away_events,
        avg_smile,
      } = eyeContactSummary

      const computed = Math.max(
        0,
        Math.min(
          100,
          eye_contact_pct -
            look_away_events * 3 +
            avg_smile * 15
        )
      )

      confidenceLogRef.current.push(Math.round(computed))
    }

    setProcessing(true)

    const audioBlob = new Blob(chunksRef.current, {
      type: 'audio/webm',
    })

    try {
      const { transcript: answerText } =
        await transcribeAnswer(audioBlob)

      setTranscript(answerText)

      const newHistory = [
        ...history,
        {
          question: currentQuestion,
          answer: answerText,
        },
      ]

      setHistory(newHistory)

      if (newHistory.length >= MAX_QUESTIONS) {
        setAllAnswered(true)

        await finishInterview(newHistory)

      } else {
        const { question: nextQ } =
          await getNextQuestion(
            currentQuestion,
            answerText,
            skills,
            difficulty,
            roundType
          )

        setCurrentQuestion(nextQ)

        speakQuestion(nextQ)
      }

    } catch (err) {
      alert(err.message)

    } finally {
      setProcessing(false)
    }
  }

  // --------------------------------------------------
  // SCREEN 3: FEEDBACK
  // --------------------------------------------------

  if (feedback) {
    return (
      <div className="app-shell">

        <nav className="navbar">
          <span className="brand">
            SmartHire AI — Interview Complete
          </span>

          <button
            className="link-btn"
            onClick={onExit}
            style={{ color: '#F7F5F1' }}
          >
            Exit
          </button>
        </nav>

        <div className="content">
          <div className="panel">

            <h2>Your Feedback</h2>

            <div className="result-box">

              <p>
                <strong>Round:</strong> {roundType}
              </p>

              <p>
                <strong>Difficulty:</strong> {difficulty}
              </p>

              <p>
                <strong>Overall Score:</strong>{' '}
                {feedback.overall_score}/100
              </p>

              <p>
                <strong>Communication (30%):</strong>{' '}
                {feedback.communication}/100
              </p>

              <p>
                <strong>Confidence (25%):</strong>{' '}
                {feedback.confidence ?? 'N/A'}/100

                <span
                  style={{
                    fontSize: '12px',
                    color: '#5B6577',
                  }}
                >
                  {' '}
                  — {feedback.confidence_note}
                </span>
              </p>

              <p>
                <strong>Technical Relevance (30%):</strong>{' '}
                {feedback.technical}/100
              </p>

              <p>
                <strong>Professionalism (15%):</strong>{' '}
                {feedback.professionalism}/100
              </p>

              <p>
                <strong>Strengths:</strong>{' '}
                {feedback.strengths}
              </p>

              <p>
                <strong>Areas to Improve:</strong>{' '}
                {feedback.improvements}
              </p>

            </div>

            <div className="questions-section">

              <h3>Full Transcript</h3>

              {history.map((h, i) => (
                <div
                  className="question-card"
                  key={i}
                >
                  <span className="question-number">
                    {i + 1}
                  </span>

                  <div>
                    <p>
                      <strong>Q:</strong> {h.question}
                    </p>

                    <p>
                      <strong>A:</strong> {h.answer}
                    </p>
                  </div>

                </div>
              ))}

            </div>

            <button
              className="generate-btn"
              onClick={onExit}
              style={{ marginTop: '16px' }}
            >
              Back to Dashboard
            </button>

          </div>
        </div>

      </div>
    )
  }

  // --------------------------------------------------
  // SCREEN 2: ALL ANSWERS RECORDED / TIME UP
  // --------------------------------------------------

  if (allAnswered) {
    return (
      <div className="app-shell">

        <nav className="navbar">

          <span className="brand">
            SmartHire AI — Live Interview
          </span>

          <button
            className="link-btn"
            onClick={onExit}
            style={{ color: '#F7F5F1' }}
          >
            Exit
          </button>

        </nav>

        <div className="content">

          <div className="panel">

            <h2>
              {timeLeft === 0
                ? "Time's Up!"
                : `All ${MAX_QUESTIONS} answers recorded`}
            </h2>

            {timeLeft === 0 && (
              <p className="subtitle">
                Your 15-minute interview time has ended.
              </p>
            )}

            {!feedbackError && (
              <p className="subtitle">
                Generating your feedback...
              </p>
            )}

            {feedbackError && (
              <>
                <div className="error-banner">
                  {feedbackError}
                </div>

                <button
                  className="generate-btn"
                  onClick={() => finishInterview(history)}
                  disabled={processing}
                >
                  {processing
                    ? 'Retrying...'
                    : 'Retry Feedback'}
                </button>
              </>
            )}

          </div>

        </div>

      </div>
    )
  }

  // --------------------------------------------------
  // SCREEN 1: LIVE INTERVIEW
  // --------------------------------------------------

  return (
    <div className="app-shell">

      <nav className="navbar">

        <span className="brand">
          SmartHire AI — Live Interview
        </span>

        <button
          className="link-btn"
          onClick={onExit}
          style={{ color: '#F7F5F1' }}
        >
          Exit
        </button>

      </nav>

      <div className="content">

        <div className="panel">

          <p className="subtitle">
            Question {history.length + 1} of {MAX_QUESTIONS}{' '}
            ·{' '}
            <span className="diff-pill">
              {roundType}
            </span>{' '}
            <span className="diff-pill">
              {difficulty}
            </span>
          </p>

          {/* COUNTDOWN TIMER */}

          <div
            className={`interview-timer ${
              timeLeft <= 60 ? 'warning' : ''
            }`}
          >
            ⏱️ {formattedTime}
          </div>

          <h2>{currentQuestion}</h2>

          {speaking && (
            <p className="speaking-indicator">
              🔊 Interviewer is speaking...
            </p>
          )}

          <div style={{ margin: '16px 0' }}>
            <CameraMonitor ref={cameraRef} />
          </div>

          <button
            className="generate-btn"
            onClick={() =>
              speakQuestion(currentQuestion)
            }
            style={{ marginBottom: '10px' }}
            disabled={processing}
          >
            🔊 Replay Question
          </button>

          {!isRecording ? (
            <button
              className="generate-btn"
              onClick={startRecording}
              disabled={processing || timeLeft === 0}
            >
              {processing
                ? 'Processing your answer...'
                : '🎤 Start Answering'}
            </button>
          ) : (
            <button
              className="generate-btn"
              onClick={stopRecording}
              style={{
                background: '#B3261E',
              }}
            >
              ⏹ Stop & Submit Answer
            </button>
          )}

          {transcript && (
            <div className="result-box">

              <p>
                <strong>You said:</strong>{' '}
                {transcript}
              </p>

            </div>
          )}

          {history.length > 0 && (
            <div className="questions-section">

              <h3>Previous Questions</h3>

              {history.map((h, i) => (
                <div
                  className="question-card"
                  key={i}
                >

                  <span className="question-number">
                    {i + 1}
                  </span>

                  <div>

                    <p>
                      <strong>Q:</strong>{' '}
                      {h.question}
                    </p>

                    <p>
                      <strong>A:</strong>{' '}
                      {h.answer}
                    </p>

                  </div>

                </div>
              ))}

            </div>
          )}

        </div>

      </div>

    </div>
  )
}

export default LiveInterview