import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server import model_rankings
from server.model_rankings import (
    RankingFetchResult,
    _connect,
    _store_snapshot,
    get_model_rankings,
    parse_artificial_analysis,
    parse_openrouter,
)


AA_HTML = r'''
{"initialData":[{"id":"1","slug":"alpha","name":"Alpha Max","shortName":"Alpha",
"intelligenceIndex":72.5,"intelligenceIndexIsEstimated":false,"codingIndex":61.2,"agenticIndex":48.0,
"extra":"value"},{"id":"2","slug":"beta","name":"Beta","shortName":"Beta",
"intelligenceIndex":74.0,"intelligenceIndexIsEstimated":false,"codingIndex":60.0,"agenticIndex":50.0}]}
'''


class ModelRankingParserTests(unittest.TestCase):
    def test_artificial_analysis_sorts_each_index(self):
        intelligence = parse_artificial_analysis(AA_HTML, "intelligenceIndex")
        coding = parse_artificial_analysis(AA_HTML, "codingIndex")

        self.assertEqual([item["model"] for item in intelligence], ["Beta", "Alpha Max"])
        self.assertEqual([item["model"] for item in coding], ["Alpha Max", "Beta"])

    def test_openrouter_sorts_by_total_tokens(self):
        rows = [
            {
                "variant_permaslug": "lab/small-model-20260701",
                "total_prompt_tokens": 100,
                "total_completion_tokens": 50,
                "change": -0.1,
            },
            {
                "variant_permaslug": "lab/big-model-20260701:free",
                "total_prompt_tokens": 300,
                "total_completion_tokens": 20,
                "change": 0.25,
            },
        ]

        items = parse_openrouter(rows)

        self.assertEqual(items[0]["modelId"], "lab/big-model-20260701:free")
        self.assertEqual(items[0]["tokens"], 320)
        self.assertEqual(items[0]["change"], 0.25)


class ModelRankingSnapshotTests(unittest.TestCase):
    def test_second_snapshot_records_rank_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            db_path = Path(directory) / "rankings.sqlite3"
            with patch.object(model_rankings, "DB_PATH", db_path):
                connection = _connect()
                try:
                    _store_snapshot(
                        connection,
                        RankingFetchResult(
                            "artificial-analysis",
                            "intelligence",
                            "https://example.com",
                            [
                                {"rank": 1, "model": "Alpha", "score": 70},
                                {"rank": 2, "model": "Beta", "score": 68},
                            ],
                        ),
                    )
                    _store_snapshot(
                        connection,
                        RankingFetchResult(
                            "artificial-analysis",
                            "intelligence",
                            "https://example.com",
                            [
                                {"rank": 1, "model": "Beta", "score": 72},
                                {"rank": 2, "model": "Alpha", "score": 70},
                            ],
                        ),
                    )
                finally:
                    connection.close()

                payload = get_model_rankings()

        intelligence = payload["charts"][0]
        self.assertEqual(intelligence["items"][0]["rankChange"], 1)
        self.assertEqual(intelligence["items"][1]["rankChange"], -1)
        self.assertEqual(len(payload["changes"]), 2)


if __name__ == "__main__":
    unittest.main()