/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

extern crate dirs;

use std::{
	fs::{create_dir, read_to_string, remove_dir_all, write},
	path::{Path, PathBuf},
	sync::{Arc, Mutex},
};

use serde::{de::DeserializeOwned, Serialize};

use crate::util::errors::{wrap, AnyError, NoHomeForLauncherError, WrappedError};

const HOME_DIR_ALTS: [&str; 2] = ["$HOME", "~"];

#[derive(Clone)]
pub struct LauncherPaths {
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
	pub fn update_with<V, R>(
		&self,
		v: V,
		mutator: fn(v: V, state: &mut T) -> R,
	) -> Result<R, WrappedError> {
		let mut container = self.container.lock().unwrap();
		let mut state = container.load_or_get();
		let r = mutator(v, &mut state);
		container.save(state).map(|_| r)
	}
}

impl LauncherPaths {
	pub fn new(root: &Option<String>) -> Result<LauncherPaths, AnyError> {
		let root = root.as_deref().unwrap_or("~/.vscode-cli");
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

		if !Path::new(&replaced).exists() {
			create_dir(&replaced)
				.map_err(|e| wrap(e, format!("error creating directory {}", &replaced)))?;
		}

		Ok(LauncherPaths::new_without_replacements(PathBuf::from(
			replaced,
		)))
	}

	pub fn new_without_replacements(root: PathBuf) -> LauncherPaths {
		LauncherPaths { root }
	}

	/// Root directory for the server launcher
	pub fn root(&self) -> &Path {
		&self.root
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
