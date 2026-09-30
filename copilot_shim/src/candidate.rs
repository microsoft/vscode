/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::collections::HashSet;
#[cfg(any(windows, test))]
use std::ffi::{OsStr, OsString};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use crate::identity::{contains_marker, is_same_file};
use crate::legacy::{classify_wrapper, LegacyClassification, LEGACY_INSPECTION_LIMIT};
use crate::model::{DiscoveredCandidate, DiscoveredFileKind, SystemError};
use crate::runtime::{EnvironmentEffects, FileSystemEffects, InspectedFileType, PathInspection};

/// Only candidates up to this size are searched for the shim marker. The shim binary is about 1 MB, and skipping larger
/// files keeps discovery from reading a large Copilot CLI executable (about 150 MB) on every launch.
const SHIM_MARKER_SEARCH_LIMIT: u64 = 16 * 1024 * 1024;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DiscoveryOperation {
	CurrentExecutable,
	PathEntry,
	CandidateMetadata,
	CandidateRead,
	LegacyRead,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DiscoveryExclusion {
	NotDirectory,
	NotRegularFile,
	#[cfg(any(not(windows), test))]
	NotExecutable,
	CurrentExecutable,
	RustShimMarker,
	LegacyShim,
	UndecodableScript,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum DiscoveryDiagnosticKind {
	Error {
		operation: DiscoveryOperation,
		error: SystemError,
	},
	Excluded(DiscoveryExclusion),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DiscoveryDiagnostic {
	pub(crate) path: PathBuf,
	pub(crate) kind: DiscoveryDiagnosticKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DiscoveryResult {
	pub(crate) candidates: Vec<DiscoveredCandidate>,
	pub(crate) diagnostics: Vec<DiscoveryDiagnostic>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DiscoveryError {
	pub(crate) path: Option<PathBuf>,
	pub(crate) operation: DiscoveryOperation,
	pub(crate) error: SystemError,
}

pub(crate) fn discover<R>(
	runtime: &R,
	shim_marker: &[u8],
) -> Result<DiscoveryResult, DiscoveryError>
where
	R: EnvironmentEffects + FileSystemEffects,
{
	let current_path = runtime
		.current_executable()
		.map_err(|error| DiscoveryError {
			path: None,
			operation: DiscoveryOperation::CurrentExecutable,
			error: SystemError::from(&error),
		})?;
	let current = required_inspection(runtime, &current_path)?;
	let current_directory = runtime
		.current_directory()
		.map_err(|error| DiscoveryError {
			path: None,
			operation: DiscoveryOperation::PathEntry,
			error: SystemError::from(&error),
		})?;

	let Some(path) = runtime.path() else {
		return Ok(DiscoveryResult {
			candidates: Vec::new(),
			diagnostics: Vec::new(),
		});
	};
	if path.is_empty() {
		return Ok(DiscoveryResult {
			candidates: Vec::new(),
			diagnostics: Vec::new(),
		});
	}

	let mut result = DiscoveryResult {
		candidates: Vec::new(),
		diagnostics: Vec::new(),
	};
	let mut visited_directories = HashSet::new();
	for entry in std::env::split_paths(&path) {
		let directory = resolve_path_entry(&current_directory, &entry);
		let inspection = match runtime.inspect_path(&directory) {
			Ok(Some(inspection)) => inspection,
			Ok(None) => continue,
			Err(error) => {
				push_error(
					&mut result,
					directory,
					DiscoveryOperation::PathEntry,
					&error,
				);
				continue;
			}
		};
		if inspection.file_type != InspectedFileType::Directory {
			push_exclusion(&mut result, directory, DiscoveryExclusion::NotDirectory);
			continue;
		}
		if !visited_directories.insert(inspection.canonical_path) {
			continue;
		}

		for (candidate_path, kind) in candidate_paths(runtime, &directory, &mut result) {
			inspect_candidate(
				runtime,
				&current,
				candidate_path,
				kind,
				shim_marker,
				&mut result,
			);
		}
	}

	Ok(result)
}

fn required_inspection<R: FileSystemEffects>(
	runtime: &R,
	path: &Path,
) -> Result<PathInspection, DiscoveryError> {
	match runtime.inspect_path(path) {
		Ok(Some(inspection)) => Ok(inspection),
		Ok(None) => Err(DiscoveryError {
			path: Some(path.to_path_buf()),
			operation: DiscoveryOperation::CurrentExecutable,
			error: SystemError {
				kind: io::ErrorKind::NotFound,
				raw_os_error: None,
			},
		}),
		Err(error) => Err(DiscoveryError {
			path: Some(path.to_path_buf()),
			operation: DiscoveryOperation::CurrentExecutable,
			error: SystemError::from(&error),
		}),
	}
}

fn resolve_path_entry(current_directory: &Path, entry: &Path) -> PathBuf {
	if entry.as_os_str().is_empty() {
		current_directory.to_path_buf()
	} else if entry.is_absolute() {
		entry.to_path_buf()
	} else {
		current_directory.join(entry)
	}
}

#[cfg(not(windows))]
fn candidate_paths<R: FileSystemEffects>(
	_runtime: &R,
	directory: &Path,
	_result: &mut DiscoveryResult,
) -> Vec<(PathBuf, DiscoveredFileKind)> {
	vec![(
		directory.join("copilot"),
		DiscoveredFileKind::UnixExecutable,
	)]
}

#[cfg(windows)]
fn candidate_paths<R: FileSystemEffects>(
	runtime: &R,
	directory: &Path,
	result: &mut DiscoveryResult,
) -> Vec<(PathBuf, DiscoveredFileKind)> {
	let entries = match runtime.read_directory(directory) {
		Ok(entries) => entries,
		Err(error) => {
			push_error(
				result,
				directory.to_path_buf(),
				DiscoveryOperation::PathEntry,
				&error,
			);
			return Vec::new();
		}
	};

	order_windows_candidates(&entries)
		.into_iter()
		.map(|(name, kind)| (directory.join(name), kind))
		.collect()
}

#[cfg(any(windows, test))]
pub(crate) fn order_windows_candidates(
	entries: &[OsString],
) -> Vec<(OsString, DiscoveredFileKind)> {
	[
		("copilot.exe", DiscoveredFileKind::WindowsExecutable),
		("copilot.cmd", DiscoveredFileKind::CommandScript),
		("copilot.bat", DiscoveredFileKind::BatchScript),
		("copilot.ps1", DiscoveredFileKind::PowerShellScript),
	]
	.into_iter()
	.filter_map(|(expected, kind)| {
		entries
			.iter()
			.find(|entry| entry.as_os_str().eq_ignore_ascii_case(OsStr::new(expected)))
			.cloned()
			.map(|entry| (entry, kind))
	})
	.collect()
}

fn inspect_candidate<R: FileSystemEffects>(
	runtime: &R,
	current: &PathInspection,
	path: PathBuf,
	kind: DiscoveredFileKind,
	shim_marker: &[u8],
	result: &mut DiscoveryResult,
) {
	let inspection = match runtime.inspect_path(&path) {
		Ok(Some(inspection)) => inspection,
		Ok(None) => return,
		Err(error) => {
			push_error(result, path, DiscoveryOperation::CandidateMetadata, &error);
			return;
		}
	};
	if inspection.file_type != InspectedFileType::RegularFile {
		push_exclusion(result, path, DiscoveryExclusion::NotRegularFile);
		return;
	}
	#[cfg(any(not(windows), test))]
	{
		if kind == DiscoveredFileKind::UnixExecutable && !inspection.executable {
			push_exclusion(result, path, DiscoveryExclusion::NotExecutable);
			return;
		}
	}
	if is_same_file(current, &inspection) {
		push_exclusion(result, path, DiscoveryExclusion::CurrentExecutable);
		return;
	}

	if inspection.file_size <= SHIM_MARKER_SEARCH_LIMIT {
		let reader = match runtime.open_file(&path) {
			Ok(reader) => reader,
			Err(error) => {
				push_error(result, path, DiscoveryOperation::CandidateRead, &error);
				return;
			}
		};
		match contains_marker(reader.take(SHIM_MARKER_SEARCH_LIMIT), shim_marker) {
			Ok(true) => {
				push_exclusion(result, path, DiscoveryExclusion::RustShimMarker);
				return;
			}
			Ok(false) => {}
			Err(error) => {
				push_error(result, path, DiscoveryOperation::CandidateRead, &error);
				return;
			}
		}
	}

	let reader = match runtime.open_file(&path) {
		Ok(reader) => reader,
		Err(error) => {
			push_error(result, path, DiscoveryOperation::LegacyRead, &error);
			return;
		}
	};
	let content = match read_legacy_prefix(reader) {
		Ok(content) => content,
		Err(error) => {
			push_error(result, path, DiscoveryOperation::LegacyRead, &error);
			return;
		}
	};
	match classify_wrapper(&content) {
		LegacyClassification::Legacy => {
			push_exclusion(result, path, DiscoveryExclusion::LegacyShim);
			return;
		}
		LegacyClassification::Undecodable if is_script(kind, &content) => {
			push_exclusion(result, path, DiscoveryExclusion::UndecodableScript);
			return;
		}
		LegacyClassification::NotLegacy | LegacyClassification::Undecodable => {}
	}

	result.candidates.push(DiscoveredCandidate::new(
		path,
		inspection.canonical_path,
		inspection.file_identity,
		kind,
	));
}

fn read_legacy_prefix(mut reader: Box<dyn Read>) -> io::Result<Vec<u8>> {
	let mut content = Vec::with_capacity(LEGACY_INSPECTION_LIMIT);
	reader
		.by_ref()
		.take(LEGACY_INSPECTION_LIMIT as u64)
		.read_to_end(&mut content)?;
	Ok(content)
}

fn is_script(kind: DiscoveredFileKind, _content: &[u8]) -> bool {
	match kind {
		#[cfg(any(not(windows), test))]
		DiscoveredFileKind::UnixExecutable => _content.starts_with(b"#!"),
		#[cfg(any(windows, test))]
		DiscoveredFileKind::CommandScript
		| DiscoveredFileKind::BatchScript
		| DiscoveredFileKind::PowerShellScript => true,
		#[cfg(any(windows, test))]
		DiscoveredFileKind::WindowsExecutable => false,
	}
}

fn push_error(
	result: &mut DiscoveryResult,
	path: PathBuf,
	operation: DiscoveryOperation,
	error: &io::Error,
) {
	result.diagnostics.push(DiscoveryDiagnostic {
		path,
		kind: DiscoveryDiagnosticKind::Error {
			operation,
			error: SystemError::from(error),
		},
	});
}

fn push_exclusion(result: &mut DiscoveryResult, path: PathBuf, exclusion: DiscoveryExclusion) {
	result.diagnostics.push(DiscoveryDiagnostic {
		path,
		kind: DiscoveryDiagnosticKind::Excluded(exclusion),
	});
}

#[cfg(test)]
mod ordering_tests {
	use super::*;

	#[test]
	fn windows_candidate_order_is_fixed_and_case_insensitive() {
		let entries = [
			OsString::from("copilot"),
			OsString::from("COPILOT.PS1"),
			OsString::from("Copilot.Bat"),
			OsString::from("copilot.com"),
			OsString::from("COPILOT.EXE"),
			OsString::from("Copilot.Cmd"),
		];

		assert_eq!(
			order_windows_candidates(&entries),
			vec![
				(
					OsString::from("COPILOT.EXE"),
					DiscoveredFileKind::WindowsExecutable,
				),
				(
					OsString::from("Copilot.Cmd"),
					DiscoveredFileKind::CommandScript,
				),
				(
					OsString::from("Copilot.Bat"),
					DiscoveredFileKind::BatchScript,
				),
				(
					OsString::from("COPILOT.PS1"),
					DiscoveredFileKind::PowerShellScript,
				),
			]
		);
	}
}

#[cfg(test)]
mod tests {
	use crate::{candidate, identity, legacy, model, runtime};
	use std::collections::HashSet;
	use std::ffi::OsString;
	use std::fs;
	use std::io::{self, Cursor, Read};
	use std::path::{Path, PathBuf};
	use std::sync::atomic::{AtomicU64, Ordering};

	use candidate::{discover, DiscoveryDiagnosticKind, DiscoveryExclusion, DiscoveryOperation};
	use legacy::{classify_wrapper, LegacyClassification};
	#[cfg(windows)]
	use model::DiscoveredFileKind;
	use model::FileIdentityState;
	use runtime::{EnvironmentEffects, FileSystemEffects, NativeRuntime, PathInspection};

	static NEXT_TEMP_DIRECTORY: AtomicU64 = AtomicU64::new(0);

	struct TestDirectory {
		path: PathBuf,
	}

	impl TestDirectory {
		fn new(test_name: &str) -> Self {
			let sequence = NEXT_TEMP_DIRECTORY.fetch_add(1, Ordering::Relaxed);
			let path = std::env::temp_dir().join(format!(
				"copilot-shim-{test_name}-{}-{sequence}",
				std::process::id()
			));
			fs::create_dir(&path).expect("create test directory");
			Self { path }
		}

		fn child(&self, name: impl AsRef<Path>) -> PathBuf {
			self.path.join(name)
		}

		fn directory(&self, name: impl AsRef<Path>) -> PathBuf {
			let path = self.child(name);
			fs::create_dir_all(&path).expect("create child directory");
			path
		}
	}

	impl Drop for TestDirectory {
		fn drop(&mut self) {
			fs::remove_dir_all(&self.path).expect("remove test directory");
		}
	}

	struct TestRuntime {
		path: Option<OsString>,
		current_executable: PathBuf,
		current_directory: PathBuf,
		unsupported_identity: bool,
		metadata_errors: HashSet<PathBuf>,
		read_errors: HashSet<PathBuf>,
		native: NativeRuntime,
	}

	impl TestRuntime {
		fn new(
			path: Option<OsString>,
			current_executable: PathBuf,
			current_directory: PathBuf,
		) -> Self {
			Self {
				path,
				current_executable,
				current_directory,
				unsupported_identity: false,
				metadata_errors: HashSet::new(),
				read_errors: HashSet::new(),
				native: NativeRuntime::default(),
			}
		}
	}

	impl EnvironmentEffects for TestRuntime {
		fn path(&self) -> Option<OsString> {
			self.path.clone()
		}

		fn current_executable(&self) -> io::Result<PathBuf> {
			Ok(self.current_executable.clone())
		}

		fn current_directory(&self) -> io::Result<PathBuf> {
			Ok(self.current_directory.clone())
		}
	}

	impl FileSystemEffects for TestRuntime {
		fn inspect_path(&self, path: &Path) -> io::Result<Option<PathInspection>> {
			if self.metadata_errors.contains(path) {
				return Err(io::Error::new(
					io::ErrorKind::PermissionDenied,
					"injected metadata error",
				));
			}
			let mut inspection = self.native.inspect_path(path)?;
			if self.unsupported_identity {
				if let Some(inspection) = &mut inspection {
					inspection.file_identity = FileIdentityState::Unsupported;
				}
			}
			Ok(inspection)
		}

		fn read_directory(&self, path: &Path) -> io::Result<Vec<OsString>> {
			self.native.read_directory(path)
		}

		fn open_file(&self, path: &Path) -> io::Result<Box<dyn Read>> {
			if self.read_errors.contains(path) {
				return Err(io::Error::new(
					io::ErrorKind::PermissionDenied,
					"injected read error",
				));
			}
			self.native.open_file(path)
		}
	}

	fn shim_marker() -> Vec<u8> {
		["VSCODE_COPILOT_", "RUST_SHIM_V1"].concat().into_bytes()
	}

	/// The file name discovery looks for in each PATH directory on this platform.
	const CANDIDATE: &str = if cfg!(windows) {
		"copilot.exe"
	} else {
		"copilot"
	};

	fn write_executable(path: &Path, content: &[u8]) {
		fs::write(path, content).expect("write executable");
		#[cfg(unix)]
		{
			use std::os::unix::fs::PermissionsExt;

			fs::set_permissions(path, fs::Permissions::from_mode(0o700))
				.expect("make file executable");
		}
	}

	fn create_current_executable(directory: &TestDirectory, content: &[u8]) -> PathBuf {
		let current_directory = directory.directory("current");
		let current = current_directory.join("copilot");
		write_executable(&current, content);
		current
	}

	fn joined_path(paths: impl IntoIterator<Item = PathBuf>) -> OsString {
		std::env::join_paths(paths).expect("join PATH entries")
	}

	fn candidate_paths(result: &candidate::DiscoveryResult) -> Vec<PathBuf> {
		result
			.candidates
			.iter()
			.map(|candidate| candidate.discovered_path().to_path_buf())
			.collect()
	}

	// Uses Unix file names and legacy scripts; Windows discovery only considers `.exe`, `.cmd`, `.bat`, and `.ps1`.
	#[cfg(unix)]
	#[test]
	fn self_and_legacy_matrix() {
		let directory = TestDirectory::new("self-and-legacy");
		let marker = shim_marker();
		let current = create_current_executable(&directory, &marker);
		let current_directory = current.parent().expect("current parent").to_path_buf();

		let symlink_directory = directory.directory("symlink");
		let symlink = symlink_directory.join("copilot");
		#[cfg(unix)]
		std::os::unix::fs::symlink(&current, &symlink).expect("create symlink");
		#[cfg(windows)]
		std::os::windows::fs::symlink_file(&current, &symlink).expect("create symlink");

		let hard_link_directory = directory.directory("hard-link");
		fs::hard_link(&current, hard_link_directory.join("copilot")).expect("create hard link");

		let copied_directory = directory.directory("copied");
		fs::copy(&current, copied_directory.join("copilot")).expect("copy current executable");

		let marked_directory = directory.directory("marked");
		let mut marked_content = b"prefix".to_vec();
		marked_content.extend_from_slice(&marker);
		marked_content.extend_from_slice(b"suffix");
		write_executable(&marked_directory.join("copilot"), &marked_content);

		let positive_fixtures: [&[u8]; 4] = [
			include_bytes!("../tests/fixtures/legacy/posix-launcher.sh"),
			include_bytes!("../tests/fixtures/legacy/windows-bootstrapper.ps1"),
			include_bytes!("../tests/fixtures/legacy/windows-wrapper.cmd"),
			include_bytes!("../tests/fixtures/legacy/git-bash-wrapper.sh"),
		];
		let mut path_directories = vec![
			current_directory.clone(),
			symlink_directory,
			hard_link_directory,
			copied_directory,
			marked_directory,
		];
		for (index, fixture) in positive_fixtures.into_iter().enumerate() {
			let fixture_directory = directory.directory(format!("legacy-{index}"));
			write_executable(&fixture_directory.join("copilot"), fixture);
			path_directories.push(fixture_directory);
		}

		let npm_cmd_directory = directory.directory("npm-cmd");
		write_executable(
			&npm_cmd_directory.join("copilot"),
			include_bytes!("../tests/fixtures/legacy/npm-wrapper.cmd"),
		);
		path_directories.push(npm_cmd_directory.clone());
		let npm_ps1_directory = directory.directory("npm-ps1");
		write_executable(
			&npm_ps1_directory.join("copilot"),
			include_bytes!("../tests/fixtures/legacy/npm-wrapper.ps1"),
		);
		path_directories.push(npm_ps1_directory.clone());
		let valid_directory = directory.directory("valid");
		write_executable(&valid_directory.join("copilot"), b"real copilot cli");
		path_directories.push(valid_directory.clone());

		let runtime = TestRuntime::new(
			Some(joined_path(path_directories)),
			current,
			directory.path.clone(),
		);
		let result = discover(&runtime, &marker).expect("discover candidates");
		let exclusions: Vec<DiscoveryExclusion> = result
			.diagnostics
			.iter()
			.filter_map(|diagnostic| match diagnostic.kind {
				DiscoveryDiagnosticKind::Excluded(exclusion) => Some(exclusion),
				DiscoveryDiagnosticKind::Error { .. } => None,
			})
			.collect();

		assert_eq!(
			(candidate_paths(&result), exclusions),
			(
				vec![
					npm_cmd_directory.join("copilot"),
					npm_ps1_directory.join("copilot"),
					valid_directory.join("copilot"),
				],
				vec![
					DiscoveryExclusion::CurrentExecutable,
					DiscoveryExclusion::CurrentExecutable,
					DiscoveryExclusion::CurrentExecutable,
					DiscoveryExclusion::RustShimMarker,
					DiscoveryExclusion::RustShimMarker,
					DiscoveryExclusion::LegacyShim,
					DiscoveryExclusion::LegacyShim,
					DiscoveryExclusion::LegacyShim,
					DiscoveryExclusion::LegacyShim,
				],
			)
		);
	}

	#[cfg(unix)]
	#[test]
	fn unix_undecodable_shebang_script_is_skipped() {
		let directory = TestDirectory::new("undecodable-shebang");
		let current = create_current_executable(&directory, b"current");
		let candidate_directory = directory.directory("candidate");
		let candidate = candidate_directory.join("copilot");
		write_executable(&candidate, b"#!/bin/sh\n\xFF");
		let binary_directory = directory.directory("binary");
		let binary = binary_directory.join("copilot");
		write_executable(&binary, b"\x7FELF\xFF");
		let runtime = TestRuntime::new(
			Some(joined_path([candidate_directory, binary_directory])),
			current,
			directory.path.clone(),
		);

		let result = discover(&runtime, &shim_marker()).expect("discover candidates");

		assert_eq!(
			(candidate_paths(&result), result.diagnostics),
			(
				vec![binary],
				vec![candidate::DiscoveryDiagnostic {
					path: candidate,
					kind: DiscoveryDiagnosticKind::Excluded(DiscoveryExclusion::UndecodableScript),
				}],
			)
		);
	}

	#[cfg(unix)]
	#[test]
	fn valid_symlink_candidate_retains_discovered_path() {
		let directory = TestDirectory::new("valid-symlink");
		let current = create_current_executable(&directory, b"current");
		let target_directory = directory.directory("target");
		let target = target_directory.join("copilot");
		write_executable(&target, b"real cli");
		let symlink_directory = directory.directory("symlink");
		let symlink = symlink_directory.join("copilot");
		std::os::unix::fs::symlink(&target, &symlink).expect("create candidate symlink");
		let runtime = TestRuntime::new(
			Some(joined_path([symlink_directory])),
			current,
			directory.path.clone(),
		);

		let result = discover(&runtime, &shim_marker()).expect("discover symlink candidate");
		let candidate = result
			.candidates
			.first()
			.expect("candidate should be eligible");
		let canonical_target = fs::canonicalize(&target).expect("canonicalize candidate target");

		assert_eq!(
			(
				result.candidates.len(),
				candidate.discovered_path(),
				candidate.canonical_path(),
			),
			(1, symlink.as_path(), canonical_target.as_path())
		);
	}

	#[test]
	fn path_entries_preserve_native_order_and_first_duplicate() {
		let directory = TestDirectory::new("path-order");
		let current = create_current_executable(&directory, b"current without marker");
		let cwd_candidate = directory.child(CANDIDATE);
		write_executable(&cwd_candidate, b"cwd");
		let relative_directory = directory.directory("relative");
		write_executable(&relative_directory.join(CANDIDATE), b"relative");
		let non_directory = directory.child("not-a-directory");
		fs::write(&non_directory, b"file").expect("write non-directory PATH entry");

		let entries = vec![
			PathBuf::new(),
			PathBuf::from("relative"),
			relative_directory.clone(),
			directory.child("missing"),
			non_directory.clone(),
		];
		#[cfg(unix)]
		let (entries, non_utf8_candidate) = {
			use std::os::unix::ffi::OsStringExt;

			let mut entries = entries;
			let non_utf8_directory =
				directory.child(PathBuf::from(OsString::from_vec(b"native-\xFF".to_vec())));
			#[cfg(not(target_os = "macos"))]
			let candidate = {
				fs::create_dir(&non_utf8_directory).expect("create non-UTF-8 directory");
				let candidate = non_utf8_directory.join("copilot");
				write_executable(&candidate, b"native");
				Some(candidate)
			};
			#[cfg(target_os = "macos")]
			let candidate = None;
			entries.push(non_utf8_directory);
			(entries, candidate)
		};

		let runtime = TestRuntime::new(Some(joined_path(entries)), current, directory.path.clone());
		let result = discover(&runtime, &shim_marker()).expect("discover candidates");
		let expected = vec![cwd_candidate, relative_directory.join(CANDIDATE)];
		#[cfg(unix)]
		let expected = {
			let mut expected = expected;
			if let Some(non_utf8_candidate) = non_utf8_candidate {
				expected.push(non_utf8_candidate);
			}
			expected
		};

		assert_eq!(candidate_paths(&result), expected);
		assert_eq!(
			result.diagnostics.first(),
			Some(&candidate::DiscoveryDiagnostic {
				path: non_directory,
				kind: DiscoveryDiagnosticKind::Excluded(DiscoveryExclusion::NotDirectory),
			})
		);
	}

	// Relies on Unix executable bits; on Windows every regular file is executable.
	#[cfg(unix)]
	#[test]
	fn invalid_candidates_continue_to_a_valid_later_candidate() {
		let directory = TestDirectory::new("invalid-candidates");
		let current = create_current_executable(&directory, b"current");
		let non_executable_directory = directory.directory("non-executable");
		fs::write(non_executable_directory.join("copilot"), b"not executable")
			.expect("write non-executable");
		let directory_candidate = directory.directory("directory-candidate");
		fs::create_dir(directory_candidate.join("copilot")).expect("create directory candidate");
		let broken_directory = directory.directory("broken");
		let loop_directory = directory.directory("loop");
		#[cfg(unix)]
		{
			std::os::unix::fs::symlink("missing", broken_directory.join("copilot"))
				.expect("create broken link");
			std::os::unix::fs::symlink("copilot", loop_directory.join("copilot"))
				.expect("create link loop");
		}
		#[cfg(windows)]
		{
			std::os::windows::fs::symlink_file("missing", broken_directory.join("copilot"))
				.expect("create broken link");
			std::os::windows::fs::symlink_file("copilot", loop_directory.join("copilot"))
				.expect("create link loop");
		}
		let unreadable_directory = directory.directory("unreadable");
		let unreadable = unreadable_directory.join("copilot");
		write_executable(&unreadable, b"unreadable");
		let valid_directory = directory.directory("valid");
		let valid = valid_directory.join("copilot");
		write_executable(&valid, b"valid");

		let mut runtime = TestRuntime::new(
			Some(joined_path([
				non_executable_directory,
				directory_candidate,
				broken_directory,
				loop_directory,
				unreadable_directory,
				valid_directory,
			])),
			current,
			directory.path.clone(),
		);
		runtime.read_errors.insert(unreadable.clone());
		let result = discover(&runtime, &shim_marker()).expect("discover candidates");

		assert_eq!(candidate_paths(&result), vec![valid]);
		assert!(matches!(
			result.diagnostics.as_slice(),
			[
				candidate::DiscoveryDiagnostic {
					kind: DiscoveryDiagnosticKind::Excluded(DiscoveryExclusion::NotExecutable),
					..
				},
				candidate::DiscoveryDiagnostic {
					kind: DiscoveryDiagnosticKind::Excluded(DiscoveryExclusion::NotRegularFile),
					..
				},
				candidate::DiscoveryDiagnostic {
					kind: DiscoveryDiagnosticKind::Error {
						operation: DiscoveryOperation::CandidateMetadata,
						error: model::SystemError {
							kind: io::ErrorKind::NotFound,
							..
						},
					},
					..
				},
				candidate::DiscoveryDiagnostic {
					kind: DiscoveryDiagnosticKind::Error {
						operation: DiscoveryOperation::CandidateMetadata,
						..
					},
					..
				},
				candidate::DiscoveryDiagnostic {
					kind: DiscoveryDiagnosticKind::Error {
						operation: DiscoveryOperation::CandidateRead,
						error: model::SystemError {
							kind: io::ErrorKind::PermissionDenied,
							..
						},
					},
					..
				},
			]
		));
	}

	#[test]
	fn unsupported_file_ids_fall_back_but_metadata_errors_do_not() {
		let directory = TestDirectory::new("identity-errors");
		let marker = shim_marker();
		let current = create_current_executable(&directory, &marker);
		let hard_link_directory = directory.directory("hard-link");
		let hard_link = hard_link_directory.join(CANDIDATE);
		fs::hard_link(&current, &hard_link).expect("create hard link");
		let metadata_error_directory = directory.directory("metadata-error");
		let metadata_error = metadata_error_directory.join(CANDIDATE);
		write_executable(&metadata_error, b"candidate");
		let valid_directory = directory.directory("valid");
		let valid = valid_directory.join(CANDIDATE);
		write_executable(&valid, b"valid");

		let mut runtime = TestRuntime::new(
			Some(joined_path([
				hard_link_directory,
				metadata_error_directory,
				valid_directory,
			])),
			current.clone(),
			directory.path.clone(),
		);
		runtime.unsupported_identity = true;
		runtime.metadata_errors.insert(metadata_error.clone());
		let result = discover(&runtime, &marker).expect("discover candidates");

		let mut fatal_runtime = TestRuntime::new(None, current.clone(), directory.path.clone());
		fatal_runtime.metadata_errors.insert(current);
		let fatal = discover(&fatal_runtime, &marker).expect_err("current metadata error is fatal");

		assert_eq!(
			(
				candidate_paths(&result),
				result
					.candidates
					.first()
					.map(|candidate| candidate.file_identity()),
				result
					.diagnostics
					.iter()
					.map(|diagnostic| &diagnostic.kind)
					.collect::<Vec<_>>(),
				(fatal.operation, fatal.error.kind),
			),
			(
				vec![valid],
				Some(&FileIdentityState::Unsupported),
				vec![
					&DiscoveryDiagnosticKind::Excluded(DiscoveryExclusion::RustShimMarker),
					&DiscoveryDiagnosticKind::Error {
						operation: DiscoveryOperation::CandidateMetadata,
						error: model::SystemError {
							kind: io::ErrorKind::PermissionDenied,
							raw_os_error: None,
						},
					},
				],
				(
					DiscoveryOperation::CurrentExecutable,
					io::ErrorKind::PermissionDenied,
				),
			)
		);
	}

	#[test]
	fn missing_and_empty_path_have_no_candidates() {
		let directory = TestDirectory::new("empty-path");
		let current = create_current_executable(&directory, b"current");
		let missing = TestRuntime::new(None, current.clone(), directory.path.clone());
		let empty = TestRuntime::new(Some(OsString::new()), current, directory.path.clone());

		assert_eq!(
			(
				discover(&missing, &shim_marker())
					.expect("missing PATH")
					.candidates,
				discover(&empty, &shim_marker())
					.expect("empty PATH")
					.candidates,
			),
			(Vec::new(), Vec::new())
		);
	}

	#[test]
	fn legacy_signatures_are_bounded_and_exact() {
		let positives: [&[u8]; 4] = [
			include_bytes!("../tests/fixtures/legacy/posix-launcher.sh"),
			include_bytes!("../tests/fixtures/legacy/windows-bootstrapper.ps1"),
			include_bytes!("../tests/fixtures/legacy/windows-wrapper.cmd"),
			include_bytes!("../tests/fixtures/legacy/git-bash-wrapper.sh"),
		];
		let negatives: [&[u8]; 2] = [
			include_bytes!("../tests/fixtures/legacy/npm-wrapper.cmd"),
			include_bytes!("../tests/fixtures/legacy/npm-wrapper.ps1"),
		];
		let mut marker_after_limit = vec![b'x'; legacy::LEGACY_INSPECTION_LIMIT];
		marker_after_limit.extend_from_slice(positives[0]);
		let crlf_posix = String::from_utf8(positives[0].to_vec())
			.expect("UTF-8 fixture")
			.replace('\n', "\r\n");
		let bom_posix = [b"\xEF\xBB\xBF".as_slice(), positives[0]].concat();
		let uppercase_windows = String::from_utf8(positives[2].to_vec())
			.expect("UTF-8 fixture")
			.to_ascii_uppercase();

		assert_eq!(
			(
				positives.map(|bytes| classify_wrapper(bytes) == LegacyClassification::Legacy),
				negatives.map(|bytes| classify_wrapper(bytes) == LegacyClassification::Legacy),
				classify_wrapper(crlf_posix.as_bytes()) == LegacyClassification::Legacy,
				classify_wrapper(&bom_posix) == LegacyClassification::Legacy,
				classify_wrapper(uppercase_windows.as_bytes()) == LegacyClassification::Legacy,
				classify_wrapper(&marker_after_limit),
				classify_wrapper(b"\xFF#!/bin/sh"),
				classify_wrapper(
					b"#!/bin/sh\nunset node_options\nELECTRON_RUN_AS_NODE=1 x copilotCLIShim.js \"$@\""
				) == LegacyClassification::Legacy,
			),
			(
				[true; 4],
				[false; 2],
				true,
				true,
				true,
				LegacyClassification::NotLegacy,
				LegacyClassification::Undecodable,
				false,
			)
		);
	}

	struct ChunkedReader {
		content: Cursor<Vec<u8>>,
		maximum_chunk: usize,
	}

	impl Read for ChunkedReader {
		fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
			let length = buffer.len().min(self.maximum_chunk);
			self.content.read(&mut buffer[..length])
		}
	}

	#[test]
	fn marker_search_streams_the_entire_file_and_handles_overlap() {
		let marker = shim_marker();
		let mut content = vec![b'x'; 20_000];
		content.extend_from_slice(&marker);
		content.extend_from_slice(&vec![b'y'; 20_000]);

		assert!(identity::contains_marker(
			ChunkedReader {
				content: Cursor::new(content),
				maximum_chunk: 3,
			},
			&marker,
		)
		.expect("search marker"));
	}

	#[test]
	fn large_candidates_are_not_scanned_for_rust_shim_marker() {
		let directory = TestDirectory::new("large-candidate-marker");
		let marker = shim_marker();
		let current = create_current_executable(&directory, b"current");
		let candidate_directory = directory.directory("candidate");
		let candidate = candidate_directory.join(CANDIDATE);
		let mut content = marker;
		content.resize(candidate::SHIM_MARKER_SEARCH_LIMIT as usize + 1, b'x');
		write_executable(&candidate, &content);
		let runtime = TestRuntime::new(
			Some(joined_path([candidate_directory])),
			current,
			directory.path.clone(),
		);

		let result = discover(&runtime, &shim_marker()).expect("discover candidates");

		assert_eq!(candidate_paths(&result), vec![candidate]);
	}

	#[cfg(windows)]
	#[test]
	fn windows_filesystem_discovery_uses_intrinsic_candidate_kinds() {
		let directory = TestDirectory::new("windows-filesystem");
		let current = create_current_executable(&directory, b"current");
		let path_directory = directory.directory("path");
		for name in ["COPILOT.PS1", "Copilot.Bat", "Copilot.Cmd", "COPILOT.EXE"] {
			write_executable(&path_directory.join(name), b"candidate");
		}
		let runtime = TestRuntime::new(
			Some(joined_path([path_directory])),
			current,
			directory.path.clone(),
		);

		assert_eq!(
			discover(&runtime, &shim_marker())
				.expect("discover Windows candidates")
				.candidates
				.into_iter()
				.map(|candidate| candidate.kind())
				.collect::<Vec<_>>(),
			vec![
				DiscoveredFileKind::WindowsExecutable,
				DiscoveredFileKind::CommandScript,
				DiscoveredFileKind::BatchScript,
				DiscoveredFileKind::PowerShellScript,
			]
		);
	}
}
