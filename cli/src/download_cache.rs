/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	fs::{create_dir, create_dir_all, OpenOptions},
	path::{Path, PathBuf},
};

use futures::Future;
use uuid::Uuid;

use crate::{
	state::PersistedState,
	util::{
		errors::{wrap, AnyError, WrappedError},
		file_lock::{FileLock, Lock},
	},
};

const KEEP_LRU: usize = 5;
const STAGING_SUFFIX: &str = ".staging";
const LOCKS_DIRECTORY: &str = ".locks";
const LOCK_WAIT_INITIAL_DELAY: std::time::Duration = std::time::Duration::from_millis(200);
const LOCK_WAIT_MAX_DELAY: std::time::Duration = std::time::Duration::from_secs(2);
const LOCK_WAIT_HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(5);
const RENAME_ATTEMPTS: u32 = 20;
const RENAME_DELAY: std::time::Duration = std::time::Duration::from_millis(200);
const PERSISTED_STATE_FILE_NAME: &str = "lru.json";

#[derive(Clone)]
pub struct DownloadCache {
	path: PathBuf,
	state: PersistedState<Vec<String>>,
}

struct StagingDirectory(PathBuf);

impl Drop for StagingDirectory {
	fn drop(&mut self) {
		// Drop cannot await, so use blocking cleanup to also remove staging directories
		// when the creating future is cancelled.
		let _ = std::fs::remove_dir_all(&self.0);
	}
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

		create_dir_all(&self.path).map_err(|e| wrap(e, "error creating server directory"))?;

		let lock_path = self.path.join(LOCKS_DIRECTORY).join(name);
		if let Some(lock_parent) = lock_path.parent() {
			create_dir_all(lock_parent)
				.map_err(|e| wrap(e, "error creating server download lock"))?;
		}

		let mut lock_wait_started = None;
		let mut lock_wait_delay = LOCK_WAIT_INITIAL_DELAY;
		let mut next_lock_wait_heartbeat = LOCK_WAIT_HEARTBEAT_INTERVAL;
		let _lock = loop {
			let lock_file = OpenOptions::new()
				.read(true)
				.write(true)
				.create(true)
				// The file is a lock holder, not a data file: its contents are
				// never read or written, so it must not be truncated out from
				// under another process already holding the lock.
				.truncate(false)
				.open(&lock_path)
				.map_err(|e| wrap(e, "error creating server download lock"))?;

			match FileLock::acquire(lock_file)
				.map_err(|e| wrap(e, "error acquiring server download lock"))?
			{
				Lock::Acquired(lock) => break lock,
				Lock::AlreadyLocked(_) if target_dir.exists() => {
					let _ = self.touch(name.to_string());
					return Ok(target_dir);
				}
				Lock::AlreadyLocked(_) => {
					let first_wait = lock_wait_started.is_none();
					let wait_started =
						lock_wait_started.get_or_insert_with(std::time::Instant::now);
					let elapsed = wait_started.elapsed();
					if first_wait {
						log::info!(
							"Another instance is already downloading the server; waiting for it to finish"
						);
					} else if elapsed >= next_lock_wait_heartbeat {
						log::info!(
							"Another instance is still downloading the server; waited {} seconds",
							elapsed.as_secs()
						);
						next_lock_wait_heartbeat = elapsed + LOCK_WAIT_HEARTBEAT_INTERVAL;
					}

					tokio::time::sleep(lock_wait_delay).await;
					lock_wait_delay =
						std::cmp::min(lock_wait_delay.saturating_mul(2), LOCK_WAIT_MAX_DELAY);
				}
			}
		};

		if target_dir.exists() {
			let _ = self.touch(name.to_string());
			return Ok(target_dir);
		}

		// Holding the lock for `name` means no other process is staging this
		// entry, so any `{name}.staging-*` left behind belongs to an attempt
		// that died before its cleanup guard ran. Nothing else reaps these, and
		// each one is a partial server download, so drop them here rather than
		// leaking disk on every crash. The `{name}{STAGING_SUFFIX}-` prefix
		// cannot match another entry's staging directory.
		self.remove_orphaned_staging_directories(name);

		let temp_dir = self
			.path
			.join(format!("{name}{STAGING_SUFFIX}-{}", Uuid::new_v4()));
		create_dir(&temp_dir).map_err(|e| wrap(e, "error creating server directory"))?;
		let temp_dir = StagingDirectory(temp_dir);
		do_create(temp_dir.0.clone()).await?;

		let _ = self.touch(name.to_string());
		// retry the rename, it seems on WoA sometimes it takes a second for the
		// directory to be 'unlocked' after doing file/process operations in it.
		for attempt_no in 0..=RENAME_ATTEMPTS {
			match std::fs::rename(&temp_dir.0, &target_dir) {
				Ok(_) => {
					break;
				}
				Err(_) if target_dir.exists() => {
					return Ok(target_dir);
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

	/// Removes staging directories left by earlier attempts at `name`. Only safe
	/// while holding that entry's download lock — see the call site.
	fn remove_orphaned_staging_directories(&self, name: &str) {
		let prefix = format!("{name}{STAGING_SUFFIX}-");
		let Ok(entries) = std::fs::read_dir(&self.path) else {
			return;
		};
		for entry in entries.flatten() {
			if entry.file_name().to_string_lossy().starts_with(&prefix) {
				let _ = std::fs::remove_dir_all(entry.path());
			}
		}
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
	use std::sync::{
		atomic::{AtomicUsize, Ordering},
		Arc,
	};

	use super::*;

	fn staging_directories(cache: &DownloadCache, name: &str) -> Vec<PathBuf> {
		std::fs::read_dir(cache.path())
			.unwrap()
			.filter_map(Result::ok)
			.map(|entry| entry.path())
			.filter(|path| {
				path.file_name()
					.unwrap()
					.to_string_lossy()
					.starts_with(&format!("{name}{STAGING_SUFFIX}"))
			})
			.collect()
	}

	#[tokio::test]
	async fn test_concurrent_create_runs_creator_once() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().join("cache"));
		let create_count = Arc::new(AtomicUsize::new(0));

		let first_count = create_count.clone();
		let first = cache.create("server", move |path| {
			first_count.fetch_add(1, Ordering::SeqCst);
			async move {
				std::fs::write(path.join("created"), "").unwrap();
				tokio::time::sleep(std::time::Duration::from_millis(100)).await;
				Ok(())
			}
		});
		let second_count = create_count.clone();
		let second = cache.create("server", move |_| {
			second_count.fetch_add(1, Ordering::SeqCst);
			async { Ok(()) }
		});

		let (first, second) = tokio::join!(first, second);
		assert_eq!(first.unwrap(), second.unwrap());
		assert_eq!(create_count.load(Ordering::SeqCst), 1);
	}

	#[tokio::test]
	async fn test_reaps_staging_directories_left_by_a_dead_attempt() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().join("cache"));
		std::fs::create_dir_all(cache.path()).unwrap();
		// A staging directory whose process died before its cleanup guard ran,
		// plus a sibling entry's staging directory that must survive.
		let orphan = cache.path().join(format!("server{STAGING_SUFFIX}-dead"));
		let other = cache.path().join(format!("server-2{STAGING_SUFFIX}-live"));
		std::fs::create_dir_all(&orphan).unwrap();
		std::fs::create_dir_all(&other).unwrap();

		cache
			.create("server", |path| async move {
				std::fs::write(path.join("created"), "").unwrap();
				Ok(())
			})
			.await
			.unwrap();

		assert_eq!(
			(
				orphan.exists(),
				other.exists(),
				staging_directories(&cache, "server").len()
			),
			(false, true, 0)
		);
	}

	#[tokio::test]
	async fn test_failed_create_removes_staging_directory() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().join("cache"));

		let result = cache
			.create("server", |_| async {
				Err::<(), AnyError>(
					wrap(std::io::Error::other("expected failure"), "test failure").into(),
				)
			})
			.await;

		assert!(result.is_err());
		assert!(staging_directories(&cache, "server").is_empty());
	}

	#[tokio::test]
	async fn test_lost_rename_race_returns_existing_target() {
		let dir = tempfile::tempdir().unwrap();
		let cache = DownloadCache::new(dir.path().join("cache"));
		let target_dir = cache.path().join("server");

		let result = cache
			.create("server", move |path| {
				let target_dir = target_dir.clone();
				async move {
					std::fs::write(path.join("created"), "").unwrap();
					std::fs::create_dir(&target_dir).unwrap();
					std::fs::write(target_dir.join("winner"), "").unwrap();
					Ok(())
				}
			})
			.await;

		assert_eq!(result.unwrap(), cache.path().join("server"));
		assert!(staging_directories(&cache, "server").is_empty());
	}
}
