/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(windows)]
use std::{io, ptr};

#[cfg(windows)]
use winapi::{
	shared::winerror::ERROR_ALREADY_EXISTS,
	um::{handleapi::CloseHandle, synchapi::CreateMutexA, winnt::HANDLE},
};

use super::errors::CodeError;

pub struct AppMutex {
	#[cfg(windows)]
	handle: HANDLE,
}

#[cfg(windows)] // handle is thread-safe, mark it so with this
unsafe impl Send for AppMutex {}

impl AppMutex {
	#[cfg(unix)]
	pub fn new(_name: &str) -> Result<Self, CodeError> {
		Ok(Self {})
	}

	#[cfg(windows)]
	pub fn new(name: &str) -> Result<Self, CodeError> {
		use std::ffi::CString;

		let cname = CString::new(name).unwrap();
		let handle = unsafe { CreateMutexA(ptr::null_mut(), 0, cname.as_ptr() as _) };

		if !handle.is_null() {
			return Ok(Self { handle });
		}

		let err = io::Error::last_os_error();
		let raw = err.raw_os_error();
		// docs report it should return ERROR_IO_PENDING, but in my testing it actually
		// returns ERROR_LOCK_VIOLATION. Or maybe winapi is wrong?
		if raw == Some(ERROR_ALREADY_EXISTS as i32) {
			return Err(CodeError::AppAlreadyLocked(name.to_string()));
		}

		Err(CodeError::AppLockFailed(err))
	}
}

impl Drop for AppMutex {
	fn drop(&mut self) {
		#[cfg(windows)]
		unsafe {
			CloseHandle(self.handle)
		};
	}
}
