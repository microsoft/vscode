/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::util::errors::CodeError;
use std::{fs::File, io};

pub struct FileLock {
	file: File,
	#[cfg(windows)]
	overlapped: winapi::um::minwinbase::OVERLAPPED,
}

#[cfg(windows)] // overlapped is thread-safe, mark it so with this
unsafe impl Send for FileLock {}

pub enum Lock {
	Acquired(FileLock),
	AlreadyLocked(File),
}

/// Number of locked bytes in the file. On Windows, locking prevents reads,
/// but consumers of the lock may still want to read what the locking file
/// as written. Thus, only PREFIX_LOCKED_BYTES are locked, and any globally-
/// readable content should be written after the prefix.
#[cfg(windows)]
pub const PREFIX_LOCKED_BYTES: usize = 1;

#[cfg(unix)]
pub const PREFIX_LOCKED_BYTES: usize = 0;

impl FileLock {
	#[cfg(windows)]
	pub fn acquire(file: File) -> Result<Lock, CodeError> {
		use std::os::windows::prelude::AsRawHandle;
		use winapi::{
			shared::winerror::{ERROR_IO_PENDING, ERROR_LOCK_VIOLATION},
			um::{
				fileapi::LockFileEx,
				minwinbase::{LOCKFILE_EXCLUSIVE_LOCK, LOCKFILE_FAIL_IMMEDIATELY},
			},
		};

		let handle = file.as_raw_handle();
		let (overlapped, ok) = unsafe {
			let mut overlapped = std::mem::zeroed();
			let ok = LockFileEx(
				handle,
				LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY,
				0,
				PREFIX_LOCKED_BYTES as u32,
				0,
				&mut overlapped,
			);

			(overlapped, ok)
		};

		if ok != 0 {
			return Ok(Lock::Acquired(Self { file, overlapped }));
		}

		let err = io::Error::last_os_error();
		let raw = err.raw_os_error();
		// docs report it should return ERROR_IO_PENDING, but in my testing it actually
		// returns ERROR_LOCK_VIOLATION. Or maybe winapi is wrong?
		if raw == Some(ERROR_IO_PENDING as i32) || raw == Some(ERROR_LOCK_VIOLATION as i32) {
			return Ok(Lock::AlreadyLocked(file));
		}

		Err(CodeError::SingletonLockfileOpenFailed(err))
	}

	#[cfg(unix)]
	pub fn acquire(file: File) -> Result<Lock, CodeError> {
		use std::os::unix::io::AsRawFd;

		let fd = file.as_raw_fd();
		let res = unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) };
		if res == 0 {
			return Ok(Lock::Acquired(Self { file }));
		}

		let err = io::Error::last_os_error();
		if err.kind() == io::ErrorKind::WouldBlock {
			return Ok(Lock::AlreadyLocked(file));
		}

		Err(CodeError::SingletonLockfileOpenFailed(err))
	}

	pub fn file(&self) -> &File {
		&self.file
	}

	pub fn file_mut(&mut self) -> &mut File {
		&mut self.file
	}
}

impl Drop for FileLock {
	#[cfg(windows)]
	fn drop(&mut self) {
		use std::os::windows::prelude::AsRawHandle;
		use winapi::um::fileapi::UnlockFileEx;

		unsafe {
			UnlockFileEx(
				self.file.as_raw_handle(),
				0,
				u32::MAX,
				u32::MAX,
				&mut self.overlapped,
			)
		};
	}

	#[cfg(unix)]
	fn drop(&mut self) {
		use std::os::unix::io::AsRawFd;

		unsafe { libc::flock(self.file.as_raw_fd(), libc::LOCK_UN) };
	}
}
