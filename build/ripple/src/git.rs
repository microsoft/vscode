/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Minimal git access through the git CLI: trees, tree diffs and batched blob reads.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};

use anyhow::{Context, Result, bail};

pub fn git(repo: &Path, args: &[&str]) -> Result<String> {
	let out = Command::new("git")
		.arg("-C")
		.arg(repo)
		.args(args)
		.output()
		.context("failed to run git")?;
	if !out.status.success() {
		bail!(
			"git {} failed: {}",
			args.join(" "),
			String::from_utf8_lossy(&out.stderr)
		);
	}
	Ok(String::from_utf8(out.stdout)?)
}

/// All blobs of a tree below the given path prefixes, as `(path, oid)`.
pub fn ls_tree(repo: &Path, rev: &str, prefixes: &[&str]) -> Result<Vec<(String, String)>> {
	let mut args = vec!["ls-tree", "-r", "-z", "--full-tree", rev, "--"];
	args.extend_from_slice(prefixes);
	let out = git(repo, &args)?;
	let mut entries = Vec::new();
	for record in out.split('\0').filter(|r| !r.is_empty()) {
		// <mode> SP <type> SP <oid> TAB <path>
		let Some((meta, path)) = record.split_once('\t') else {
			continue;
		};
		let mut parts = meta.split(' ');
		let (_, kind, oid) = (parts.next(), parts.next(), parts.next());
		if kind == Some("blob") {
			if let Some(oid) = oid {
				entries.push((path.to_owned(), oid.to_owned()));
			}
		}
	}
	Ok(entries)
}

#[derive(Debug, Clone)]
pub struct Change {
	pub path: String,
	/// `None` when the file was added.
	pub old: Option<String>,
	/// `None` when the file was deleted.
	pub new: Option<String>,
}

const NULL_OID: &str = "0000000000000000000000000000000000000000";

/// Blob-level changes between two commits. Renames are reported as a delete and an add.
pub fn diff_tree(repo: &Path, from: &str, to: &str) -> Result<Vec<Change>> {
	let out = git(
		repo,
		&[
			"diff-tree",
			"-r",
			"-z",
			"--no-renames",
			"--no-commit-id",
			from,
			to,
		],
	)?;
	let mut changes = Vec::new();
	let mut fields = out.split('\0');
	while let Some(meta) = fields.next() {
		if meta.is_empty() {
			continue;
		}
		let Some(path) = fields.next() else { break };
		// :<old mode> <new mode> <old oid> <new oid> <status>
		let parts: Vec<&str> = meta.trim_start_matches(':').split(' ').collect();
		if parts.len() < 5 || parts[0] == "160000" || parts[1] == "160000" {
			continue;
		}
		let oid = |s: &str| (s != NULL_OID).then(|| s.to_owned());
		changes.push(Change {
			path: path.to_owned(),
			old: oid(parts[2]),
			new: oid(parts[3]),
		});
	}
	Ok(changes)
}

/// A long-running `git cat-file --batch` process.
pub struct BlobReader {
	child: Child,
	stdin: ChildStdin,
	stdout: BufReader<ChildStdout>,
}

impl BlobReader {
	pub fn new(repo: &Path) -> Result<Self> {
		let mut child = Command::new("git")
			.arg("-C")
			.arg(repo)
			.args(["cat-file", "--batch"])
			.stdin(Stdio::piped())
			.stdout(Stdio::piped())
			.spawn()
			.context("failed to start git cat-file")?;
		let stdin = child.stdin.take().unwrap();
		let stdout = BufReader::with_capacity(1 << 20, child.stdout.take().unwrap());
		Ok(Self {
			child,
			stdin,
			stdout,
		})
	}

	pub fn read(&mut self, oid: &str) -> Result<Vec<u8>> {
		writeln!(self.stdin, "{oid}")?;
		self.stdin.flush()?;
		let mut header = String::new();
		self.stdout.read_line(&mut header)?;
		let mut parts = header.split_whitespace();
		let (_, kind, size) = (parts.next(), parts.next(), parts.next());
		if kind != Some("blob") {
			bail!("{oid} is not a blob: {}", header.trim());
		}
		let size: usize = size.context("missing size")?.parse()?;
		let mut data = vec![0; size + 1];
		self.stdout.read_exact(&mut data)?;
		data.truncate(size);
		Ok(data)
	}
}

impl Drop for BlobReader {
	fn drop(&mut self) {
		let _ = self.child.kill();
		let _ = self.child.wait();
	}
}

/// Resolves the repository root containing `path`.
pub fn repo_root(path: &Path) -> Result<PathBuf> {
	Ok(PathBuf::from(
		git(path, &["rev-parse", "--show-toplevel"])?.trim(),
	))
}
