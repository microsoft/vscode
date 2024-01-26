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
	util::{
		errors::CodeError,
		file_lock::{FileLock, Lock, PREFIX_LOCKED_BYTES},
		machine::wait_until_process_exits,
	},
};

pub struct SingletonServer {
	server: AsyncPipeListener,
	_lock: FileLock,
}

impl SingletonServer {
	pub async fn accept(&mut self) -> Result<AsyncPipe, CodeError> {
		self.server.accept().await
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

/// Tries to acquire the singleton homed at the given lock file, either starting
/// a new singleton if it doesn't exist, or connecting otherwise.
pub async fn acquire_singleton(lock_file: &Path) -> Result<SingletonConnection, CodeError> {
	let file = OpenOptions::new()
		.read(true)
		.write(true)
		.create(true)
		.open(lock_file)
		.map_err(CodeError::SingletonLockfileOpenFailed)?;

	match FileLock::acquire(file) {
		Ok(Lock::AlreadyLocked(mut file)) => connect_as_client_with_file(&mut file)
			.await
			.map(SingletonConnection::Client),
		Ok(Lock::Acquired(lock)) => start_singleton_server(lock)
			.await
			.map(SingletonConnection::Singleton),
		Err(e) => Err(e),
	}
}

/// Tries to connect to the singleton homed at the given file as a client.
pub async fn connect_as_client(lock_file: &Path) -> Result<AsyncPipe, CodeError> {
	let mut file = OpenOptions::new()
		.read(true)
		.open(lock_file)
		.map_err(CodeError::SingletonLockfileOpenFailed)?;

	connect_as_client_with_file(&mut file).await
}

async fn start_singleton_server(mut lock: FileLock) -> Result<SingletonServer, CodeError> {
	let socket_path = get_socket_name();

	let mut vec = Vec::with_capacity(128);
	let _ = vec.write(&[0; PREFIX_LOCKED_BYTES]);
	let _ = rmp_serde::encode::write(
		&mut vec,
		&LockFileMatter {
			socket_path: socket_path.to_string_lossy().to_string(),
			pid: std::process::id(),
		},
	);

	lock.file_mut()
		.write_all(&vec)
		.map_err(CodeError::SingletonLockfileOpenFailed)?;

	let server = listen_socket_rw_stream(&socket_path).await?;
	Ok(SingletonServer {
		server,
		_lock: lock,
	})
}

const MAX_CLIENT_ATTEMPTS: i32 = 10;

async fn connect_as_client_with_file(mut file: &mut File) -> Result<AsyncPipe, CodeError> {
	// retry, since someone else could get a lock and we could read it before
	// the JSON info was finished writing out
	let mut attempt = 0;
	loop {
		let _ = file.seek(SeekFrom::Start(PREFIX_LOCKED_BYTES as u64));
		let r = match rmp_serde::from_read::<_, LockFileMatter>(&mut file) {
			Ok(prev) => {
				let socket_path = PathBuf::from(prev.socket_path);

				tokio::select! {
					p = retry_get_socket_rw_stream(&socket_path, 5, Duration::from_millis(500)) => p,
					_ = wait_until_process_exits(Pid::from_u32(prev.pid), 500) => return Err(CodeError::SingletonLockedProcessExited(prev.pid)),
				}
			}
			Err(e) => Err(CodeError::SingletonLockfileReadFailed(e)),
		};

		if r.is_ok() || attempt == MAX_CLIENT_ATTEMPTS {
			return r;
		}

		attempt += 1;
		tokio::time::sleep(Duration::from_millis(500)).await;
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
		let s = acquire_singleton(&dir.path().join("lock"))
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
		let s1 = acquire_singleton(&lockfile)
			.await
			.expect("expected to acquire1");
		match s1 {
			SingletonConnection::Singleton(mut l) => tokio::spawn(async move {
				l.accept().await.expect("expected to accept");
			}),
			_ => panic!("expected to be singleton"),
		};

		let s2 = acquire_singleton(&lockfile)
			.await
			.expect("expected to acquire2");
		match s2 {
			SingletonConnection::Client(_) => {}
			_ => panic!("expected to be client"),
		}
	}
}
