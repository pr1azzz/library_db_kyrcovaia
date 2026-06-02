from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

import pytest


ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"


def read_frontend_file(name: str) -> str:
    return (FRONTEND_DIR / name).read_text(encoding="utf-8")


def test_app_js_has_valid_syntax_when_node_is_available() -> None:
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is not installed; skipping frontend syntax check")

    result = subprocess.run(
        [node, "--check", str(FRONTEND_DIR / "app.js")],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_frontend_pages_reference_current_cache_busting_version() -> None:
    for page in ["dashboard.html", "books.html", "branches.html", "reports.html", "account.html"]:
        html = read_frontend_file(page)
        assert "/static/styles.css?v=20260602-4" in html
        assert "/static/app.js?v=20260602-4" in html


def test_branch_analytics_keeps_select_and_title_search_contract() -> None:
    branches_html = read_frontend_file("branches.html")
    app_js = read_frontend_file("app.js")

    assert 'id="branchBookSelect"' in branches_html
    assert 'id="branchBookSearch"' in branches_html
    assert 'id="branchBookSuggestions"' in branches_html
    assert "branchBookInputSource" in app_js
    assert "fields.bookSelect.addEventListener('change'" in app_js


def test_admin_request_filters_and_auto_refresh_are_present() -> None:
    account_html = read_frontend_file("account.html")
    app_js = read_frontend_file("app.js")

    assert 'id="requestStudentFilter"' in account_html
    assert 'id="requestDateFrom"' in account_html
    assert 'id="requestDateTo"' in account_html
    assert "filterAdminRequests" in app_js
    assert "accountRefreshTimer" in app_js


def test_student_return_pending_status_is_not_rendered_twice() -> None:
    app_js = read_frontend_file("app.js")

    assert "renderedReturnPendingKeys" in app_js
    assert "request.request_type === 'return'" in app_js
    assert "renderedReturnPendingKeys.has(key)" in app_js
    assert "request.status !== 'approved'" in app_js


def test_service_worker_does_not_cache_api_requests() -> None:
    sw = read_frontend_file("sw.js")

    assert "library-is-v7" in sw
    assert "url.pathname.startsWith('/api/')" in sw
    assert "return;" in sw
