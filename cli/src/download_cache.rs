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
/// Sentinel file written into a staging directory once `do_create` has
/// finished populating it. Its presence is the only signal that staged
/// content is complete and safe to reuse rather than a partial download
/// left behind by an interrupted run; see `create()`.
const STAGING_COMPLETE_MARKER: &str = ".complete";
const RENAME_ATTEMPTS: u32 = 20;
const RENAME_DELAY: std::time::Duration = std::time::Duration::from_millis(200);
const PERSISTED_STATE_FILE_NAME: &str = "lru.json";

#[derive(Clone)]
pub struct DownloadCache {
	path: PathBuf,
	state: PersistedState<Vec<String>>,
}

impl DownloadCache {
	pub fn new(path: PathBuf) -> DownloadCache {
		DownloadCache {
			state: PersistedState::new(path.join(PERSISTED_STATE_FILE_NAME)),
			path,
		}
	}

	/// Gets the value stored on the state
	pub fn get(&self) -> Vec<String> {
		self.state.load()
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
	///
	/// If a previous call was interrupted (e.g. the process was killed)
	/// after `do_create` finished but before the staging directory could be
	/// renamed into place, the next call reuses that already-downloaded
	/// staging directory instead of deleting it and downloading again. A
	/// staging directory without the completion marker is assumed to be
	/// partial (interrupted mid-download/extract) and is discarded as
	/// before.
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

		let temp_dir = self.path.join(format!("{name}{STAGING_SUFFIX}"));
		let marker = temp_dir.join(STAGING_COMPLETE_MARKER);

		if marker.exists() {
			debug_assert!(temp_dir.exists());
		} else {
			let _ = remove_dir_all(&temp_dir).await; // cleanup any incomplete attempt

			create_dir_all(&temp_dir).map_err(|e| wrap(e, "error creating server directory"))?;
			do_create(temp_dir.clone()).await?;

			// Record that staging finished successfully before attempting the
			// rename below, so an interruption between here and a successful
			// rename can be recovered on the next call without re-downloading.
			std::fs::write(&marker, b"")
				.map_err(|e| wrap(e, "error marking download as complete"))?;
		}

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

		// The marker is staging-only bookkeeping; strip it from the final
		// location so callers that enumerate the returned directory (e.g.
		// looking for the single extracted CLI binary) don't see it.
		let _ = std::fs::remove_file(target_dir.join(STAGING_COMPLETE_MARKER));

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

#[cfg(test)]
mod tests {
	use super::*;
	use std::sync::{
		atomic::{AtomicBool, Ordering},
		Arc,
	};

	/// An existing, fully-renamed target directory (the common case: the
	/// commit was already installed on a previous run) must be returned
	/// as-is, without ever invoking `do_create` -- i.e. without touching
	/// the network.
	#[tokio::test]
	async fn test_existing_valid_target_is_reused_without_download() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().to_path_buf());
		let name = "some-commit";
		std::fs::create_dir_all(dir.path().join(name)).unwrap();
		std::fs::write(dir.path().join(name).join("payload.bin"), b"already installed").unwrap();

		let called = Arc::new(AtomicBool::new(false));
		let called_inner = called.clone();
		let result = cache
			.create(name, move |_target_dir| {
				called_inner.store(true, Ordering::SeqCst);
				async move { Ok(()) }
			})
			.await
			.unwrap();

		assert!(
			!called.load(Ordering::SeqCst),
			"do_create must not run when the target directory already exists"
		);
		assert_eq!(result, dir.path().join(name));
		assert!(result.join("payload.bin").exists());
	}

	/// When nothing is cached at all, `do_create` must run and its output
	/// must end up at the final (non-staging) path.
	#[tokio::test]
	async fn test_missing_patch_triggers_download() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().to_path_buf());
		let name = "some-commit";

		let result = cache
			.create(name, |target_dir| async move {
				std::fs::write(target_dir.join("payload.bin"), b"downloaded").unwrap();
				Ok(())
			})
			.await
			.unwrap();

		assert_eq!(result, dir.path().join(name));
		assert!(result.join("payload.bin").exists());
		assert!(!dir.path().join(format!("{name}{STAGING_SUFFIX}")).exists());
	}

	/// A staging directory left over without the completion marker
	/// represents a download/extraction that was interrupted partway
	/// through (e.g. connection lost mid-transfer). It must be discarded
	/// and `do_create` must run again from scratch, so stale partial
	/// content can never leak into the final installed directory.
	#[tokio::test]
	async fn test_incomplete_staging_download_triggers_fresh_download() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().to_path_buf());
		let name = "some-commit";

		let staging = dir.path().join(format!("{name}{STAGING_SUFFIX}"));
		std::fs::create_dir_all(&staging).unwrap();
		std::fs::write(staging.join("partial.tmp"), b"half-downloaded").unwrap();

		let called = Arc::new(AtomicBool::new(false));
		let called_inner = called.clone();
		let result = cache
			.create(name, move |target_dir| {
				called_inner.store(true, Ordering::SeqCst);
				async move {
					std::fs::write(target_dir.join("payload.bin"), b"downloaded").unwrap();
					Ok(())
				}
			})
			.await
			.unwrap();

		assert!(
			called.load(Ordering::SeqCst),
			"do_create must run again for an incomplete staging directory"
		);
		assert!(result.join("payload.bin").exists());
		assert!(
			!result.join("partial.tmp").exists(),
			"stale partial content from the interrupted attempt must not survive"
		);
	}

	/// Regression test for https://github.com/microsoft/vscode/issues/331690:
	/// if the process is killed after a download+extract fully finished in
	/// the staging directory but before it could be renamed into place,
	/// restarting must reuse that already-downloaded content instead of
	/// re-downloading it from the update service.
	#[tokio::test]
	async fn test_interrupted_update_restart_reuses_completed_staging_without_redownload() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().to_path_buf());
		let name = "some-commit";

		// Simulate a prior run that finished populating the staging directory
		// (do_create succeeded and the completion marker was written) but was
		// killed before the final rename ran.
		let staging = dir.path().join(format!("{name}{STAGING_SUFFIX}"));
		std::fs::create_dir_all(&staging).unwrap();
		std::fs::write(staging.join("payload.bin"), b"downloaded").unwrap();
		std::fs::write(staging.join(STAGING_COMPLETE_MARKER), b"").unwrap();

		let called = Arc::new(AtomicBool::new(false));
		let called_inner = called.clone();
		let result = cache
			.create(name, move |_target_dir| {
				called_inner.store(true, Ordering::SeqCst);
				async move { Ok(()) }
			})
			.await
			.unwrap();

		assert!(
			!called.load(Ordering::SeqCst),
			"restarting after an interrupted update must not redownload an already-available patch"
		);
		assert_eq!(result, dir.path().join(name));
		assert!(result.join("payload.bin").exists());
		assert!(
			!result.join(STAGING_COMPLETE_MARKER).exists(),
			"the internal completion marker must not leak into the final installed directory"
		);
		assert!(!staging.exists(), "the staging directory must be renamed away, not left behind");
	}
}
