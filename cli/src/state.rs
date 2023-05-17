/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

extern crate dirs;

use std::{
	fs::{create_dir_all, read_to_string, remove_dir_all, write},
	path::{Path, PathBuf},
	sync::{Arc, Mutex},
};

use serde::{de::DeserializeOwned, Serialize};

use crate::{
	constants::{DEFAULT_DATA_PARENT_DIR, VSCODE_CLI_QUALITY},
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
		write(&self.path, s).map_err(|e| {
			wrap(
				e,
				format!("error saving launcher state into {}", self.path.display()),
			)
		})
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
		PersistedState {
			container: Arc::new(Mutex::new(PersistedStateContainer { path, state: None })),
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
			eprintln!(
				"Failed to migrate old CLI data directory, will create a new one ({})",
				e
			);
		}

		Self::new_for_path(new_dir)
	}

	pub fn new(root: Option<String>) -> Result<LauncherPaths, AnyError> {
		let root = root.unwrap_or_else(|| format!("~/{}/cli", DEFAULT_DATA_PARENT_DIR));
		let mut replaced = root.to_owned();
		for token in HOME_DIR_ALTS {
			if root.contains(token) {
				if let Some(home) = dirs::home_dir() {
					replaced = root.replace(token, &home.to_string_lossy())
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
}
