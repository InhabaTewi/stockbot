import unittest
from unittest.mock import Mock, patch

from server.live_news_provider import get_news_articles, sync_news_articles


def fake_connection(dictionary_rows=None):
    connection = Mock()
    cursor = Mock()
    cursor.fetchall.return_value = dictionary_rows or []
    connection.cursor.return_value = cursor
    return connection, cursor


class NewsProviderTests(unittest.TestCase):
    def test_groups_database_articles_by_stock(self):
        connection, cursor = fake_connection(
            [
                {
                    "symbol": "1810.HK",
                    "stock_name": "小米集团-W",
                    "title": "小米发布业绩",
                }
            ]
        )

        payload = get_news_articles(lambda: connection)

        self.assertTrue(payload["meta"]["available"])
        market = payload["markets"][0]
        xiaomi = market["sectors"][0]["stocks"][0]
        self.assertEqual(xiaomi["symbol"], "1810.HK")
        self.assertEqual(xiaomi["articleCount"], 1)
        cursor.close.assert_called_once()
        connection.close.assert_called_once()

    @patch("server.live_news_provider.requests.get")
    def test_sync_writes_approved_crawler_articles(self, get):
        get.return_value.json.return_value = {
            "items": [
                {
                    "id": 7,
                    "symbol": "2513.HK",
                    "stock_name": "智谱",
                    "title": "智谱公告",
                    "url": "https://example.com/zhipu",
                    "sentiment": "neutral",
                }
            ]
        }
        connection, cursor = fake_connection()

        result = sync_news_articles(lambda: connection)

        self.assertEqual(result, {"received": 1, "synced": 1})
        self.assertEqual(cursor.execute.call_count, 2)
        connection.commit.assert_called_once()
        connection.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()