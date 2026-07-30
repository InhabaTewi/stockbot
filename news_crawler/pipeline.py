from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Dict, Iterable, List, Optional

from .clients import FirecrawlClient, SearchResult, SearxNGClient
from .domain import get_stock
from .repository import NewsRepository
from .reviewer import ModelReviewer


@dataclass
class CrawlStats:
    searched: int = 0
    discovered: int = 0
    duplicates: int = 0
    approved: int = 0
    pending: int = 0
    rejected: int = 0
    failed: int = 0
    errors: List[str] = field(default_factory=list)


class NewsPipeline:
    def __init__(
        self,
        search_client: SearxNGClient,
        scrape_client: FirecrawlClient,
        reviewer: ModelReviewer,
        repository: NewsRepository,
        reviewer_provider: Optional[Callable[[], ModelReviewer]] = None,
    ) -> None:
        self.search_client = search_client
        self.scrape_client = scrape_client
        self.reviewer = reviewer
        self.repository = repository
        self.reviewer_provider = reviewer_provider

    def crawl(self, symbols: Iterable[str], max_results: int = 5) -> Dict[str, CrawlStats]:
        output = {}
        for symbol in symbols:
            stock = get_stock(symbol)
            stats = CrawlStats()
            results: List[SearchResult] = []
            for query in stock.search_terms:
                stats.searched += 1
                try:
                    results.extend(self.search_client.search(query, max_results))
                except Exception as exc:
                    stats.failed += 1
                    stats.errors.append(f"search failed: {exc}")
            unique_results = {}
            for item in results:
                unique_results.setdefault(item.url, item)
            stats.discovered = len(unique_results)
            for result in unique_results.values():
                if self.repository.has_url(stock.symbol, result.url):
                    stats.duplicates += 1
                    continue
                try:
                    article = self.scrape_client.scrape(result)
                    reviewer = (
                        self.reviewer_provider()
                        if self.reviewer_provider
                        else self.reviewer
                    )
                    review = reviewer.review(stock, article)
                    manual_review_enabled = self.repository.manual_review_enabled()
                    self.repository.save_review(
                        stock, article, review, manual_review_enabled
                    )
                    if review.approved:
                        if manual_review_enabled:
                            stats.pending += 1
                        else:
                            stats.approved += 1
                    else:
                        stats.rejected += 1
                except Exception as exc:
                    stats.failed += 1
                    self.repository.save_failure(stock, result.title, result.url, str(exc))
            output[stock.symbol] = stats
        return output