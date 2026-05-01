# Информационная система библиотеки (PostgreSQL + PLpgSQL + FastAPI + MPA)

Проект переделан в **вариант 3**:
- хранение данных в **PostgreSQL**;
- администрирование через **pgAdmin 4**;
- фронтенд в формате **многостраничного приложения (MPA)**: отдельные страницы для каждого раздела.

## 1) Стек и обоснование

- **БД:** PostgreSQL 16 + PL/pgSQL
- **Клиент БД:** pgAdmin 4
- **Backend/API:** Python + FastAPI + psycopg
- **Frontend:** HTML5 + CSS3 + JavaScript + Bootstrap 5

Почему FastAPI оставлен:
- быстрый REST-слой и валидация данных через Pydantic;
- чистая интеграция с PostgreSQL (`psycopg`);
- минимальный объем кода для CRUD + отчетов + обработка ошибок триггеров.

## 2) Что реализовано по ТЗ

### База данных и PL/pgSQL

Таблицы:
- `books`
- `authors`
- `book_authors`
- `publishers`
- `branches`
- `faculties`
- `inventory`
- `book_faculty`
- `app_users`
- `book_loans`
- `loan_requests`

Реализованные объекты:
1. Функция `get_book_count_in_branch(p_branch_name, p_book_title)`.
2. Процедура `get_faculties_by_book(p_book_title, p_branch_name)` (через `refcursor`).
3. Аналог пакета `library_mgmt` в PostgreSQL:
   - схема `library_mgmt`;
   - функции `library_mgmt.add_or_update_book(...)` и `library_mgmt.add_or_update_branch(...)`.
4. Триггер `trg_branch_delete` с пользовательской ошибкой (аналог `ex_cant_delete_branch`): запрещает удалять филиал с книгами.
5. Триггер `trg_cascade_inventory`: каскадно удаляет связанные записи при удалении книги.

### REST API

Обязательные endpoint’ы:
- `GET /api/books/count?branch=...&title=...`
- `GET /api/books/faculties?title=...&branch=...`
- `POST /api/books`
- `POST /api/branches`
- `DELETE /api/books/{id}`
- `DELETE /api/branches/{id}`

Дополнительные endpoint’ы для UI:
- `GET /api/stats`
- `GET /api/books` (фильтры: `title`, `author`, `publisher`, `year`)
- `GET /api/books/options`
- `GET /api/books/{book_id}/availability`
- `GET /api/books/top-issued?limit=10`
- `GET /api/branches`
- `GET /api/branches/options`
- `GET /api/branches/{id}/inventory`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/loan-requests/my`
- `GET /api/loan-requests/pending`
- `POST /api/loan-requests`
- `POST /api/loan-requests/{id}/approve`
- `GET /api/reports/book-students?book_id=...`

### Frontend (многостраничный)

Отдельные страницы:
- `/dashboard` — статистика + быстрый поиск
- `/books` — таблица книг, фильтры, add/edit/delete
- `/branches` — филиалы, add/edit/delete, просмотр книг и аналитики
- `/reports` — отчет книга+филиал + самые выдаваемые книги
- `/account` — кабинет студента и администратора библиотеки

Дополнительно:
- адаптивная верстка;
- светлая/темная тема;
- уведомления об ошибках API;
- понятная ошибка при запрете удаления филиала триггером.

## 3) Структура проекта

```text
.
├─ backend/
│  ├─ app/
│  │  ├─ config.py
│  │  ├─ database.py
│  │  ├─ main.py
│  │  └─ schemas.py
│  ├─ .env.example
│  ├─ Dockerfile
│  └─ requirements.txt
├─ db/
│  └─ init/
│     ├─ 01_schema.sql
│     ├─ 02_plsql.sql
│     └─ 03_seed.sql
├─ frontend/
│  ├─ index.html
│  ├─ dashboard.html
│  ├─ books.html
│  ├─ branches.html
│  ├─ reports.html
│  ├─ styles.css
│  └─ app.js
├─ docs/
│  └─ screenshots/
│     └─ README.md
└─ docker-compose.yml
```

## 4) Запуск через Docker Compose

### Шаг 1. Запуск
```bash
docker compose up --build
```

### Шаг 2. Адреса сервисов
- Веб-приложение + API: `http://localhost:8000`
- Swagger API: `http://localhost:8000/docs`
- pgAdmin 4: `http://localhost:5050`

### Шаг 3. Логин в pgAdmin
- Email: `admin@example.com`
- Password: `admin123`

### Шаг 4. Подключение сервера в pgAdmin
В pgAdmin создайте новый Server:
- Host: `postgres` (если pgAdmin в том же docker-compose)
- Port: `5432`
- Maintenance DB: `library_db`
- Username: `library`
- Password: `library123`

Если подключаетесь к PostgreSQL с хоста (вне docker-сети), используйте:
- Host: `localhost`
- Port: `5432`

## 5) Запуск без Docker

1. Установить PostgreSQL и создать БД `library_db`.
2. Выполнить SQL-скрипты по порядку:
   - `db/init/01_schema.sql`
   - `db/init/02_plsql.sql`
   - `db/init/03_seed.sql`
3. В `backend` создать `.env` на основе `.env.example`.
4. Установить зависимости:
```bash
cd backend
pip install -r requirements.txt
```
5. Запустить backend:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
6. Открыть:
- `http://localhost:8000/dashboard`

## 6) Примеры API-запросов

### Роли и тестовые пользователи

В системе есть три уровня доступа:
- **Гость** — просматривает книги, филиалы, статистику и отчеты.
- **Клиент / студент** — может брать книгу, после чего запись появляется в личном кабинете.
- **Администратор / библиотекарь** — управляет книгами, филиалами и факультетами.

Тестовые учетные записи:
- Администратор: `admin@example.com` / `admin123`
- Студент: `student@example.com` / `student123`

Для запросов, требующих авторизации, передается заголовок `X-User-Id`.
В UI он устанавливается автоматически после входа.

### Добавить/обновить книгу
```bash
curl -X POST http://localhost:8000/api/books \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -d '{
    "title":"Новая книга",
    "publication_year":2024,
    "pages_count":320,
    "illustrations_count":25,
    "price":1500,
    "publisher_name":"Питер",
    "authors":["Иван Иванов"]
  }'
```

### Количество экземпляров
```bash
curl "http://localhost:8000/api/books/count?branch=Центральный%20филиал&title=Чистый%20код"
```

### Попытка удаления филиала с книгами (получите сообщение от триггера)
```bash
curl -X DELETE http://localhost:8000/api/branches/1 -H "X-User-Id: 1"
```

### Создать заявку на выдачу книги
```bash
curl -X POST http://localhost:8000/api/loan-requests \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 2" \
  -d '{"book_id":1,"branch_id":1,"request_type":"take"}'
```

### Создать заявку на возврат книги
```bash
curl -X POST http://localhost:8000/api/loan-requests \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 2" \
  -d '{"book_id":1,"branch_id":1,"request_type":"return"}'
```

### Одобрить заявку библиотекарем
```bash
curl -X POST http://localhost:8000/api/loan-requests/1/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -d '{"status":"approved"}'
```

### Количество студентов, которым выдавалась конкретная книга
```bash
curl "http://localhost:8000/api/reports/book-students?book_id=1" \
  -H "X-User-Id: 1"
```

## 7) Скриншоты для отчета

Папка для скриншотов: `docs/screenshots`.

Рекомендуемые файлы перечислены в `docs/screenshots/README.md`.
