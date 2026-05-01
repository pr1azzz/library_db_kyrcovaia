CREATE TABLE IF NOT EXISTS loan_requests (
    id_request BIGSERIAL PRIMARY KEY,
    id_user BIGINT NOT NULL,
    id_book BIGINT NOT NULL,
    id_branch BIGINT NOT NULL,
    id_faculty BIGINT NULL,
    request_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP NULL,
    approved_by BIGINT NULL,
    CONSTRAINT fk_loan_requests_user FOREIGN KEY (id_user) REFERENCES app_users(id_user),
    CONSTRAINT fk_loan_requests_book FOREIGN KEY (id_book) REFERENCES books(id_book),
    CONSTRAINT fk_loan_requests_branch FOREIGN KEY (id_branch) REFERENCES branches(id_branch),
    CONSTRAINT fk_loan_requests_faculty FOREIGN KEY (id_faculty) REFERENCES faculties(id_faculty),
    CONSTRAINT fk_loan_requests_approved_by FOREIGN KEY (approved_by) REFERENCES app_users(id_user),
    CONSTRAINT ck_loan_requests_type CHECK (request_type IN ('take', 'return')),
    CONSTRAINT ck_loan_requests_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_loan_requests_user ON loan_requests(id_user);
CREATE INDEX IF NOT EXISTS idx_loan_requests_status ON loan_requests(status);
CREATE INDEX IF NOT EXISTS idx_loan_requests_branch ON loan_requests(id_branch);
