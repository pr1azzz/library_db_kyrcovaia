-- ==========================================
-- 03_seed.sql (PostgreSQL)
-- Начальные данные
-- ==========================================

-- Издательства
INSERT INTO publishers(name)
VALUES
    ('Питер'),
    ('БХВ-Петербург'),
    ('O''Reilly Media')
ON CONFLICT (name) DO NOTHING;

-- Авторы
INSERT INTO authors(full_name)
VALUES
    ('Роберт Мартин'),
    ('Эрик Фримен'),
    ('Владстон Феррейра Фило'),
    ('Федор Достоевский'),
    ('Лев Толстой'),
    ('Мартин Клеппман')
ON CONFLICT (full_name) DO NOTHING;

-- Филиалы
INSERT INTO branches(name)
VALUES
    ('Центральный филиал'),
    ('Северный филиал'),
    ('Южный филиал')
ON CONFLICT (name) DO NOTHING;

-- Факультеты
INSERT INTO faculties(name)
VALUES
    ('ФКН'),
    ('Экономический'),
    ('Исторический'),
    ('Юридический')
ON CONFLICT (name) DO NOTHING;

INSERT INTO app_users(full_name, email, password_salt, password_hash, role, id_faculty)
SELECT 'Администратор библиотеки',
       'admin@example.com',
       'seed-admin',
       '34d9c5694eaa9c5fb2a38fafc8edebb8e0dd40c79d39369b7aa4db1fba4529d0',
       'admin',
       NULL
WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE email = 'admin@example.com');

INSERT INTO app_users(full_name, email, password_salt, password_hash, role, id_faculty)
SELECT 'Иван Петров',
       'student@example.com',
       'seed-client',
       'd84b638445f265065153fc3b55f738817ef6680920d39ea6d2e7f0b3720e82c4',
       'client',
       f.id_faculty
FROM faculties f
WHERE f.name = 'ФКН'
  AND NOT EXISTS (SELECT 1 FROM app_users WHERE email = 'student@example.com');

-- Книги через функцию package-аналога
SELECT library_mgmt.add_or_update_book(NULL, 'Чистый код', 2008, 464, 35, 2200, 'Питер');
SELECT library_mgmt.add_or_update_book(NULL, 'Head First Design Patterns', 2020, 694, 120, 3500, 'O''Reilly Media');
SELECT library_mgmt.add_or_update_book(NULL, 'Grokking Algorithms', 2016, 256, 150, 2900, 'БХВ-Петербург');
SELECT library_mgmt.add_or_update_book(NULL, 'Преступление и наказание', 1866, 592, 10, 900, 'Питер');
SELECT library_mgmt.add_or_update_book(NULL, 'Война и мир', 1869, 1225, 15, 1200, 'Питер');
SELECT library_mgmt.add_or_update_book(NULL, 'Designing Data-Intensive Applications', 2017, 616, 90, 4200, 'O''Reilly Media');

-- Связи книг и авторов
INSERT INTO book_authors(id_book, id_author)
SELECT b.id_book, a.id_author
  FROM books b
  JOIN authors a ON a.full_name = 'Роберт Мартин'
 WHERE b.title = 'Чистый код'
ON CONFLICT (id_book, id_author) DO NOTHING;

INSERT INTO book_authors(id_book, id_author)
SELECT b.id_book, a.id_author
  FROM books b
  JOIN authors a ON a.full_name = 'Эрик Фримен'
 WHERE b.title = 'Head First Design Patterns'
ON CONFLICT (id_book, id_author) DO NOTHING;

INSERT INTO book_authors(id_book, id_author)
SELECT b.id_book, a.id_author
  FROM books b
  JOIN authors a ON a.full_name = 'Владстон Феррейра Фило'
 WHERE b.title = 'Grokking Algorithms'
ON CONFLICT (id_book, id_author) DO NOTHING;

INSERT INTO book_authors(id_book, id_author)
SELECT b.id_book, a.id_author
  FROM books b
  JOIN authors a ON a.full_name = 'Федор Достоевский'
 WHERE b.title = 'Преступление и наказание'
ON CONFLICT (id_book, id_author) DO NOTHING;

INSERT INTO book_authors(id_book, id_author)
SELECT b.id_book, a.id_author
  FROM books b
  JOIN authors a ON a.full_name = 'Лев Толстой'
 WHERE b.title = 'Война и мир'
ON CONFLICT (id_book, id_author) DO NOTHING;

INSERT INTO book_authors(id_book, id_author)
SELECT b.id_book, a.id_author
  FROM books b
  JOIN authors a ON a.full_name = 'Мартин Клеппман'
 WHERE b.title = 'Designing Data-Intensive Applications'
ON CONFLICT (id_book, id_author) DO NOTHING;

-- Инвентарь
INSERT INTO inventory(id_book, id_branch, copies_count, times_issued)
SELECT b.id_book, br.id_branch, 9, 0
  FROM books b
  JOIN branches br ON br.name = 'Центральный филиал'
 WHERE b.title = 'Чистый код'
ON CONFLICT (id_book, id_branch) DO UPDATE
SET copies_count = EXCLUDED.copies_count,
    times_issued = EXCLUDED.times_issued;

INSERT INTO inventory(id_book, id_branch, copies_count, times_issued)
SELECT b.id_book, br.id_branch, 4, 0
  FROM books b
  JOIN branches br ON br.name = 'Северный филиал'
 WHERE b.title = 'Чистый код'
ON CONFLICT (id_book, id_branch) DO UPDATE
SET copies_count = EXCLUDED.copies_count,
    times_issued = EXCLUDED.times_issued;

INSERT INTO inventory(id_book, id_branch, copies_count, times_issued)
SELECT b.id_book, br.id_branch, 6, 0
  FROM books b
  JOIN branches br ON br.name = 'Центральный филиал'
 WHERE b.title = 'Head First Design Patterns'
ON CONFLICT (id_book, id_branch) DO UPDATE
SET copies_count = EXCLUDED.copies_count,
    times_issued = EXCLUDED.times_issued;

INSERT INTO inventory(id_book, id_branch, copies_count, times_issued)
SELECT b.id_book, br.id_branch, 8, 0
  FROM books b
  JOIN branches br ON br.name = 'Южный филиал'
 WHERE b.title = 'Grokking Algorithms'
ON CONFLICT (id_book, id_branch) DO UPDATE
SET copies_count = EXCLUDED.copies_count,
    times_issued = EXCLUDED.times_issued;

INSERT INTO inventory(id_book, id_branch, copies_count, times_issued)
SELECT b.id_book, br.id_branch, 12, 0
  FROM books b
  JOIN branches br ON br.name = 'Центральный филиал'
 WHERE b.title = 'Преступление и наказание'
ON CONFLICT (id_book, id_branch) DO UPDATE
SET copies_count = EXCLUDED.copies_count,
    times_issued = EXCLUDED.times_issued;

INSERT INTO inventory(id_book, id_branch, copies_count, times_issued)
SELECT b.id_book, br.id_branch, 7, 0
  FROM books b
  JOIN branches br ON br.name = 'Северный филиал'
 WHERE b.title = 'Война и мир'
ON CONFLICT (id_book, id_branch) DO UPDATE
SET copies_count = EXCLUDED.copies_count,
    times_issued = EXCLUDED.times_issued;

INSERT INTO inventory(id_book, id_branch, copies_count, times_issued)
SELECT b.id_book, br.id_branch, 5, 0
  FROM books b
  JOIN branches br ON br.name = 'Южный филиал'
 WHERE b.title = 'Designing Data-Intensive Applications'
ON CONFLICT (id_book, id_branch) DO UPDATE
SET copies_count = EXCLUDED.copies_count,
    times_issued = EXCLUDED.times_issued;

-- Связь книга-филиал-факультет
INSERT INTO book_faculty(id_book, id_branch, id_faculty)
SELECT b.id_book, br.id_branch, f.id_faculty
  FROM books b
  JOIN branches br ON br.name = 'Центральный филиал'
  JOIN faculties f ON f.name = 'ФКН'
 WHERE b.title = 'Чистый код'
ON CONFLICT (id_book, id_branch, id_faculty) DO NOTHING;

INSERT INTO book_faculty(id_book, id_branch, id_faculty)
SELECT b.id_book, br.id_branch, f.id_faculty
  FROM books b
  JOIN branches br ON br.name = 'Центральный филиал'
  JOIN faculties f ON f.name = 'ФКН'
 WHERE b.title = 'Head First Design Patterns'
ON CONFLICT (id_book, id_branch, id_faculty) DO NOTHING;

INSERT INTO book_faculty(id_book, id_branch, id_faculty)
SELECT b.id_book, br.id_branch, f.id_faculty
  FROM books b
  JOIN branches br ON br.name = 'Южный филиал'
  JOIN faculties f ON f.name = 'ФКН'
 WHERE b.title = 'Grokking Algorithms'
ON CONFLICT (id_book, id_branch, id_faculty) DO NOTHING;

INSERT INTO book_faculty(id_book, id_branch, id_faculty)
SELECT b.id_book, br.id_branch, f.id_faculty
  FROM books b
  JOIN branches br ON br.name = 'Центральный филиал'
  JOIN faculties f ON f.name = 'Исторический'
 WHERE b.title = 'Преступление и наказание'
ON CONFLICT (id_book, id_branch, id_faculty) DO NOTHING;

INSERT INTO book_faculty(id_book, id_branch, id_faculty)
SELECT b.id_book, br.id_branch, f.id_faculty
  FROM books b
  JOIN branches br ON br.name = 'Северный филиал'
  JOIN faculties f ON f.name = 'Исторический'
 WHERE b.title = 'Война и мир'
ON CONFLICT (id_book, id_branch, id_faculty) DO NOTHING;

INSERT INTO book_faculty(id_book, id_branch, id_faculty)
SELECT b.id_book, br.id_branch, f.id_faculty
  FROM books b
  JOIN branches br ON br.name = 'Южный филиал'
  JOIN faculties f ON f.name = 'Экономический'
 WHERE b.title = 'Designing Data-Intensive Applications'
ON CONFLICT (id_book, id_branch, id_faculty) DO NOTHING;
