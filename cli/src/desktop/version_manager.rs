/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	ffi::OsString,
	fmt, io,
	path::{Path, PathBuf},
};

use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::{
	constants::{PRODUCT_DOWNLOAD_URL, QUALITY, QUALITYLESS_PRODUCT_NAME},
	log,
	state::{LauncherPaths, PersistedState},
	update_service::Platform,
	util::{
		command::new_std_command,
		errors::{AnyError, InvalidRequestedVersion},
	},
};

/// Parsed instance that a user can request.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "t", content = "c")]
pub enum RequestedVersion {
	Default,
	Commit(String),
	Path(String),
}

lazy_static! {
	static ref COMMIT_RE: Regex = Regex::new(r"(?i)^[0-9a-f]{40}$").unwrap();
}

impl RequestedVersion {
	pub fn get_command(&self) -> String {
		match self {
			RequestedVersion::Default => {
				format!("code version use {QUALITY}")
			}
			RequestedVersion::Commit(commit) => {
				format!("code version use {QUALITY}/{commit}")
			}
			RequestedVersion::Path(path) => {
				format!("code version use {path}")
			}
		}
	}
}

impl std::fmt::Display for RequestedVersion {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			RequestedVersion::Default => {
				write!(f, "{QUALITY}")
			}
			RequestedVersion::Commit(commit) => {
				write!(f, "{QUALITY}/{commit}")
			}
			RequestedVersion::Path(path) => write!(f, "{path}"),
		}
	}
}

impl TryFrom<&str> for RequestedVersion {
	type Error = InvalidRequestedVersion;

	fn try_from(s: &str) -> Result<Self, Self::Error> {
		if s == QUALITY {
			return Ok(RequestedVersion::Default);
		}

		if Path::is_absolute(&PathBuf::from(s)) {
			return Ok(RequestedVersion::Path(s.to_string()));
		}

		if COMMIT_RE.is_match(s) {
			return Ok(RequestedVersion::Commit(s.to_string()));
		}

		Err(InvalidRequestedVersion())
	}
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Stored {
	/// Map of requested versions to locations where those versions are installed.
	versions: Vec<(RequestedVersion, OsString)>,
	current: usize,
}

pub struct CodeVersionManager {
	state: PersistedState<Stored>,
	log: log::Logger,
}

impl CodeVersionManager {
	pub fn new(log: log::Logger, lp: &LauncherPaths, _platform: Platform) -> Self {
		CodeVersionManager {
			log,
			state: PersistedState::new(lp.root().join("versions.json")),
		}
	}

	/// Tries to find the binary entrypoint for VS Code installed in the path.
	pub async fn get_entrypoint_for_install_dir(path: &Path) -> Option<PathBuf> {
		use tokio::sync::mpsc;

		// Check whether the user is supplying a path to the CLI directly (e.g. #164622)
		if let Ok(true) = path.metadata().map(|m| m.is_file()) {
			let result = new_std_command(path)
				.args(["--version"])
				.output()
				.map(|o| o.status.success());

			if let Ok(true) = result {
				return Some(path.to_owned());
			}
		}

		let (tx, mut rx) = mpsc::channel(1);

		// Look for all the possible paths in parallel
		for entry in DESKTOP_CLI_RELATIVE_PATH.split(',') {
			let my_path = path.join(entry);
			let my_tx = tx.clone();
			tokio::spawn(async move {
				if tokio::fs::metadata(&my_path).await.is_ok() {
					my_tx.send(my_path).await.ok();
				}
			});
		}

		drop(tx); // drop so rx gets None if no sender emits

		rx.recv().await
	}

	/// Sets the "version" as the persisted one for the user.
	pub async fn set_preferred_version(
		&self,
		version: RequestedVersion,
		path: PathBuf,
	) -> Result<(), AnyError> {
		let mut stored = self.state.load();
		stored.current = self.store_version_path(&mut stored, version, path);
		self.state.save(stored)?;
		Ok(())
	}

	/// Stores or updates the path used for the given version. Returns the index
	/// that the path exists at.
	fn store_version_path(
		&self,
		state: &mut Stored,
		version: RequestedVersion,
		path: PathBuf,
	) -> usize {
		if let Some(i) = state.versions.iter().position(|(v, _)| v == &version) {
			state.versions[i].1 = path.into_os_string();
			i
		} else {
			state
				.versions
				.push((version.clone(), path.into_os_string()));
			state.versions.len() - 1
		}
	}

	/// Gets the currently preferred version based on set_preferred_version.
	pub fn get_preferred_version(&self) -> RequestedVersion {
		let stored = self.state.load();
		stored
			.versions
			.get(stored.current)
			.map(|(v, _)| v.clone())
			.unwrap_or(RequestedVersion::Default)
	}

	/// Tries to get the entrypoint for the version, if one can be found.
	pub async fn try_get_entrypoint(&self, version: &RequestedVersion) -> Option<PathBuf> {
		let mut state = self.state.load();
		if let Some((_, install_path)) = state.versions.iter().find(|(v, _)| v == version) {
			let p = PathBuf::from(install_path);
			if p.exists() {
				return Some(p);
			}
		}

		// For simple quality requests, see if that's installed already on the system
		let candidates = match &version {
			RequestedVersion::Default => match detect_installed_program(&self.log) {
				Ok(p) => p,
				Err(e) => {
					warning!(self.log, "error looking up installed applications: {}", e);
					return None;
				}
			},
			_ => return None,
		};

		let found = match candidates.into_iter().next() {
			Some(p) => p,
			None => return None,
		};

		// stash the found path for faster lookup
		self.store_version_path(&mut state, version.clone(), found.clone());
		if let Err(e) = self.state.save(state) {
			debug!(self.log, "error caching version path: {}", e);
		}

		Some(found)
	}
}

/// Shows a nice UI prompt to users asking them if they want to install the
/// requested version.
pub fn prompt_to_install(version: &RequestedVersion) {
	println!("No installation of {QUALITYLESS_PRODUCT_NAME} {version} was found.");

	if let RequestedVersion::Default = version {
		if let Some(uri) = PRODUCT_DOWNLOAD_URL {
			// todo: on some platforms, we may be able to help automate installation. For example,
			// we can unzip the app ourselves on macOS and on windows we can download and spawn the GUI installer
			#[cfg(target_os = "linux")]
			println!("Install it from your system's package manager or {uri}, restart your shell, and try again.");
			#[cfg(target_os = "macos")]
			println!("Download and unzip it from {} and try again.", uri);
			#[cfg(target_os = "windows")]
			println!("Install it from {} and try again.", uri);
		}
	}

	println!();
	println!("If you already installed {} and we didn't detect it, run `{} --install-dir /path/to/installation`", QUALITYLESS_PRODUCT_NAME, version.get_command());
}

#[cfg(target_os = "macos")]
fn detect_installed_program(log: &log::Logger) -> io::Result<Vec<PathBuf>> {
	use crate::constants::PRODUCT_NAME_LONG;

	// easy, fast detection for where apps are usually installed
	let mut probable = PathBuf::from("/Applications");
	probable.push(format!("{}.app", PRODUCT_NAME_LONG));
	if probable.exists() {
		probable.extend(["Contents/Resources", "app", "bin", "code"]);
		return Ok(vec![probable]);
	}

	// _Much_ slower detection using the system_profiler (~10s for me). While the
	// profiler can output nicely structure plist xml, pulling in an xml parser
	// just for this is overkill. The default output looks something like...
	//
	//     Visual Studio Code - Exploration 2:
	//
	//        Version: 1.73.0-exploration
	//        Obtained from: Identified Developer
	//        Last Modified: 9/23/22, 10:16 AM
	//        Kind: Intel
	//        Signed by: Developer ID Application: Microsoft Corporation (UBF8T346G9), Developer ID Certification Authority, Apple Root CA
	//        Location: /Users/connor/Downloads/Visual Studio Code - Exploration 2.app
	//
	// So, use a simple state machine that looks for the first line, and then for
	// the `Location:` line for the path.
	info!(log, "Searching for installations on your machine, this is done once and will take about 10 seconds...");

	let stdout = new_std_command("system_profiler")
		.args(["SPApplicationsDataType", "-detailLevel", "mini"])
		.output()?
		.stdout;

	enum State {
		LookingForName,
		LookingForLocation,
	}

	let mut state = State::LookingForName;
	let mut output: Vec<PathBuf> = vec![];
	const LOCATION_PREFIX: &str = "Location:";
	for mut line in String::from_utf8_lossy(&stdout).lines() {
		line = line.trim();
		match state {
			State::LookingForName => {
				if line.starts_with(PRODUCT_NAME_LONG) && line.ends_with(':') {
					state = State::LookingForLocation;
				}
			}
			State::LookingForLocation => {
				if let Some(suffix) = line.strip_prefix(LOCATION_PREFIX) {
					output.push(
						[suffix.trim(), "Contents/Resources", "app", "bin", "code"]
							.iter()
							.collect(),
					);
					state = State::LookingForName;
				}
			}
		}
	}

	// Sort shorter paths to the front, preferring "more global" installs, and
	// incidentally preferring local installs over Parallels 'installs'.
	output.sort_by_key(|a| a.as_os_str().len());

	Ok(output)
}

#[cfg(windows)]
fn detect_installed_program(_log: &log::Logger) -> io::Result<Vec<PathBuf>> {
	use crate::constants::{APPLICATION_NAME, WIN32_APP_IDS};
	use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
	use winreg::RegKey;

	let mut output: Vec<PathBuf> = vec![];
	let app_ids = match WIN32_APP_IDS.as_ref() {
		Some(ids) => ids,
		None => return Ok(output),
	};

	let scopes = [
		(
			HKEY_LOCAL_MACHINE,
			"SOFTWARE\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
		),
		(
			HKEY_LOCAL_MACHINE,
			"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
		),
		(
			HKEY_CURRENT_USER,
			"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
		),
	];

	for (scope, key) in scopes {
		let cur_ver = match RegKey::predef(scope).open_subkey(key) {
			Ok(k) => k,
			Err(_) => continue,
		};

		for key in cur_ver.enum_keys().flatten() {
			if app_ids.iter().any(|id| key.contains(id)) {
				let sk = cur_ver.open_subkey(&key)?;
				if let Ok(location) = sk.get_value::<String, _>("InstallLocation") {
					output.push(
						[
							location.as_str(),
							"bin",
							&format!("{}.cmd", APPLICATION_NAME),
						]
						.iter()
						.collect(),
					)
				}
			}
		}
	}

	Ok(output)
}

// Looks for the given binary name in the PATH, returning all candidate matches.
// Based on https://github.dev/microsoft/vscode-js-debug/blob/7594d05518df6700df51771895fcad0ddc7f92f9/src/common/pathUtils.ts#L15
#[cfg(target_os = "linux")]
fn detect_installed_program(log: &log::Logger) -> io::Result<Vec<PathBuf>> {
	use crate::constants::APPLICATION_NAME;

	let path = match std::env::var("PATH") {
		Ok(p) => p,
		Err(e) => {
			info!(log, "PATH is empty ({}), skipping detection", e);
			return Ok(vec![]);
		}
	};

	let current_exe = std::env::current_exe().expect("expected to read current exe");
	let mut output = vec![];
	for dir in path.split(':') {
		let target: PathBuf = [dir, APPLICATION_NAME].iter().collect();
		match std::fs::canonicalize(&target) {
			Ok(m) if m == current_exe => continue,
			Ok(_) => {}
			Err(_) => continue,
		};

		// note: intentionally store the non-canonicalized version, since if it's a
		// symlink, (1) it's probably desired to use it and (2) resolving the link
		// breaks snap installations.
		output.push(target);
	}

	Ok(output)
}

const DESKTOP_CLI_RELATIVE_PATH: &str = if cfg!(target_os = "macos") {
	"Contents/Resources/app/bin/code"
} else if cfg!(target_os = "windows") {
	"bin/code.cmd,bin/code-insiders.cmd,bin/code-exploration.cmd"
} else {
	"bin/code,bin/code-insiders,bin/code-exploration"
};

#[cfg(test)]
mod tests {
	use std::{
		fs::{create_dir_all, File},
		io::Write,
	};

	use super::*;

	fn make_fake_vscode_install(path: &Path) {
		let bin = DESKTOP_CLI_RELATIVE_PATH
			.split(',')
			.next()
			.expect("expected exe path");

		let binary_file_path = path.join(bin);
		let parent_dir_path = binary_file_path.parent().expect("expected parent path");

		create_dir_all(parent_dir_path).expect("expected to create parent dir");

		let mut binary_file = File::create(binary_file_path).expect("expected to make file");
		binary_file
			.write_all(b"")
			.expect("expected to write binary");
	}

	fn make_multiple_vscode_install() -> tempfile::TempDir {
		let dir = tempfile::tempdir().expect("expected to make temp dir");
		make_fake_vscode_install(&dir.path().join("desktop/stable"));
		make_fake_vscode_install(&dir.path().join("desktop/1.68.2"));
		dir
	}

	#[test]
	fn test_detect_installed_program() {
		// developers can run this test and debug output manually; VS Code will not
		// be installed in CI, so the test only makes sure it doesn't error out
		let result = detect_installed_program(&log::Logger::test());
		println!("result: {result:?}");
		assert!(result.is_ok());
	}

	#[tokio::test]
	async fn test_set_preferred_version() {
		let dir = make_multiple_vscode_install();
		let lp = LauncherPaths::new_without_replacements(dir.path().to_owned());
		let vm1 = CodeVersionManager::new(log::Logger::test(), &lp, Platform::LinuxARM64);

		assert_eq!(vm1.get_preferred_version(), RequestedVersion::Default);
		vm1.set_preferred_version(
			RequestedVersion::Commit("foobar".to_string()),
			dir.path().join("desktop/stable"),
		)
		.await
		.expect("expected to store");
		vm1.set_preferred_version(
			RequestedVersion::Commit("foobar2".to_string()),
			dir.path().join("desktop/stable"),
		)
		.await
		.expect("expected to store");

		assert_eq!(
			vm1.get_preferred_version(),
			RequestedVersion::Commit("foobar2".to_string()),
		);

		let vm2 = CodeVersionManager::new(log::Logger::test(), &lp, Platform::LinuxARM64);
		assert_eq!(
			vm2.get_preferred_version(),
			RequestedVersion::Commit("foobar2".to_string()),
		);
	}

	#[tokio::test]
	async fn test_gets_entrypoint() {
		let dir = make_multiple_vscode_install();

		assert!(CodeVersionManager::get_entrypoint_for_install_dir(
			&dir.path().join("desktop").join("stable")
		)
		.await
		.is_some());

		assert!(
			CodeVersionManager::get_entrypoint_for_install_dir(&dir.path().join("invalid"))
				.await
				.is_none()
		);
	}

	#[tokio::test]
	async fn test_gets_entrypoint_as_binary() {
		let dir = tempfile::tempdir().expect("expected to make temp dir");

		#[cfg(windows)]
		let binary_file_path = {
			let path = dir.path().join("code.cmd");
			File::create(&path).expect("expected to create file");
			path
		};

		#[cfg(unix)]
		let binary_file_path = {
			use std::fs;
			use std::os::unix::fs::PermissionsExt;

			let path = dir.path().join("code");
			{
				let mut f = File::create(&path).expect("expected to create file");
				f.write_all(b"#!/bin/sh")
					.expect("expected to write to file");
			}
			fs::set_permissions(&path, fs::Permissions::from_mode(0o777))
				.expect("expected to set permissions");
			path
		};

		assert_eq!(
			CodeVersionManager::get_entrypoint_for_install_dir(&binary_file_path).await,
			Some(binary_file_path)
		);
	}
}
