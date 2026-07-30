import unittest

from news_crawler.domain import get_stock, normalize_symbol


class NewsDomainTests(unittest.TestCase):
    def test_normalize_symbol(self) -> None:
        cases = [
            ("01810.HK", "1810.HK"),
            ("hk", "HK"),
            ("02513.hk", "2513.HK"),
        ]
        for value, expected in cases:
            with self.subTest(value=value):
                self.assertEqual(normalize_symbol(value), expected)

    def test_get_stock_supports_experimental_symbols(self) -> None:
        self.assertEqual(get_stock("01810.HK").name, "小米集团-W")
        self.assertEqual(get_stock("2513.hk").name, "智谱")

    def test_get_stock_rejects_unknown_symbol(self) -> None:
        with self.assertRaisesRegex(ValueError, "unsupported experimental stock"):
            get_stock("0700.HK")


if __name__ == "__main__":
    unittest.main()