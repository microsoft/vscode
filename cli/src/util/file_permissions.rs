/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Owner-only permissions for files holding secrets.
//!
//! The agent host writes two files that carry its connection token: the
//! per-quality lockfile and the token file itself. On Unix these are created
//! `0600` inside a `0700` directory. This module provides the Windows
//! equivalent, which the platform does not give us for free — a newly created
//! file simply inherits whatever its parent grants, and the parent is created
//! by whichever tool got there first.

use std::io;
use std::path::Path;

/// Restrict `path` so that only its owner may read it.
///
/// On Unix this is a no-op: callers already create these files with mode
/// `0600`, which is enforced at creation rather than applied afterwards.
#[cfg(not(windows))]
pub fn restrict_to_owner(_path: &Path) -> io::Result<()> {
	Ok(())
}

/// Restrict `path` so that only its owner may read it.
///
/// Drops inheritance from the parent directory and grants access to the
/// `OWNER RIGHTS` well-known SID (`S-1-3-4`), which resolves to whoever owns
/// the file. Granting the owner by SID rather than by name matters: these
/// machines are commonly joined such that the account name is of the form
/// `AzureAD\user@example.com`, which does not survive being interpolated into
/// a command line.
///
/// The result is then verified rather than assumed. `icacls` does not behave
/// identically everywhere — on some hosts `/inheritance:r` removes the
/// inherited entries outright, on others it converts them to explicit ones —
/// so the check below asserts the property we actually care about (no broad
/// principal retains access) instead of trusting a particular implementation.
///
/// `SYSTEM` and `Administrators` may remain. That is the intended parity with
/// Unix, where `root` can read a `0600` file; the threat model is another
/// unprivileged account on the same machine, not a privileged one.
#[cfg(windows)]
pub fn restrict_to_owner(path: &Path) -> io::Result<()> {
	use std::process::{Command, Stdio};

	let run = |args: &[&std::ffi::OsStr]| -> io::Result<std::process::Output> {
		Command::new("icacls")
			.args(args)
			.stdin(Stdio::null())
			.output()
	};

	let path_os = path.as_os_str();
	let output = run(&[
		path_os,
		"/inheritance:r".as_ref(),
		"/grant:r".as_ref(),
		"*S-1-3-4:(F)".as_ref(),
	])?;
	if !output.status.success() {
		return Err(io::Error::other(format!(
			"icacls failed to restrict {}: {}",
			path.display(),
			String::from_utf8_lossy(&output.stderr).trim()
		)));
	}

	verify_no_broad_access(path)
}

/// Fail if any well-known "everyone-ish" principal can still reach the file.
///
/// Checked by SID so the result does not depend on the machine's display
/// language: `S-1-1-0` Everyone, `S-1-5-32-545` Users,
/// `S-1-5-11` Authenticated Users, `S-1-5-7` Anonymous, `S-1-5-32-546` Guests.
#[cfg(windows)]
fn verify_no_broad_access(path: &Path) -> io::Result<()> {
	use std::process::{Command, Stdio};

	const BROAD_SIDS: &[&str] = &[
		"*S-1-1-0",
		"*S-1-5-32-545",
		"*S-1-5-11",
		"*S-1-5-7",
		"*S-1-5-32-546",
	];

	for sid in BROAD_SIDS {
		let found = Command::new("icacls")
			.arg(path.as_os_str())
			.arg("/findsid")
			.arg(sid)
			.stdin(Stdio::null())
			.output()?;
		// `/findsid` prints `SID Found: <path>` on a hit and
		// `No files with a matching SID was found` otherwise. It exits zero
		// either way, so the marker is what distinguishes them.
		if String::from_utf8_lossy(&found.stdout).contains("SID Found:") {
			return Err(io::Error::other(format!(
				"{} is still accessible to {}",
				path.display(),
				sid.trim_start_matches('*')
			)));
		}
	}

	Ok(())
}

#[cfg(all(test, windows))]
mod tests {
	use super::*;
	use std::fs;

	#[test]
	fn restricts_a_file_created_under_a_permissive_parent() {
		let dir = tempfile::tempdir().unwrap();
		let parent = dir.path().join("permissive");
		fs::create_dir_all(&parent).unwrap();

		// Deliberately widen the parent so the file inherits broad access,
		// which is the situation this function exists to correct.
		let _ = std::process::Command::new("icacls")
			.arg(parent.as_os_str())
			.args(["/grant", "*S-1-1-0:(OI)(CI)(F)"])
			.output();

		let path = parent.join("token");
		fs::write(&path, "super-secret").unwrap();

		restrict_to_owner(&path).unwrap();

		// The owner must still be able to read it back.
		assert_eq!(fs::read_to_string(&path).unwrap(), "super-secret");
	}
}
