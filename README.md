# Информационная система библиотеки

Курсовой проект: информационная система библиотеки на **PostgreSQL + PL/pgSQL + FastAPI + HTML/CSS/JavaScript**.

Приложение запускается через Docker Compose и доступно по адресу:

```text
http://localhost:8000
```

## Стек

- **База данных:** PostgreSQL 16
- **Процедурная логика БД:** PL/pgSQL
- **Backend/API:** FastAPI + psycopg
- **Frontend:** HTML5, CSS3, JavaScript, Bootstrap 5
- **Администрирование БД:** pgAdmin 4
- **Запуск:** Docker Compose
- **PWA:** manifest + service worker + иконка приложения

## Реализованные роли

В системе предусмотрены три уровня доступа:

- **Гость** — просматривает дашборд, список книг, подробную информацию о книге и филиалы.
- **Студент** — регистрируется, входит в систему, создает заявки на получение/возврат книги и видит историю выдач в личном кабинете.
- **Администратор библиотеки** — управляет книгами, филиалами, факультетами, подтверждает заявки студентов и просматривает отчеты.

Тестовые учетные записи:

```text
Администратор:
admin@example.com
admin123

Студент:
student@example.com
student123
```

## Реализованные пункты ТЗ

1. Для указанного филиала считается количество экземпляров указанной книги.
   - API: `GET /api/books/count?branch=...&title=...`
   - PL/pgSQL: `get_book_count_in_branch(...)`

2. Для указанной книги считается количество факультетов, на которых она используется в указанном филиале, и выводятся названия факультетов.
   - API: `GET /api/books/faculties?title=...&branch=...`
   - PL/pgSQL: `get_faculties_by_book(...)`

3. Реализовано добавление и изменение информации о книгах.
   - Страница: `/books`
   - API: `POST /api/books`
   - Доступ: администратор библиотеки

4. Реализовано добавление и изменение информации о филиалах.
   - Страница: `/branches`
   - API: `POST /api/branches`
   - Доступ: администратор библиотеки

5. Разработаны триггеры на пользовательские исключительные ситуации.
   - `trg_branch_delete` запрещает удалять филиал, если в нем есть книги.
   - `trg_cascade_inventory` удаляет связанные записи инвентаря при удалении книги.

Дополнительно реализовано:

- регистрация и вход студентов;
- личный кабинет;
- заявки на выдачу и возврат книг;
- подтверждение заявок администратором;
- отчет по количеству студентов, которым выдавалась конкретная книга;
- отчет “Самые выдаваемые книги”;
- подробный просмотр книги для гостя и студента;
- светлая/темная тема;
- PWA-установка приложения.

## Структура БД

Основные таблицы:

- `books` — книги;
- `authors` — авторы;
- `book_authors` — связь книг и авторов;
- `publishers` — издательства;
- `branches` — филиалы;
- `faculties` — факультеты;
- `inventory` — количество экземпляров книг по филиалам;
- `book_faculty` — использование книги факультетами в конкретном филиале;
- `app_users` — пользователи системы;
- `book_loans` — история фактических выдач;
- `loan_requests` — заявки студентов на получение/возврат.

## Основные страницы

- `/dashboard` — статистика и быстрый поиск книг.
- `/books` — список книг, фильтрация, подробный просмотр, выдача по заявке, админское добавление/редактирование/удаление.
- `/branches` — список филиалов, инвентарь филиала, аналитика по книге и факультетам, управление факультетами.
- `/reports` — отчеты администратора.
- `/account` — личный кабинет студента и рабочий кабинет администратора для подтверждения заявок.

## REST API

Основные endpoint’ы:

```text
GET  /api/health
GET  /api/stats

GET  /api/books
GET  /api/books/options
GET  /api/books/{book_id}/availability
GET  /api/books/count
GET  /api/books/faculties
GET  /api/books/top-issued
POST /api/books
DELETE /api/books/{book_id}

GET  /api/branches
GET  /api/branches/options
GET  /api/branches/{branch_id}/inventory
POST /api/branches
DELETE /api/branches/{branch_id}

GET  /api/faculties
POST /api/faculties

POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me

POST /api/loan-requests
GET  /api/loan-requests/my
GET  /api/loan-requests/pending
POST /api/loan-requests/{request_id}/approve

GET  /api/loans/my
GET  /api/reports/book-students
```

Для запросов, требующих авторизации, frontend передает заголовок:

```text
X-User-Id: <id пользователя>
```

## Запуск через Docker

Запустить проект:

```bash
docker compose up --build
```

Адреса:

```text
Приложение: http://localhost:8000
Swagger API:  http://localhost:8000/docs
pgAdmin:     http://localhost:5050
```

Доступ к pgAdmin в браузере:

```text
Email:    admin@example.com
Password: admin123
```

Подключение сервера PostgreSQL внутри Docker pgAdmin:

```text
Host: postgres
Port: 5432
Maintenance database: library_db
Username: pgadmin_user
Password: pgadmin123
```

Подключение через установленное приложение pgAdmin на Windows:

```text
Host: 127.0.0.1
Port: 5432
Maintenance database: library_db
Username: pgadmin_user
Password: pgadmin123
```

## Запуск без Docker

1. Установить PostgreSQL.
2. Создать БД `library_db`.
3. Выполнить SQL-скрипты из `db/init` по порядку:

```text
01_schema.sql
02_plsql.sql
03_seed.sql
04_auth_migration.sql
05_loan_requests_migration.sql
```

4. Создать файл `backend/.env` на основе `backend/.env.example`.
5. Установить зависимости:

```bash
cd backend
pip install -r requirements.txt
```

6. Запустить backend:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## PWA

Приложение подключено как PWA:

- manifest: `/manifest.webmanifest`;
- service worker: `/sw.js`;
- иконка: `/static/icons/icon.svg`;
- стартовая страница: `/dashboard`.

После открытия `http://localhost:8000` браузер может предложить установить приложение. В Chrome установка обычно доступна через кнопку в адресной строке или меню `Установить приложение`.

## Примеры API-запросов

Добавить или изменить книгу:

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

Посчитать экземпляры книги в филиале:

```bash
curl "http://localhost:8000/api/books/count?branch=Центральный%20филиал&title=Чистый%20код"
```

Создать заявку на выдачу книги:

```bash
curl -X POST http://localhost:8000/api/loan-requests \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 2" \
  -d '{"book_id":1,"branch_id":1,"request_type":"take"}'
```

Создать заявку на возврат книги:

```bash
curl -X POST http://localhost:8000/api/loan-requests \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 2" \
  -d '{"book_id":1,"branch_id":1,"request_type":"return"}'
```

Одобрить заявку администратором:

```bash
curl -X POST http://localhost:8000/api/loan-requests/1/approve \
  -H "Content-Type: application/json" \
  -H "X-User-Id: 1" \
  -d '{"status":"approved"}'
```

Отчет по студентам, которым выдавалась книга:

```bash
curl "http://localhost:8000/api/reports/book-students?book_id=1" \
  -H "X-User-Id: 1"
```

## Диаграммы и материалы для отчета

- ER-диаграмму можно построить в pgAdmin по текущей БД.
- Диаграммы вариантов использования и карта функций находятся в `docs/project_diagrams.html`.
- Описание диаграмм находится в `docs/project_diagrams.md`.
- Скриншоты для отчета можно складывать в `docs/screenshots`.
