/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{fs::create_dir_all, path::PathBuf};

use futures::Future;
use tokio::fs::remove_dir_all;

use crate::{
	state::PersistedState,
	util::errors::{wrap, AnyError},
};

const KEEP_LRU: usize = 5;
const STAGING_SUFFIX: &str = ".staging";

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
		do_create(target_dir.clone()).await?;

		let _ = self.touch(name.to_string());
		std::fs::rename(&temp_dir, &target_dir)
			.map_err(|e| wrap(e, "error renaming downloaded server"))?;

		Ok(target_dir)
	}

	fn touch(&self, name: String) -> Result<(), AnyError> {
		let rm = self.state.update_with(name, |name, l| {
			if let Some(index) = l.iter().position(|s| s == &name) {
				l.remove(index);
			}
			l.insert(0, name);

			if l.len() > KEEP_LRU {
				l.pop()
			} else {
				None
			}
		})?;

		if let Some(rm) = rm {
			let _ = std::fs::remove_dir_all(rm);
		}

		Ok(())
	}
}
