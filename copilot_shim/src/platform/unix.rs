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
use std::process::{Child, ChildStderr, ChildStdout, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(test)]
use crate::model::CommandBuildError;
use crate::model::{CommandSpec, ProcessError, ProcessTermination};

use super::{native_command, spawn_error};

const GRACEFUL_TERMINATION_PERIOD: Duration = Duration::from_millis(100);
const GROUP_VERIFICATION_PERIOD: Duration = Duration::from_secs(1);

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

pub(crate) struct CapturedChild {
	child: Child,
	process_group: i32,
	stdout: Option<ChildStdout>,
	stderr: Option<ChildStderr>,
	reaped: bool,
}

impl CapturedChild {
	pub(crate) fn take_stdout(&mut self) -> io::Result<ChildStdout> {
		self.stdout
			.take()
			.ok_or_else(|| io::Error::other("captured stdout is unavailable"))
	}

	pub(crate) fn take_stderr(&mut self) -> io::Result<ChildStderr> {
		self.stderr
			.take()
			.ok_or_else(|| io::Error::other("captured stderr is unavailable"))
	}

	pub(crate) fn try_wait(&mut self) -> io::Result<Option<ProcessTermination>> {
		self.child.try_wait().map(|status| {
			if status.is_some() {
				self.reaped = true;
			}
			status.map(termination)
		})
	}

	pub(crate) fn terminate_and_reap(&mut self) -> io::Result<()> {
		signal_group(self.process_group, libc::SIGTERM)?;
		let graceful_deadline = Instant::now() + GRACEFUL_TERMINATION_PERIOD;
		while Instant::now() < graceful_deadline {
			let _ = self.child.try_wait()?;
			if !group_exists(self.process_group)? {
				break;
			}
			thread::sleep(Duration::from_millis(5));
		}
		if group_exists(self.process_group)? {
			signal_group(self.process_group, libc::SIGKILL)?;
		}
		let _ = self.child.wait()?;
		self.reaped = true;

		let verification_deadline = Instant::now() + GROUP_VERIFICATION_PERIOD;
		while group_exists(self.process_group)? {
			if Instant::now() >= verification_deadline {
				return Err(io::Error::new(
					io::ErrorKind::TimedOut,
					"probe process group still exists after forced termination",
				));
			}
			thread::sleep(Duration::from_millis(5));
		}
		Ok(())
	}
}

impl Drop for CapturedChild {
	fn drop(&mut self) {
		if !self.reaped {
			let _ = self.terminate_and_reap();
		}
	}
}

pub(crate) struct InteractiveChild {
	child: Child,
}

impl InteractiveChild {
	pub(crate) fn try_wait(&mut self) -> io::Result<Option<ProcessTermination>> {
		self.child.try_wait().map(|status| status.map(termination))
	}

	pub(crate) fn wait(&mut self) -> io::Result<ProcessTermination> {
		self.child.wait().map(termination)
	}

	pub(crate) fn terminate(&mut self) -> io::Result<()> {
		self.child.kill()
	}
}

pub(crate) fn spawn_captured(command: &CommandSpec) -> Result<CapturedChild, ProcessError> {
	let mut process = native_command(command)?;
	process
		.stdin(Stdio::null())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.process_group(0);
	let mut child = process
		.spawn()
		.map_err(|error| spawn_error(command, &error))?;
	let process_group = child.id() as i32;
	let Some(stdout) = child.stdout.take() else {
		let error = io::Error::other("piped stdout was not created");
		let _ = child.kill();
		let _ = child.wait();
		return Err(spawn_error(command, &error));
	};
	let Some(stderr) = child.stderr.take() else {
		let error = io::Error::other("piped stderr was not created");
		let _ = child.kill();
		let _ = child.wait();
		return Err(spawn_error(command, &error));
	};
	Ok(CapturedChild {
		child,
		process_group,
		stdout: Some(stdout),
		stderr: Some(stderr),
		reaped: false,
	})
}

pub(crate) fn spawn_interactive(command: &CommandSpec) -> Result<InteractiveChild, ProcessError> {
	let mut process = native_command(command)?;
	process
		.stdin(Stdio::inherit())
		.stdout(Stdio::inherit())
		.stderr(Stdio::inherit());
	process
		.spawn()
		.map(|child| InteractiveChild { child })
		.map_err(|error| spawn_error(command, &error))
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

fn signal_group(process_group: i32, signal: i32) -> io::Result<()> {
	let result = unsafe { libc::killpg(process_group, signal) };
	if result == 0 {
		return Ok(());
	}
	let error = io::Error::last_os_error();
	if error.raw_os_error() == Some(libc::ESRCH) {
		Ok(())
	} else {
		Err(error)
	}
}

fn group_exists(process_group: i32) -> io::Result<bool> {
	let result = unsafe { libc::killpg(process_group, 0) };
	if result == 0 {
		return Ok(true);
	}
	let error = io::Error::last_os_error();
	match error.raw_os_error() {
		Some(libc::ESRCH) => Ok(false),
		Some(libc::EPERM) => Ok(true),
		_ => Err(error),
	}
}

fn termination(status: std::process::ExitStatus) -> ProcessTermination {
	match status.code() {
		Some(code) => ProcessTermination::NumericExit(code),
		None => match status.signal() {
			Some(signal) => ProcessTermination::UnixSignal(signal),
			None => ProcessTermination::UnixSignal(0),
		},
	}
}
