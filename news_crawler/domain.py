from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ReviewStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    FAILED = "failed"


@dataclass(frozen=True)
class StockProfile:
    symbol: str
    name: str
    description: str
    sector_id: str
    sector_name: str
    aliases: tuple[str, ...]
    search_terms: tuple[str, ...]


STOCKS: dict[str, StockProfile] = {
    "1810.HK": StockProfile(
        symbol="1810.HK",
        name="小米集团-W",
        description="智能手机、AIoT 与智能汽车业务集团",
        sector_id="consumer-electronics",
        sector_name="消费电子与智能汽车",
        aliases=("小米集团", "小米", "Xiaomi"),
        search_terms=("小米集团 港股", "小米 01810 财报 OR 公告 OR 业务"),
    ),
    "2513.HK": StockProfile(
        symbol="2513.HK",
        name="智谱",
        description="大模型基础技术与企业级 AI 应用公司",
        sector_id="large-model",
        sector_name="大模型",
        aliases=("智谱", "智谱AI", "Zhipu AI", "Knowledge Atlas"),
        search_terms=("智谱 港股", "智谱AI 02513 公告 OR 融资 OR 大模型"),
    ),
}


def normalize_symbol(symbol: str) -> str:
    normalized = symbol.strip().upper().removeprefix("0")
    if normalized.endswith(".HK"):
        code = normalized.removesuffix(".HK")
        if code.isdigit():
            return f"{int(code)}.HK"
    return normalized


def get_stock(symbol: str) -> StockProfile:
    normalized = normalize_symbol(symbol)
    try:
        return STOCKS[normalized]
    except KeyError as exc:
        raise ValueError(f"unsupported experimental stock: {symbol}") from exc