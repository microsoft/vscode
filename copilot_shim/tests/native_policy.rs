/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#![cfg(target_os = "linux")]

use std::env;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::process::Command;

const ENABLE_VARIABLE: &str = "VSCODE_COPILOT_SHIM_NATIVE_POLICY_TEST";
const RUNNER_DIRECTORY_VARIABLE: &str = "VSCODE_COPILOT_SHIM_NATIVE_POLICY_TEST_ROOT";
const POLICY_DIRECTORY: &str = "/etc/vscode";
const POLICY_PATH: &str = "/etc/vscode/policy.json";
const ROOT_FALLBACK_CLI_PATH: &str = "/usr/local/bin/copilot";
const RUNNER_MARKER: &str = ".vscode-copilot-shim-native-policy-isolated-runner";
const RUNNER_MARKER_CONTENT: &[u8] = b"vscode-copilot-shim-native-policy-isolated-runner\n";

#[derive(Clone, Copy)]
struct EntryIdentity {
	device: u64,
	inode: u64,
}

impl EntryIdentity {
	fn read(path: &Path) -> io::Result<Self> {
		let metadata = fs::symlink_metadata(path)?;
		Ok(Self {
			device: metadata.dev(),
			inode: metadata.ino(),
		})
	}

	fn matches(self, metadata: &fs::Metadata) -> bool {
		self.device == metadata.dev() && self.inode == metadata.ino()
	}
}

struct NativePolicyFixture {
	policy_path: PathBuf,
	policy_identity: Option<EntryIdentity>,
	fixture_directory: PathBuf,
	fixture_directory_identity: EntryIdentity,
	cli_path: PathBuf,
	cli_identity: Option<EntryIdentity>,
}

impl NativePolicyFixture {
	fn new(runner_directory: &Path) -> Self {
		let (fixture_directory, fixture_directory_identity) =
			create_fixture_directory(runner_directory);
		let cli_path = fixture_directory.join("copilot");
		let cli_identity = create_fake_cli(&cli_path);
		Self {
			policy_path: PathBuf::from(POLICY_PATH),
			policy_identity: None,
			fixture_directory,
			fixture_directory_identity,
			cli_path,
			cli_identity: Some(cli_identity),
		}
	}

	fn set(&mut self) {
		assert!(
			self.policy_identity.is_none(),
			"native policy fixture is already set"
		);
		let mut file = OpenOptions::new()
			.write(true)
			.create_new(true)
			.open(&self.policy_path)
			.expect("create native policy fixture");
		self.policy_identity =
			Some(EntryIdentity::read(&self.policy_path).expect("identify native policy fixture"));
		file.write_all(br#"{"CopilotCliCommand":false}"#)
			.expect("write native policy fixture");
		file.flush().expect("flush native policy fixture");
	}

	fn clear(&mut self) -> io::Result<()> {
		let Some(identity) = self.policy_identity else {
			return Ok(());
		};
		remove_owned_file(&self.policy_path, identity)?;
		self.policy_identity = None;
		Ok(())
	}

	fn cleanup(&mut self) -> Result<(), String> {
		let mut failures = Vec::new();
		if let Err(error) = self.clear() {
			failures.push(format!("policy fixture: {error}"));
		}
		if let Some(identity) = self.cli_identity {
			match remove_owned_file(&self.cli_path, identity) {
				Ok(()) => self.cli_identity = None,
				Err(error) => failures.push(format!("fake CLI: {error}")),
			}
		}
		if self.cli_identity.is_none() {
			if let Err(error) =
				remove_owned_directory(&self.fixture_directory, self.fixture_directory_identity)
			{
				failures.push(format!("fixture directory: {error}"));
			}
		}
		if failures.is_empty() {
			Ok(())
		} else {
			Err(failures.join("; "))
		}
	}
}

impl Drop for NativePolicyFixture {
	fn drop(&mut self) {
		if let Err(error) = self.cleanup() {
			eprintln!("failed to clean native policy fixture: {error}");
		}
	}
}

fn create_fixture_directory(runner_directory: &Path) -> (PathBuf, EntryIdentity) {
	for attempt in 0..100 {
		let directory = runner_directory.join(format!(
			".vscode-copilot-shim-native-policy-fixture-{}-{attempt}",
			std::process::id()
		));
		match fs::create_dir(&directory) {
			Ok(()) => {
				let identity = EntryIdentity::read(&directory)
					.expect("identify native policy fixture directory");
				return (directory, identity);
			}
			Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
			Err(error) => panic!("create native policy fixture directory {directory:?}: {error}"),
		}
	}
	panic!("could not allocate a native policy fixture directory");
}

fn create_fake_cli(path: &Path) -> EntryIdentity {
	let mut file = OpenOptions::new()
		.write(true)
		.create_new(true)
		.open(path)
		.expect("create fake CLI");
	let identity = EntryIdentity::read(path).expect("identify fake CLI");
	file.write_all(b"#!/bin/sh\nprintf 'native-policy-fake-cli:%s\\n' \"$1\"\nexit 73\n")
		.expect("write fake CLI");
	file.flush().expect("flush fake CLI");
	let mut permissions = file
		.metadata()
		.expect("read fake CLI metadata")
		.permissions();
	permissions.set_mode(0o700);
	fs::set_permissions(path, permissions).expect("make fake CLI executable");
	identity
}

fn remove_owned_file(path: &Path, identity: EntryIdentity) -> io::Result<()> {
	match fs::symlink_metadata(path) {
		Ok(metadata)
			if metadata.file_type().is_file()
				&& !metadata.file_type().is_symlink()
				&& identity.matches(&metadata) =>
		{
			fs::remove_file(path)
		}
		Ok(_) => Err(io::Error::other(format!(
			"refusing to remove entry not created by this test: {path:?}"
		))),
		Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
		Err(error) => Err(error),
	}
}

fn remove_owned_directory(path: &Path, identity: EntryIdentity) -> io::Result<()> {
	match fs::symlink_metadata(path) {
		Ok(metadata)
			if metadata.file_type().is_dir()
				&& !metadata.file_type().is_symlink()
				&& identity.matches(&metadata) =>
		{
			fs::remove_dir(path)
		}
		Ok(_) => Err(io::Error::other(format!(
			"refusing to remove directory not created by this test: {path:?}"
		))),
		Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
		Err(error) => Err(error),
	}
}

fn provisioned_runner_directory() -> PathBuf {
	assert_eq!(
		env::var(ENABLE_VARIABLE).as_deref(),
		Ok("1"),
		"set {ENABLE_VARIABLE}=1 only in a provisioned isolated Linux runner"
	);
	let directory = PathBuf::from(env::var_os(RUNNER_DIRECTORY_VARIABLE).unwrap_or_else(|| {
		panic!("set {RUNNER_DIRECTORY_VARIABLE} to {POLICY_DIRECTORY} in the isolated runner")
	}));
	assert_eq!(
		directory.as_path(),
		Path::new(POLICY_DIRECTORY),
		"{RUNNER_DIRECTORY_VARIABLE} must be {POLICY_DIRECTORY}"
	);
	let metadata = fs::symlink_metadata(&directory)
		.unwrap_or_else(|error| panic!("inspect isolated runner directory {directory:?}: {error}"));
	assert!(
		metadata.file_type().is_dir() && !metadata.file_type().is_symlink(),
		"isolated runner directory must be a real directory: {directory:?}"
	);
	let marker = directory.join(RUNNER_MARKER);
	let marker_metadata = fs::symlink_metadata(&marker)
		.unwrap_or_else(|error| panic!("inspect isolated runner marker {marker:?}: {error}"));
	assert!(
		marker_metadata.file_type().is_file() && !marker_metadata.file_type().is_symlink(),
		"isolated runner marker must be a regular file: {marker:?}"
	);
	assert_eq!(
		fs::read(&marker).expect("read isolated runner marker"),
		RUNNER_MARKER_CONTENT,
		"isolated runner marker contents"
	);
	directory
}

fn refuse_existing_policy_path() {
	match fs::symlink_metadata(POLICY_PATH) {
		Ok(_) => panic!("refusing to overwrite existing policy entry: {POLICY_PATH}"),
		Err(error) if error.kind() == io::ErrorKind::NotFound => {}
		Err(error) => panic!("inspect policy entry {POLICY_PATH}: {error}"),
	}
}

fn refuse_uncontrolled_root_fallback() {
	match fs::symlink_metadata(ROOT_FALLBACK_CLI_PATH) {
		Ok(_) => {
			panic!("refusing to inspect or run existing fallback CLI: {ROOT_FALLBACK_CLI_PATH}")
		}
		Err(error) if error.kind() == io::ErrorKind::NotFound => {}
		Err(error) => panic!("inspect fallback CLI {ROOT_FALLBACK_CLI_PATH}: {error}"),
	}
}

fn run_shim(path: &Path, arguments: &[&str], home: &Path) -> std::process::Output {
	Command::new(env!("CARGO_BIN_EXE_copilot"))
		.args(arguments)
		.env("PATH", path)
		.env("HOME", home)
		.env_remove("PREFIX")
		.output()
		.expect("run native shim")
}

#[test]
#[ignore = "requires VSCODE_COPILOT_SHIM_NATIVE_POLICY_TEST=1 in an isolated Linux runner"]
fn native_binary_dispatches_provisioned_policy() {
	let runner_directory = provisioned_runner_directory();
	refuse_existing_policy_path();
	refuse_uncontrolled_root_fallback();

	let mut fixture = NativePolicyFixture::new(&runner_directory);
	fixture.set();

	let blocked = run_shim(Path::new(""), &[], &fixture.fixture_directory);
	assert_eq!(
		(
			blocked.status.code(),
			blocked.stdout,
			String::from_utf8(blocked.stderr).expect("UTF-8 policy diagnostic"),
		),
		(
			Some(10),
			Vec::<u8>::new(),
			String::from(
				"GitHub Copilot CLI was not found. Installing it from VS Code is turned off by the CopilotCliCommand policy; contact your administrator.\n"
			),
		)
	);

	let launched = run_shim(
		&fixture.fixture_directory,
		&["--native-policy-dispatch"],
		&fixture.fixture_directory,
	);
	assert_eq!(
		(
			launched.status.code(),
			String::from_utf8(launched.stdout).expect("UTF-8 fake CLI output"),
			launched.stderr,
		),
		(
			Some(73),
			String::from("native-policy-fake-cli:--native-policy-dispatch\n"),
			Vec::<u8>::new(),
		)
	);

	let entries = fs::read_dir(&fixture.fixture_directory)
		.expect("read native policy fixture directory")
		.map(|entry| entry.expect("read native policy fixture entry").file_name())
		.collect::<Vec<_>>();
	assert_eq!(entries, vec![std::ffi::OsString::from("copilot")]);

	fixture.cleanup().expect("clean native policy fixture");
}
