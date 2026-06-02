const apiBase = '/api';
const currentPage = document.body.dataset.page || 'dashboard';

const state = {
    books: [],
    branches: [],
    faculties: [],
    branchDetails: null,
    user: JSON.parse(localStorage.getItem('library-user') || 'null'),
};

const toastEl = document.getElementById('appToast');
const toastBody = document.getElementById('appToastBody');
const toastInstance = toastEl ? new bootstrap.Toast(toastEl, { delay: 3800 }) : null;
let lastToast = { message: '', shownAt: 0 };

function showToast(message, variant = 'info') {
    if (!toastEl || !toastBody || !toastInstance) {
        return;
    }

    const now = Date.now();
    if (message === lastToast.message && now - lastToast.shownAt < 5000) {
        return;
    }
    lastToast = { message, shownAt: now };

    const variants = {
        info: { bg: '#184660', color: '#ffffff' },
        success: { bg: '#126646', color: '#ffffff' },
        danger: { bg: '#8b1d31', color: '#ffffff' },
    };

    const palette = variants[variant] || variants.info;
    toastEl.style.background = palette.bg;
    toastEl.style.color = palette.color;
    toastBody.textContent = message;
    toastInstance.show();
}

function buildQuery(params) {
    const searchParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            searchParams.append(key, String(value));
        }
    });

    const queryString = searchParams.toString();
    return queryString ? `?${queryString}` : '';
}

async function apiRequest(path, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };

    if (state.user?.id_user) {
        headers['X-User-Id'] = String(state.user.id_user);
    }

    let response;
    try {
        response = await fetch(`${apiBase}${path}`, {
            headers,
            ...options,
        });
    } catch (error) {
        const offlineHint = navigator.onLine === false
            ? 'В DevTools включен Offline. Откройте Network и выберите No throttling/Online.'
            : 'Не удалось подключиться к API. Проверьте, что Docker и http://localhost:8000 запущены.';
        throw new Error(offlineHint);
    }

    const rawText = await response.text();
    let payload = null;

    if (rawText) {
        try {
            payload = JSON.parse(rawText);
        } catch {
            payload = { detail: rawText };
        }
    }

    if (!response.ok) {
        const detail = payload?.detail || payload?.message || `Ошибка запроса: ${response.status}`;
        throw new Error(detail);
    }

    return payload;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatMoney(value) {
    if (value === null || value === undefined || value === '') {
        return '-';
    }

    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        maximumFractionDigits: 2,
    }).format(Number(value));
}

function parseDbDate(value) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    const rawValue = String(value);
    const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(rawValue);
    return new Date(hasTimeZone ? rawValue : `${rawValue}Z`);
}

function formatMoscowDate(value) {
    const date = parseDbDate(value);
    if (!date || Number.isNaN(date.getTime())) {
        return '-';
    }

    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).format(date);
}

function normalizeSearchText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function moscowDateKey(value) {
    const date = parseDbDate(value);
    if (!date || Number.isNaN(date.getTime())) {
        return '';
    }

    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('library-theme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'light' ? 'dark' : 'light');
}

function initTheme() {
    const savedTheme = localStorage.getItem('library-theme') || 'light';
    applyTheme(savedTheme);

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeToggleBtnDesktop = document.getElementById('themeToggleBtnDesktop');

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    if (themeToggleBtnDesktop) {
        themeToggleBtnDesktop.addEventListener('click', toggleTheme);
    }
}

function initNav() {
    const navLinks = document.querySelectorAll('#mainNav [data-page]');
    navLinks.forEach((link) => {
        link.classList.toggle('active', link.dataset.page === currentPage);
    });
}

function isAdmin() {
    return state.user?.role === 'admin';
}

function isClient() {
    return state.user?.role === 'client';
}

function roleLabel(user = state.user) {
    if (!user) {
        return '';
    }
    return user.role === 'admin' ? 'Администратор библиотеки' : 'Студент';
}

function setUser(user) {
    state.user = user;
    if (user) {
        localStorage.setItem('library-user', JSON.stringify(user));
    } else {
        localStorage.removeItem('library-user');
    }
    renderAuthUI();
    window.location.reload();
}

function ensureAuthModal() {
    if (document.getElementById('authModal')) {
        return;
    }

    document.body.insertAdjacentHTML(
        'beforeend',
        `
        <div class="modal fade" id="authModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <form id="authForm">
                        <div class="modal-header">
                            <h5 class="modal-title" id="authModalTitle">Вход</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                        </div>
                        <div class="modal-body">
                            <input id="authMode" type="hidden" value="login">
                            <div id="registerFields" class="d-none">
                                <label for="authFullName" class="form-label">ФИО</label>
                                <input id="authFullName" type="text" class="form-control mb-2">
                                <label for="authFaculty" class="form-label">Факультет</label>
                                <select id="authFaculty" class="form-select mb-2"></select>
                            </div>
                            <label for="authEmail" class="form-label">Email</label>
                            <input id="authEmail" type="email" class="form-control mb-2" required>
                            <label for="authPassword" class="form-label">Пароль</label>
                            <input id="authPassword" type="password" class="form-control" required>
                            <button id="authModeToggle" class="btn btn-link px-0 mt-2" type="button">Создать аккаунт студента</button>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button id="authSubmitBtn" type="submit" class="btn btn-primary">Войти</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        `,
    );
}

async function openAuthModal(mode = 'login') {
    ensureAuthModal();
    const modalEl = document.getElementById('authModal');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const modeInput = document.getElementById('authMode');
    const title = document.getElementById('authModalTitle');
    const registerFields = document.getElementById('registerFields');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleBtn = document.getElementById('authModeToggle');
    const facultySelect = document.getElementById('authFaculty');

    if (!state.faculties.length) {
        state.faculties = await fetchFaculties();
    }

    fillSelectOptions(
        facultySelect,
        state.faculties.map((faculty) => ({ value: faculty.id_faculty, label: faculty.name })),
        'Выберите факультет',
    );

    modeInput.value = mode;
    const isRegister = mode === 'register';
    title.textContent = isRegister ? 'Регистрация студента' : 'Вход';
    registerFields.classList.toggle('d-none', !isRegister);
    submitBtn.textContent = isRegister ? 'Зарегистрироваться' : 'Войти';
    toggleBtn.textContent = isRegister ? 'У меня уже есть аккаунт' : 'Создать аккаунт студента';
    modal.show();
}

function renderAuthUI() {
    document.body.classList.remove('role-guest', 'role-client', 'role-admin');
    document.body.classList.add(state.user?.role === 'admin' ? 'role-admin' : state.user?.role === 'client' ? 'role-client' : 'role-guest');

    const topbarInner = document.querySelector('.topbar .container-fluid');
    if (!topbarInner) {
        return;
    }

    let authBox = document.getElementById('authBox');
    if (!authBox) {
        authBox = document.createElement('div');
        authBox.id = 'authBox';
        authBox.className = 'auth-box d-flex align-items-center gap-2 flex-wrap justify-content-end';
        topbarInner.appendChild(authBox);
    }

    if (state.user) {
        authBox.innerHTML = `
            <span class="auth-user">${escapeHtml(state.user.full_name)}</span>
            <a class="btn btn-sm btn-outline-light" href="/account">Кабинет</a>
            <button id="logoutBtn" class="btn btn-sm btn-outline-light" type="button">Выйти</button>
        `;
    } else {
        authBox.innerHTML = `
            <button id="loginBtn" class="btn btn-sm btn-outline-light" type="button">Войти</button>
        `;
    }

    document.querySelectorAll('[data-admin-only]').forEach((el) => {
        el.classList.toggle('d-none', !isAdmin());
    });
    document.querySelectorAll('[data-client-only]').forEach((el) => {
        el.classList.toggle('d-none', !isClient());
    });
}

function initAuth() {
    ensureAuthModal();
    renderAuthUI();

    document.addEventListener('click', async (event) => {
        if (event.target.closest('#loginBtn')) {
            await openAuthModal('login');
        } else if (event.target.closest('#logoutBtn')) {
            setUser(null);
            showToast('Вы вышли из системы', 'info');
        } else if (event.target.closest('#authModeToggle')) {
            const mode = document.getElementById('authMode')?.value === 'login' ? 'register' : 'login';
            await openAuthModal(mode);
        } else if (event.target.closest('[data-action="select-availability"]')) {
            const button = event.target.closest('[data-action="select-availability"]');
            document.getElementById('borrowBranchSelect').value = button.dataset.branchId;
            document.querySelectorAll('.availability-option').forEach((item) => item.classList.remove('active'));
            button.classList.add('active');
        }
    });

    const authForm = document.getElementById('authForm');
    authForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const mode = document.getElementById('authMode').value;
        const payload = {
            email: document.getElementById('authEmail').value.trim(),
            password: document.getElementById('authPassword').value,
        };

        if (mode === 'register') {
            payload.full_name = document.getElementById('authFullName').value.trim();
            payload.faculty_id = document.getElementById('authFaculty').value
                ? Number(document.getElementById('authFaculty').value)
                : null;
        }

        try {
            const result = await apiRequest(mode === 'register' ? '/auth/register' : '/auth/login', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            setUser(result.user);
            bootstrap.Modal.getOrCreateInstance(document.getElementById('authModal')).hide();
            showToast(result.message, 'success');
        } catch (error) {
            showToast(error.message, 'danger');
        }
    });

    document.addEventListener('submit', async (event) => {
        if (!event.target.closest('#borrowForm')) {
            return;
        }

        event.preventDefault();
        try {
            if (!document.getElementById('borrowBranchSelect').value) {
                showToast('Для этой книги нет свободных экземпляров', 'info');
                return;
            }
            await createLoanRequest(
                document.getElementById('borrowBookId').value,
                document.getElementById('borrowBranchSelect').value,
                'take'
            );
            bootstrap.Modal.getOrCreateInstance(document.getElementById('borrowModal')).hide();
            showToast('Запрос на выдачу книги создан. Ожидайте одобрения библиотекаря', 'success');
        } catch (error) {
            showToast(error.message, 'danger');
        }
    });
}

function ensureBorrowModal() {
    if (document.getElementById('borrowModal')) {
        return;
    }

    document.body.insertAdjacentHTML(
        'beforeend',
        `
        <div class="modal fade" id="borrowModal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <form id="borrowForm">
                        <div class="modal-header">
                            <h5 class="modal-title">Взять книгу</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Закрыть"></button>
                        </div>
                        <div class="modal-body">
                            <input id="borrowBookId" type="hidden">
                            <input id="borrowBranchSelect" type="hidden" required>
                            <div class="borrow-layout">
                                <div class="borrow-book-panel">
                                    <div class="text-muted">Книга</div>
                                    <div id="borrowBookTitle" class="borrow-book-title"></div>
                                </div>
                                <div>
                                    <label class="form-label">Доступна в филиалах</label>
                                    <div id="borrowAvailabilityList" class="availability-grid"></div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Отмена</button>
                            <button type="submit" class="btn btn-primary">Взять</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        `,
    );
}

async function openBorrowModal(bookId, title) {
    if (!state.user) {
        await openAuthModal('login');
        return;
    }

    if (!isClient() && !isAdmin()) {
        showToast('Книги могут брать только студенты и администраторы', 'danger');
        return;
    }

    ensureBorrowModal();
    const branches = await fetchBookAvailability(bookId);
    document.getElementById('borrowBookId').value = bookId;
    document.getElementById('borrowBranchSelect').value = '';
    document.getElementById('borrowBookTitle').textContent = title;
    const availabilityList = document.getElementById('borrowAvailabilityList');

    if (!branches.length) {
        availabilityList.innerHTML = '<div class="text-muted">Свободных экземпляров нет ни в одном филиале.</div>';
    } else {
        availabilityList.innerHTML = branches
            .map(
                (branch, index) => `
                    <button class="availability-option ${index === 0 ? 'active' : ''}" type="button" data-action="select-availability" data-branch-id="${branch.id_branch}">
                        <span>${branch.branch_name}</span>
                        <strong>${branch.copies_count} экз.</strong>
                    </button>
                `,
            )
            .join('');
        document.getElementById('borrowBranchSelect').value = branches[0].id_branch;
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('borrowModal')).show();
}

async function fetchStats() {
    return apiRequest('/stats');
}

async function fetchBooks(filters = {}) {
    return apiRequest(`/books${buildQuery(filters)}`);
}

async function fetchBranches() {
    return apiRequest('/branches');
}

async function fetchBookOptions() {
    return apiRequest('/books/options');
}

async function fetchBranchOptions() {
    return apiRequest('/branches/options');
}

async function fetchFaculties() {
    return apiRequest('/faculties');
}

async function fetchTopIssued(limit = 10) {
    return apiRequest(`/books/top-issued${buildQuery({ limit })}`);
}

async function fetchBranchInventory(branchId) {
    return apiRequest(`/branches/${branchId}/inventory`);
}

async function fetchBookAvailability(bookId) {
    return apiRequest(`/books/${bookId}/availability`);
}

async function fetchBookAdminDetails(bookId) {
    return apiRequest(`/books/${bookId}/admin-details`);
}

async function fetchMyLoans() {
    return apiRequest('/loans/my');
}

async function borrowBook(bookId, branchId) {
    return apiRequest('/loans', {
        method: 'POST',
        body: JSON.stringify({ book_id: Number(bookId), branch_id: Number(branchId) }),
    });
}

async function saveFaculty(payload) {
    return apiRequest('/faculties', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}

async function deleteFaculty(facultyId) {
    return apiRequest(`/faculties/${facultyId}`, { method: 'DELETE' });
}

async function fetchFacultyBooks(facultyId) {
    return apiRequest(`/faculties/${facultyId}/books`);
}

async function updateProfile(payload) {
    return apiRequest('/auth/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}

async function fetchBookStudentReport(bookId) {
    return apiRequest(`/reports/book-students${buildQuery({ book_id: bookId })}`);
}

async function returnLoan(loanId) {
    return apiRequest(`/loans/${loanId}/return`, { method: 'POST' });
}

async function createLoanRequest(bookId, branchId, requestType) {
    return apiRequest('/loan-requests', {
        method: 'POST',
        body: JSON.stringify({ book_id: Number(bookId), branch_id: Number(branchId), request_type: requestType }),
    });
}

async function fetchMyLoanRequests() {
    return apiRequest('/loan-requests/my');
}

async function fetchPendingLoanRequests(branchId = null) {
    return apiRequest(`/loan-requests/pending${branchId ? buildQuery({ branch_id: branchId }) : ''}`);
}

async function fetchAllLoanRequests() {
    return apiRequest('/loan-requests');
}

async function approveLoanRequest(requestId, status) {
    return apiRequest(`/loan-requests/${requestId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ status }),
    });
}

async function getBookBranchAnalytics(bookTitle, branchName) {
    const [countData, facultiesData] = await Promise.all([
        apiRequest(`/books/count${buildQuery({ title: bookTitle, branch: branchName })}`),
        apiRequest(`/books/faculties${buildQuery({ title: bookTitle, branch: branchName })}`),
    ]);

    return {
        copiesCount: countData.copies_count ?? 0,
        facultiesCount: facultiesData.faculties_count ?? (facultiesData.faculties || []).length,
        faculties: facultiesData.faculties || [],
    };
}

function fillSelectOptions(select, options, placeholder) {
    if (!select) {
        return;
    }

    const placeholderOption = `<option value="">${placeholder}</option>`;
    select.innerHTML = `${placeholderOption}${options
        .map((item) => `<option value="${item.value}">${item.label}</option>`)
        .join('')}`;
}

function renderFacultiesTable(targetBody, faculties) {
    if (!targetBody) {
        return;
    }

    if (!faculties.length) {
        targetBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-2">Нет данных</td></tr>';
        return;
    }

    targetBody.innerHTML = faculties
        .map(
            (row) => `
                <tr>
                    <td>${row.faculty_name || '-'}</td>
                    <td>${row.usage_count ?? 0}</td>
                </tr>
            `,
        )
        .join('');
}

function renderTopIssuedTable(targetBody, rows) {
    if (!targetBody) {
        return;
    }

    if (!rows.length) {
        targetBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-3">Нет данных</td></tr>';
        return;
    }

    targetBody.innerHTML = rows
        .map(
            (row) => `
                <tr>
                    <td>${row.title}</td>
                    <td>${row.total_issued ?? 0}</td>
                </tr>
            `,
        )
        .join('');
}

async function initDashboardPage() {
    const statBooks = document.getElementById('statBooks');
    const statBranches = document.getElementById('statBranches');
    const statFaculties = document.getElementById('statFaculties');
    const quickSearchInput = document.getElementById('quickSearchInput');
    const quickSearchForm = document.getElementById('quickSearchForm');
    const dashboardSearchTableBody = document.querySelector('#dashboardSearchTable tbody');

    function renderDashboardRows(rows) {
        if (!dashboardSearchTableBody) {
            return;
        }

        if (!rows.length) {
            dashboardSearchTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Ничего не найдено</td></tr>';
            return;
        }

        dashboardSearchTableBody.innerHTML = rows
            .map(
                (book) => `
                    <tr>
                        <td>${book.title || '-'}</td>
                        <td>${book.authors || '-'}</td>
                        <td>${book.publication_year || '-'}</td>
                        <td>${formatMoney(book.price)}</td>
                    </tr>
                `,
            )
            .join('');
    }

    async function refreshSearchByTitle(title) {
        const rows = await fetchBooks({ title });
        renderDashboardRows(rows.slice(0, 20));
    }

    if (quickSearchForm) {
        quickSearchForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            try {
                await refreshSearchByTitle(quickSearchInput?.value.trim() || '');
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    try {
        const stats = await fetchStats();
        if (statBooks) statBooks.textContent = stats.books ?? 0;
        if (statBranches) statBranches.textContent = stats.branches ?? 0;
        if (statFaculties) statFaculties.textContent = stats.faculties ?? 0;

        await refreshSearchByTitle('');
    } catch (error) {
        showToast(`Ошибка загрузки дашборда: ${error.message}`, 'danger');
    }
}

async function initBooksPage() {
    const booksTableBody = document.querySelector('#booksTable tbody');
    const filterAuthor = document.getElementById('filterAuthor');
    const filterPublisher = document.getElementById('filterPublisher');
    const filterYear = document.getElementById('filterYear');
    const bookFilterForm = document.getElementById('bookFilterForm');
    const addBookBtn = document.getElementById('addBookBtn');

    const bookForm = document.getElementById('bookForm');
    const bookModalEl = document.getElementById('bookModal');
    const bookModal = bookModalEl ? new bootstrap.Modal(bookModalEl) : null;

    const fields = {
        modalTitle: document.getElementById('bookModalTitle'),
        id: document.getElementById('bookId'),
        title: document.getElementById('bookTitle'),
        year: document.getElementById('bookYear'),
        price: document.getElementById('bookPrice'),
        pages: document.getElementById('bookPages'),
        illustrations: document.getElementById('bookIllustrations'),
        publisher: document.getElementById('bookPublisher'),
        authors: document.getElementById('bookAuthors'),
        branchFacultyEditor: document.getElementById('bookBranchFacultyEditor'),
        detailsTitle: document.getElementById('bookDetailsTitle'),
        detailsAuthors: document.getElementById('bookDetailsAuthors'),
        detailsYear: document.getElementById('bookDetailsYear'),
        detailsPublisher: document.getElementById('bookDetailsPublisher'),
        detailsPrice: document.getElementById('bookDetailsPrice'),
        detailsPages: document.getElementById('bookDetailsPages'),
        detailsIllustrations: document.getElementById('bookDetailsIllustrations'),
    };

    const filters = {
        author: '',
        publisher: '',
        year: '',
    };

    function renderBooksTable() {
        if (!booksTableBody) {
            return;
        }

        if (!state.books.length) {
            booksTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Список книг пуст</td></tr>';
            return;
        }

        booksTableBody.innerHTML = state.books
            .map((book) => {
                const detailAction = `<button class="btn btn-sm btn-outline-secondary me-1" data-action="view-book" data-id="${book.id_book}">Подробнее</button>`;
                const adminActions = isAdmin()
                    ? `
                        <button class="btn btn-sm btn-outline-primary me-1" data-action="edit-book" data-id="${book.id_book}">Редактировать</button>
                        <button class="btn btn-sm btn-outline-danger" data-action="delete-book" data-id="${book.id_book}">Удалить</button>
                    `
                    : '';
                const clientActions = isClient()
                    ? `<button class="btn btn-sm btn-primary" data-action="borrow-book" data-id="${book.id_book}">Взять</button>`
                    : '';
                const actions = `${detailAction}${clientActions}${adminActions}`;

                return `
                    <tr>
                        <td>${escapeHtml(book.title || '-')}</td>
                        <td>${escapeHtml(book.authors || '-')}</td>
                        <td>${book.publication_year || '-'}</td>
                        <td>${escapeHtml(book.publisher_name || '-')}</td>
                        <td>${formatMoney(book.price)}</td>
                        <td class="text-end">${actions}</td>
                    </tr>
                `;
            })
            .join('');
    }

    async function loadBooks() {
        state.books = await fetchBooks({
            author: filters.author,
            publisher: filters.publisher,
            year: filters.year,
        });
        renderBooksTable();
    }

    function renderBookBranchFacultyEditor(rows = []) {
        if (!fields.branchFacultyEditor) {
            return;
        }

        if (!state.branches.length) {
            fields.branchFacultyEditor.innerHTML = '<div class="text-muted">Сначала добавьте филиалы.</div>';
            return;
        }

        // Админ редактирует связи книги сразу в двух существующих таблицах: inventory и book_faculty.
        const byBranch = new Map(rows.map((row) => [Number(row.id_branch), row]));
        fields.branchFacultyEditor.innerHTML = state.branches
            .map((branch) => {
                const row = byBranch.get(Number(branch.id_branch)) || {};
                const selected = new Set((row.faculty_ids || []).map(Number));
                const facultyOptions = state.faculties.length
                    ? state.faculties
                          .map(
                              (faculty) => `
                                <label class="faculty-check">
                                    <input class="form-check-input" type="checkbox" value="${faculty.id_faculty}" data-role="faculty" ${selected.has(Number(faculty.id_faculty)) ? 'checked' : ''}>
                                    <span>${escapeHtml(faculty.name)}</span>
                                </label>
                            `,
                          )
                          .join('')
                    : '<div class="text-muted small">Факультеты пока не добавлены.</div>';

                return `
                    <div class="inventory-row" data-branch-id="${branch.id_branch}">
                        <div>
                            <div class="fw-semibold">${escapeHtml(branch.name)}</div>
                            <div class="text-muted small">Филиал</div>
                        </div>
                        <div>
                            <label class="form-label small">Экземпляров</label>
                            <input class="form-control" type="number" min="0" value="${row.copies_count ?? 0}" data-role="copies">
                        </div>
                        <div>
                            <label class="form-label small">Факультеты</label>
                            <div class="faculty-check-list">${facultyOptions}</div>
                        </div>
                    </div>
                `;
            })
            .join('');
    }

    function collectBookBranchFaculties() {
        if (!fields.branchFacultyEditor) {
            return [];
        }

        return [...fields.branchFacultyEditor.querySelectorAll('.inventory-row')].map((row) => ({
            branch_id: Number(row.dataset.branchId),
            copies_count: Number(row.querySelector('[data-role="copies"]')?.value || 0),
            faculty_ids: [...row.querySelectorAll('[data-role="faculty"]:checked')].map((input) => Number(input.value)),
        }));
    }

    async function ensureBookAdminOptions() {
        if (!isAdmin()) {
            return;
        }
        const [branches, faculties] = await Promise.all([fetchBranches(), fetchFaculties()]);
        state.branches = branches;
        state.faculties = faculties;
    }

    function openBookModalForCreate() {
        if (!fields.modalTitle) {
            return;
        }

        fields.modalTitle.textContent = 'Добавить книгу';
        fields.id.value = '';
        fields.title.value = '';
        fields.year.value = '';
        fields.price.value = '';
        fields.pages.value = '';
        fields.illustrations.value = '';
        fields.publisher.value = '';
        fields.authors.value = '';
        renderBookBranchFacultyEditor([]);
    }

    async function openBookModalForEdit(bookId) {
        const book = state.books.find((item) => Number(item.id_book) === Number(bookId));
        if (!book) {
            showToast('Книга для редактирования не найдена', 'danger');
            return;
        }

        const details = await fetchBookAdminDetails(bookId);
        fields.modalTitle.textContent = 'Редактировать книгу';
        fields.id.value = book.id_book;
        fields.title.value = book.title || '';
        fields.year.value = book.publication_year || '';
        fields.price.value = book.price ?? '';
        fields.pages.value = book.pages_count ?? '';
        fields.illustrations.value = book.illustrations_count ?? '';
        fields.publisher.value = book.publisher_name || '';
        fields.authors.value = book.authors || '';
        renderBookBranchFacultyEditor(details.branches || []);

        if (bookModal) {
            bookModal.show();
        }
    }

    function openBookDetailsModal(bookId) {
        const book = state.books.find((item) => Number(item.id_book) === Number(bookId));
        if (!book) {
            showToast('Книга не найдена', 'danger');
            return;
        }

        fields.detailsTitle.textContent = book.title || 'Информация о книге';
        fields.detailsAuthors.textContent = book.authors || '-';
        fields.detailsYear.textContent = book.publication_year || '-';
        fields.detailsPublisher.textContent = book.publisher_name || '-';
        fields.detailsPrice.textContent = formatMoney(book.price);
        fields.detailsPages.textContent = book.pages_count ?? '-';
        fields.detailsIllustrations.textContent = book.illustrations_count ?? '-';
        bootstrap.Modal.getOrCreateInstance(document.getElementById('bookDetailsModal')).show();
    }

    async function submitBookForm(event) {
        event.preventDefault();

        const payload = {
            id_book: fields.id.value ? Number(fields.id.value) : null,
            title: fields.title.value.trim(),
            publication_year: fields.year.value ? Number(fields.year.value) : null,
            pages_count: fields.pages.value ? Number(fields.pages.value) : null,
            illustrations_count: fields.illustrations.value ? Number(fields.illustrations.value) : null,
            price: fields.price.value ? Number(fields.price.value) : null,
            publisher_name: fields.publisher.value.trim() || null,
            authors: fields.authors.value
                .split(',')
                .map((name) => name.trim())
                .filter(Boolean),
            branch_faculties: isAdmin() ? collectBookBranchFaculties() : null,
        };

        await apiRequest('/books', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (bookModal) {
            bookModal.hide();
        }

        showToast('Книга сохранена', 'success');
        await loadBooks();
    }

    async function deleteBook(bookId) {
        const confirmed = window.confirm('Удалить книгу? Будут удалены связанные записи инвентаря и факультетов.');
        if (!confirmed) {
            return;
        }

        await apiRequest(`/books/${bookId}`, { method: 'DELETE' });
        showToast('Книга удалена', 'success');
        await loadBooks();
    }

    if (addBookBtn) {
        addBookBtn.addEventListener('click', async () => {
            try {
                await ensureBookAdminOptions();
                openBookModalForCreate();
                if (bookModal) {
                    bookModal.show();
                }
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (bookForm) {
        bookForm.addEventListener('submit', async (event) => {
            try {
                await submitBookForm(event);
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (bookFilterForm) {
        bookFilterForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            filters.author = filterAuthor?.value.trim() || '';
            filters.publisher = filterPublisher?.value.trim() || '';
            filters.year = filterYear?.value.trim() || '';

            try {
                await loadBooks();
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (booksTableBody) {
        booksTableBody.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) {
                return;
            }

            const action = button.dataset.action;
            const id = button.dataset.id;

            try {
                if (action === 'edit-book') {
                    await ensureBookAdminOptions();
                    await openBookModalForEdit(id);
                } else if (action === 'delete-book') {
                    await deleteBook(id);
                } else if (action === 'borrow-book') {
                    const book = state.books.find((item) => Number(item.id_book) === Number(id));
                    await openBorrowModal(id, book?.title || '');
                } else if (action === 'view-book') {
                    openBookDetailsModal(id);
                }
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    document.getElementById('borrowForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            await createLoanRequest(
                document.getElementById('borrowBookId').value,
                document.getElementById('borrowBranchSelect').value,
                'take'
            );
            bootstrap.Modal.getOrCreateInstance(document.getElementById('borrowModal')).hide();
            showToast('Запрос на выдачу книги создан. Ожидайте одобрения библиотекаря', 'success');
            await loadBooks();
        } catch (error) {
            showToast(error.message, 'danger');
        }
    });

    try {
        await loadBooks();
    } catch (error) {
        showToast(`Ошибка загрузки книг: ${error.message}`, 'danger');
    }
}

async function initBranchesPage() {
    const branchesTableBody = document.querySelector('#branchesTable tbody');
    const facultiesTableBody = document.querySelector('#facultiesTable tbody');
    const branchForm = document.getElementById('branchForm');
    const facultyForm = document.getElementById('facultyForm');
    const addBranchBtn = document.getElementById('addBranchBtn');

    const branchModalEl = document.getElementById('branchModal');
    const branchModal = branchModalEl ? new bootstrap.Modal(branchModalEl) : null;

    const branchDetailsModalEl = document.getElementById('branchDetailsModal');
    const branchDetailsModal = branchDetailsModalEl ? new bootstrap.Modal(branchDetailsModalEl) : null;
    let branchBookInputSource = 'select';

    const fields = {
        modalTitle: document.getElementById('branchModalTitle'),
        id: document.getElementById('branchId'),
        name: document.getElementById('branchName'),
        detailsTitle: document.getElementById('branchDetailsTitle'),
        inventoryBody: document.querySelector('#branchInventoryTable tbody'),
        bookSelect: document.getElementById('branchBookSelect'),
        bookSearch: document.getElementById('branchBookSearch'),
        bookSuggestions: document.getElementById('branchBookSuggestions'),
        analyticsForm: document.getElementById('branchAnalyticsForm'),
        copiesValue: document.getElementById('branchModalCopiesValue'),
        facultiesCountValue: document.getElementById('branchModalFacultiesCountValue'),
        facultiesBody: document.querySelector('#branchModalFacultiesTable tbody'),
        branchInventoryEditor: document.getElementById('branchInventoryEditor'),
        facultyBooksTitle: document.getElementById('facultyBooksTitle'),
        facultyBooksBody: document.querySelector('#facultyBooksTable tbody'),
        facultyId: document.getElementById('facultyId'),
        facultyName: document.getElementById('facultyName'),
    };

    function renderBranchesTable() {
        if (!branchesTableBody) {
            return;
        }

        if (!state.branches.length) {
            branchesTableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">Филиалы не добавлены</td></tr>';
            return;
        }

        branchesTableBody.innerHTML = state.branches
            .map((branch) => {
                const adminActions = isAdmin()
                    ? `
                        <button class="btn btn-sm btn-outline-primary me-1" data-action="edit-branch" data-id="${branch.id_branch}">Редактировать</button>
                        <button class="btn btn-sm btn-outline-danger" data-action="delete-branch" data-id="${branch.id_branch}">Удалить</button>
                    `
                    : '';

                return `
                    <tr>
                        <td>${branch.name}</td>
                        <td>${branch.books_count ?? 0}</td>
                        <td>${branch.total_copies ?? 0}</td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-secondary me-1" data-action="view-branch" data-id="${branch.id_branch}">Посмотреть книги</button>
                            ${adminActions}
                        </td>
                    </tr>
                `;
            })
            .join('');
    }

    async function loadBranches() {
        state.branches = await fetchBranches();
        renderBranchesTable();
    }

    function renderFacultiesAdminTable() {
        if (!facultiesTableBody) {
            return;
        }

        if (!state.faculties.length) {
            facultiesTableBody.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-2">Факультеты не добавлены</td></tr>';
            return;
        }

        facultiesTableBody.innerHTML = state.faculties
            .map(
                (faculty) => `
                    <tr>
                        <td>${faculty.name}</td>
                        <td class="text-end">
                            <button class="btn btn-sm btn-outline-secondary me-1" data-action="view-faculty-books" data-id="${faculty.id_faculty}" data-name="${escapeHtml(faculty.name)}">Подробнее</button>
                            <button class="btn btn-sm btn-outline-primary me-1" data-action="edit-faculty" data-id="${faculty.id_faculty}" data-name="${escapeHtml(faculty.name)}">Редактировать</button>
                            <button class="btn btn-sm btn-outline-danger" data-action="delete-faculty" data-id="${faculty.id_faculty}">Удалить</button>
                        </td>
                    </tr>
                `,
            )
            .join('');
    }

    async function loadFacultiesAdmin() {
        state.faculties = await fetchFaculties();
        renderFacultiesAdminTable();
    }

    function renderBranchInventoryEditor(inventory = []) {
        if (!fields.branchInventoryEditor) {
            return;
        }

        if (!state.books.length) {
            fields.branchInventoryEditor.innerHTML = '<div class="text-muted">Сначала добавьте книги.</div>';
            return;
        }

        const byBook = new Map(inventory.map((item) => [Number(item.id_book), item]));
        fields.branchInventoryEditor.innerHTML = state.books
            .map((book) => {
                const item = byBook.get(Number(book.id_book)) || {};
                return `
                    <div class="inventory-row" data-book-id="${book.id_book}">
                        <div>
                            <div class="fw-semibold">${escapeHtml(book.title)}</div>
                            <div class="text-muted small">Книга</div>
                        </div>
                        <div>
                            <label class="form-label small">Экземпляров</label>
                            <input class="form-control" type="number" min="0" value="${item.copies_count ?? 0}" data-role="copies">
                        </div>
                    </div>
                `;
            })
            .join('');
    }

    function collectBranchInventory() {
        if (!fields.branchInventoryEditor) {
            return [];
        }

        return [...fields.branchInventoryEditor.querySelectorAll('.inventory-row')].map((row) => ({
            book_id: Number(row.dataset.bookId),
            copies_count: Number(row.querySelector('[data-role="copies"]')?.value || 0),
        }));
    }

    async function ensureBranchAdminOptions() {
        if (!isAdmin()) {
            return;
        }
        state.books = await fetchBookOptions();
    }

    function openBranchModalForCreate() {
        fields.modalTitle.textContent = 'Добавить филиал';
        fields.id.value = '';
        fields.name.value = '';
        renderBranchInventoryEditor([]);
    }

    async function openBranchModalForEdit(branchId) {
        const branch = state.branches.find((item) => Number(item.id_branch) === Number(branchId));
        if (!branch) {
            showToast('Филиал для редактирования не найден', 'danger');
            return;
        }

        const details = await fetchBranchInventory(branchId);
        fields.modalTitle.textContent = 'Редактировать филиал';
        fields.id.value = branch.id_branch;
        fields.name.value = branch.name;
        renderBranchInventoryEditor(details.inventory || []);
        if (branchModal) {
            branchModal.show();
        }
    }

    async function submitBranchForm(event) {
        event.preventDefault();

        const payload = {
            id_branch: fields.id.value ? Number(fields.id.value) : null,
            name: fields.name.value.trim(),
            inventory: isAdmin() ? collectBranchInventory() : null,
        };

        await apiRequest('/branches', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (branchModal) {
            branchModal.hide();
        }

        showToast('Филиал сохранен', 'success');
        await loadBranches();
    }

    async function submitFacultyForm(event) {
        event.preventDefault();
        await saveFaculty({
            id_faculty: fields.facultyId.value ? Number(fields.facultyId.value) : null,
            name: fields.facultyName.value.trim(),
        });
        fields.facultyId.value = '';
        fields.facultyName.value = '';
        showToast('Факультет сохранен', 'success');
        await loadFacultiesAdmin();
    }

    async function deleteBranch(branchId) {
        const confirmed = window.confirm('Удалить филиал? Если в филиале есть книги, удаление будет запрещено.');
        if (!confirmed) {
            return;
        }

        await apiRequest(`/branches/${branchId}`, { method: 'DELETE' });
        showToast('Филиал удален', 'success');
        await loadBranches();
    }

    async function deleteFacultyById(facultyId) {
        const confirmed = window.confirm('Удалить факультет? Если он используется в книгах или пользователях, база запретит удаление.');
        if (!confirmed) {
            return;
        }

        await deleteFaculty(facultyId);
        showToast('Факультет удален', 'success');
        await loadFacultiesAdmin();
    }

    async function openFacultyBooksModal(facultyId, facultyName) {
        const rows = await fetchFacultyBooks(facultyId);
        fields.facultyBooksTitle.textContent = `Книги факультета: ${facultyName}`;

        if (!rows.length) {
            fields.facultyBooksBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Книги не привязаны</td></tr>';
        } else {
            fields.facultyBooksBody.innerHTML = rows
                .map(
                    (row) => `
                        <tr>
                            <td>${escapeHtml(row.title)}</td>
                            <td>${escapeHtml(row.branch_name)}</td>
                            <td>${row.copies_count ?? 0}</td>
                        </tr>
                    `,
                )
                .join('');
        }

        bootstrap.Modal.getOrCreateInstance(document.getElementById('facultyBooksModal')).show();
    }

    async function loadBranchDetails(branchId) {
        const details = await fetchBranchInventory(branchId);
        state.branchDetails = details;

        fields.detailsTitle.textContent = `Книги филиала: ${details.branch.name}`;

        const inventory = details.inventory || [];
        if (!inventory.length) {
            fields.inventoryBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-2">В филиале нет книг</td></tr>';
        } else {
            fields.inventoryBody.innerHTML = inventory
                .map(
                    (item) => `
                        <tr>
                            <td>${item.title}</td>
                            <td>${item.copies_count ?? 0}</td>
                            <td>${item.times_issued ?? 0}</td>
                        </tr>
                    `,
                )
                .join('');
        }

        fillSelectOptions(
            fields.bookSelect,
            inventory.map((item) => ({ value: item.id_book, label: item.title })),
            'Выберите книгу',
        );
        if (fields.bookSuggestions) {
            fields.bookSuggestions.innerHTML = inventory
                .map((item) => `<option value="${escapeHtml(item.title)}"></option>`)
                .join('');
        }
        if (fields.bookSearch) {
            fields.bookSearch.value = '';
        }
        branchBookInputSource = 'select';

        fields.copiesValue.textContent = '-';
        if (fields.facultiesCountValue) fields.facultiesCountValue.textContent = '-';
        renderFacultiesTable(fields.facultiesBody, []);

        if (branchDetailsModal) {
            branchDetailsModal.show();
        }
    }

    async function submitBranchAnalyticsForm(event) {
        event.preventDefault();

        if (!state.branchDetails) {
            showToast('Сначала откройте филиал', 'info');
            return;
        }

        const inventory = state.branchDetails.inventory || [];
        const searchValue = normalizeSearchText(fields.bookSearch?.value || '');
        const selectedBookId = fields.bookSelect.value;
        let selectedBook = null;

        if (branchBookInputSource === 'search' && searchValue) {
            selectedBook =
                inventory.find((item) => normalizeSearchText(item.title) === searchValue) ||
                inventory.find((item) => normalizeSearchText(item.title).includes(searchValue));
        }

        if (!selectedBook && selectedBookId) {
            selectedBook = inventory.find((item) => Number(item.id_book) === Number(selectedBookId));
        }

        if (!selectedBook) {
            showToast('Сначала выберите книгу', 'info');
            return;
        }

        if (fields.bookSelect) {
            fields.bookSelect.value = selectedBook.id_book;
        }
        if (fields.bookSearch) {
            fields.bookSearch.value = selectedBook.title;
        }
        branchBookInputSource = 'select';

        const analytics = await getBookBranchAnalytics(selectedBook.title, state.branchDetails.branch.name);
        fields.copiesValue.textContent = analytics.copiesCount;
        if (fields.facultiesCountValue) fields.facultiesCountValue.textContent = analytics.facultiesCount;
        renderFacultiesTable(fields.facultiesBody, analytics.faculties);
    }

    if (addBranchBtn) {
        addBranchBtn.addEventListener('click', async () => {
            try {
                await ensureBranchAdminOptions();
                openBranchModalForCreate();
                if (branchModal) {
                    branchModal.show();
                }
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (branchForm) {
        branchForm.addEventListener('submit', async (event) => {
            try {
                await submitBranchForm(event);
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (facultyForm) {
        facultyForm.addEventListener('submit', async (event) => {
            try {
                await submitFacultyForm(event);
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (fields.analyticsForm) {
        fields.analyticsForm.addEventListener('submit', async (event) => {
            try {
                await submitBranchAnalyticsForm(event);
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (fields.bookSearch) {
        fields.bookSearch.addEventListener('input', () => {
            branchBookInputSource = 'search';
            const inventory = state.branchDetails?.inventory || [];
            const value = normalizeSearchText(fields.bookSearch.value);
            const exactMatch = inventory.find((item) => normalizeSearchText(item.title) === value);
            if (exactMatch && fields.bookSelect) {
                fields.bookSelect.value = exactMatch.id_book;
            }
        });
    }

    if (fields.bookSelect) {
        fields.bookSelect.addEventListener('change', () => {
            branchBookInputSource = 'select';
            const selectedOption = fields.bookSelect.options[fields.bookSelect.selectedIndex];
            if (fields.bookSearch) {
                fields.bookSearch.value = selectedOption?.value ? selectedOption.textContent : '';
            }
        });
    }

    if (branchesTableBody) {
        branchesTableBody.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) {
                return;
            }

            const action = button.dataset.action;
            const id = button.dataset.id;

            try {
                if (action === 'edit-branch') {
                    await ensureBranchAdminOptions();
                    await openBranchModalForEdit(id);
                } else if (action === 'delete-branch') {
                    await deleteBranch(id);
                } else if (action === 'view-branch') {
                    await loadBranchDetails(id);
                }
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (facultiesTableBody) {
        facultiesTableBody.addEventListener('click', async (event) => {
            const button = event.target.closest('button[data-action]');
            if (!button) {
                return;
            }

            try {
                if (button.dataset.action === 'edit-faculty') {
                    fields.facultyId.value = button.dataset.id;
                    fields.facultyName.value = button.dataset.name || '';
                    fields.facultyName.focus();
                } else if (button.dataset.action === 'delete-faculty') {
                    await deleteFacultyById(button.dataset.id);
                } else if (button.dataset.action === 'view-faculty-books') {
                    await openFacultyBooksModal(button.dataset.id, button.dataset.name || '');
                }
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    try {
        await loadBranches();
        if (isAdmin()) {
            await loadFacultiesAdmin();
        }
    } catch (error) {
        showToast(`Ошибка загрузки филиалов: ${error.message}`, 'danger');
    }
}

async function initReportsPage() {
    if (!isAdmin()) {
        window.location.href = '/dashboard';
        return;
    }

    const reportForm = document.getElementById('reportForm');
    const reportBookSelect = document.getElementById('reportBookSelect');
    const reportBranchSelect = document.getElementById('reportBranchSelect');
    const reportCopiesValue = document.getElementById('reportCopiesValue');
    const reportFacultiesCountValue = document.getElementById('reportFacultiesCountValue');
    const reportFacultiesBody = document.querySelector('#reportFacultiesTable tbody');
    const refreshTopIssuedBtn = document.getElementById('refreshTopIssuedBtn');
    const topIssuedBody = document.querySelector('#topIssuedTable tbody');

    function ensureStudentReportBlock() {
        if (document.getElementById('bookStudentsBlock')) {
            return;
        }

        document.getElementById('reportResultBlock')?.insertAdjacentHTML(
            'beforeend',
            `
            <div id="bookStudentsBlock" class="mt-3">
                <div class="report-metric mb-3">
                    <span class="report-metric-label">Студентов брали книгу:</span>
                    <span id="bookStudentsCount" class="report-metric-value">-</span>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm" id="bookStudentsTable">
                        <thead>
                            <tr>
                                <th>Студент</th>
                                <th>Факультет</th>
                                <th>Выдач</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
            `,
        );
    }

    function renderBookStudents(report) {
        ensureStudentReportBlock();
        document.getElementById('bookStudentsCount').textContent = report.students_count ?? 0;
        const targetBody = document.querySelector('#bookStudentsTable tbody');

        if (!report.students?.length) {
            targetBody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-2">Нет выдач</td></tr>';
            return;
        }

        targetBody.innerHTML = report.students
            .map(
                (student) => `
                    <tr>
                        <td>${student.full_name}</td>
                        <td>${student.faculty_name || '-'}</td>
                        <td>${student.loans_count ?? 0}</td>
                    </tr>
                `,
            )
            .join('');
    }

    async function loadOptions() {
        const [books, branches] = await Promise.all([fetchBookOptions(), fetchBranchOptions()]);

        fillSelectOptions(
            reportBookSelect,
            books.map((book) => ({ value: book.id_book, label: book.title })),
            'Выберите книгу',
        );

        fillSelectOptions(
            reportBranchSelect,
            branches.map((branch) => ({ value: branch.id_branch, label: branch.name })),
            'Выберите филиал',
        );
    }

    async function loadTopIssued() {
        const rows = await fetchTopIssued(10);
        renderTopIssuedTable(topIssuedBody, rows);
    }

    async function submitReportForm(event) {
        event.preventDefault();

        const selectedBookOption = reportBookSelect.options[reportBookSelect.selectedIndex];
        const selectedBranchOption = reportBranchSelect.options[reportBranchSelect.selectedIndex];

        if (!selectedBookOption?.value || !selectedBranchOption?.value) {
            showToast('Выберите книгу и филиал для отчета', 'info');
            return;
        }

        const analytics = await getBookBranchAnalytics(selectedBookOption.text, selectedBranchOption.text);
        const studentReport = await fetchBookStudentReport(selectedBookOption.value);
        reportCopiesValue.textContent = analytics.copiesCount;
        if (reportFacultiesCountValue) reportFacultiesCountValue.textContent = analytics.facultiesCount;
        renderFacultiesTable(reportFacultiesBody, analytics.faculties);
        renderBookStudents(studentReport);
    }

    if (reportForm) {
        reportForm.addEventListener('submit', async (event) => {
            try {
                await submitReportForm(event);
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (refreshTopIssuedBtn) {
        refreshTopIssuedBtn.addEventListener('click', async () => {
            try {
                await loadTopIssued();
                showToast('Отчет обновлен', 'success');
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    try {
        await Promise.all([loadOptions(), loadTopIssued()]);
        renderFacultiesTable(reportFacultiesBody, []);
        ensureStudentReportBlock();
    } catch (error) {
        showToast(`Ошибка загрузки отчетов: ${error.message}`, 'danger');
    }
}

async function initAccountPage() {
    const profileBlock = document.getElementById('accountProfile');
    const historyTitle = document.getElementById('accountHistoryTitle');
    const loansTable = document.getElementById('accountLoansTable');
    const loansHead = loansTable?.querySelector('thead');
    const loansBody = document.querySelector('#accountLoansTable tbody');
    const pendingRequestsBody = document.querySelector('#pendingRequestsTable tbody');
    const profileForm = document.getElementById('profileForm');
    const profileFullName = document.getElementById('profileFullName');
    const profilePassword = document.getElementById('profilePassword');
    const profilePasswordConfirm = document.getElementById('profilePasswordConfirm');
    const requestStudentFilter = document.getElementById('requestStudentFilter');
    const requestDateFrom = document.getElementById('requestDateFrom');
    const requestDateTo = document.getElementById('requestDateTo');
    const requestFilterReset = document.getElementById('requestFilterReset');

    function requestTypeLabel(type) {
        return type === 'return' ? 'Возврат' : 'Получение';
    }

    function statusBadge(status, context = '') {
        const labels = {
            pending: context === 'return' ? 'Ожидает подтверждения возврата' : 'Ожидание',
            approved: 'Одобрено',
            rejected: 'Отклонено',
            on_hand: 'На руках',
            returned: 'Вернул',
        };
        const classes = {
            pending: 'bg-warning text-dark',
            approved: 'bg-success',
            rejected: 'bg-danger',
            on_hand: 'bg-info text-dark',
            returned: 'bg-success',
        };
        return `<span class="badge ${classes[status] || 'bg-secondary'}">${labels[status] || status}</span>`;
    }

    function filterAdminRequests(requests) {
        const studentQuery = normalizeSearchText(requestStudentFilter?.value || '');
        const dateFrom = requestDateFrom?.value || '';
        const dateTo = requestDateTo?.value || '';

        return requests.filter((request) => {
            const studentMatches = !studentQuery || normalizeSearchText(request.full_name).includes(studentQuery);
            const requestDate = moscowDateKey(request.created_at);
            const fromMatches = !dateFrom || requestDate >= dateFrom;
            const toMatches = !dateTo || requestDate <= dateTo;
            return studentMatches && fromMatches && toMatches;
        });
    }

    if (!state.user) {
        profileBlock.innerHTML = '<p class="mb-3">Войдите или зарегистрируйтесь, чтобы видеть личный кабинет.</p><button id="accountLoginBtn" class="btn btn-primary" type="button">Войти</button>';
        document.getElementById('accountLoginBtn')?.addEventListener('click', () => openAuthModal('login'));
        if (loansHead) {
            loansHead.innerHTML = '<tr><th>Книга</th><th>Филиал</th><th>Факультет</th><th>Дата</th><th>Статус</th></tr>';
        }
        if (loansBody) loansBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">Нет данных</td></tr>';
        return;
    }

    profileBlock.innerHTML = `
        <div class="row g-3">
            <div class="col-12 col-md-4">
                <div class="stat-label">Пользователь</div>
                <div class="fw-semibold">${escapeHtml(state.user.full_name)}</div>
            </div>
            <div class="col-12 col-md-4">
                <div class="stat-label">Роль</div>
                <div class="fw-semibold">${roleLabel()}</div>
            </div>
            <div class="col-12 col-md-4">
                <div class="stat-label">Факультет</div>
                <div class="fw-semibold">${escapeHtml(state.user.faculty_name || '-')}</div>
            </div>
        </div>
    `;
    if (profileFullName) {
        profileFullName.value = state.user.full_name || '';
    }

    if (profileForm && !profileForm.dataset.handlerAttached) {
        profileForm.dataset.handlerAttached = 'true';
        profileForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const newPassword = profilePassword.value.trim();
            const confirmPassword = profilePasswordConfirm.value.trim();

            if (newPassword !== confirmPassword) {
                showToast('Пароли не совпадают', 'danger');
                return;
            }

            try {
                const result = await updateProfile({
                    full_name: profileFullName.value.trim(),
                    new_password: newPassword || null,
                    confirm_password: confirmPassword || null,
                });
                state.user = result.user;
                localStorage.setItem('library-user', JSON.stringify(result.user));
                renderAuthUI();
                profilePassword.value = '';
                profilePasswordConfirm.value = '';
                profileBlock.querySelector('.fw-semibold').textContent = result.user.full_name;
                showToast('Профиль обновлен', 'success');
            } catch (error) {
                showToast(error.message, 'danger');
            }
        });
    }

    if (isAdmin() && requestFilterReset && !requestFilterReset.dataset.handlerAttached) {
        requestFilterReset.dataset.handlerAttached = 'true';
        requestFilterReset.addEventListener('click', async () => {
            if (requestStudentFilter) requestStudentFilter.value = '';
            if (requestDateFrom) requestDateFrom.value = '';
            if (requestDateTo) requestDateTo.value = '';
            await initAccountPage();
        });
    }

    [requestStudentFilter, requestDateFrom, requestDateTo].forEach((input) => {
        if (input && !input.dataset.handlerAttached) {
            input.dataset.handlerAttached = 'true';
            input.addEventListener('input', async () => {
                await initAccountPage();
            });
        }
    });

    try {
        if (isAdmin()) {
            if (historyTitle) {
                historyTitle.textContent = 'История запросов';
            }
            if (loansHead) {
                loansHead.innerHTML = `
                    <tr>
                        <th>Студент</th>
                        <th>Книга</th>
                        <th>Филиал</th>
                        <th>Факультет</th>
                        <th>Тип</th>
                        <th>Статус</th>
                        <th>Создано</th>
                        <th>Обработал</th>
                    </tr>
                `;
            }

            // У администратора история строится по всем заявкам, чтобы видеть ожидание, одобрение и отказ.
            const allRequests = filterAdminRequests(await fetchAllLoanRequests());
            if (!allRequests.length) {
                loansBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-3">История запросов пуста</td></tr>';
            } else {
                loansBody.innerHTML = allRequests
                    .map(
                        (req) => `
                            <tr>
                                <td>${escapeHtml(req.full_name)}</td>
                                <td>${escapeHtml(req.title)}</td>
                                <td>${escapeHtml(req.branch_name)}</td>
                                <td>${escapeHtml(req.faculty_name || '-')}</td>
                                <td>${requestTypeLabel(req.request_type)}</td>
                                <td>${statusBadge(req.status, req.request_type)}</td>
                                <td>${formatMoscowDate(req.created_at)}</td>
                                <td>${req.approved_by_name ? `${escapeHtml(req.approved_by_name)}<br><span class="text-muted small">${formatMoscowDate(req.approved_at)}</span>` : '-'}</td>
                            </tr>
                        `,
                    )
                    .join('');
            }
        } else {
            if (historyTitle) {
                historyTitle.textContent = 'История выдач и заявок';
            }
            if (loansHead) {
                loansHead.innerHTML = '<tr><th>Книга</th><th>Филиал</th><th>Факультет</th><th>Дата</th><th>Статус</th></tr>';
            }

            // Для студента объединяем реальные выдачи и заявки, потому что статус возврата живет в loan_requests.
            const [loans, requests] = await Promise.all([fetchMyLoans(), fetchMyLoanRequests()]);
            const pendingReturnKeys = new Set(
                requests
                    .filter((request) => request.request_type === 'return' && request.status === 'pending')
                    .map((request) => `${request.id_book}|${request.id_branch}`),
            );
            const renderedReturnPendingKeys = new Set();
            const rows = [];

            loans.forEach((loan) => {
                const key = `${loan.id_book}|${loan.id_branch}`;
                const waitingReturn = pendingReturnKeys.has(key);
                let statusCell = statusBadge('on_hand');

                if (loan.returned_at) {
                    statusCell = `${statusBadge('returned')}<br><span class="text-muted small">${formatMoscowDate(loan.returned_at)}</span>`;
                } else if (waitingReturn) {
                    statusCell = statusBadge('pending', 'return');
                    renderedReturnPendingKeys.add(key);
                } else {
                    statusCell = `${statusBadge('on_hand')} <button class="btn btn-sm btn-outline-primary ms-2" type="button" data-action="request-return" data-book-id="${loan.id_book}" data-branch-id="${loan.id_branch}">Вернуть</button>`;
                }

                rows.push({
                    date: loan.issued_at,
                    html: `
                        <tr>
                            <td>${escapeHtml(loan.title)}</td>
                            <td>${escapeHtml(loan.branch_name)}</td>
                            <td>${escapeHtml(loan.faculty_name || '-')}</td>
                            <td>${formatMoscowDate(loan.issued_at)}</td>
                            <td>${statusCell}</td>
                        </tr>
                    `,
                });
            });

            requests
                .filter((request) => {
                    const key = `${request.id_book}|${request.id_branch}`;
                    return request.status !== 'approved' && !(request.request_type === 'return' && renderedReturnPendingKeys.has(key));
                })
                .forEach((request) => {
                    rows.push({
                        date: request.created_at,
                        html: `
                            <tr>
                                <td>${escapeHtml(request.title)}</td>
                                <td>${escapeHtml(request.branch_name)}</td>
                                <td>${escapeHtml(request.faculty_name || state.user.faculty_name || '-')}</td>
                                <td>${formatMoscowDate(request.created_at)}</td>
                                <td>${statusBadge(request.status, request.request_type)} <span class="text-muted small">${requestTypeLabel(request.request_type)}</span></td>
                            </tr>
                        `,
                    });
                });

            rows.sort((a, b) => parseDbDate(b.date) - parseDbDate(a.date));
            loansBody.innerHTML = rows.length
                ? rows.map((row) => row.html).join('')
                : '<tr><td colspan="5" class="text-center text-muted py-3">История выдач пуста</td></tr>';

            if (!loansBody.dataset.returnHandlerAttached) {
                loansBody.dataset.returnHandlerAttached = 'true';
                loansBody.addEventListener('click', async (event) => {
                    const button = event.target.closest('button[data-action="request-return"]');
                    if (!button) {
                        return;
                    }

                    try {
                        await createLoanRequest(button.dataset.bookId, button.dataset.branchId, 'return');
                        showToast('Запрос на возврат отправлен библиотекарю', 'success');
                        await initAccountPage();
                    } catch (error) {
                        showToast(error.message, 'danger');
                    }
                });
            }
        }

        if (isAdmin() && pendingRequestsBody) {
            const pendingRequests = await fetchPendingLoanRequests();
            if (!pendingRequests.length) {
                pendingRequestsBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Нет ожидающих запросов</td></tr>';
            } else {
                pendingRequestsBody.innerHTML = pendingRequests
                    .map(
                        (req) => `
                            <tr>
                                <td>${req.full_name}</td>
                                <td>${req.title}</td>
                                <td>${req.branch_name}</td>
                                <td>${req.request_type === 'take' ? 'Взять' : 'Вернуть'}</td>
                                <td>${formatMoscowDate(req.created_at)}</td>
                                <td class="text-end">
                                    <button class="btn btn-sm btn-success" type="button" data-action="approve-request" data-id="${req.id_request}" data-status="approved">Одобрить</button>
                                    <button class="btn btn-sm btn-danger" type="button" data-action="approve-request" data-id="${req.id_request}" data-status="rejected">Отклонить</button>
                                </td>
                            </tr>
                        `,
                    )
                    .join('');

                if (!pendingRequestsBody.dataset.approveHandlerAttached) {
                    pendingRequestsBody.dataset.approveHandlerAttached = 'true';
                    pendingRequestsBody.addEventListener('click', async (event) => {
                        const button = event.target.closest('button[data-action="approve-request"]');
                        if (!button) {
                            return;
                        }

                        try {
                            await approveLoanRequest(button.dataset.id, button.dataset.status);
                            showToast(
                                button.dataset.status === 'approved' ? 'Запрос одобрен' : 'Запрос отклонен',
                                'success',
                            );
                            await initAccountPage();
                        } catch (error) {
                            showToast(error.message, 'danger');
                        }
                    });
                }
            }
        }
    } catch (error) {
        showToast(`Ошибка загрузки кабинета: ${error.message}`, 'danger');
    }

    if (!window.accountRefreshTimer) {
        window.accountRefreshTimer = setInterval(async () => {
            if (currentPage !== 'account' || document.hidden || window.accountRefreshInProgress) {
                return;
            }

            if (document.activeElement?.closest('#profileForm')) {
                return;
            }

            try {
                window.accountRefreshInProgress = true;
                await initAccountPage();
            } finally {
                window.accountRefreshInProgress = false;
            }
        }, 10000);
    }
}

async function bootstrapApp() {
    initTheme();
    initNav();
    initAuth();

    if (currentPage === 'dashboard') {
        await initDashboardPage();
    } else if (currentPage === 'books') {
        await initBooksPage();
    } else if (currentPage === 'branches') {
        await initBranchesPage();
    } else if (currentPage === 'reports') {
        await initReportsPage();
    } else if (currentPage === 'account') {
        await initAccountPage();
    }
}

bootstrapApp();
