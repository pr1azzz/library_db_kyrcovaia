# Информационная система библиотеки

## Содержание
1. [Разработка составных элементов](#31-разработка-составных-элементов)
2. [Установка и настройка](#32-установка-и-настройка)
3. [Тестирование](#33-тестирование)
4. [Ввод в эксплуатацию](#34-ввод-в-эксплуатацию)
5. [Документация](#35-разработка-сопроводительной-документации)
6. [Проверка БД в pgAdmin](#дополнительно-проверка-бд-в-pgadmin)

---

# 3.1 Разработка составных элементов

## Архитектура приложения

### Основные компоненты системы

Приложение построено по трёхуровневой архитектуре:

```
┌─────────────────────────────────────────────────────────────┐
│                     ФРОНТЕНД (Frontend)                      │
│              HTML5 + CSS3 + JavaScript + Bootstrap 5          │
│  (Многостраничное приложение - MPA с адаптивной версткой)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    HTTP REST API
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                   БЭКЕНД (Backend)                            │
│              Python 3.9+ + FastAPI + Pydantic                 │
│              (Валидация данных, обработка ошибок, CORS)       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    psycopg (драйвер)
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  БД (Database)                                │
│         PostgreSQL 16 + PL/pgSQL + Триггеры                   │
│              (Функции, процедуры, валидация)                  │
└─────────────────────────────────────────────────────────────┘
```

### Компоненты в деталях:

**1. Фронтенд (Frontend Layer)**
- **Технология:** HTML5, CSS3, JavaScript (ванильный)
- **Фреймворк:** Bootstrap 5 (адаптивная верстка)
- **Особенности:**
  - Многостраничное приложение (MPA) с отдельными HTML файлами для каждого раздела
  - Светлая/тёмная тема (localStorage для сохранения)
  - Валидация на клиенте (перед отправкой на сервер)
  - Toast-уведомления об ошибках и успешных операциях
  - Все компоненты UI в одном CSS файле

**2. Бэкенд (Application Layer)**
- **Технология:** Python 3.9+
- **Фреймворк:** FastAPI (асинхронный веб-фреймворк)
- **Особенности:**
  - Все бизнес-логика на сервере
  - Валидация данных через Pydantic схемы
  - Обработка ошибок БД с преобразованием в HTTP статусы
  - CORS включён для обращений с фронтенда
  - Автоматическая генерация документации (Swagger UI)

**3. База данных (Data Layer)**
- **СУБД:** PostgreSQL 16 (объектно-реляционная БД)
- **Язык расширения:** PL/pgSQL (серверные функции и триггеры)
- **Особенности:**
  - Нормализованная схема (ACID транзакции)
  - Функции для сложных операций
  - Триггеры для обеспечения целостности данных
  - Индексы для оптимизации запросов
  - Каскадные операции удаления

---

## Основные таблицы БД (11 таблиц)

### 1. **publishers** (Издательства)
```sql
CREATE TABLE publishers (
    id_publisher BIGINT PRIMARY KEY (IDENTITY),
    name VARCHAR(200) NOT NULL UNIQUE
);
```
- **Назначение:** Справочник издательств
- **Ключ:** id_publisher
- **Уникальность:** Название издательства (не может быть два одинаковых)

### 2. **authors** (Авторы)
```sql
CREATE TABLE authors (
    id_author BIGINT PRIMARY KEY (IDENTITY),
    full_name VARCHAR(250) NOT NULL UNIQUE
);
```
- **Назначение:** Справочник авторов книг
- **Ключ:** id_author
- **Связь:** Many-to-Many с таблицей books через book_authors

### 3. **branches** (Филиалы библиотеки)
```sql
CREATE TABLE branches (
    id_branch BIGINT PRIMARY KEY (IDENTITY),
    name VARCHAR(200) NOT NULL UNIQUE
);
```
- **Назначение:** Справочник филиалов библиотеки
- **Ключ:** id_branch
- **Примечание:** При удалении проверяется наличие книг (триггер запрещает)

### 4. **faculties** (Факультеты)
```sql
CREATE TABLE faculties (
    id_faculty BIGINT PRIMARY KEY (IDENTITY),
    name VARCHAR(200) NOT NULL UNIQUE
);
```
- **Назначение:** Справочник факультетов университета
- **Ключ:** id_faculty

### 5. **app_users** (Пользователи системы)
```sql
CREATE TABLE app_users (
    id_user BIGINT PRIMARY KEY (IDENTITY),
    full_name VARCHAR(250) NOT NULL,
    email VARCHAR(250) NOT NULL UNIQUE,
    password_salt VARCHAR(100) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'client',
    id_faculty BIGINT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_faculty) REFERENCES faculties(id_faculty)
);
```
- **Назначение:** Хранение пользователей (студенты и администраторы)
- **Роли:** 'client' (студент) или 'admin' (администратор библиотеки)
- **Безопасность:** Пароль хранится как хеш (SHA256), не в открытом виде

### 6. **books** (Книги)
```sql
CREATE TABLE books (
    id_book BIGINT PRIMARY KEY (IDENTITY),
    title VARCHAR(300) NOT NULL,
    publication_year INTEGER,
    pages_count INTEGER,
    illustrations_count INTEGER,
    price NUMERIC(10, 2),
    id_publisher BIGINT,
    FOREIGN KEY (id_publisher) REFERENCES publishers(id_publisher)
);
```
- **Назначение:** Основной справочник книг в системе
- **Ключ:** id_book
- **Индекс:** На title для ускорения поиска

### 7. **book_authors** (Связь книги-авторы)
```sql
CREATE TABLE book_authors (
    id_book BIGINT NOT NULL,
    id_author BIGINT NOT NULL,
    PRIMARY KEY (id_book, id_author),
    FOREIGN KEY (id_book) REFERENCES books(id_book),
    FOREIGN KEY (id_author) REFERENCES authors(id_author)
);
```
- **Назначение:** Многие-ко-многим связь между книгами и авторами
- **Ключ:** Композитный (id_book, id_author)
- **Примечание:** Одна книга может иметь несколько авторов

### 8. **inventory** (Инвентарь книг по филиалам)
```sql
CREATE TABLE inventory (
    id_inventory BIGINT PRIMARY KEY (IDENTITY),
    id_book BIGINT NOT NULL,
    id_branch BIGINT NOT NULL,
    copies_count INTEGER NOT NULL DEFAULT 0,
    times_issued INTEGER NOT NULL DEFAULT 0,
    UNIQUE (id_book, id_branch),
    FOREIGN KEY (id_book) REFERENCES books(id_book),
    FOREIGN KEY (id_branch) REFERENCES branches(id_branch)
);
```
- **Назначение:** Хранит сколько экземпляров каждой книги в каждом филиале
- **Ключ:** Композитный уникальный (id_book, id_branch)
- **Индекс:** На (id_book, id_branch) для быстрого поиска
- **Статистика:** times_issued - счётчик выдач

### 9. **book_faculty** (Связь книга-филиал-факультет)
```sql
CREATE TABLE book_faculty (
    id_book BIGINT NOT NULL,
    id_branch BIGINT NOT NULL,
    id_faculty BIGINT NOT NULL,
    PRIMARY KEY (id_book, id_branch, id_faculty),
    FOREIGN KEY (id_book) REFERENCES books(id_book),
    FOREIGN KEY (id_branch) REFERENCES branches(id_branch),
    FOREIGN KEY (id_faculty) REFERENCES faculties(id_faculty)
);
```
- **Назначение:** Показывает какая книга предназначена какому факультету в каком филиале
- **Ключ:** Композитный (id_book, id_branch, id_faculty)

### 10. **book_loans** (История выдачи книг)
```sql
CREATE TABLE book_loans (
    id_loan BIGINT PRIMARY KEY (IDENTITY),
    id_user BIGINT NOT NULL,
    id_book BIGINT NOT NULL,
    id_branch BIGINT NOT NULL,
    id_faculty BIGINT,
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    returned_at TIMESTAMP,
    FOREIGN KEY (id_user) REFERENCES app_users(id_user),
    FOREIGN KEY (id_book) REFERENCES books(id_book),
    FOREIGN KEY (id_branch) REFERENCES branches(id_branch),
    FOREIGN KEY (id_faculty) REFERENCES faculties(id_faculty)
);
```
- **Назначение:** Журнал всех выдач и возвратов книг
- **Ключ:** id_loan
- **Индексы:** На id_book и id_user для быстрого поиска

### 11. **loan_requests** (Запросы на выдачу/возврат) - ⭐ НОВАЯ ТАБЛИЦА
```sql
CREATE TABLE loan_requests (
    id_request BIGINT PRIMARY KEY (IDENTITY),
    id_user BIGINT NOT NULL,
    id_book BIGINT NOT NULL,
    id_branch BIGINT NOT NULL,
    id_faculty BIGINT,
    request_type VARCHAR(10) NOT NULL, -- 'take' или 'return'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP,
    approved_by BIGINT,
    CONSTRAINT ck_request_type CHECK (request_type IN ('take', 'return')),
    CONSTRAINT ck_status CHECK (status IN ('pending', 'approved', 'rejected')),
    FOREIGN KEY (id_user) REFERENCES app_users(id_user),
    FOREIGN KEY (id_book) REFERENCES books(id_book),
    FOREIGN KEY (id_branch) REFERENCES branches(id_branch),
    FOREIGN KEY (id_faculty) REFERENCES faculties(id_faculty),
    FOREIGN KEY (approved_by) REFERENCES app_users(id_user)
);
```
- **Назначение:** Хранит запросы студентов на выдачу/возврат книг, требующие подтверждения библиотекаря
- **Статусы:** pending (ожидает), approved (одобрено), rejected (отклонено)

### Диаграмма связей (ER-диаграмма)

```
┌──────────────┐
│ publishers   │
└──────┬───────┘
       │
       │ 1:M
       │
┌──────▼────────────┐         ┌──────────────┐
│ books             │◄────────┤ book_authors │
├───────────────────┤ M:M     └──────┬───────┘
│ id_book (PK)      │               │
│ title             │               │ 1:M
│ publication_year  │               │
│ pages_count       │         ┌─────▼─────┐
│ price             │         │  authors   │
│ id_publisher (FK) │         └────────────┘
└──────┬────────────┘
       │ 1:M
       │
┌──────▼──────────────┐
│ inventory            │
├──────────────────────┤
│ id_inventory (PK)    │
│ id_book (FK)         │
│ id_branch (FK)       │ ───────┐
│ copies_count         │        │
│ times_issued         │        │ 1:M
└──────────────────────┘        │
                         ┌──────▼──────────┐
┌─────────────────────┐  │ book_faculty    │
│ branches            │  ├─────────────────┤
├─────────────────────┤  │ id_book (FK)    │
│ id_branch (PK)      │  │ id_branch (FK)  │
│ name                │  │ id_faculty (FK) │
└─────────────────────┘  └──────────────────┘
                                │ 1:M
                                │
┌─────────────────────┐  ┌──────▼────────┐
│ faculties           │  │ app_users      │
├─────────────────────┤  ├────────────────┤
│ id_faculty (PK)     │  │ id_user (PK)   │
│ name                │  │ full_name      │
└─────────────────────┘  │ email          │
                         │ password_hash  │
                         │ role           │
                         │ id_faculty(FK) │
                         └────────────────┘
                                │ 1:M
                                │
┌──────────────────────────────▼────────────────────────────┐
│ book_loans (История выдачи)                              │
├──────────────────────────────────────────────────────────┤
│ id_loan, id_user(FK), id_book(FK), id_branch(FK)         │
│ issued_at, returned_at                                   │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ loan_requests (Запросы на выдачу/возврат) ⭐ НОВОЕ      │
├──────────────────────────────────────────────────────────┤
│ id_request, id_user(FK), id_book(FK), id_branch(FK)      │
│ request_type, status, created_at, approved_by(FK)       │
└──────────────────────────────────────────────────────────┘
```

---

## PL/pgSQL Функции и процедуры

### 1. **Функция: get_book_count_in_branch**

```sql
CREATE OR REPLACE FUNCTION get_book_count_in_branch(
    p_branch_name TEXT,
    p_book_title TEXT
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
```

**Назначение:** Подсчитывает количество экземпляров конкретной книги в конкретном филиале

**Параметры:**
- `p_branch_name` - название филиала
- `p_book_title` - название книги

**Возвращает:** Целое число (количество экземпляров)

**Пример использования:**
```sql
SELECT get_book_count_in_branch('Центральный филиал', 'Чистый код');
-- Результат: 3
```

### 2. **Процедура: get_faculties_by_book**

```sql
CREATE OR REPLACE PROCEDURE get_faculties_by_book(
    IN p_book_title TEXT,
    IN p_branch_name TEXT,
    INOUT p_result REFCURSOR DEFAULT 'faculties_cursor'
)
LANGUAGE plpgsql
AS $$
BEGIN
    OPEN p_result FOR
    SELECT 
        f.id_faculty,
        f.name AS faculty_name,
        COUNT(*)::INTEGER AS usage_count
    FROM book_faculty bf
    JOIN faculties f ON f.id_faculty = bf.id_faculty
    JOIN books b ON b.id_book = bf.id_book
    JOIN branches br ON br.id_branch = bf.id_branch
    WHERE LOWER(b.title) = LOWER(BTRIM(p_book_title))
      AND LOWER(br.name) = LOWER(BTRIM(p_branch_name))
    GROUP BY f.id_faculty, f.name
    ORDER BY f.name;
END;
$$;
```

**Назначение:** Получает список факультетов, которым предназначена книга в филиале

**Параметры:**
- `p_book_title` - название книги
- `p_branch_name` - название филиала
- `p_result` - переменная типа REFCURSOR для возврата результата

**Возвращает:** Курсор с полями (id_faculty, faculty_name, usage_count)

**Пример использования:**
```sql
CALL get_faculties_by_book('Чистый код', 'Центральный филиал', 'result');
FETCH ALL FROM result;
```

### 3. **Пакет library_mgmt: Функция add_or_update_book**

```sql
CREATE OR REPLACE FUNCTION library_mgmt.add_or_update_book(
    p_id_book BIGINT,
    p_title TEXT,
    p_publication_year INTEGER,
    p_pages_count INTEGER,
    p_illustrations_count INTEGER,
    p_price NUMERIC,
    p_publisher_name TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_id_publisher BIGINT;
    v_id_book BIGINT;
BEGIN
    -- Получить или создать издателя
    IF p_publisher_name IS NOT NULL THEN
        INSERT INTO publishers(name) VALUES (BTRIM(p_publisher_name))
        ON CONFLICT (name) DO NOTHING;
        
        SELECT id_publisher INTO v_id_publisher
        FROM publishers
        WHERE LOWER(name) = LOWER(BTRIM(p_publisher_name));
    END IF;
    
    -- Вставить или обновить книгу
    IF p_id_book IS NULL THEN
        INSERT INTO books(
            title, publication_year, pages_count,
            illustrations_count, price, id_publisher
        ) VALUES (
            BTRIM(p_title), p_publication_year, p_pages_count,
            p_illustrations_count, p_price, v_id_publisher
        ) RETURNING id_book INTO v_id_book;
    ELSE
        UPDATE books
        SET title = BTRIM(p_title),
            publication_year = p_publication_year,
            pages_count = p_pages_count,
            illustrations_count = p_illustrations_count,
            price = p_price,
            id_publisher = v_id_publisher
        WHERE id_book = p_id_book;
        v_id_book := p_id_book;
    END IF;
    
    RETURN v_id_book;
END;
$$;
```

**Назначение:** Добавляет новую книгу или обновляет существующую

**Параметры:** Все поля книги

**Возвращает:** id_book (новый или обновленный ID)

### 4. **Пакет library_mgmt: Функция add_or_update_branch**

```sql
CREATE OR REPLACE FUNCTION library_mgmt.add_or_update_branch(
    p_id_branch BIGINT,
    p_name TEXT
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_id_branch BIGINT;
BEGIN
    IF p_id_branch IS NULL THEN
        INSERT INTO branches(name) VALUES (BTRIM(p_name))
        RETURNING id_branch INTO v_id_branch;
    ELSE
        UPDATE branches
        SET name = BTRIM(p_name)
        WHERE id_branch = p_id_branch;
        v_id_branch := p_id_branch;
    END IF;
    
    RETURN v_id_branch;
END;
$$;
```

**Назначение:** Добавляет новый филиал или обновляет существующий

**Параметры:**
- `p_id_branch` - ID филиала (NULL для новой записи)
- `p_name` - название филиала

**Возвращает:** id_branch (новый или обновленный ID)

---

## Триггеры БД

### 1. **Триггер: trg_branch_delete** (Запрет удаления филиала с книгами)

```sql
CREATE OR REPLACE FUNCTION fn_trg_branch_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_books_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_books_count
    FROM inventory
    WHERE id_branch = OLD.id_branch;
    
    IF v_books_count > 0 THEN
        RAISE EXCEPTION 'Невозможно удалить филиал: в нём находится % книг', v_books_count;
    END IF;
    
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_branch_delete
BEFORE DELETE ON branches
FOR EACH ROW
EXECUTE FUNCTION fn_trg_branch_delete();
```

**Назначение:** Запрещает удалять филиал, если в нём есть книги

**Когда срабатывает:** При попытке удалить филиал

**Действие:** Выбрасывает исключение (ошибка) с понятным сообщением

**Пример ошибки:**
```
ERROR: Невозможно удалить филиал: в нём находится 5 книг
```

### 2. **Триггер: trg_cascade_inventory** (Каскадное удаление инвентаря)

```sql
CREATE OR REPLACE FUNCTION fn_trg_cascade_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM book_faculty
    WHERE id_book = OLD.id_book;
    
    DELETE FROM inventory
    WHERE id_book = OLD.id_book;
    
    DELETE FROM book_authors
    WHERE id_book = OLD.id_book;
    
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_cascade_inventory
BEFORE DELETE ON books
FOR EACH ROW
EXECUTE FUNCTION fn_trg_cascade_inventory();
```

**Назначение:** При удалении книги автоматически удаляет все связанные записи

**Когда срабатывает:** При удалении записи из таблицы books

**Действие:** Удаляет:
- Связи книга-факультет (book_faculty)
- Записи инвентаря (inventory)
- Связи книга-автор (book_authors)

**Преимущества:**
- Обеспечивает referential integrity (целостность ссылок)
- Предотвращает "зависшие" записи
- Упрощает логику приложения

---

## Индексы для оптимизации

```sql
-- Поиск по названию книги
CREATE INDEX idx_books_title ON books(title);

-- Быстрое получение инвентаря
CREATE INDEX idx_inventory_book_branch ON inventory(id_book, id_branch);

-- Аналитика книга-факультет
CREATE INDEX idx_book_faculty_book_branch ON book_faculty(id_book, id_branch);

-- Истории выдач
CREATE INDEX idx_book_loans_book ON book_loans(id_book);
CREATE INDEX idx_book_loans_user ON book_loans(id_user);

-- Запросы на выдачу/возврат
CREATE INDEX idx_loan_requests_user ON loan_requests(id_user);
CREATE INDEX idx_loan_requests_status ON loan_requests(status);
CREATE INDEX idx_loan_requests_branch ON loan_requests(id_branch);
```

---

# 3.2 Установка и настройка

## Требуемые инструменты

### Вариант A: С использованием Docker (Рекомендуется)

**Требуется установить:**
- Docker Desktop (https://www.docker.com/products/docker-desktop)
- Git (для клонирования репозитория)

**Преимущества:**
- Не нужно устанавливать PostgreSQL отдельно
- Всё работает "из коробки"
- Быстрая развёртка на любом компьютере
- Изолированная среда

### Вариант B: Локальная установка (Без Docker)

**Требуется установить:**
- Python 3.9+ (https://www.python.org/)
- PostgreSQL 14+ (https://www.postgresql.org/)
- pgAdmin 4 (опционально, https://www.pgadmin.org/)
- Git (для клонирования)

---

## Пошаговая установка (Вариант A - Docker)

### Шаг 1: Установить Docker Desktop

1. Загрузить Docker Desktop с https://www.docker.com/products/docker-desktop
2. Установить по инструкциям для вашей ОС
3. Запустить Docker Desktop
4. Проверить установку:
```bash
docker --version
docker-compose --version
```

### Шаг 2: Клонировать репозиторий

```bash
git clone https://github.com/pr1azzz/library_db_kyrcovaia.git
cd kyrcovaia
```

Или распаковать архив проекта.

### Шаг 3: Запустить контейнеры

```bash
# Перейти в папку проекта
cd "c:\Users\ASUS\Documents\курсовой проект\kyrcovaia"

# Запустить все сервисы
docker-compose up -d

# Дождитесь инициализации (~40 секунд)
# Проверить статус
docker-compose ps
```

**Ожидаемый результат:**
```
NAME               IMAGE                 STATUS
library-postgres   postgres:16-alpine    Up (healthy)
library-pgadmin    dpage/pgadmin4:8.12   Up
library-api        library-api:latest    Up
```

### Шаг 4: Открыть приложение

| Сервис | URL | Логин |
|--------|-----|-------|
| **Веб-приложение** | http://localhost:8000 | - |
| **API Документация (Swagger)** | http://localhost:8000/docs | - |
| **pgAdmin** | http://localhost:5050 | admin@example.com / admin123 |

---

## Пошаговая установка (Вариант B - Локально)

### Шаг 1: Установить PostgreSQL

**Windows:**
1. Загрузить с https://www.postgresql.org/download/windows/
2. Запустить установщик
3. Выбрать пароль для пользователя `postgres` (например: `postgres123`)
4. Оставить порт 5432 (стандартный)
5. Завершить установку

**Проверка:**
```bash
psql --version
```

### Шаг 2: Создать базу данных

```bash
# Подключиться как администратор PostgreSQL
psql -U postgres

# В консоли psql выполнить:
CREATE DATABASE library_db;
CREATE USER library WITH ENCRYPTED PASSWORD 'library123';
ALTER DATABASE library_db OWNER TO library;
GRANT CONNECT ON DATABASE library_db TO library;

# Выход
\q
```

### Шаг 3: Инициализировать схему БД

```bash
# Из корня проекта kyrcovaia
cd "c:\Users\ASUS\Documents\курсовой проект\kyrcovaia"

# Выполнить SQL скрипты по порядку
psql -U library -d library_db -f db/init/01_schema.sql
psql -U library -d library_db -f db/init/02_plsql.sql
psql -U library -d library_db -f db/init/03_seed.sql
psql -U library -d library_db -f db/init/04_auth_migration.sql
```

### Шаг 4: Установить Python зависимости

```bash
# Перейти в папку backend
cd backend

# Создать виртуальное окружение (опционально)
python -m venv venv

# Активировать виртуальное окружение
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Установить зависимости
pip install -r requirements.txt
```

### Шаг 5: Запустить FastAPI сервер

```bash
# Из папки backend
python -m app.main

# Или использовать uvicorn напрямую
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Ожидаемый результат:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### Шаг 6: Открыть приложение

| Сервис | URL |
|--------|-----|
| **Веб-приложение** | http://localhost:8000 |
| **API Документация** | http://localhost:8000/docs |

---

## Структура файлов проекта

```
kyrcovaia/
├── backend/                      # Бэкенд приложение
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py            # Конфигурация приложения
│   │   ├── database.py          # Подключение к БД
│   │   ├── main.py              # FastAPI приложение + endpoints
│   │   └── schemas.py           # Pydantic схемы для валидации
│   ├── Dockerfile               # Docker образ для API
│   ├── requirements.txt          # Python зависимости
│   └── .env.example             # Пример переменных окружения
│
├── frontend/                     # Веб-приложение
│   ├── index.html               # Главная страница (редирект)
│   ├── dashboard.html           # Дашборд (статистика + поиск)
│   ├── books.html               # Управление книгами
│   ├── branches.html            # Управление филиалами
│   ├── reports.html             # Отчёты
│   ├── account.html             # Личный кабинет студента/админа
│   ├── app.js                   # JavaScript логика
│   └── styles.css               # Стили (светлая/тёмная тема)
│
├── db/
│   └── init/                     # SQL скрипты инициализации
│       ├── 01_schema.sql        # Создание таблиц
│       ├── 02_plsql.sql         # PL/pgSQL функции и триггеры
│       ├── 03_seed.sql          # Тестовые данные
│       └── 04_auth_migration.sql # Таблицы аутентификации
│
├── docker-compose.yml            # Конфигурация Docker контейнеров
├── README.md                     # Основная документация
└── COURSEWORK_DOCUMENTATION.md  # Эта документация
```

---

## Переменные окружения

Создать файл `.env` в папке `backend` на основе `.env.example`:

```bash
# backend/.env

DATABASE_URL=postgresql://library:library123@localhost:5432/library_db
API_HOST=0.0.0.0
API_PORT=8000

# Для Docker:
# DATABASE_URL=postgresql://library:library123@postgres:5432/library_db
```

---

# 3.3 Тестирование

## Тестовые сценарии

### Сценарий 1: Регистрация пользователя

**Предусловие:** Приложение запущено

**Шаги:**
1. Открыть http://localhost:8000
2. Нажать кнопку "Войти"
3. Нажать "Создать аккаунт студента"
4. Заполнить форму:
   - ФИО: "Иван Иванов"
   - Email: "ivan@example.com"
   - Пароль: "test123"
   - Факультет: выбрать любой

**Ожидаемый результат:**
- ✅ Показано сообщение: "Регистрация выполнена"
- ✅ Пользователь авторизован
- ✅ Видно имя пользователя в шапке приложения
- ✅ Доступна вкладка "Кабинет"

---

### Сценарий 2: Добавление книги (для администратора)

**Предусловие:** 
- Администратор авторизован
- Открыта страница "Книги"

**Шаги:**
1. Нажать кнопку "Добавить книгу" (видна только для админа)
2. Заполнить форму:
   - Название: "Чистый код"
   - Автор: "Роберт Мартин"
   - Год: 2008
   - Издательство: "Питер"
   - Цена: 1500
3. Нажать "Сохранить"

**Ожидаемый результат:**
- ✅ Сообщение: "Книга успешно сохранена"
- ✅ Книга появляется в таблице
- ✅ Данные сохранены в БД

---

### Сценарий 3: Фильтрация книг

**Предусловие:** На странице "Книги" есть несколько книг

**Шаги:**
1. Ввести в поле "Автор": "Роберт"
2. Нажать кнопку "Применить"

**Ожидаемый результат:**
- ✅ Таблица отфильтрована
- ✅ Видны только книги автора "Роберт Мартин"

---

### Сценарий 4: Просмотр инвентаря филиала

**Предусловие:** Открыта страница "Филиалы"

**Шаги:**
1. Выбрать филиал из таблицы
2. Нажать кнопку "Просмотр" (или вкладка "Инвентарь")

**Ожидаемый результат:**
- ✅ Открывается модальное окно
- ✅ Видна таблица с книгами в этом филиале
- ✅ Показано количество экземпляров каждой книги
- ✅ Показано сколько раз каждая книга была выдана

---

### Сценарий 5: Попытка удалить филиал с книгами ⚠️

**Предусловие:** Филиал содержит книги

**Шаги:**
1. На странице "Филиалы" выбрать филиал с книгами
2. Нажать кнопку "Удалить"
3. Подтвердить удаление

**Ожидаемый результат:**
- ✅ Показана ошибка: "Невозможно удалить филиал: в нём находится N книг"
- ✅ Филиал НЕ удалён
- ✅ Данные остались целыми

**Это работает благодаря триггеру `trg_branch_delete`**

---

### Сценарий 6: Отчёт по книге и филиалу

**Предусловие:** Открыта страница "Отчеты"

**Шаги:**
1. Выбрать книгу из dropdown "Книга"
2. Выбрать филиал из dropdown "Филиал"
3. Нажать "Показать отчет"

**Ожидаемый результат:**
- ✅ Показано количество экземпляров в филиале
- ✅ Показано количество факультетов, к которым относится книга
- ✅ Таблица с факультетами

---

### Сценарий 7: Просмотр TOP 10 выдаваемых книг

**Предусловие:** Открыта страница "Отчеты"

**Шаги:**
1. Найти раздел "Самые выдаваемые книги"
2. Нажать "Обновить"

**Ожидаемый результат:**
- ✅ Таблица показывает до 10 самых выдаваемых книг
- ✅ Показано название книги и количество выдач
- ✅ **Заголовок БЕЗ "(TOP 10)" - только "Самые выдаваемые книги"** ⭐

---

### Сценарий 8: Создание запроса на выдачу книги (НОВОЕ) ⭐

**Предусловие:** 
- Студент авторизован
- Открыта страница "Книги"

**Шаги:**
1. Найти любую книгу
2. Нажать кнопку "Взять"
3. В модальном окне выбрать филиал
4. Нажать "Взять"

**Ожидаемый результат:**
- ✅ Сообщение: "Запрос на выдачу книги создан. Ожидайте одобрения библиотекаря"
- ✅ Запрос сохранён в таблицу `loan_requests` со статусом `pending`
- ✅ Книга НЕ добавлена сразу в историю выдач

---

### Сценарий 9: Просмотр своих запросов (студент)

**Предусловие:** 
- Студент авторизован
- Создал хотя бы один запрос
- Открыта страница "Кабинет"

**Шаги:**
1. Найти раздел "Запросы на выдачу/возврат"

**Ожидаемый результат:**
- ✅ Таблица с запросами студента:
  - Название книги
  - Филиал
  - Тип запроса (Взять / Вернуть)
  - **Статус: "Ожидает"** (оранжевый бейдж)
  - Дата создания

---

### Сценарий 10: Одобрение запроса администратором (НОВОЕ) ⭐

**Предусловие:**
- Администратор авторизован
- Есть ожидающие запросы
- Открыта страница "Кабинет"

**Шаги:**
1. Найти раздел "Ожидающие одобрения запросы" (видна только для админа)
2. Найти запрос в таблице
3. Нажать кнопку "Одобрить"

**Ожидаемый результат:**
- ✅ Сообщение: "Запрос одобрен"
- ✅ Статус запроса изменился на `approved`
- ✅ В таблице `book_loans` создалась новая запись
- ✅ В таблице `inventory` количество экземпляров уменьшилось на 1

---

### Сценарий 11: Проверка статуса запроса у студента после одобрения

**Предусловие:** Администратор одобрил запрос

**Шаги:**
1. Студент обновляет страницу "Кабинет" (F5)
2. Смотрит раздел "Запросы на выдачу/возврат"

**Ожидаемый результат:**
- ✅ **Статус запроса: "Одобрено"** (зелёный бейдж) ⭐
- ✅ Сразу ниже в разделе "История выдач" видна новая запись:
  - Название книги
  - Филиал
  - Дата выдачи (текущее время)
  - Кнопка "Вернуть" (для возврата книги)

---

### Сценарий 12: Отклонение запроса администратором

**Предусловие:** Есть ожидающий запрос

**Шаги:**
1. На странице "Кабинет" найти раздел "Ожидающие одобрения запросы"
2. Нажать кнопку "Отклонить"

**Ожидаемый результат:**
- ✅ Сообщение: "Запрос отклонен"
- ✅ Статус запроса: `rejected`
- ✅ У студента статус запроса: **"Отклонено"** (красный бейдж)
- ✅ Запись в `book_loans` НЕ создалась

---

## Результаты тестирования

### Таблица результатов

| # | Сценарий | Статус | Примечания |
|---|----------|--------|-----------|
| 1 | Регистрация пользователя | ✅ PASS | Пользователь успешно создан |
| 2 | Добавление книги (админ) | ✅ PASS | Книга в таблице и БД |
| 3 | Фильтрация книг | ✅ PASS | Фильтр работает корректно |
| 4 | Просмотр инвентаря | ✅ PASS | Данные загружаются правильно |
| 5 | Запрет удаления филиала | ✅ PASS | Триггер срабатывает |
| 6 | Отчёт по книге | ✅ PASS | Данные корректны |
| 7 | TOP книги, TOP 10 удален | ✅ PASS | Заголовок без "(TOP 10)" |
| 8 | Создание запроса на выдачу | ✅ PASS | Запрос в статусе `pending` |
| 9 | Просмотр запросов студента | ✅ PASS | Все запросы видны |
| 10 | Одобрение запроса (админ) | ✅ PASS | Создана запись в `book_loans` |
| 11 | Проверка статуса у студента | ✅ PASS | Статус "Одобрено", книга в истории |
| 12 | Отклонение запроса | ✅ PASS | Статус "Отклонено", `book_loans` не создана |

---

## Скриншоты интерфейса

> Скриншоты расположены в папке: `docs/screenshots/`

### Рекомендуемые скриншоты для отчёта:

1. **Дашборд** (`dashboard.html`) - главная страница с навигацией
2. **Список книг** - таблица с фильтрацией
3. **Добавление книги** - модальное окно формы
4. **Филиалы** - с таблицей и кнопками действий
5. **Отчёты** - секция "Самые выдаваемые книги" БЕЗ "TOP 10"
6. **Личный кабинет студента** - раздел "Запросы на выдачу/возврат"
7. **Кабинет администратора** - раздел "Ожидающие одобрения запросы"
8. **Ошибка при удалении филиала** - сообщение триггера
9. **Swagger API документация** - `http://localhost:8000/docs`
10. **pgAdmin** - таблица `loan_requests` в БД

---

# 3.4 Ввод в эксплуатацию

## Процесс запуска пользователем

### Первый запуск приложения

```
1. Открыть браузер
2. Перейти на http://localhost:8000
   (или http://127.0.0.1:8000)
3. Увидеть главную страницу "Дашборд"
   ├─ Статистика (Всего книг, Филиалы, Факультеты)
   ├─ Быстрый поиск книги
   └─ Результаты поиска
```

### Регистрация и вход

**Первый раз (регистрация):**
```
1. Нажать кнопку "Войти" (верхний правый угол)
2. В модальном окне нажать "Создать аккаунт студента"
3. Заполнить форму:
   ✓ ФИО: Иван Иванов
   ✓ Email: ivan@example.com
   ✓ Пароль: любой пароль
   ✓ Факультет: выбрать из списка
4. Нажать "Зарегистрироваться"
5. Автоматический вход в систему
```

**Последующие входы:**
```
1. Нажать "Войти"
2. Ввести email и пароль
3. Нажать "Войти"
```

### Жизненный цикл студента

```
Студент логирует в систему
    │
    ├─→ Страница "Книги"
    │   ├─ Просмотреть каталог
    │   ├─ Поиск по названию
    │   └─ Фильтрация по автору/году
    │
    ├─→ Выбрать книгу
    │   └─ Нажать "Взять"
    │
    ├─→ Выбрать филиал
    │   └─ Подтвердить (создаётся ЗАПРОС)
    │
    ├─→ Страница "Кабинет"
    │   ├─ Видит раздел "Запросы на выдачу/возврат"
    │   └─ Статус: "Ожидает одобрения"
    │
    ├─→ Ждёт одобрения библиотекаря
    │
    ├─→ Обновить "Кабинет"
    │   ├─ Статус запроса: "Одобрено"
    │   └─ Книга в разделе "История выдач"
    │
    └─→ Работа с книгой
        ├─ Читает книгу
        └─ Когда нужно вернуть:
           ├─ На странице "Кабинет"
           ├─ В "Истории выдач" нажать "Вернуть"
           └─ Создаётся запрос типа "return"
```

### Жизненный цикл администратора

```
Администратор логирует в систему
    │
    ├─→ Страница "Кабинет"
    │   └─ Видит раздел "Ожидающие одобрения запросы"
    │      (видна ТОЛЬКО для администратора)
    │
    ├─→ Просматривает запросы
    │   ├─ Студент: Иван Иванов
    │   ├─ Книга: Чистый код
    │   ├─ Филиал: Центральный
    │   ├─ Тип: Взять
    │   └─ Дата создания: 2024-04-30 14:30
    │
    ├─→ Выбирает действие
    │   ├─ "Одобрить" → запрос переходит в статус "approved"
    │   │                → создаётся запись в book_loans
    │   │                → уменьшается counts_copy в inventory
    │   │
    │   └─ "Отклонить" → запрос переходит в статус "rejected"
    │                     → ничего не создаётся
    │
    └─→ Система отправляет уведомление студенту
        (видимо при обновлении страницы "Кабинета")
```

---

## Тестовые данные в БД

После инициализации БД (скрипт `03_seed.sql`) система содержит:

### Книги (примеры)
```
1. Чистый код - Роберт Мартин (2008)
2. Изучаем Git - Бхаргав Арьян (2014)
3. Code Complete - Стив Макконелл (2004)
4. The Pragmatic Programmer - Хант, Томас (1999)
5. Рефакторинг - Мартин Фаулер (2018)
... (ещё несколько)
```

### Филиалы
```
1. Центральный филиал
2. Северный филиал
3. Восточный филиал
```

### Факультеты
```
1. Информатика
2. Математика
3. Физика
4. Химия
5. Биология
```

### Администратор (тестовый)
```
Email: admin@test.com
Пароль: admin123
Роль: admin
```

### Студент (тестовый)
```
Email: student@test.com
Пароль: test123
Роль: client
```

---

## Темизация приложения

### Светлая тема (по умолчанию)
```css
--bg-main: #f4f8fb            /* Светло-голубой фон */
--text-main: #132f43          /* Тёмно-синий текст */
--accent: #0f7a94             /* Бирюзовая подсветка */
```

### Тёмная тема
```css
--bg-main: #0f1e29            /* Очень тёмный фон */
--text-main: #eaf4fb          /* Светлый текст */
--accent: #2cc4d9             /* Светлая бирюза */
```

**Как переключить:**
- Нажать кнопку "Сменить тему" в верхнем правом углу
- Выбор сохраняется в localStorage браузера

---

# 3.5 Разработка сопроводительной документации

## Документы, подготовленные для проекта

### 1. **README.md** - Основная документация

**Содержание:**
- Описание стека технологий
- Список реализованных функций (ТЗ)
- Структура проекта
- Команды для запуска (Docker и локально)
- Примеры API-запросов
- Ссылки на Swagger и pgAdmin

**Использование:** Новички начинают отсюда

---

### 2. **COURSEWORK_DOCUMENTATION.md** - Эта документация

**Содержание:**
- 3.1 Архитектура и описание компонентов
- 3.2 Полная инструкция установки
- 3.3 Тестовые сценарии
- 3.4 Ввод в эксплуатацию
- 3.5 Эта секция

**Использование:** Для курсовой работы, для преподавателя

---

### 3. **docs/screenshots/README.md** - Скриншоты

**Содержание:**
- Инструкция как делать скриншоты
- Рекомендуемые скриншоты
- Где сохранять

---

### 4. **API Документация (Swagger)**

**URL:** http://localhost:8000/docs

**Автоматически генерируется из кода:**
```
GET /api/stats
GET /api/books
GET /api/books/count
GET /api/books/faculties
GET /api/books/top-issued
POST /api/books
DELETE /api/books/{id}

GET /api/branches
POST /api/branches
DELETE /api/branches/{id}
GET /api/branches/{id}/inventory

GET /api/loan-requests/my
GET /api/loan-requests/pending
POST /api/loan-requests
POST /api/loan-requests/{id}/approve

... и другие
```

**Есть "Try it out" - можно тестировать прямо из браузера**

---

### 5. **ERD (Entity-Relationship Diagram)**

**Диаграмма связей в БД** (см. выше в разделе 3.1)

**Показывает:**
- 11 таблиц
- Связи между таблицами (1:1, 1:M, M:M)
- Первичные и внешние ключи
- Типы данных

---

### 6. **Руководство пользователя (User Guide)**

**Раздел 3.4 выше - полное описание:**
- Как зарегистрироваться
- Как искать книги
- Как создать запрос на выдачу
- Как вернуть книгу
- Как администратор одобряет запросы

---

### 7. **Руководство администратора (Admin Guide)**

**Смотри раздел 3.4 "Жизненный цикл администратора"**

**Включает:**
- Как логировать как админ
- Как видеть и одобрять запросы
- Как добавлять книги
- Как управлять филиалами
- Как смотреть отчёты

---

### 8. **Исходный код с комментариями**

#### backend/app/main.py
```python
@app.post("/api/loan-requests")
def create_loan_request(
    payload: LoanRequestCreatePayload,
    user: dict[str, Any] = Depends(require_client_or_admin),
    connection: psycopg.Connection = Depends(get_connection),
) -> dict[str, Any]:
    """
    Создание запроса на выдачу/возврат книги.
    
    Параметры:
    - book_id: ID книги
    - branch_id: ID филиала
    - request_type: 'take' (взять) или 'return' (вернуть)
    
    Возвращает:
    - id_request: ID созданного запроса
    - created_at: Время создания
    """
    # ... код ...
```

#### db/init/01_schema.sql
```sql
-- Таблица запросов на выдачу/возврат
-- Статусы: pending (ожидает), approved (одобрено), rejected (отклонено)
CREATE TABLE loan_requests (
    -- ... колонки ...
);
```

---

## Контрольный список для сдачи курсовой

Перед отправкой проверить наличие:

### Документация ✓
- [x] README.md - основная инструкция
- [x] COURSEWORK_DOCUMENTATION.md - полная документация
- [x] Этот файл с разделами 3.1-3.5

### Код ✓
- [x] backend/app/main.py - все endpoints реализованы
- [x] backend/app/schemas.py - Pydantic схемы
- [x] frontend/*.html - все страницы с правильной навигацией
- [x] frontend/app.js - вся логика включая новые функции
- [x] db/init/*.sql - все SQL скрипты

### Функциональность ✓
- [x] Навигация содержит "Кабинет" на всех страницах
- [x] "TOP 10" удален из заголовка отчётов
- [x] Таблица `loan_requests` в БД
- [x] API endpoints для запросов на выдачу/возврат
- [x] Студент видит список своих запросов
- [x] Администратор видит и может одобрять запросы
- [x] Статусы запросов отображаются правильно

### Тестирование ✓
- [x] Все 12 тестовых сценариев пройдены
- [x] Скриншоты сохранены в docs/screenshots/
- [x] API работает через Swagger

### Развёртывание ✓
- [x] docker-compose.yml готов к использованию
- [x] requirements.txt с зависимостями
- [x] SQL скрипты инициализации готовы
- [x] Инструкция по локальной установке

---

## Дополнительно: Проверка БД в pgAdmin

### Способ 1: Через веб-интерфейс Docker pgAdmin

**Если используете Docker:**

1. Откройте http://localhost:5050
2. Логин: admin@example.com / admin123
3. На левой панели: Right-click "Servers" → "Create" → "Server"
4. Заполнить:
   - Name: `library-postgres`
   - Host: `postgres` (ИЛИ `localhost` если подключаетесь с хоста)
   - Port: 5432
   - Username: library
   - Password: library123
5. Нажать "Save"
6. Развернуть: Servers → library-postgres → Databases → library_db → Schemas → public → Tables

**Можно видеть все таблицы:**
- publishers, authors, books, book_authors
- branches, faculties, app_users
- inventory, book_faculty, book_loans
- **loan_requests** ⭐ (новая таблица!)

### Способ 2: Через локальный pgAdmin (установленный на компьютер)

**Если у вас есть pgAdmin установлен локально:**

1. Откройте pgAdmin на вашем компьютере
2. Right-click "Servers" → "Register" → "Server"
3. General tab:
   - Name: `library-kyrcovaia`
4. Connection tab:
   - Host: `localhost` (если PostgreSQL локально)
   - Port: 5432
   - Maintenance database: library_db
   - Username: library
   - Password: library123
5. Нажать "Save"
6. Развернуть в левой панели и проверить таблицы

### Способ 3: Через командную строку (psql)

**Самый быстрый способ:**

```bash
# Подключиться к БД
psql -U library -d library_db -h localhost

# Показать все таблицы
\dt

# Показать структуру таблицы loan_requests
\d loan_requests

# Посчитать запросы
SELECT COUNT(*) FROM loan_requests;

# Показать все запросы со статусом pending
SELECT * FROM loan_requests WHERE status = 'pending';

# Выход
\q
```

### Способ 4: Прямое SQL в pgAdmin Web UI

В веб-интерфейсе pgAdmin:

1. Нажать на базу library_db
2. Tools → Query Tool
3. Написать SQL:
```sql
-- Показать структуру таблицы loan_requests
SELECT * FROM information_schema.columns 
WHERE table_name = 'loan_requests';

-- Показать все запросы
SELECT 
    lr.id_request,
    u.full_name,
    b.title,
    br.name,
    lr.request_type,
    lr.status,
    lr.created_at
FROM loan_requests lr
JOIN app_users u ON u.id_user = lr.id_user
JOIN books b ON b.id_book = lr.id_book
JOIN branches br ON br.id_branch = lr.id_branch;
```

4. Нажать Play (▶) или F5 для выполнения

### Проверить индексы

```sql
-- Показать индексы на таблице loan_requests
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'loan_requests';
```

**Ожидаемый результат:**
```
idx_loan_requests_user        ON loan_requests(id_user)
idx_loan_requests_status      ON loan_requests(status)
idx_loan_requests_branch      ON loan_requests(id_branch)
```

---

## Заключение

Система полностью готова к использованию:

✅ **Архитектура** - трёхуровневая, масштабируемая
✅ **БД** - нормализованная с триггерами и функциями
✅ **Backend** - FastAPI с валидацией и обработкой ошибок
✅ **Frontend** - MPA с адаптивной версткой и двумя темами
✅ **Новая функциональность** - система запросов на выдачу/возврат
✅ **Тестирование** - 12 сценариев пройдены
✅ **Документация** - полная, для разных аудиторий

**Система готова к защите курсовой работы!** 🎓

