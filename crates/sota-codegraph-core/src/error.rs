
#[derive(thiserror::Error, Debug)]
pub enum CodeGraphError {
    #[error("io error {0}")]
    Io(#[from] std::io::Error),

    #[error("Database error {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Parse error {0}")]
    Parse(String),

    #[error("not found: {0}")]
    NotFound(String),

    #[error("migration error: {0}")]
    Migration(#[from] rusqlite_migration::Error),
}
