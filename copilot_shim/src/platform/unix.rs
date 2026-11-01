/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(test)]
use std::ffi::{OsStr, OsString};
use std::io;
#[cfg(test)]
use std::os::unix::ffi::OsStringExt;
use std::os::unix::process::{CommandExt, ExitStatusExt};
use std::process::ExitStatus;

#[cfg(test)]
use crate::model::CommandBuildError;
use crate::model::{CommandSpec, ProcessError, ProcessTermination};

use super::{native_command, spawn_error};

#[cfg(test)]
pub(super) fn os_string_to_wide(value: &OsStr) -> Result<Vec<u16>, CommandBuildError> {
	value
		.to_str()
		.map(|value| value.encode_utf16().collect())
		.ok_or(CommandBuildError::UnsupportedWindowsCommandValue)
}

#[cfg(test)]
pub(super) fn os_string_from_wide(value: &[u16]) -> Result<OsString, CommandBuildError> {
	String::from_utf16(value)
		.map(|value| OsString::from_vec(value.into_bytes()))
		.map_err(|_| CommandBuildError::UnsupportedWindowsCommandValue)
}

/// Replaces the shim with `command`, so signals, the exit status, and the process's lifetime are the Copilot CLI's.
/// Returns only if the command couldn't be started.
pub(crate) fn exec(command: &CommandSpec) -> ProcessError {
	let error = native_command(command).exec();
	spawn_error(command, &error)
}

pub(crate) fn install_cancellation_handler() -> io::Result<()> {
	let previous = unsafe {
		libc::signal(
			libc::SIGINT,
			handle_interrupt as *const () as libc::sighandler_t,
		)
	};
	if previous == libc::SIG_ERR {
		Err(io::Error::last_os_error())
	} else {
		Ok(())
	}
}

extern "C" fn handle_interrupt(_signal: i32) {
	super::request_process_cancellation();
}

pub(super) fn termination(status: ExitStatus) -> ProcessTermination {
	match status.code() {
		Some(code) => ProcessTermination::NumericExit(code),
		None => ProcessTermination::UnixSignal(status.signal().unwrap_or(0)),
	}
}
