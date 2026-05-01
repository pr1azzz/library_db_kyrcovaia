from __future__ import annotations

import decimal
import hashlib
import secrets
from pathlib import Path
from typing import Any

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import close_pool, get_connection, init_pool
from .schemas import (
    BookUpsertPayload,
    BranchUpsertPayload,
    FacultyUpsertPayload,
    LoanCreatePayload,
    LoanRequestCreatePayload,
    LoanRequestApprovalPayload,
    LoginPayload,
    RegisterPayload,
)


def resolve_frontend_dir() -> Path | None:
    current_file = Path(__file__).resolve()
    candidates = [
        current_file.parents[2] / "frontend",  # Локальный запуск из корня проекта
        current_file.parents[1] / "frontend",  # Docker-образ (/app/frontend)
    ]
    for candidate in candidates:
        if candidate.exists() and (candidate / "dashboard.html").exists():
            return candidate
    return None


FRONTEND_DIR = resolve_frontend_dir()

app = FastAPI(
    title="Library Information System API",
    version="2.0.0",
    description="REST API для ИС библиотеки на PostgreSQL + PLpgSQL",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if FRONTEND_DIR is not None:
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


def normalize_value(value: Any) -> Any:
    if isinstance(value, decimal.Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    return value


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    return {key: normalize_value(value) for key, value in record.items()}


def raise_http_from_db_error(exc: psycopg.Error) -> None:
    code = exc.sqlstate
    diag = getattr(exc, "diag", None)
    primary_message = getattr(diag, "message_primary", None)
    message = (primary_message or str(exc)).strip()

    if code == "P0001":
        raise HTTPException(status_code=409, detail=message)
    if code == "23505":
        raise HTTPException(status_code=409, detail="Нарушено уникальное ограничение: запись уже существует.")
    if code == "23503":
        raise HTTPException(status_code=409, detail="Нельзя выполнить операцию: нарушена ссылочная целостность.")
    if code == "23514":
        raise HTTPException(status_code=400, detail="Нарушено проверочное ограничение данных.")
    if code == "22P02":
        raise HTTPException(status_code=400, detail="Некорректный формат входных данных.")

    raise HTTPException(status_code=500, detail=f"Ошибка БД: {message}")


def hash_password(password: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()


def public_user(row: dict[str, Any]) -> dict[str, Any]:
    row = normalize_record(row)
    return {
        "id_user": int(row["id_user"]),
        "full_name": row["full_name"],
        "email": row["email"],
        "role": row["role"],
        "id_faculty": row.get("id_faculty"),
        "faculty_name": row.get("faculty_name"),
    }


def get_optional_user(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any] | None:
    if not x_user_id:
        return None

    try:
        user_id = int(x_user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="Некорректный идентификатор пользователя")

    with connection.cursor(row_factory=dict_row) as cursor:
        cursor.execute(
            """
            SELECT u.id_user, u.full_name, u.email, u.role, u.id_faculty, f.name AS faculty_name
            FROM app_users u
            LEFT JOIN faculties f ON f.id_faculty = u.id_faculty
            WHERE u.id_user = %s
            """,
            (user_id,),
        )
        row = cursor.fetchone()

    if row is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")

    return public_user(row)


def require_user(user: dict[str, Any] | None = Depends(get_optional_user)) -> dict[str, Any]:
    if user is None:
        raise HTTPException(status_code=401, detail="Войдите в систему")
    return user


def require_admin(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Действие доступно только администратору")
    return user


def require_client_or_admin(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    if user["role"] not in {"client", "admin"}:
        raise HTTPException(status_code=403, detail="Недостаточно прав")
    return user


def serve_page(page_name: str) -> FileResponse:
    if FRONTEND_DIR is None:
        raise HTTPException(status_code=404, detail="Frontend не найден")

    file_path = FRONTEND_DIR / page_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Страница не найдена")

    return FileResponse(file_path)


@app.on_event("startup")
def on_startup() -> None:
    init_pool()


@app.on_event("shutdown")
def on_shutdown() -> None:
    close_pool()


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register_user(
    payload: RegisterPayload,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    salt = secrets.token_hex(16)
    password_hash = hash_password(payload.password, salt)

    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                INSERT INTO app_users(full_name, email, password_salt, password_hash, role, id_faculty)
                VALUES (%s, %s, %s, %s, 'client', %s)
                RETURNING id_user, full_name, email, role, id_faculty
                """,
                (payload.full_name, payload.email, salt, password_hash, payload.faculty_id),
            )
            row = cursor.fetchone()

            if row is None:
                raise HTTPException(status_code=500, detail="Не удалось зарегистрировать пользователя")

            if row.get("id_faculty") is not None:
                cursor.execute("SELECT name AS faculty_name FROM faculties WHERE id_faculty = %s", (row["id_faculty"],))
                faculty_row = cursor.fetchone()
                row["faculty_name"] = faculty_row["faculty_name"] if faculty_row else None

        connection.commit()
        return {"message": "Регистрация выполнена", "user": public_user(row)}
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.post("/api/auth/login")
def login_user(
    payload: LoginPayload,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT u.id_user, u.full_name, u.email, u.password_salt, u.password_hash,
                       u.role, u.id_faculty, f.name AS faculty_name
                FROM app_users u
                LEFT JOIN faculties f ON f.id_faculty = u.id_faculty
                WHERE LOWER(u.email) = LOWER(%s)
                """,
                (payload.email,),
            )
            row = cursor.fetchone()

        if row is None or row["password_hash"] != hash_password(payload.password, row["password_salt"]):
            raise HTTPException(status_code=401, detail="Неверный email или пароль")

        return {"message": "Вход выполнен", "user": public_user(row)}
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/auth/me")
def get_me(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    return user


@app.get("/api/faculties")
def list_faculties(connection: psycopg.Connection = Depends(get_connection)) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT id_faculty, name
                FROM faculties
                ORDER BY name
                """
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.post("/api/faculties")
def add_or_update_faculty(
    payload: FacultyUpsertPayload,
    _admin: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            if payload.id_faculty is None:
                cursor.execute(
                    """
                    INSERT INTO faculties(name)
                    VALUES (%s)
                    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id_faculty
                    """,
                    (payload.name,),
                )
            else:
                cursor.execute(
                    """
                    INSERT INTO faculties(id_faculty, name)
                    VALUES (%s, %s)
                    ON CONFLICT (id_faculty) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id_faculty
                    """,
                    (payload.id_faculty, payload.name),
                )
            row = cursor.fetchone()

        connection.commit()
        return {"message": "Факультет сохранен", "id_faculty": int(row["id_faculty"])}
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.get("/api/stats")
def get_stats(connection: psycopg.Connection = Depends(get_connection)) -> dict[str, int]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    (SELECT COUNT(*) FROM books) AS books_count,
                    (SELECT COUNT(*) FROM branches) AS branches_count,
                    (SELECT COUNT(*) FROM faculties) AS faculties_count
                """
            )
            row = cursor.fetchone()
            if row is None:
                return {"books": 0, "branches": 0, "faculties": 0}

            row = normalize_record(row)
            return {
                "books": int(row.get("books_count", 0)),
                "branches": int(row.get("branches_count", 0)),
                "faculties": int(row.get("faculties_count", 0)),
            }
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/books")
def list_books(
    title: str | None = Query(default=None),
    author: str | None = Query(default=None),
    publisher: str | None = Query(default=None),
    year: int | None = Query(default=None, ge=1500, le=3000),
    connection: psycopg.Connection = Depends(get_connection),
) -> list[dict[str, Any]]:
    title_like = f"%{title.strip()}%" if title and title.strip() else None
    author_like = f"%{author.strip()}%" if author and author.strip() else None
    publisher_like = f"%{publisher.strip()}%" if publisher and publisher.strip() else None

    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT *
                FROM (
                    SELECT
                        b.id_book,
                        b.title,
                        b.publication_year,
                        b.pages_count,
                        b.illustrations_count,
                        b.price,
                        p.name AS publisher_name,
                        COALESCE(string_agg(DISTINCT a.full_name, ', ' ORDER BY a.full_name), '') AS authors
                    FROM books b
                    LEFT JOIN publishers p ON p.id_publisher = b.id_publisher
                    LEFT JOIN book_authors ba ON ba.id_book = b.id_book
                    LEFT JOIN authors a ON a.id_author = ba.id_author
                    GROUP BY
                        b.id_book,
                        b.title,
                        b.publication_year,
                        b.pages_count,
                        b.illustrations_count,
                        b.price,
                        p.name
                ) t
                WHERE (%s::TEXT IS NULL OR t.title ILIKE %s::TEXT)
                  AND (%s::TEXT IS NULL OR COALESCE(t.authors, '') ILIKE %s::TEXT)
                  AND (%s::TEXT IS NULL OR COALESCE(t.publisher_name, '') ILIKE %s::TEXT)
                  AND (%s::INTEGER IS NULL OR t.publication_year = %s::INTEGER)
                ORDER BY t.title
                """,
                (
                    title_like,
                    title_like,
                    author_like,
                    author_like,
                    publisher_like,
                    publisher_like,
                    year,
                    year,
                ),
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/books/options")
def list_book_options(connection: psycopg.Connection = Depends(get_connection)) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT id_book, title
                FROM books
                ORDER BY title
                """
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/books/count")
def get_book_count(
    branch: str = Query(..., min_length=1),
    title: str = Query(..., min_length=1),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                "SELECT get_book_count_in_branch(%s, %s) AS copies_count",
                (branch.strip(), title.strip()),
            )
            row = cursor.fetchone() or {"copies_count": 0}
            row = normalize_record(row)
            return {
                "branch": branch.strip(),
                "title": title.strip(),
                "copies_count": int(row.get("copies_count", 0)),
            }
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/books/faculties")
def get_book_faculties(
    title: str = Query(..., min_length=1),
    branch: str = Query(..., min_length=1),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    cursor_name = "faculties_cursor"

    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                "CALL get_faculties_by_book(%s, %s, %s)",
                (title.strip(), branch.strip(), cursor_name),
            )
            cursor.execute(sql.SQL("FETCH ALL FROM {}").format(sql.Identifier(cursor_name)))
            faculties = [normalize_record(row) for row in cursor.fetchall()]
            cursor.execute(sql.SQL("CLOSE {}").format(sql.Identifier(cursor_name)))

        connection.commit()
        return {
            "title": title.strip(),
            "branch": branch.strip(),
            "faculties_count": len(faculties),
            "faculties": faculties,
        }
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.get("/api/books/top-issued")
def get_top_issued_books(
    limit: int = Query(default=10, ge=1, le=100),
    connection: psycopg.Connection = Depends(get_connection),
) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    b.id_book,
                    b.title,
                    SUM(i.times_issued)::INTEGER AS total_issued
                FROM inventory i
                JOIN books b ON b.id_book = i.id_book
                GROUP BY b.id_book, b.title
                ORDER BY total_issued DESC, b.title
                LIMIT %s
                """,
                (limit,),
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/books/{book_id}/availability")
def get_book_availability(
    book_id: int,
    connection: psycopg.Connection = Depends(get_connection),
) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    br.id_branch,
                    br.name AS branch_name,
                    i.copies_count
                FROM inventory i
                JOIN branches br ON br.id_branch = i.id_branch
                WHERE i.id_book = %s
                  AND i.copies_count > 0
                ORDER BY br.name
                """,
                (book_id,),
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.post("/api/books")
def add_or_update_book(
    payload: BookUpsertPayload,
    _admin: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT library_mgmt.add_or_update_book(
                    %s::BIGINT,
                    %s::TEXT,
                    %s::INTEGER,
                    %s::INTEGER,
                    %s::INTEGER,
                    %s::NUMERIC,
                    %s::TEXT
                ) AS id_book
                """,
                (
                    payload.id_book,
                    payload.title,
                    payload.publication_year,
                    payload.pages_count,
                    payload.illustrations_count,
                    payload.price,
                    payload.publisher_name,
                ),
            )
            row = cursor.fetchone()
            if row is None or row.get("id_book") is None:
                raise HTTPException(status_code=500, detail="Не удалось сохранить книгу")

            row = normalize_record(row)
            book_id = int(row["id_book"])

            if payload.authors is not None:
                cursor.execute("DELETE FROM book_authors WHERE id_book = %s", (book_id,))

                for author_name in payload.authors:
                    cursor.execute(
                        """
                        INSERT INTO authors(full_name)
                        VALUES (%s)
                        ON CONFLICT (full_name) DO NOTHING
                        """,
                        (author_name,),
                    )

                    cursor.execute(
                        """
                        SELECT id_author
                        FROM authors
                        WHERE LOWER(full_name) = LOWER(%s)
                        ORDER BY id_author
                        LIMIT 1
                        """,
                        (author_name,),
                    )
                    author_row = cursor.fetchone()
                    if author_row is None:
                        continue

                    author_row = normalize_record(author_row)
                    cursor.execute(
                        """
                        INSERT INTO book_authors(id_book, id_author)
                        VALUES (%s, %s)
                        ON CONFLICT (id_book, id_author) DO NOTHING
                        """,
                        (book_id, int(author_row["id_author"])),
                    )

        connection.commit()
        return {
            "message": "Книга успешно сохранена",
            "id_book": book_id,
        }
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.delete("/api/books/{book_id}")
def delete_book(
    book_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, str]:
    try:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM books WHERE id_book = %s", (book_id,))
            if cursor.rowcount == 0:
                connection.rollback()
                raise HTTPException(status_code=404, detail="Книга не найдена")

        connection.commit()
        return {"message": "Книга удалена"}
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.get("/api/branches")
def list_branches(connection: psycopg.Connection = Depends(get_connection)) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    br.id_branch,
                    br.name,
                    COALESCE(SUM(i.copies_count), 0)::INTEGER AS total_copies,
                    COUNT(DISTINCT i.id_book)::INTEGER AS books_count
                FROM branches br
                LEFT JOIN inventory i ON i.id_branch = br.id_branch
                GROUP BY br.id_branch, br.name
                ORDER BY br.name
                """
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/branches/options")
def list_branch_options(connection: psycopg.Connection = Depends(get_connection)) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT id_branch, name
                FROM branches
                ORDER BY name
                """
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/branches/{branch_id}/inventory")
def get_branch_inventory(
    branch_id: int,
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT id_branch, name
                FROM branches
                WHERE id_branch = %s
                """,
                (branch_id,),
            )
            branch_row = cursor.fetchone()
            if branch_row is None:
                raise HTTPException(status_code=404, detail="Филиал не найден")

            cursor.execute(
                """
                SELECT
                    i.id_inventory,
                    b.id_book,
                    b.title,
                    i.copies_count,
                    i.times_issued
                FROM inventory i
                JOIN books b ON b.id_book = i.id_book
                WHERE i.id_branch = %s
                ORDER BY b.title
                """,
                (branch_id,),
            )
            inventory_rows = [normalize_record(row) for row in cursor.fetchall()]

            branch_row = normalize_record(branch_row)
            return {
                "branch": {
                    "id_branch": int(branch_row["id_branch"]),
                    "name": branch_row["name"],
                },
                "inventory": inventory_rows,
            }
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.post("/api/branches")
def add_or_update_branch(
    payload: BranchUpsertPayload,
    _admin: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                "SELECT library_mgmt.add_or_update_branch(%s::BIGINT, %s::TEXT) AS id_branch",
                (payload.id_branch, payload.name),
            )
            row = cursor.fetchone()
            if row is None or row.get("id_branch") is None:
                raise HTTPException(status_code=500, detail="Не удалось сохранить филиал")

            row = normalize_record(row)
            branch_id = int(row["id_branch"])

        connection.commit()
        return {
            "message": "Филиал успешно сохранен",
            "id_branch": branch_id,
        }
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.delete("/api/branches/{branch_id}")
def delete_branch(
    branch_id: int,
    _admin: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, str]:
    try:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM branches WHERE id_branch = %s", (branch_id,))
            if cursor.rowcount == 0:
                connection.rollback()
                raise HTTPException(status_code=404, detail="Филиал не найден")

        connection.commit()
        return {"message": "Филиал удален"}
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.post("/api/loans")
def create_loan(
    payload: LoanCreatePayload,
    user: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT id_inventory, copies_count
                FROM inventory
                WHERE id_book = %s AND id_branch = %s
                FOR UPDATE
                """,
                (payload.book_id, payload.branch_id),
            )
            inventory_row = cursor.fetchone()

            if inventory_row is None:
                raise HTTPException(status_code=404, detail="В выбранном филиале нет такой книги")

            if int(inventory_row["copies_count"]) <= 0:
                raise HTTPException(status_code=409, detail="Свободных экземпляров книги нет")

            cursor.execute(
                """
                INSERT INTO book_loans(id_user, id_book, id_branch, id_faculty)
                VALUES (%s, %s, %s, %s)
                RETURNING id_loan, issued_at
                """,
                (user["id_user"], payload.book_id, payload.branch_id, user.get("id_faculty")),
            )
            loan_row = cursor.fetchone()

            cursor.execute(
                """
                UPDATE inventory
                   SET copies_count = copies_count - 1,
                       times_issued = times_issued + 1
                 WHERE id_book = %s AND id_branch = %s
                """,
                (payload.book_id, payload.branch_id),
            )

        connection.commit()
        return {
            "message": "Книга выдана",
            "id_loan": int(loan_row["id_loan"]),
            "issued_at": loan_row["issued_at"],
        }
    except HTTPException:
        connection.rollback()
        raise
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.get("/api/loans/my")
def list_my_loans(
    user: dict[str, Any] = Depends(require_user),
    connection: psycopg.Connection = Depends(get_connection),
) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    l.id_loan,
                    l.id_book,
                    l.id_branch,
                    b.title,
                    br.name AS branch_name,
                    f.name AS faculty_name,
                    l.issued_at,
                    l.returned_at
                FROM book_loans l
                JOIN books b ON b.id_book = l.id_book
                JOIN branches br ON br.id_branch = l.id_branch
                LEFT JOIN faculties f ON f.id_faculty = l.id_faculty
                WHERE l.id_user = %s
                ORDER BY l.issued_at DESC
                """,
                (user["id_user"],),
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.post("/api/loans/{loan_id}/return")
def return_loan(
    loan_id: int,
    user: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT id_loan, id_user, id_book, id_branch, returned_at
                FROM book_loans
                WHERE id_loan = %s
                FOR UPDATE
                """,
                (loan_id,),
            )
            loan_row = cursor.fetchone()

            if loan_row is None:
                raise HTTPException(status_code=404, detail="Запись выдачи не найдена")

            if loan_row["returned_at"] is not None:
                raise HTTPException(status_code=409, detail="Книга уже возвращена")

            cursor.execute(
                """
                UPDATE book_loans
                   SET returned_at = CURRENT_TIMESTAMP
                 WHERE id_loan = %s
                 RETURNING returned_at
                """,
                (loan_id,),
            )
            returned_row = cursor.fetchone()

            cursor.execute(
                """
                UPDATE inventory
                   SET copies_count = copies_count + 1
                 WHERE id_book = %s AND id_branch = %s
                """,
                (loan_row["id_book"], loan_row["id_branch"]),
            )

        connection.commit()
        return {
            "message": "Книга возвращена",
            "id_loan": loan_id,
            "returned_at": returned_row["returned_at"],
        }
    except HTTPException:
        connection.rollback()
        raise
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.post("/api/loan-requests")
def create_loan_request(
    payload: LoanRequestCreatePayload,
    user: dict[str, Any] = Depends(require_client_or_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT 1
                FROM loan_requests
                WHERE id_user = %s
                  AND id_book = %s
                  AND id_branch = %s
                  AND request_type = %s
                  AND status = 'pending'
                LIMIT 1
                """,
                (user["id_user"], payload.book_id, payload.branch_id, payload.request_type),
            )
            if cursor.fetchone() is not None:
                raise HTTPException(status_code=409, detail="По этой книге уже есть необработанный запрос")

            if payload.request_type == "take":
                cursor.execute(
                    """
                    SELECT 1
                    FROM book_loans
                    WHERE id_user = %s
                      AND id_book = %s
                      AND id_branch = %s
                      AND returned_at IS NULL
                    LIMIT 1
                    """,
                    (user["id_user"], payload.book_id, payload.branch_id),
                )
                if cursor.fetchone() is not None:
                    raise HTTPException(status_code=409, detail="Эта книга уже находится у студента")
            else:
                cursor.execute(
                    """
                    SELECT 1
                    FROM book_loans
                    WHERE id_user = %s
                      AND id_book = %s
                      AND id_branch = %s
                      AND returned_at IS NULL
                    LIMIT 1
                    """,
                    (user["id_user"], payload.book_id, payload.branch_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(status_code=409, detail="Нет активной выдачи для возврата")

            cursor.execute(
                """
                INSERT INTO loan_requests(id_user, id_book, id_branch, id_faculty, request_type)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id_request, created_at
                """,
                (user["id_user"], payload.book_id, payload.branch_id, user.get("id_faculty"), payload.request_type),
            )
            request_row = cursor.fetchone()

        connection.commit()
        request_row = normalize_record(request_row)
        return {
            "message": "Запрос создан",
            "id_request": int(request_row["id_request"]),
            "created_at": request_row["created_at"],
        }
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.get("/api/loan-requests/my")
def list_my_loan_requests(
    user: dict[str, Any] = Depends(require_user),
    connection: psycopg.Connection = Depends(get_connection),
) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT
                    r.id_request,
                    r.id_book,
                    r.id_branch,
                    b.title,
                    br.name AS branch_name,
                    f.name AS faculty_name,
                    r.request_type,
                    r.status,
                    r.created_at,
                    r.approved_at,
                    au.full_name AS approved_by_name
                FROM loan_requests r
                JOIN books b ON b.id_book = r.id_book
                JOIN branches br ON br.id_branch = r.id_branch
                LEFT JOIN faculties f ON f.id_faculty = r.id_faculty
                LEFT JOIN app_users au ON au.id_user = r.approved_by
                WHERE r.id_user = %s
                ORDER BY r.created_at DESC
                """,
                (user["id_user"],),
            )
            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/api/loan-requests/pending")
def list_pending_loan_requests(
    _admin: dict[str, Any] = Depends(require_admin),
    branch_id: int | None = Query(None),
    connection: psycopg.Connection = Depends(get_connection),
) -> list[dict[str, Any]]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            if branch_id is not None:
                cursor.execute(
                    """
                    SELECT
                        r.id_request,
                        u.full_name,
                        u.email,
                        b.title,
                        br.name AS branch_name,
                        f.name AS faculty_name,
                        r.request_type,
                        r.status,
                        r.created_at
                    FROM loan_requests r
                    JOIN app_users u ON u.id_user = r.id_user
                    JOIN books b ON b.id_book = r.id_book
                    JOIN branches br ON br.id_branch = r.id_branch
                    LEFT JOIN faculties f ON f.id_faculty = r.id_faculty
                    WHERE r.status = 'pending' AND r.id_branch = %s
                    ORDER BY r.created_at ASC
                    """,
                    (branch_id,),
                )
            else:
                cursor.execute(
                    """
                    SELECT
                        r.id_request,
                        u.full_name,
                        u.email,
                        b.title,
                        br.name AS branch_name,
                        f.name AS faculty_name,
                        r.request_type,
                        r.status,
                        r.created_at
                    FROM loan_requests r
                    JOIN app_users u ON u.id_user = r.id_user
                    JOIN books b ON b.id_book = r.id_book
                    JOIN branches br ON br.id_branch = r.id_branch
                    LEFT JOIN faculties f ON f.id_faculty = r.id_faculty
                    WHERE r.status = 'pending'
                    ORDER BY r.created_at ASC
                    """
                )

            rows = cursor.fetchall()
            return [normalize_record(row) for row in rows]
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.post("/api/loan-requests/{request_id}/approve")
def approve_loan_request(
    request_id: int,
    payload: LoanRequestApprovalPayload,
    admin: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT id_request, id_user, id_book, id_branch, request_type, status
                FROM loan_requests
                WHERE id_request = %s
                FOR UPDATE
                """,
                (request_id,),
            )
            request_row = cursor.fetchone()

            if request_row is None:
                raise HTTPException(status_code=404, detail="Запрос не найден")

            if request_row["status"] != "pending":
                raise HTTPException(status_code=409, detail="Запрос уже обработан")

            request_row = normalize_record(request_row)
            request_type = request_row["request_type"]
            book_id = int(request_row["id_book"])
            branch_id = int(request_row["id_branch"])
            user_id = int(request_row["id_user"])

            if payload.status == "approved":
                if request_type == "take":
                    cursor.execute(
                        """
                        SELECT id_inventory, copies_count
                        FROM inventory
                        WHERE id_book = %s AND id_branch = %s
                        FOR UPDATE
                        """,
                        (book_id, branch_id),
                    )
                    inventory_row = cursor.fetchone()

                    if inventory_row is None:
                        raise HTTPException(status_code=404, detail="В выбранном филиале нет такой книги")

                    if int(inventory_row["copies_count"]) <= 0:
                        raise HTTPException(status_code=409, detail="Свободных экземпляров книги нет")

                    cursor.execute(
                        """
                        SELECT id_user, id_faculty
                        FROM app_users
                        WHERE id_user = %s
                        """,
                        (user_id,),
                    )
                    user_row = cursor.fetchone()
                    user_row = normalize_record(user_row)

                    cursor.execute(
                        """
                        INSERT INTO book_loans(id_user, id_book, id_branch, id_faculty)
                        VALUES (%s, %s, %s, %s)
                        RETURNING id_loan
                        """,
                        (user_id, book_id, branch_id, user_row.get("id_faculty")),
                    )
                    loan_row = cursor.fetchone()

                    cursor.execute(
                        """
                        UPDATE inventory
                           SET copies_count = copies_count - 1,
                               times_issued = times_issued + 1
                         WHERE id_book = %s AND id_branch = %s
                        """,
                        (book_id, branch_id),
                    )

                elif request_type == "return":
                    cursor.execute(
                        """
                        SELECT id_loan, returned_at
                        FROM book_loans
                        WHERE id_user = %s AND id_book = %s AND id_branch = %s AND returned_at IS NULL
                        ORDER BY issued_at DESC
                        LIMIT 1
                        FOR UPDATE
                        """,
                        (user_id, book_id, branch_id),
                    )
                    loan_row = cursor.fetchone()

                    if loan_row is None:
                        raise HTTPException(status_code=404, detail="Активная выдача книги не найдена")

                    cursor.execute(
                        """
                        UPDATE book_loans
                           SET returned_at = CURRENT_TIMESTAMP
                         WHERE id_loan = %s
                        """,
                        (int(normalize_record(loan_row)["id_loan"]),),
                    )

                    cursor.execute(
                        """
                        UPDATE inventory
                           SET copies_count = copies_count + 1
                         WHERE id_book = %s AND id_branch = %s
                        """,
                        (book_id, branch_id),
                    )

            cursor.execute(
                """
                UPDATE loan_requests
                   SET status = %s,
                       approved_at = CURRENT_TIMESTAMP,
                       approved_by = %s
                 WHERE id_request = %s
                 RETURNING approved_at
                """,
                (payload.status, admin["id_user"], request_id),
            )
            approval_row = cursor.fetchone()

        connection.commit()
        approval_row = normalize_record(approval_row)
        return {
            "message": f"Запрос {'одобрен' if payload.status == 'approved' else 'отклонен'}",
            "id_request": request_id,
            "status": payload.status,
            "approved_at": approval_row["approved_at"],
        }
    except HTTPException:
        connection.rollback()
        raise
    except psycopg.Error as exc:
        connection.rollback()
        raise_http_from_db_error(exc)


@app.get("/api/reports/book-students")
def get_book_student_report(
    book_id: int = Query(..., ge=1),
    _admin: dict[str, Any] = Depends(require_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    try:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(
                """
                SELECT b.id_book, b.title, COUNT(DISTINCT l.id_user)::INTEGER AS students_count
                FROM books b
                LEFT JOIN book_loans l ON l.id_book = b.id_book
                WHERE b.id_book = %s
                GROUP BY b.id_book, b.title
                """,
                (book_id,),
            )
            summary = cursor.fetchone()
            if summary is None:
                raise HTTPException(status_code=404, detail="Книга не найдена")

            cursor.execute(
                """
                SELECT
                    u.full_name,
                    u.email,
                    COALESCE(f.name, 'Не указан') AS faculty_name,
                    COUNT(*)::INTEGER AS loans_count
                FROM book_loans l
                JOIN app_users u ON u.id_user = l.id_user
                LEFT JOIN faculties f ON f.id_faculty = l.id_faculty
                WHERE l.id_book = %s
                GROUP BY u.id_user, u.full_name, u.email, f.name
                ORDER BY u.full_name
                """,
                (book_id,),
            )
            students = cursor.fetchall()

        summary = normalize_record(summary)
        return {
            "id_book": int(summary["id_book"]),
            "title": summary["title"],
            "students_count": int(summary["students_count"]),
            "students": [normalize_record(row) for row in students],
        }
    except psycopg.Error as exc:
        raise_http_from_db_error(exc)


@app.get("/", include_in_schema=False)
def root_page() -> FileResponse:
    return serve_page("dashboard.html")


@app.get("/dashboard", include_in_schema=False)
def dashboard_page() -> FileResponse:
    return serve_page("dashboard.html")


@app.get("/books", include_in_schema=False)
def books_page() -> FileResponse:
    return serve_page("books.html")


@app.get("/branches", include_in_schema=False)
def branches_page() -> FileResponse:
    return serve_page("branches.html")


@app.get("/reports", include_in_schema=False)
def reports_page() -> FileResponse:
    return serve_page("reports.html")


@app.get("/account", include_in_schema=False)
def account_page() -> FileResponse:
    return serve_page("account.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=True,
    )
