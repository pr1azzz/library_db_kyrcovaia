from __future__ import annotations

import decimal

import pytest
from pydantic import ValidationError

from app.schemas import (
    BookBranchFacultyPayload,
    BookUpsertPayload,
    BranchUpsertPayload,
    LoanRequestApprovalPayload,
    LoanRequestCreatePayload,
    LoginPayload,
    ProfileUpdatePayload,
)


@pytest.fixture()
def main_module():
    return pytest.importorskip("app.main")


def test_health_check_contract(main_module) -> None:
    assert main_module.health_check() == {"status": "ok"}


def test_decimal_normalization_for_api_responses(main_module) -> None:
    assert main_module.normalize_value(decimal.Decimal("10.00")) == 10
    assert main_module.normalize_value(decimal.Decimal("10.50")) == 10.5
    assert main_module.normalize_record({"price": decimal.Decimal("1250.00")}) == {"price": 1250}


def test_public_user_hides_password_fields_and_normalizes_id(main_module) -> None:
    user = main_module.public_user(
        {
            "id_user": decimal.Decimal("7"),
            "full_name": "Иван Петров",
            "email": "student@example.com",
            "role": "client",
            "id_faculty": 2,
            "faculty_name": "ФКН",
            "password_hash": "secret",
        }
    )

    assert user == {
        "id_user": 7,
        "full_name": "Иван Петров",
        "email": "student@example.com",
        "role": "client",
        "id_faculty": 2,
        "faculty_name": "ФКН",
    }
    assert "password_hash" not in user


def test_hash_password_is_stable_and_salt_sensitive(main_module) -> None:
    assert main_module.hash_password("student123", "salt") == main_module.hash_password("student123", "salt")
    assert main_module.hash_password("student123", "salt") != main_module.hash_password("student123", "other")


def test_book_payload_normalizes_nested_admin_editor_data() -> None:
    payload = BookUpsertPayload(
        title="  Чистый код  ",
        publisher_name="  Питер  ",
        authors=[" Роберт Мартин ", "", "  "],
        branch_faculties=[
            BookBranchFacultyPayload(branch_id=1, copies_count=3, faculty_ids=[1, 2]),
            BookBranchFacultyPayload(branch_id=2, copies_count=0, faculty_ids=[]),
        ],
    )

    assert payload.title == "Чистый код"
    assert payload.publisher_name == "Питер"
    assert payload.authors == ["Роберт Мартин"]
    assert payload.branch_faculties[0].copies_count == 3


def test_negative_inventory_values_are_rejected() -> None:
    with pytest.raises(ValidationError):
        BookBranchFacultyPayload(branch_id=1, copies_count=-1)

    with pytest.raises(ValidationError):
        BranchUpsertPayload(name="Филиал", inventory=[{"book_id": 1, "copies_count": -2}])


def test_auth_and_profile_payload_validation() -> None:
    assert LoginPayload(email=" ADMIN@EXAMPLE.COM ", password="admin123").email == "admin@example.com"
    assert ProfileUpdatePayload(full_name=" Администратор ", new_password=None, confirm_password=None).full_name == "Администратор"

    with pytest.raises(ValidationError):
        ProfileUpdatePayload(full_name="A", new_password="123", confirm_password="123")


def test_loan_request_literals_restrict_user_actions() -> None:
    assert LoanRequestCreatePayload(book_id=1, branch_id=1, request_type="take").request_type == "take"
    assert LoanRequestCreatePayload(book_id=1, branch_id=1, request_type="return").request_type == "return"
    assert LoanRequestApprovalPayload(status="approved").status == "approved"

    with pytest.raises(ValidationError):
        LoanRequestCreatePayload(book_id=1, branch_id=1, request_type="extend")

    with pytest.raises(ValidationError):
        LoanRequestApprovalPayload(status="pending")
