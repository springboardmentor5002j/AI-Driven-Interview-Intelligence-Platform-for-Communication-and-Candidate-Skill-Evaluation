"""Local Whisper transcription and explainable communication indicators."""

from functools import lru_cache
import re
from pathlib import Path


FILLER_PATTERNS = {
    "you know": re.compile(r"\byou\s+know\b", re.IGNORECASE),
    "basically": re.compile(r"\bbasically\b", re.IGNORECASE),
    "actually": re.compile(r"\bactually\b", re.IGNORECASE),
    "um": re.compile(r"\bum+\b", re.IGNORECASE),
    "uh": re.compile(r"\buh+\b", re.IGNORECASE),
    "like": re.compile(r"\blike\b", re.IGNORECASE),
    "so": re.compile(r"\bso\b", re.IGNORECASE),
}
WORD_PATTERN = re.compile(r"\b[\w']+\b", re.UNICODE)


class SpeechTranscriptionError(Exception):
    """Raised when the local Whisper model cannot transcribe a recording."""


@lru_cache(maxsize=1)
def _load_model():
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SpeechTranscriptionError(
            "faster-whisper is not installed in the backend environment."
        ) from exc

    try:
        return WhisperModel("tiny", device="cpu", compute_type="int8")
    except Exception as exc:
        raise SpeechTranscriptionError(
            "The local Whisper tiny model could not be initialized. Check model access and backend logs."
        ) from exc


def _decode_audio(audio_path: str | Path):
    """Decode to 16 kHz mono float samples using PyAV's current public API."""
    try:
        import av
        import numpy as np
    except ImportError as exc:
        raise SpeechTranscriptionError("PyAV and NumPy are required to decode audio.") from exc

    try:
        samples = []
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        with av.open(str(audio_path), mode="r") as container:
            if not container.streams.audio:
                raise ValueError("The uploaded file has no audio stream.")
            for decoded_frame in container.decode(audio=0):
                samples.extend(frame.to_ndarray().reshape(-1) for frame in resampler.resample(decoded_frame))
            samples.extend(frame.to_ndarray().reshape(-1) for frame in resampler.resample(None))
        if not samples:
            raise ValueError("The uploaded audio contains no decodable samples.")
        return np.concatenate(samples).astype(np.float32) / 32768.0
    except SpeechTranscriptionError:
        raise
    except Exception as exc:
        raise SpeechTranscriptionError(
            "The uploaded audio could not be decoded. Use a valid WebM, Ogg, MP4, WAV, or MP3 recording."
        ) from exc


def transcribe_audio(audio_path: str | Path) -> tuple[str, float]:
    """Transcribe audio locally and return (transcript, media duration seconds)."""
    try:
        audio_samples = _decode_audio(audio_path)
        segments, _info = _load_model().transcribe(
            audio_samples, beam_size=5, vad_filter=True
        )
        transcript_parts = [segment.text.strip() for segment in segments]
        transcript = " ".join(part for part in transcript_parts if part).strip()
        duration = len(audio_samples) / 16000
    except SpeechTranscriptionError:
        raise
    except Exception as exc:
        raise SpeechTranscriptionError(
            "The uploaded audio could not be decoded or transcribed."
        ) from exc

    if not transcript:
        raise SpeechTranscriptionError(
            "No speech was detected. Try recording a clear spoken answer."
        )
    return transcript, duration


def analyze_transcript(transcript: str, duration_seconds: float | None = None) -> dict:
    """Produce transparent text/audio indicators; these are not psychological measures."""
    words = WORD_PATTERN.findall(transcript or "")
    word_count = len(words)
    filler_words = {
        phrase: count
        for phrase, pattern in FILLER_PATTERNS.items()
        if (count := len(pattern.findall(transcript or ""))) > 0
    }
    filler_count = sum(filler_words.values())
    sentence_count = len(re.findall(r"[.!?]+", transcript or ""))
    if word_count and sentence_count == 0:
        sentence_count = 1

    duration = float(duration_seconds) if duration_seconds and duration_seconds > 0 else None
    speaking_rate = round(word_count * 60 / duration, 1) if duration else None
    if speaking_rate is None:
        pace = "unavailable"
    elif speaking_rate < 100:
        pace = "slow"
    elif speaking_rate > 170:
        pace = "fast"
    else:
        pace = "normal"

    filler_rate = round(filler_count / word_count * 100, 1) if word_count else 0.0
    # Explainable clarity proxy: answer substance plus measured filler frequency.
    clarity_score = min(100.0, 45.0 + min(word_count, 45) + (10 if sentence_count >= 2 else 0))
    clarity_score = round(max(0.0, clarity_score - min(30.0, filler_rate * 3)), 1)
    if not transcript.strip() or word_count < 3:
        meaningful_content = False
        clarity_score = min(clarity_score, 25.0)
    else:
        meaningful_content = True

    # Keep the existing answer-length heuristic while adjusting it with observable transcript signals.
    if word_count >= 50:
        baseline = 90.0
    elif word_count >= 30:
        baseline = 80.0
    elif word_count >= 15:
        baseline = 70.0
    elif word_count >= 8:
        baseline = 60.0
    else:
        baseline = 40.0
    pace_score = 75.0 if pace == "unavailable" else (85.0 if pace == "normal" else 65.0)
    filler_score = max(40.0, 100.0 - filler_rate * 8)
    communication_score = round(
        max(0.0, min(100.0, baseline * 0.4 + clarity_score * 0.3 + pace_score * 0.15 + filler_score * 0.15)),
        1,
    )

    feedback = []
    if not meaningful_content:
        feedback.append("Add more relevant detail so the answer communicates a complete idea.")
    if filler_count:
        feedback.append(f"Reduce filler words; {filler_count} were detected ({filler_rate}% of words).")
    if pace == "slow":
        feedback.append("The measured speaking pace was slow; a slightly brisker pace may help maintain flow.")
    elif pace == "fast":
        feedback.append("The measured speaking pace was fast; brief pauses may make key points easier to follow.")
    if not feedback:
        feedback.append("The transcript contains meaningful content with a measured speaking pace and few filler words.")

    return {
        "word_count": word_count,
        "sentence_count": sentence_count,
        "duration_seconds": round(duration, 2) if duration else None,
        "speaking_rate_wpm": speaking_rate,
        "pace": pace,
        "filler_count": filler_count,
        "filler_words": filler_words,
        "filler_rate_percent": filler_rate,
        "clarity_score": clarity_score,
        "meaningful_content": meaningful_content,
        "communication_score": communication_score,
        "feedback": " ".join(feedback),
    }
