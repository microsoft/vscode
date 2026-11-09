/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

extern crate dirs;

use std::{
	fs::{self, create_dir_all, read_to_string, remove_dir_all},
	io::Write,
	path::{Path, PathBuf},
	sync::{Arc, Mutex},
};

use serde::{de::DeserializeOwned, Serialize};

use crate::{
	constants::{DEFAULT_DATA_PARENT_DIR, SERVER_DATA_PARENT_DIR, VSCODE_CLI_QUALITY},
	download_cache::DownloadCache,
	util::errors::{wrap, AnyError, NoHomeForLauncherError, WrappedError},
};

const HOME_DIR_ALTS: [&str; 2] = ["$HOME", "~"];

#[derive(Clone)]
pub struct LauncherPaths {
	pub server_cache: DownloadCache,
	pub cli_cache: DownloadCache,
	root: PathBuf,
}

struct PersistedStateContainer<T>
where
	T: Clone + Serialize + DeserializeOwned + Default,
{
	path: PathBuf,
	state: Option<T>,
	#[allow(dead_code)]
	mode: u32,
}

impl<T> PersistedStateContainer<T>
where
	T: Clone + Serialize + DeserializeOwned + Default,
{
	fn load_or_get(&mut self) -> T {
		if let Some(state) = &self.state {
			return state.clone();
		}

		let state = if let Ok(s) = read_to_string(&self.path) {
			serde_json::from_str::<T>(&s).unwrap_or_default()
		} else {
			T::default()
		};

		self.state = Some(state.clone());
		state
	}

	fn save(&mut self, state: T) -> Result<(), WrappedError> {
		let s = serde_json::to_string(&state).unwrap();
		self.state = Some(state);
		self.write_state(s).map_err(|e| {
			wrap(
				e,
				format!("error saving launcher state into {}", self.path.display()),
			)
		})
	}

	fn write_state(&mut self, s: String) -> std::io::Result<()> {
		#[cfg(not(windows))]
		use std::os::unix::fs::OpenOptionsExt;

		let mut f = fs::OpenOptions::new();
		f.create(true);
		f.write(true);
		f.truncate(true);
		#[cfg(not(windows))]
		f.mode(self.mode);

		let mut f = f.open(&self.path)?;
		f.write_all(s.as_bytes())
	}
}

/// Container that holds some state value that is persisted to disk.
#[derive(Clone)]
pub struct PersistedState<T>
where
	T: Clone + Serialize + DeserializeOwned + Default,
{
	container: Arc<Mutex<PersistedStateContainer<T>>>,
}

impl<T> PersistedState<T>
where
	T: Clone + Serialize + DeserializeOwned + Default,
{
	/// Creates a new state container that persists to the given path.
	pub fn new(path: PathBuf) -> PersistedState<T> {
		Self::new_with_mode(path, 0o644)
	}

	/// Creates a new state container that persists to the given path.
	pub fn new_with_mode(path: PathBuf, mode: u32) -> PersistedState<T> {
		PersistedState {
			container: Arc::new(Mutex::new(PersistedStateContainer {
				path,
				state: None,
				mode,
			})),
		}
	}

	/// Loads persisted state.
	pub fn load(&self) -> T {
		self.container.lock().unwrap().load_or_get()
	}

	/// Saves persisted state.
	pub fn save(&self, state: T) -> Result<(), WrappedError> {
		self.container.lock().unwrap().save(state)
	}

	/// Mutates persisted state.
	pub fn update<R>(&self, mutator: impl FnOnce(&mut T) -> R) -> Result<R, WrappedError> {
		let mut container = self.container.lock().unwrap();
		let mut state = container.load_or_get();
		let r = mutator(&mut state);
		container.save(state).map(|_| r)
	}
}

impl LauncherPaths {
	/// todo@conno4312: temporary migration from the old CLI data directory
	pub fn migrate(root: Option<String>) -> Result<LauncherPaths, AnyError> {
		if root.is_some() {
			return Self::new(root);
		}

		if let Ok(portable) = std::env::var("VSCODE_PORTABLE") {
			if !portable.is_empty() {
				let mut new_dir = PathBuf::from(portable);
				new_dir.push(DEFAULT_DATA_PARENT_DIR);
				new_dir.push("cli");
				return Self::new_for_path(new_dir);
			}
		}

		let home_dir = match dirs::home_dir() {
			None => return Self::new(root),
			Some(d) => d,
		};

		let old_dir = home_dir.join(".vscode-cli");
		let mut new_dir = home_dir;
		new_dir.push(DEFAULT_DATA_PARENT_DIR);
		new_dir.push("cli");
		if !old_dir.exists() || new_dir.exists() {
			return Self::new_for_path(new_dir);
		}

		if let Err(e) = std::fs::rename(&old_dir, &new_dir) {
			// no logger exists at this point in the lifecycle, so just log to stderr
			eprintln!("Failed to migrate old CLI data directory, will create a new one ({e})");
		}

		Self::new_for_path(new_dir)
	}

	pub fn new(root: Option<String>) -> Result<LauncherPaths, AnyError> {
		if let Some(root) = root {
			return Self::new_for_root_string(root);
		}

		if let Ok(portable) = std::env::var("VSCODE_PORTABLE") {
			if !portable.is_empty() {
				let mut dir = PathBuf::from(portable);
				dir.push(DEFAULT_DATA_PARENT_DIR);
				dir.push("cli");
				return Self::new_for_path(dir);
			}
		}

		Self::new_for_root_string(format!("~/{DEFAULT_DATA_PARENT_DIR}/cli"))
	}

	fn new_for_root_string(root: String) -> Result<LauncherPaths, AnyError> {
		let mut replaced = root.to_owned();
		for token in HOME_DIR_ALTS {
			if root.contains(token) {
				if let Some(home) = dirs::home_dir() {
					replaced = root.replace(token, &home.to_string_lossy());
				} else {
					return Err(AnyError::from(NoHomeForLauncherError()));
				}
			}
		}

		Self::new_for_path(PathBuf::from(replaced))
	}

	fn new_for_path(root: PathBuf) -> Result<LauncherPaths, AnyError> {
		if !root.exists() {
			create_dir_all(&root)
				.map_err(|e| wrap(e, format!("error creating directory {}", root.display())))?;
		}

		Ok(LauncherPaths::new_without_replacements(root))
	}

	pub fn new_without_replacements(root: PathBuf) -> LauncherPaths {
		// cleanup folders that existed before the new LRU strategy:
		let _ = std::fs::remove_dir_all(root.join("server-insiders"));
		let _ = std::fs::remove_dir_all(root.join("server-stable"));

		LauncherPaths {
			server_cache: DownloadCache::new(root.join("servers")),
			cli_cache: DownloadCache::new(root.join("cli")),
			root,
		}
	}

	/// Root directory for the server launcher
	pub fn root(&self) -> &Path {
		&self.root
	}

	/// Lockfile for the running tunnel
	pub fn tunnel_lockfile(&self) -> PathBuf {
		self.root.join(format!(
			"tunnel-{}.lock",
			VSCODE_CLI_QUALITY.unwrap_or("oss")
		))
	}

	/// Lockfile for port forwarding
	pub fn forwarding_lockfile(&self) -> PathBuf {
		self.root.join(format!(
			"forwarding-{}.lock",
			VSCODE_CLI_QUALITY.unwrap_or("oss")
		))
	}

	/// Suggested path for tunnel service logs, when using file logs
	pub fn service_log_file(&self) -> PathBuf {
		self.root.join("tunnel-service.log")
	}

	/// Removes the launcher data directory.
	pub fn remove(&self) -> Result<(), WrappedError> {
		remove_dir_all(&self.root).map_err(|e| {
			wrap(
				e,
				format!(
					"error removing launcher data directory {}",
					self.root.display()
				),
			)
		})
	}

	/// Suggested path for the detached `code agent host` supervisor's log
	/// file. The supervisor severs its inherited stdio after signalling
	/// readiness, so a file log is the only way to debug post-handoff
	/// issues (download progress, AH child crashes, update loop errors).
	pub fn agent_host_log_file(&self) -> PathBuf {
		self.agent_host_root().join(format!(
			"agent-host-{}.log",
			VSCODE_CLI_QUALITY.unwrap_or("oss")
		))
	}

	/// Canonical machine-wide directory holding the detached `code agent
	/// host` supervisor's log file. Anchored on `serverDataFolderName`
	/// rather than `self.root` so different `--cli-data-dir` values still
	/// land on the same log file. Falls back to `self.root` when no home
	/// directory is available.
	pub fn agent_host_root(&self) -> PathBuf {
		if let Ok(portable) = std::env::var("VSCODE_PORTABLE") {
			if !portable.is_empty() {
				return PathBuf::from(portable)
					.join(SERVER_DATA_PARENT_DIR)
					.join("cli");
			}
		}
		match dirs::home_dir() {
			Some(home) => home.join(SERVER_DATA_PARENT_DIR).join("cli"),
			None => self.root.clone(),
		}
	}

	/// Suggested path for web server storage
	pub fn web_server_storage(&self) -> PathBuf {
		self.root.join("serve-web")
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_launcher_paths_explicit_root() {
		let temp = tempfile::tempdir().unwrap();
		let custom_root = temp.path().join("my-custom-cli");
		let paths = LauncherPaths::new(Some(custom_root.to_string_lossy().to_string())).unwrap();
		assert_eq!(paths.root(), custom_root.as_path());
	}

	#[test]
	fn test_launcher_paths_portable_mode() {
		let temp = tempfile::tempdir().unwrap();
		// Test with a path that contains a literal '~' (like Windows 8.3 short paths e.g. PORTAB~1)
		let portable_dir = temp.path().join("portab~1-data");
		std::fs::create_dir_all(&portable_dir).unwrap();

		std::env::set_var("VSCODE_PORTABLE", &portable_dir);

		let paths = LauncherPaths::new(None).unwrap();
		let expected = portable_dir.join(DEFAULT_DATA_PARENT_DIR).join("cli");
		assert_eq!(paths.root(), expected.as_path());

		let migrated_paths = LauncherPaths::migrate(None).unwrap();
		assert_eq!(migrated_paths.root(), expected.as_path());

		let expected_agent_host = portable_dir.join(SERVER_DATA_PARENT_DIR).join("cli");
		assert_eq!(paths.agent_host_root(), expected_agent_host);

		std::env::remove_var("VSCODE_PORTABLE");
	}
}
