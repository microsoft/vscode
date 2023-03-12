/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use serde::{Deserialize, Serialize};
use std::{
	fs::{File, OpenOptions},
	io::{Seek, SeekFrom, Write},
	path::{Path, PathBuf},
	time::Duration,
};
use sysinfo::{Pid, PidExt};

use crate::{
	async_pipe::{
		get_socket_name, get_socket_rw_stream, listen_socket_rw_stream, AsyncPipe,
		AsyncPipeListener,
	},
	util::{errors::CodeError, machine::wait_until_process_exits},
};

pub struct SingletonServer {
	server: AsyncPipeListener,
	lock_file: PathBuf,
}

impl SingletonServer {
	pub async fn accept(&mut self) -> Result<AsyncPipe, CodeError> {
		self.server.accept().await
	}
}

impl Drop for SingletonServer {
	fn drop(&mut self) {
		let _ = std::fs::remove_file(&self.lock_file);
	}
}

pub enum SingletonConnection {
	/// This instance got the singleton lock. It started listening on a socket
	/// and has the read/write pair. If this gets dropped, the lock is released.
	Singleton(SingletonServer),
	/// Another instance is a singleton, and this client connected to it.
	Client(AsyncPipe),
}

/// Contents of the lock file; the listening socket ID and process ID
/// doing the listening.
#[derive(Deserialize, Serialize)]
struct LockFileMatter {
	socket_path: String,
	pid: u32,
}

pub async fn acquire_singleton(lock_file: PathBuf) -> Result<SingletonConnection, CodeError> {
	let mut file = OpenOptions::new()
		.read(true)
		.write(true)
		.create(true)
		.open(&lock_file)
		.map_err(CodeError::SingletonLockfileOpenFailed)?;

	if let Some(p) = try_getting_existing(&mut file).await {
		return Ok(SingletonConnection::Client(p));
	}

	let socket_path = get_socket_name();

	file.write_all(
		rmp_serde::to_vec(&LockFileMatter {
			socket_path: socket_path.to_string_lossy().to_string(),
			pid: std::process::id(),
		})
		.expect("expected to serialize")
		.as_slice(),
	)
	.map_err(CodeError::SingletonLockfileOpenFailed)?;

	let server = listen_socket_rw_stream(&socket_path).await?;
	Ok(SingletonConnection::Singleton(SingletonServer {
		server,
		lock_file,
	}))
}

async fn try_getting_existing(mut file: &mut File) -> Option<AsyncPipe> {
	let prev: Option<LockFileMatter> = rmp_serde::from_read(&mut file).ok();
	let prev = match prev {
		Some(prev) => prev,
		None => {
			file.seek(SeekFrom::Start(0)).ok();
			return None;
		}
	};

	let socket_path = PathBuf::from(prev.socket_path);

	tokio::select! {
		p = retry_get_socket_rw_stream(&socket_path, 5, Duration::from_millis(500)) => p.ok(),
		_ = wait_until_process_exits(Pid::from_u32(prev.pid), 500) => None,
	}
}

async fn retry_get_socket_rw_stream(
	path: &Path,
	max_tries: usize,
	interval: Duration,
) -> Result<AsyncPipe, CodeError> {
	for i in 0.. {
		match get_socket_rw_stream(path).await {
			Ok(s) => return Ok(s),
			Err(e) if i == max_tries => return Err(e),
			Err(_) => tokio::time::sleep(interval).await,
		}
	}

	unreachable!()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[tokio::test]
	async fn test_acquires_singleton() {
		let dir = tempfile::tempdir().expect("expected to make temp dir");
		let s = acquire_singleton(dir.path().join("lock"))
			.await
			.expect("expected to acquire");

		match s {
			SingletonConnection::Singleton(_) => {}
			_ => panic!("expected to be singleton"),
		}
	}

	#[tokio::test]
	async fn test_acquires_client() {
		let dir = tempfile::tempdir().expect("expected to make temp dir");
		let lockfile = dir.path().join("lock");
		let s1 = acquire_singleton(lockfile.clone())
			.await
			.expect("expected to acquire1");
		match s1 {
			SingletonConnection::Singleton(mut l) => tokio::spawn(async move {
				l.accept().await.expect("expected to accept");
			}),
			_ => panic!("expected to be singleton"),
		};

		let s2 = acquire_singleton(lockfile)
			.await
			.expect("expected to acquire2");
		match s2 {
			SingletonConnection::Client(_) => {}
			_ => panic!("expected to be client"),
		}
	}
}
