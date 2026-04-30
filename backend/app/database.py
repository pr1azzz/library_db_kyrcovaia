from __future__ import annotations

from collections.abc import Generator

import psycopg
from psycopg_pool import ConnectionPool

from .config import settings

_pool: ConnectionPool | None = None


def init_pool() -> None:
    """Инициализирует пул соединений PostgreSQL."""
    global _pool
    if _pool is not None:
        return

    _pool = ConnectionPool(
        conninfo=settings.database_url,
        min_size=1,
        max_size=10,
        timeout=20,
    )
    _pool.open(wait=True)


def close_pool() -> None:
    """Закрывает пул соединений PostgreSQL."""
    global _pool
    if _pool is None:
        return

    _pool.close()
    _pool = None


def get_pool() -> ConnectionPool:
    if _pool is None:
        raise RuntimeError("Пул соединений PostgreSQL не инициализирован")
    return _pool


def get_connection() -> Generator[psycopg.Connection, None, None]:
    """Зависимость FastAPI: выдает и возвращает соединение в пул."""
    pool = get_pool()
    with pool.connection() as connection:
        yield connection
