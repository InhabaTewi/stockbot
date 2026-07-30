import tempfile
import unittest
from pathlib import Path

from news_crawler.clients import ScrapedArticle, SearchResult
from news_crawler.domain import get_stock
from news_crawler.pipeline import NewsPipeline
from news_crawler.repository import NewsRepository
from news_crawler.reviewer import ReviewResult


class FakeSearchClient:
    def search(self, query, limit):
        return [
            SearchResult("小米发布业绩", "https://example.com/xiaomi", "业绩增长"),
            SearchResult("重复结果", "https://example.com/xiaomi", "相同链接"),
            SearchResult("待拦截内容", "https://example.com/rejected", "需审核"),
        ][:limit]


class FakeScrapeClient:
    def scrape(self, result):
        return ScrapedArticle(result.title, result.url, f"正文：{result.snippet}")


class FakeReviewer:
    def review(self, stock, article):
        rejected = article.url.endswith("rejected")
        return ReviewResult(
            approved=not rejected,
            relevant=True,
            politically_sensitive=rejected,
            categories=["political_sensitive"] if rejected else [],
            reason="拦截" if rejected else "通过",
            summary="小米集团发布业绩。" if not rejected else "",
            sentiment="positive" if not rejected else "neutral",
        )


class NewsPipelineTests(unittest.TestCase):
    def test_failed_article_can_be_retried(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = NewsRepository(str(Path(directory) / "news.db"))
            stock = get_stock("1810.HK")
            url = "https://example.com/retry"

            repository.save_failure(stock, "临时失败", url, "接口超时")

            self.assertFalse(repository.has_url(stock.symbol, url))

    def test_manual_review_is_disabled_by_default_and_queues_model_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = NewsRepository(str(Path(directory) / "news.db"))
            article = ScrapedArticle(
                "小米发布业绩", "https://example.com/manual", "正文"
            )
            review = ReviewResult(
                approved=True,
                relevant=True,
                politically_sensitive=False,
                categories=[],
                reason="通过",
                summary="摘要",
                sentiment="positive",
            )

            self.assertFalse(repository.manual_review_enabled())
            repository.set_manual_review_enabled(True)
            repository.save_review(
                get_stock("1810.HK"), article, review, manual_review_enabled=True
            )

            self.assertEqual(repository.counts(), {"pending": 1})
            self.assertEqual(repository.list_approved(), [])
            self.assertEqual(repository.set_manual_review_enabled(False), 1)
            self.assertEqual(repository.counts(), {"approved": 1})
            self.assertEqual(len(repository.list_approved()), 1)

            repository.set_manual_review_enabled(True)
            article = ScrapedArticle(
                "小米更新指引", "https://example.com/manual-2", "正文"
            )
            repository.save_review(
                get_stock("1810.HK"), article, review, manual_review_enabled=True
            )
            pending = repository.list_reviews("pending")
            self.assertEqual(pending[0]["title"], "小米更新指引")
            repository.decide_review(pending[0]["id"], "approved", "人工复核通过")
            self.assertEqual(repository.counts(), {"approved": 2})
            self.assertEqual(len(repository.list_approved()), 2)

    def test_pipeline_only_publishes_approved_articles_and_deduplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            repository = NewsRepository(str(Path(directory) / "news.db"))
            pipeline = NewsPipeline(
                FakeSearchClient(), FakeScrapeClient(), FakeReviewer(), repository
            )

            first = pipeline.crawl(["01810.HK"], max_results=3)["1810.HK"]
            second = pipeline.crawl(["1810.HK"], max_results=3)["1810.HK"]

            self.assertEqual(first.discovered, 2)
            self.assertEqual(first.approved, 1)
            self.assertEqual(first.rejected, 1)
            self.assertEqual(second.duplicates, 2)
            published = repository.list_approved()
            self.assertEqual(len(published), 1)
            self.assertEqual(published[0]["title"], "小米发布业绩")
            self.assertEqual(repository.counts(), {"approved": 1, "rejected": 1})


if __name__ == "__main__":
    unittest.main()