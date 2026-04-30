-- ==========================================
-- 02_plsql.sql (PostgreSQL / PLpgSQL)
-- Функции, процедура, «пакет» (через schema), триггеры
-- ==========================================

DROP TRIGGER IF EXISTS trg_cascade_inventory ON books;
DROP FUNCTION IF EXISTS fn_trg_cascade_inventory();

DROP TRIGGER IF EXISTS trg_branch_delete ON branches;
DROP FUNCTION IF EXISTS fn_trg_branch_delete();

DROP PROCEDURE IF EXISTS get_faculties_by_book(TEXT, TEXT, REFCURSOR);
DROP FUNCTION IF EXISTS get_book_count_in_branch(TEXT, TEXT);

DROP SCHEMA IF EXISTS library_mgmt CASCADE;
CREATE SCHEMA library_mgmt;

-- 1) Функция количества экземпляров книги в выбранном филиале
CREATE OR REPLACE FUNCTION get_book_count_in_branch(
    p_branch_name TEXT,
    p_book_title  TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COALESCE(SUM(i.copies_count), 0)::INTEGER
      INTO v_count
      FROM inventory i
      JOIN branches br ON br.id_branch = i.id_branch
      JOIN books b ON b.id_book = i.id_book
     WHERE LOWER(br.name) = LOWER(BTRIM(p_branch_name))
       AND LOWER(b.title) = LOWER(BTRIM(p_book_title));

    RETURN v_count;
END;
$$;

-- 2) Процедура списка факультетов по книге и филиалу
-- Возвращает refcursor: название факультета + количество
CREATE OR REPLACE PROCEDURE get_faculties_by_book(
    IN p_book_title  TEXT,
    IN p_branch_name TEXT,
    INOUT p_result   REFCURSOR DEFAULT 'faculties_cursor'
)
LANGUAGE plpgsql
AS $$
BEGIN
    IF p_result IS NULL OR BTRIM(p_result::TEXT) = '' THEN
        p_result := 'faculties_cursor';
    END IF;

    OPEN p_result FOR
        SELECT f.name AS faculty_name,
               COUNT(*)::INTEGER AS usage_count
          FROM book_faculty bf
          JOIN books b ON b.id_book = bf.id_book
          JOIN branches br ON br.id_branch = bf.id_branch
          JOIN faculties f ON f.id_faculty = bf.id_faculty
         WHERE LOWER(b.title) = LOWER(BTRIM(p_book_title))
           AND LOWER(br.name) = LOWER(BTRIM(p_branch_name))
         GROUP BY f.name
         ORDER BY f.name;
END;
$$;

-- 3) Аналог package library_mgmt в PostgreSQL: schema + функции

CREATE OR REPLACE FUNCTION library_mgmt.add_or_update_book(
    p_id_book             BIGINT,
    p_title               TEXT,
    p_publication_year    INTEGER,
    p_pages_count         INTEGER,
    p_illustrations_count INTEGER,
    p_price               NUMERIC,
    p_publisher_name      TEXT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_book_id BIGINT;
    v_publisher_id BIGINT;
    v_normalized_title TEXT;
BEGIN
    v_normalized_title := NULLIF(BTRIM(p_title), '');

    IF v_normalized_title IS NULL THEN
        RAISE EXCEPTION 'Название книги не может быть пустым.' USING ERRCODE = 'P0001';
    END IF;

    IF NULLIF(BTRIM(p_publisher_name), '') IS NOT NULL THEN
        INSERT INTO publishers(name)
        VALUES (BTRIM(p_publisher_name))
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id_publisher INTO v_publisher_id;
    ELSE
        v_publisher_id := NULL;
    END IF;

    IF p_id_book IS NULL THEN
        SELECT b.id_book
          INTO v_book_id
          FROM books b
         WHERE LOWER(b.title) = LOWER(v_normalized_title)
         ORDER BY b.id_book
         LIMIT 1;
    ELSE
        v_book_id := p_id_book;
    END IF;

    IF v_book_id IS NULL THEN
        INSERT INTO books(
            title,
            publication_year,
            pages_count,
            illustrations_count,
            price,
            id_publisher
        ) VALUES (
            v_normalized_title,
            p_publication_year,
            p_pages_count,
            p_illustrations_count,
            p_price,
            v_publisher_id
        )
        RETURNING id_book INTO v_book_id;
    ELSE
        INSERT INTO books(
            id_book,
            title,
            publication_year,
            pages_count,
            illustrations_count,
            price,
            id_publisher
        ) VALUES (
            v_book_id,
            v_normalized_title,
            p_publication_year,
            p_pages_count,
            p_illustrations_count,
            p_price,
            v_publisher_id
        )
        ON CONFLICT (id_book) DO UPDATE
           SET title = EXCLUDED.title,
               publication_year = EXCLUDED.publication_year,
               pages_count = EXCLUDED.pages_count,
               illustrations_count = EXCLUDED.illustrations_count,
               price = EXCLUDED.price,
               id_publisher = EXCLUDED.id_publisher
        RETURNING id_book INTO v_book_id;
    END IF;

    RETURN v_book_id;
END;
$$;

CREATE OR REPLACE FUNCTION library_mgmt.add_or_update_branch(
    p_id_branch BIGINT,
    p_name      TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_branch_id BIGINT;
    v_name TEXT;
BEGIN
    v_name := NULLIF(BTRIM(p_name), '');

    IF v_name IS NULL THEN
        RAISE EXCEPTION 'Название филиала не может быть пустым.' USING ERRCODE = 'P0001';
    END IF;

    IF p_id_branch IS NULL THEN
        SELECT br.id_branch
          INTO v_branch_id
          FROM branches br
         WHERE LOWER(br.name) = LOWER(v_name)
         ORDER BY br.id_branch
         LIMIT 1;
    ELSE
        v_branch_id := p_id_branch;
    END IF;

    IF v_branch_id IS NULL THEN
        INSERT INTO branches(name)
        VALUES (v_name)
        RETURNING id_branch INTO v_branch_id;
    ELSE
        INSERT INTO branches(id_branch, name)
        VALUES (v_branch_id, v_name)
        ON CONFLICT (id_branch) DO UPDATE
           SET name = EXCLUDED.name
        RETURNING id_branch INTO v_branch_id;
    END IF;

    RETURN v_branch_id;
END;
$$;

-- 4) Пользовательское исключение ex_cant_delete_branch (аналог)
-- В PostgreSQL именованные исключения на уровне схемы не создаются,
-- поэтому используем RAISE EXCEPTION c кодом P0001 и тем же смыслом.
CREATE OR REPLACE FUNCTION fn_trg_branch_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_linked_rows INTEGER;
BEGIN
    SELECT (
        SELECT COUNT(*) FROM inventory WHERE id_branch = OLD.id_branch
    ) + (
        SELECT COUNT(*) FROM book_faculty WHERE id_branch = OLD.id_branch
    )
      INTO v_linked_rows;

    IF v_linked_rows > 0 THEN
        RAISE EXCEPTION 'Нельзя удалить филиал: в нем есть книги или связи с факультетами.'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_branch_delete
BEFORE DELETE ON branches
FOR EACH ROW
EXECUTE FUNCTION fn_trg_branch_delete();

-- 5) Каскадное удаление зависимых записей при удалении книги
CREATE OR REPLACE FUNCTION fn_trg_cascade_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM inventory WHERE id_book = OLD.id_book;
    DELETE FROM book_authors WHERE id_book = OLD.id_book;
    DELETE FROM book_faculty WHERE id_book = OLD.id_book;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_inventory
BEFORE DELETE ON books
FOR EACH ROW
EXECUTE FUNCTION fn_trg_cascade_inventory();
