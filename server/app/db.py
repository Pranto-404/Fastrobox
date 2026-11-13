"""PostgreSQL connection pool and schema set-up."""
import os
import pathlib

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

pool = ConnectionPool(
    os.environ.get("DATABASE_URL", ""),
    min_size=1,
    max_size=5,
    kwargs={"row_factory": dict_row},
    open=False,
)


def init() -> None:
    pool.open(wait=True)
    schema = (pathlib.Path(__file__).parent / "schema.sql").read_text()
    with pool.connection() as conn:
        conn.execute(schema)
