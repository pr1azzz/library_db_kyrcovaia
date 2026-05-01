from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class BookUpsertPayload(BaseModel):
    id_book: int | None = None
    title: str = Field(..., min_length=1, max_length=300)
    publication_year: int | None = Field(default=None, ge=1500, le=3000)
    pages_count: int | None = Field(default=None, ge=1)
    illustrations_count: int | None = Field(default=None, ge=0)
    price: float | None = Field(default=None, ge=0)
    publisher_name: str | None = Field(default=None, max_length=200)
    authors: list[str] | None = None

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        return value.strip()

    @field_validator("publisher_name")
    @classmethod
    def normalize_publisher(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @field_validator("authors")
    @classmethod
    def normalize_authors(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized: list[str] = []
        for author in value:
            name = author.strip()
            if name:
                normalized.append(name)
        return normalized


class BranchUpsertPayload(BaseModel):
    id_branch: int | None = None
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class LoginPayload(BaseModel):
    email: str = Field(..., min_length=3, max_length=250)
    password: str = Field(..., min_length=1, max_length=100)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class RegisterPayload(LoginPayload):
    full_name: str = Field(..., min_length=2, max_length=250)
    faculty_id: int | None = None

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        return value.strip()


class LoanCreatePayload(BaseModel):
    book_id: int
    branch_id: int


class LoanRequestCreatePayload(BaseModel):
    book_id: int
    branch_id: int
    request_type: Literal["take", "return"]


class LoanRequestApprovalPayload(BaseModel):
    status: Literal["approved", "rejected"]


class FacultyUpsertPayload(BaseModel):
    id_faculty: int | None = None
    name: str = Field(..., min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class ApiMessage(BaseModel):
    message: str
    data: dict[str, Any] | list[dict[str, Any]] | None = None
