/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	fs::create_dir_all,
	path::{Path, PathBuf},
};

use futures::Future;
use tokio::fs::remove_dir_all;

use crate::{
	state::PersistedState,
	util::errors::{wrap, AnyError, WrappedError},
};

const KEEP_LRU: usize = 5;
const STAGING_SUFFIX: &str = ".staging";
const RENAME_ATTEMPTS: u32 = 20;
const RENAME_DELAY: std::time::Duration = std::time::Duration::from_millis(200);

#[derive(Clone)]
pub struct DownloadCache {
	path: PathBuf,
	state: PersistedState<Vec<String>>,
}

impl DownloadCache {
	pub fn new(path: PathBuf) -> DownloadCache {
		DownloadCache {
			state: PersistedState::new(path.join("lru.json")),
			path,
		}
	}

	/// Gets the download cache path. Names of cache entries can be formed by
	/// joining them to the path.
	pub fn path(&self) -> &Path {
		&self.path
	}

	/// Gets whether a cache exists with the name already. Marks it as recently
	/// used if it does exist.
	pub fn exists(&self, name: &str) -> Option<PathBuf> {
		let p = self.path.join(name);
		if !p.exists() {
			return None;
		}

		let _ = self.touch(name.to_string());
		Some(p)
	}

	/// Removes the item from the cache, if it exists
	pub fn delete(&self, name: &str) -> Result<(), WrappedError> {
		let f = self.path.join(name);
		if f.exists() {
			std::fs::remove_dir_all(f).map_err(|e| wrap(e, "error removing cached folder"))?;
		}

		self.state.update(|l| {
			l.retain(|n| n != name);
		})
	}

	/// Calls the function to create the cached folder if it doesn't exist,
	/// returning the path where the folder is. Note that the path passed to
	/// the `do_create` method is a staging path and will not be the same as the
	/// final returned path.
	pub async fn create<F, T>(
		&self,
		name: impl AsRef<str>,
		do_create: F,
	) -> Result<PathBuf, AnyError>
	where
		F: FnOnce(PathBuf) -> T,
		T: Future<Output = Result<(), AnyError>> + Send,
	{
		let name = name.as_ref();
		let target_dir = self.path.join(name);
		if target_dir.exists() {
			return Ok(target_dir);
		}

		let temp_dir = self.path.join(format!("{}{}", name, STAGING_SUFFIX));
		let _ = remove_dir_all(&temp_dir).await; // cleanup any existing

		create_dir_all(&temp_dir).map_err(|e| wrap(e, "error creating server directory"))?;
		do_create(temp_dir.clone()).await?;

		let _ = self.touch(name.to_string());
		// retry the rename, it seems on WoA sometimes it takes a second for the
		// directory to be 'unlocked' after doing file/process operations in it.
		for attempt_no in 0..=RENAME_ATTEMPTS {
			match std::fs::rename(&temp_dir, &target_dir) {
				Ok(_) => {
					break;
				}
				Err(e) if attempt_no == RENAME_ATTEMPTS => {
					return Err(wrap(e, "error renaming downloaded server").into())
				}
				Err(_) => {
					tokio::time::sleep(RENAME_DELAY).await;
				}
			}
		}

		Ok(target_dir)
	}

	fn touch(&self, name: String) -> Result<(), AnyError> {
		self.state.update(|l| {
			if let Some(index) = l.iter().position(|s| s == &name) {
				l.remove(index);
			}
			l.insert(0, name);

			if l.len() <= KEEP_LRU {
				return;
			}

			if let Some(f) = l.last() {
				let f = self.path.join(f);
				if !f.exists() || std::fs::remove_dir_all(f).is_ok() {
					l.pop();
				}
			}
		})?;

		Ok(())
	}
}
