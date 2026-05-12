use std::path::PathBuf;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use sota_codegraph_core::index::bulk_index;
use sota_codegraph_core::search;
use sota_codegraph_core::store::sqlite::SqliteStore;

#[derive(Parser)]
#[command(name = "sota-codegraph", about = "Embedded code-graph CLI")]
struct Cli {
    /// Path to the SQLite database file.
    #[arg(long, default_value = "./codegraph.db")]
    db: PathBuf,

    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Walk a directory and index every supported source file.
    Index {
        #[arg(default_value = ".")]
        root: PathBuf,
    },
    /// Print the symbol list for a file.
    Summary { path: PathBuf },
    /// Look up symbols by name (prefix/substring).
    Lookup {
        query: String,
        #[arg(long, default_value_t = 20)]
        limit: usize,
    },
    /// Files this file depends on (recursive).
    Deps {
        path: PathBuf,
        #[arg(long, default_value_t = 5)]
        depth: u32,
    },
    /// Files affected if this file changes (reverse traversal).
    Impact {
        path: PathBuf,
        #[arg(long, default_value_t = 5)]
        depth: u32,
    },
    /// Find references to a symbol by name.
    Refs { name: String },
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let db = cli
        .db
        .to_str()
        .context("db path is not valid UTF-8")?
        .to_string();

    match cli.command {
        Command::Index { root } => {
            let mut store = SqliteStore::new(&db)?;
            let stats = bulk_index(&mut store, &root)?;
            println!("{}", serde_json::to_string_pretty(&stats)?);
        }
        Command::Summary { path } => {
            let store = SqliteStore::new(&db)?;
            let summary = search::file_summary(&store, &path.to_string_lossy())?;
            println!("{}", serde_json::to_string_pretty(&summary)?);
        }
        Command::Lookup { query, limit } => {
            let store = SqliteStore::new(&db)?;
            let hits = search::symbol_lookup(&store, &query, limit)?;
            println!("{}", serde_json::to_string_pretty(&hits)?);
        }
        Command::Deps { path, depth } => {
            let store = SqliteStore::new(&db)?;
            let deps = search::dependency_traversal(&store, &path.to_string_lossy(), depth)?;
            println!("{}", serde_json::to_string_pretty(&deps)?);
        }
        Command::Impact { path, depth } => {
            let store = SqliteStore::new(&db)?;
            let impact = search::impact_analysis(&store, &path.to_string_lossy(), depth)?;
            println!("{}", serde_json::to_string_pretty(&impact)?);
        }
        Command::Refs { name } => {
            let store = SqliteStore::new(&db)?;
            let refs = search::find_references(&store, &name)?;
            println!("{}", serde_json::to_string_pretty(&refs)?);
        }
    }
    Ok(())
}
