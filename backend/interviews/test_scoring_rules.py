import unittest

from .scoring_rules import (
    WEIGHTS, compute_communication, compute_confidence, compute_professionalism,
    compute_time_management, normalize_llm_assessment, pace_score, rating_for,
    rule_based_feedback, weighted_overall,
)


class WeightedOverallTests(unittest.TestCase):
    def test_weights_match_requirements(self):
        self.assertEqual(WEIGHTS, {
            "communication": 0.30, "confidence": 0.25,
            "technical": 0.30, "professionalism": 0.15})
        self.assertAlmostEqual(sum(WEIGHTS.values()), 1.0)

    def test_full_formula(self):
        overall, missing, partial = weighted_overall({
            "communication": 80, "confidence": 60,
            "technical": 70, "professionalism": 90})
        # 80*.30 + 60*.25 + 70*.30 + 90*.15 = 24 + 15 + 21 + 13.5
        self.assertEqual(overall, 73.5)
        self.assertEqual(missing, [])
        self.assertFalse(partial)

    def test_missing_component_is_not_treated_as_zero(self):
        overall, missing, partial = weighted_overall({
            "communication": 80, "confidence": None,
            "technical": 70, "professionalism": 90})
        # (80*.30 + 70*.30 + 90*.15) / 0.75 = 58.5 / 0.75
        self.assertEqual(overall, 78.0)
        self.assertEqual(missing, ["confidence"])
        self.assertTrue(partial)

    def test_all_missing(self):
        overall, missing, partial = weighted_overall({})
        self.assertIsNone(overall)
        self.assertEqual(len(missing), 4)
        self.assertTrue(partial)

    def test_zero_is_a_real_score(self):
        overall, missing, _ = weighted_overall({
            "communication": 0, "confidence": 0, "technical": 0, "professionalism": 0})
        self.assertEqual(overall, 0)
        self.assertEqual(missing, [])


class RatingTests(unittest.TestCase):
    def test_boundaries(self):
        cases = [(100, "Excellent"), (90, "Excellent"), (89.99, "Good"), (75, "Good"),
                 (74.99, "Average"), (60, "Average"), (59.99, "Needs Improvement"),
                 (40, "Needs Improvement"), (39.99, "Poor"), (0, "Poor"), (None, None)]
        for score, label in cases:
            self.assertEqual(rating_for(score), label, score)


class CommunicationTests(unittest.TestCase):
    GOOD = dict(word_count=300, question_count=3, filler_word_count=2,
                grammar_issue_count=1, grammar_checked=True,
                speaking_pace_wpm=135, pronunciation_estimate=96)

    def test_good_speaker_scores_high(self):
        score, breakdown = compute_communication(self.GOOD)
        self.assertGreater(score, 85)
        self.assertEqual(breakdown["pace"]["score"], 100)

    def test_no_words_is_unavailable(self):
        self.assertEqual(compute_communication({"word_count": 0}), (None, {}))

    def test_many_fillers_lower_score(self):
        bad = dict(self.GOOD, filler_word_count=40)
        self.assertLess(compute_communication(bad)[0], compute_communication(self.GOOD)[0])

    def test_grammar_not_checked_is_skipped_not_perfect(self):
        m = dict(self.GOOD, grammar_checked=False, grammar_issue_count=0)
        _, breakdown = compute_communication(m)
        self.assertIsNone(breakdown["grammar"]["score"])

    def test_very_short_answers_penalised_by_completeness(self):
        m = dict(word_count=12, question_count=5)
        score, breakdown = compute_communication(m)
        # 12 words over 5 questions = 2.4 words per question, below the 10-word floor.
        self.assertEqual(breakdown["completeness"]["score"], 0.0)
        self.assertLess(score, 10)

    def test_rates_ignored_for_tiny_samples(self):
        _, breakdown = compute_communication(
            dict(word_count=10, question_count=1, filler_word_count=5, speaking_pace_wpm=300))
        self.assertIsNone(breakdown["filler_words"]["score"])
        self.assertIsNone(breakdown["pace"]["score"])


class PaceTests(unittest.TestCase):
    def test_curve(self):
        self.assertEqual(pace_score(None), None)
        self.assertEqual(pace_score(110), 100)
        self.assertEqual(pace_score(160), 100)
        self.assertEqual(pace_score(60), 0)
        self.assertEqual(pace_score(220), 0)
        self.assertEqual(pace_score(85), 50)
        self.assertEqual(pace_score(190), 50)


class ConfidenceTests(unittest.TestCase):
    M = dict(word_count=200, filler_word_count=2, pause_ratio=0.05, pronunciation_estimate=95)

    def test_speech_only(self):
        score, b = compute_confidence(self.M)
        self.assertEqual(b["basis"], "speech_only")
        self.assertEqual(score, 100.0)

    def test_blends_with_vision(self):
        score, b = compute_confidence(self.M, vision={"eye_contact": 50, "engagement": 50, "attention": None})
        self.assertEqual(b["basis"], "speech+vision")
        self.assertEqual(score, 75.0)

    def test_unavailable_without_signals(self):
        self.assertEqual(compute_confidence({"word_count": 5}), (None, {}))

    def test_vision_only_when_no_speech(self):
        score, b = compute_confidence({"word_count": 0}, vision={"eye_contact": 80})
        self.assertEqual((score, b["basis"]), (80.0, "vision_only"))


class ProfessionalismTests(unittest.TestCase):
    def test_time_management_bands(self):
        self.assertEqual(compute_time_management(105 * 5, 5), 100)       # ratio 1.0
        self.assertEqual(compute_time_management(20, 5), 0)              # far too short
        self.assertEqual(compute_time_management(105 * 5 * 3, 5), 0)     # far too long
        self.assertIsNone(compute_time_management(None, 5))
        self.assertIsNone(compute_time_management(100, 0))

    def test_combines_available_parts(self):
        self.assertEqual(compute_professionalism(80, 100)[0], 84.0)
        self.assertEqual(compute_professionalism(80, None)[0], 80.0)
        self.assertEqual(compute_professionalism(None, 100)[0], 100.0)
        self.assertIsNone(compute_professionalism(None, None)[0])


class NormalizeLlmTests(unittest.TestCase):
    def test_clamps_and_cleans(self):
        out = normalize_llm_assessment({
            "technical_relevance": {"score": 140, "reasoning": " solid "},
            "professionalism": {"score": "72.5"},
            "strengths": ["a", "", 5, "b"],
            "learning_resources": [
                {"topic": "SQL", "url": "http://evil.example", "type": "course"}, "x", 3],
        })
        self.assertEqual(out["technical"], 100.0)
        self.assertEqual(out["professionalism"], 72.5)
        self.assertEqual(out["technical_reasoning"], "solid")
        self.assertEqual(out["strengths"], ["a", "b"])
        self.assertEqual(out["learning_resources"],
                         [{"topic": "SQL", "type": "course"}, {"topic": "x"}])
        self.assertNotIn("url", out["learning_resources"][0])

    def test_garbage_is_safe(self):
        for bad in (None, "text", [], {"technical_relevance": "high"},
                    {"technical_relevance": {"score": True}}):
            out = normalize_llm_assessment(bad)
            self.assertIsNone(out["technical"])
            self.assertEqual(out["strengths"], [])

    def test_null_score_stays_unavailable(self):
        out = normalize_llm_assessment({"technical_relevance": {"score": None}})
        self.assertIsNone(out["technical"])


class RuleFeedbackTests(unittest.TestCase):
    def test_feedback_from_breakdown(self):
        s, w, tips = rule_based_feedback({
            "filler_words": {"score": 90}, "grammar": {"score": 30}, "pace": {"score": None}})
        self.assertEqual(s, ["Few filler words."])
        self.assertEqual(w, ["Several grammar issues were found."])
        self.assertEqual(len(tips), 1)


if __name__ == "__main__":
    unittest.main()
