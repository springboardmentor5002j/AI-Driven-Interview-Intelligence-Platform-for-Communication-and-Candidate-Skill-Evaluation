import unittest

from .speech_metrics import compute_timing_metrics, count_filler_words


def words(spec):
    """spec: list of (start, end, confidence)."""
    return [{"word": "w", "start": s, "end": e, "confidence": c} for s, e, c in spec]


class FillerTests(unittest.TestCase):
    def test_hesitations_and_discourse_fillers(self):
        count, found = count_filler_words("Um, I think, you know, uh, basically it works. Ummm okay.")
        self.assertEqual(count, 5)
        self.assertEqual(found, ["basically", "uh", "um", "ummm", "you know"])

    def test_plain_like_is_not_a_filler(self):
        count, _ = count_filler_words("I like Python and I would like to learn Go.")
        self.assertEqual(count, 0)

    def test_comma_delimited_like_is_a_filler(self):
        count, found = count_filler_words("So, like, I built the API.")
        self.assertEqual((count, found), (1, ["like"]))

    def test_no_false_positives_inside_words(self):
        count, _ = count_filler_words("The human summer drummer hummed.")
        self.assertEqual(count, 0)

    def test_empty(self):
        self.assertEqual(count_filler_words(""), (0, []))
        self.assertEqual(count_filler_words(None), (0, []))


class TimingTests(unittest.TestCase):
    def test_pace_uses_speaking_time_not_whole_span(self):
        # 100 words, each 0.4 s with 0.1 s gaps = 50 s speaking, then a 60 s silence,
        # then 100 more words (50 s). Wall-clock span is ~160 s but speech is ~100 s.
        first = [(i * 0.5, i * 0.5 + 0.4, 0.95) for i in range(100)]
        second = [(110 + i * 0.5, 110 + i * 0.5 + 0.4, 0.95) for i in range(100)]
        m = compute_timing_metrics(words(first + second))
        self.assertEqual(m["word_count"], 200)
        self.assertEqual(m["long_pause_count"], 1)
        self.assertAlmostEqual(m["speaking_seconds"], 99.5, delta=1.0)
        self.assertAlmostEqual(m["speaking_pace_wpm"], 120, delta=3)
        self.assertGreater(m["pause_ratio"], 0.3)

    def test_pronunciation_estimate_is_mean_confidence(self):
        m = compute_timing_metrics(words([(0, 1, 0.9), (1, 2, 0.8), (2, 3, 1.0)]))
        self.assertEqual(m["pronunciation_estimate"], 90.0)

    def test_short_sample_has_no_pace(self):
        m = compute_timing_metrics(words([(0, 1, 0.9), (1, 2, 0.9)]))
        self.assertIsNone(m["speaking_pace_wpm"])

    def test_bad_input_is_safe(self):
        for bad in (None, [], [{"word": "x"}], ["x"], [{"start": 2, "end": 1}]):
            m = compute_timing_metrics(bad)
            self.assertEqual(m["word_count"], 0)
            self.assertIsNone(m["speaking_pace_wpm"])


if __name__ == "__main__":
    unittest.main()
