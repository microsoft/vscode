/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	fmt,
	path::{Path, PathBuf},
};

use indicatif::ProgressBar;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize, Serialize};
use tokio::fs::remove_dir_all;

use crate::{
	options,
	state::{LauncherPaths, PersistedState},
	update_service::{unzip_downloaded_release, Platform, Release, TargetKind, UpdateService},
	util::{
		errors::{
			wrap, AnyError, InvalidRequestedVersion, MissingEntrypointError,
			NoInstallInUserProvidedPath, UserCancelledInstallation, WrappedError,
		},
		http,
		input::{prompt_yn, ProgressBarReporter},
	},
};

/// Parsed instance that a user can request.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(tag = "t", content = "c")]
pub enum RequestedVersion {
	Quality(options::Quality),
	Version {
		version: String,
		quality: options::Quality,
	},
	Commit {
		commit: String,
		quality: options::Quality,
	},
	Path(String),
}

lazy_static! {
	static ref SEMVER_RE: Regex = Regex::new(r"^\d+\.\d+\.\d+(-insider)?$").unwrap();
	static ref COMMIT_RE: Regex = Regex::new(r"^[a-z]+/[a-e0-f]{40}$").unwrap();
}

impl RequestedVersion {
	pub fn get_command(&self) -> String {
		match self {
			RequestedVersion::Quality(quality) => {
				format!("code version use {}", quality.get_machine_name())
			}
			RequestedVersion::Version { version, .. } => {
				format!("code version use {}", version)
			}
			RequestedVersion::Commit { commit, quality } => {
				format!("code version use {}/{}", quality.get_machine_name(), commit)
			}
			RequestedVersion::Path(path) => {
				format!("code version use {}", path)
			}
		}
	}
}

impl std::fmt::Display for RequestedVersion {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			RequestedVersion::Quality(quality) => write!(f, "{}", quality.get_capitalized_name()),
			RequestedVersion::Version { version, .. } => {
				write!(f, "{}", version)
			}
			RequestedVersion::Commit { commit, quality } => {
				write!(f, "{}/{}", quality, commit)
			}
			RequestedVersion::Path(path) => write!(f, "{}", path),
		}
	}
}

impl TryFrom<&str> for RequestedVersion {
	type Error = InvalidRequestedVersion;

	fn try_from(s: &str) -> Result<Self, Self::Error> {
		if let Ok(quality) = options::Quality::try_from(s) {
			return Ok(RequestedVersion::Quality(quality));
		}

		if SEMVER_RE.is_match(s) {
			return Ok(RequestedVersion::Version {
				quality: if s.ends_with("-insider") {
					options::Quality::Insiders
				} else {
					options::Quality::Stable
				},
				version: s.to_string(),
			});
		}

		if Path::is_absolute(&PathBuf::from(s)) {
			return Ok(RequestedVersion::Path(s.to_string()));
		}

		if COMMIT_RE.is_match(s) {
			let idx = s.find('/').expect("expected a /");
			if let Ok(quality) = options::Quality::try_from(&s[0..idx]) {
				return Ok(RequestedVersion::Commit {
					commit: s[idx + 1..].to_string(),
					quality,
				});
			}
		}

		Err(InvalidRequestedVersion())
	}
}

#[derive(Serialize, Deserialize, Clone, Default)]
struct Stored {
	versions: Vec<RequestedVersion>,
	current: usize,
}

pub struct CodeVersionManager {
	state: PersistedState<Stored>,
	platform: Platform,
	storage_dir: PathBuf,
}

impl CodeVersionManager {
	pub fn new(lp: &LauncherPaths, platform: Platform) -> Self {
		CodeVersionManager {
			state: PersistedState::new(lp.root().join("versions.json")),
			storage_dir: lp.root().join("desktop"),
			platform,
		}
	}

	/// Sets the "version" as the persisted one for the user.
	pub fn set_preferred_version(&self, version: &RequestedVersion) -> Result<(), AnyError> {
		let mut stored = self.state.load();
		if let Some(i) = stored.versions.iter().position(|v| v == version) {
			stored.current = i;
		} else {
			stored.current = stored.versions.len();
			stored.versions.push(version.clone());
		}

		self.state.save(stored)?;

		Ok(())
	}

	/// Lists installed versions.
	pub fn list(&self) -> Vec<RequestedVersion> {
		self.state.load().versions
	}

	/// Uninstalls a previously installed version.
	pub async fn uninstall(&self, version: &RequestedVersion) -> Result<(), AnyError> {
		let mut stored = self.state.load();
		if let Some(i) = stored.versions.iter().position(|v| v == version) {
			if i > stored.current && i > 0 {
				stored.current -= 1;
			}
			stored.versions.remove(i);
			self.state.save(stored)?;
		}

		remove_dir_all(self.get_install_dir(version))
			.await
			.map_err(|e| wrap(e, "error deleting vscode directory"))?;

		Ok(())
	}

	pub fn get_preferred_version(&self) -> RequestedVersion {
		let stored = self.state.load();
		stored
			.versions
			.get(stored.current)
			.unwrap_or(&RequestedVersion::Quality(options::Quality::Stable))
			.clone()
	}

	/// Installs the release for the given request. This always runs and does not
	/// prompt, so you may want to use `try_get_entrypoint` first.
	pub async fn install(
		&self,
		update_service: &UpdateService,
		version: &RequestedVersion,
	) -> Result<PathBuf, AnyError> {
		let target_dir = self.get_install_dir(version);
		let release = get_release_for_request(update_service, version, self.platform).await?;
		install_release_into(update_service, &target_dir, &release).await?;

		if let Some(p) = try_get_entrypoint(&target_dir).await {
			return Ok(p);
		}

		Err(MissingEntrypointError().into())
	}

	/// Tries to get the entrypoint in the installed version, if one exists.
	pub async fn try_get_entrypoint(&self, version: &RequestedVersion) -> Option<PathBuf> {
		try_get_entrypoint(&self.get_install_dir(version)).await
	}

	fn get_install_dir(&self, version: &RequestedVersion) -> PathBuf {
		let (name, quality) = match version {
			RequestedVersion::Path(path) => return PathBuf::from(path),
			RequestedVersion::Quality(quality) => (quality.get_machine_name(), quality),
			RequestedVersion::Version {
				quality,
				version: number,
			} => (number.as_str(), quality),
			RequestedVersion::Commit { commit, quality } => (commit.as_str(), quality),
		};

		let mut dir = self.storage_dir.join(name);
		if cfg!(target_os = "macos") {
			dir.push(format!("{}.app", quality.get_app_name()))
		}

		dir
	}
}

/// Shows a nice UI prompt to users asking them if they want to install the
/// requested version.
pub fn prompt_to_install(version: &RequestedVersion) -> Result<(), AnyError> {
	if let RequestedVersion::Path(path) = version {
		return Err(NoInstallInUserProvidedPath(path.clone()).into());
	}

	if !prompt_yn(&format!(
		"VS Code {} is not installed yet, install it now?",
		version
	))? {
		return Err(UserCancelledInstallation().into());
	}

	Ok(())
}

async fn get_release_for_request(
	update_service: &UpdateService,
	request: &RequestedVersion,
	platform: Platform,
) -> Result<Release, WrappedError> {
	match request {
		RequestedVersion::Version {
			quality,
			version: number,
		} => update_service
			.get_release_by_semver_version(platform, TargetKind::Archive, *quality, number)
			.await
			.map_err(|e| wrap(e, "Could not get release")),
		RequestedVersion::Commit { commit, quality } => Ok(Release {
			platform,
			commit: commit.clone(),
			quality: *quality,
			target: TargetKind::Archive,
		}),
		RequestedVersion::Quality(quality) => update_service
			.get_latest_commit(platform, TargetKind::Archive, *quality)
			.await
			.map_err(|e| wrap(e, "Could not get release")),
		_ => panic!("cannot get release info for a path"),
	}
}

async fn install_release_into(
	update_service: &UpdateService,
	path: &Path,
	release: &Release,
) -> Result<(), AnyError> {
	let tempdir =
		tempfile::tempdir().map_err(|e| wrap(e, "error creating temporary download dir"))?;
	let save_path = tempdir.path().join("vscode");

	let stream = update_service.get_download_stream(release).await?;
	let pb = ProgressBar::new(1);
	pb.set_message("Downloading...");
	let progress = ProgressBarReporter::from(pb);
	http::download_into_file(&save_path, progress, stream).await?;

	let pb = ProgressBar::new(1);
	pb.set_message("Unzipping...");
	let progress = ProgressBarReporter::from(pb);
	unzip_downloaded_release(&save_path, path, progress)?;

	drop(tempdir);

	Ok(())
}

/// Tries to find the binary entrypoint for VS Code installed in the path.
async fn try_get_entrypoint(path: &Path) -> Option<PathBuf> {
	use tokio::sync::mpsc;

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

	fn make_fake_vscode_install(path: &Path, quality: options::Quality) {
		let bin = DESKTOP_CLI_RELATIVE_PATH
			.split(',')
			.next()
			.expect("expected exe path");

		let binary_file_path = if cfg!(target_os = "macos") {
			path.join(format!("{}.app/{}", quality.get_app_name(), bin))
		} else {
			path.join(bin)
		};

		let parent_dir_path = binary_file_path.parent().expect("expected parent path");

		create_dir_all(parent_dir_path).expect("expected to create parent dir");

		let mut binary_file = File::create(binary_file_path).expect("expected to make file");
		binary_file
			.write_all(b"")
			.expect("expected to write binary");
	}

	fn make_multiple_vscode_install() -> tempfile::TempDir {
		let dir = tempfile::tempdir().expect("expected to make temp dir");
		make_fake_vscode_install(&dir.path().join("desktop/stable"), options::Quality::Stable);
		make_fake_vscode_install(&dir.path().join("desktop/1.68.2"), options::Quality::Stable);
		dir
	}

	#[test]
	fn test_requested_version_parses() {
		assert_eq!(
			RequestedVersion::try_from("1.2.3").unwrap(),
			RequestedVersion::Version {
				quality: options::Quality::Stable,
				version: "1.2.3".to_string(),
			}
		);

		assert_eq!(
			RequestedVersion::try_from("1.2.3-insider").unwrap(),
			RequestedVersion::Version {
				quality: options::Quality::Insiders,
				version: "1.2.3-insider".to_string(),
			}
		);

		assert_eq!(
			RequestedVersion::try_from("stable").unwrap(),
			RequestedVersion::Quality(options::Quality::Stable)
		);

		assert_eq!(
			RequestedVersion::try_from("insiders").unwrap(),
			RequestedVersion::Quality(options::Quality::Insiders)
		);

		assert_eq!(
			RequestedVersion::try_from("insiders/92fd228156aafeb326b23f6604028d342152313b")
				.unwrap(),
			RequestedVersion::Commit {
				commit: "92fd228156aafeb326b23f6604028d342152313b".to_string(),
				quality: options::Quality::Insiders
			}
		);

		assert_eq!(
			RequestedVersion::try_from("stable/92fd228156aafeb326b23f6604028d342152313b").unwrap(),
			RequestedVersion::Commit {
				commit: "92fd228156aafeb326b23f6604028d342152313b".to_string(),
				quality: options::Quality::Stable
			}
		);

		let exe = std::env::current_exe()
			.expect("expected to get exe")
			.to_string_lossy()
			.to_string();
		assert_eq!(
			RequestedVersion::try_from(exe.as_str()).unwrap(),
			RequestedVersion::Path(exe),
		);
	}

	#[test]
	fn test_set_preferred_version() {
		let dir = make_multiple_vscode_install();
		let lp = LauncherPaths::new_without_replacements(dir.path().to_owned());
		let vm1 = CodeVersionManager::new(&lp, Platform::LinuxARM64);

		assert_eq!(
			vm1.get_preferred_version(),
			RequestedVersion::Quality(options::Quality::Stable)
		);
		vm1.set_preferred_version(&RequestedVersion::Quality(options::Quality::Exploration))
			.expect("expected to store");
		vm1.set_preferred_version(&RequestedVersion::Quality(options::Quality::Insiders))
			.expect("expected to store");
		assert_eq!(
			vm1.get_preferred_version(),
			RequestedVersion::Quality(options::Quality::Insiders)
		);

		let vm2 = CodeVersionManager::new(&lp, Platform::LinuxARM64);
		assert_eq!(
			vm2.get_preferred_version(),
			RequestedVersion::Quality(options::Quality::Insiders)
		);

		assert_eq!(
			vm2.list(),
			vec![
				RequestedVersion::Quality(options::Quality::Exploration),
				RequestedVersion::Quality(options::Quality::Insiders)
			]
		);
	}

	#[tokio::test]
	async fn test_gets_entrypoint() {
		let dir = make_multiple_vscode_install();
		let lp = LauncherPaths::new_without_replacements(dir.path().to_owned());
		let vm = CodeVersionManager::new(&lp, Platform::LinuxARM64);

		assert!(vm
			.try_get_entrypoint(&RequestedVersion::Quality(options::Quality::Stable))
			.await
			.is_some());

		assert!(vm
			.try_get_entrypoint(&RequestedVersion::Quality(options::Quality::Exploration))
			.await
			.is_none());
	}

	#[tokio::test]
	async fn test_uninstall() {
		let dir = make_multiple_vscode_install();
		let lp = LauncherPaths::new_without_replacements(dir.path().to_owned());
		let vm = CodeVersionManager::new(&lp, Platform::LinuxARM64);

		vm.uninstall(&RequestedVersion::Quality(options::Quality::Stable))
			.await
			.expect("expected to uninsetall");

		assert!(vm
			.try_get_entrypoint(&RequestedVersion::Quality(options::Quality::Stable))
			.await
			.is_none());
	}
}
