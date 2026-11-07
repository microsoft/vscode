/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::{OsStr, OsString};
use std::fs::File;
use std::io;
use std::mem::size_of;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::io::FromRawHandle;
use std::process::ExitStatus;
use std::ptr::{null, null_mut};
use std::thread;
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
	CloseHandle, SetHandleInformation, GENERIC_READ, HANDLE, HANDLE_FLAG_INHERIT,
	INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Security::SECURITY_ATTRIBUTES;
use windows_sys::Win32::Storage::FileSystem::{CreateFileW, OPEN_EXISTING};
use windows_sys::Win32::System::Console::SetConsoleCtrlHandler;
use windows_sys::Win32::System::JobObjects::{
	AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicAccountingInformation,
	JobObjectExtendedLimitInformation, QueryInformationJobObject, SetInformationJobObject,
	TerminateJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION,
	JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
	CreateProcessW, GetExitCodeProcess, ResumeThread, TerminateProcess, WaitForSingleObject,
	CREATE_SUSPENDED, PROCESS_INFORMATION, STARTF_USESTDHANDLES, STARTUPINFOW,
};

use crate::model::{
	CommandArguments, CommandBuildError, CommandSpec, ProcessError, ProcessOperation,
	ProcessTermination,
};

use super::spawn_error;

const JOB_VERIFICATION_PERIOD: Duration = Duration::from_secs(1);
const JOB_VERIFICATION_POLL_INTERVAL: Duration = Duration::from_millis(5);

pub(super) fn os_string_to_wide(value: &OsStr) -> Result<Vec<u16>, CommandBuildError> {
	Ok(value.encode_wide().collect())
}

pub(super) fn os_string_from_wide(value: &[u16]) -> Result<OsString, CommandBuildError> {
	Ok(OsString::from_wide(value))
}

struct OwnedHandle(HANDLE);

impl OwnedHandle {
	fn new(handle: HANDLE) -> io::Result<Self> {
		if handle.is_null() || handle == INVALID_HANDLE_VALUE {
			Err(io::Error::last_os_error())
		} else {
			Ok(Self(handle))
		}
	}

	fn raw(&self) -> HANDLE {
		self.0
	}

	fn into_raw(mut self) -> HANDLE {
		let handle = self.0;
		self.0 = null_mut();
		handle
	}
}

impl Drop for OwnedHandle {
	fn drop(&mut self) {
		if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
			unsafe {
				CloseHandle(self.0);
			}
		}
	}
}

pub(crate) struct CapturedChild {
	process: OwnedHandle,
	job: OwnedHandle,
	stdout: Option<File>,
	stderr: Option<File>,
	reaped: bool,
}

impl CapturedChild {
	pub(crate) fn take_stdout(&mut self) -> io::Result<File> {
		self.stdout
			.take()
			.ok_or_else(|| io::Error::other("captured stdout is unavailable"))
	}

	pub(crate) fn take_stderr(&mut self) -> io::Result<File> {
		self.stderr
			.take()
			.ok_or_else(|| io::Error::other("captured stderr is unavailable"))
	}

	pub(crate) fn try_wait(&mut self) -> io::Result<Option<ProcessTermination>> {
		match unsafe { WaitForSingleObject(self.process.raw(), 0) } {
			WAIT_OBJECT_0 => {
				self.reaped = true;
				exit_code(self.process.raw()).map(Some)
			}
			WAIT_TIMEOUT => Ok(None),
			_ => Err(io::Error::last_os_error()),
		}
	}

	pub(crate) fn terminate_and_reap(&mut self) -> io::Result<()> {
		if unsafe { TerminateJobObject(self.job.raw(), 1) } == 0 {
			return Err(io::Error::last_os_error());
		}
		if unsafe { WaitForSingleObject(self.process.raw(), u32::MAX) } != WAIT_OBJECT_0 {
			return Err(io::Error::last_os_error());
		}
		self.reaped = true;

		wait_for_job_to_empty(self.job.raw())
	}
}

fn wait_for_job_to_empty(job: HANDLE) -> io::Result<()> {
	wait_for_job_to_empty_until(
		|| active_job_processes(job),
		Instant::now() + JOB_VERIFICATION_PERIOD,
		Instant::now,
		thread::sleep,
	)
}

fn wait_for_job_to_empty_until(
	mut active_processes: impl FnMut() -> io::Result<u32>,
	deadline: Instant,
	mut now: impl FnMut() -> Instant,
	mut sleep: impl FnMut(Duration),
) -> io::Result<()> {
	loop {
		if active_processes()? == 0 {
			return Ok(());
		}

		let current = now();
		if current >= deadline {
			return Err(io::Error::new(
				io::ErrorKind::TimedOut,
				"probe Job Object still has active processes after forced termination",
			));
		}
		sleep(JOB_VERIFICATION_POLL_INTERVAL.min(deadline.duration_since(current)));
	}
}

fn active_job_processes(job: HANDLE) -> io::Result<u32> {
	let mut accounting = JOBOBJECT_BASIC_ACCOUNTING_INFORMATION::default();
	if unsafe {
		QueryInformationJobObject(
			job,
			JobObjectBasicAccountingInformation,
			&mut accounting as *mut _ as *mut _,
			size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32,
			null_mut(),
		)
	} == 0
	{
		return Err(io::Error::last_os_error());
	}
	Ok(accounting.ActiveProcesses)
}

impl Drop for CapturedChild {
	fn drop(&mut self) {
		if !self.reaped {
			unsafe {
				TerminateJobObject(self.job.raw(), 1);
				WaitForSingleObject(self.process.raw(), u32::MAX);
			}
		}
	}
}

pub(crate) fn spawn_captured(command: &CommandSpec) -> Result<CapturedChild, ProcessError> {
	spawn_captured_inner(command).map_err(|failure| match failure {
		ProbeSpawnFailure::Start(error) => spawn_error(command, &error),
		ProbeSpawnFailure::Supervision(operation, error) => {
			ProcessError::supervision(operation, command.program(), &error)
		}
	})
}

enum ProbeSpawnFailure {
	Start(io::Error),
	Supervision(ProcessOperation, io::Error),
}

fn spawn_captured_inner(command: &CommandSpec) -> Result<CapturedChild, ProbeSpawnFailure> {
	let (stdout_read, stdout_write) = create_pipe().map_err(ProbeSpawnFailure::Start)?;
	let (stderr_read, stderr_write) = create_pipe().map_err(ProbeSpawnFailure::Start)?;
	let null_input = open_null_input().map_err(ProbeSpawnFailure::Start)?;
	let job = create_kill_on_close_job().map_err(ProbeSpawnFailure::Start)?;
	let startup = STARTUPINFOW {
		cb: size_of::<STARTUPINFOW>() as u32,
		dwFlags: STARTF_USESTDHANDLES,
		hStdInput: null_input.raw(),
		hStdOutput: stdout_write.raw(),
		hStdError: stderr_write.raw(),
		..Default::default()
	};
	let mut process_information = PROCESS_INFORMATION::default();
	let mut application_name: Vec<u16> = command
		.program()
		.encode_wide()
		.chain(std::iter::once(0))
		.collect();
	let mut command_line = create_process_command_line(command);

	let created = unsafe {
		CreateProcessW(
			application_name.as_mut_ptr(),
			command_line.as_mut_ptr(),
			null(),
			null(),
			1,
			CREATE_SUSPENDED,
			null(),
			null(),
			&startup,
			&mut process_information,
		)
	};
	if created == 0 {
		return Err(ProbeSpawnFailure::Start(io::Error::last_os_error()));
	}
	let process =
		OwnedHandle::new(process_information.hProcess).map_err(ProbeSpawnFailure::Start)?;
	let thread = OwnedHandle::new(process_information.hThread).map_err(ProbeSpawnFailure::Start)?;
	drop(stdout_write);
	drop(stderr_write);

	if unsafe { AssignProcessToJobObject(job.raw(), process.raw()) } == 0 {
		let error = io::Error::last_os_error();
		unsafe {
			TerminateProcess(process.raw(), 1);
			WaitForSingleObject(process.raw(), u32::MAX);
		}
		return Err(ProbeSpawnFailure::Supervision(
			ProcessOperation::Contain,
			error,
		));
	}
	if unsafe { ResumeThread(thread.raw()) } == u32::MAX {
		let error = io::Error::last_os_error();
		unsafe {
			TerminateJobObject(job.raw(), 1);
			WaitForSingleObject(process.raw(), u32::MAX);
		}
		return Err(ProbeSpawnFailure::Supervision(
			ProcessOperation::Resume,
			error,
		));
	}
	drop(thread);

	let stdout = unsafe { File::from_raw_handle(stdout_read.into_raw()) };
	let stderr = unsafe { File::from_raw_handle(stderr_read.into_raw()) };
	Ok(CapturedChild {
		process,
		job,
		stdout: Some(stdout),
		stderr: Some(stderr),
		reaped: false,
	})
}

pub(crate) fn install_cancellation_handler() -> io::Result<()> {
	if unsafe { SetConsoleCtrlHandler(Some(handle_console_control), 1) } == 0 {
		Err(io::Error::last_os_error())
	} else {
		Ok(())
	}
}

unsafe extern "system" fn handle_console_control(control_type: u32) -> i32 {
	if control_type == 0 {
		super::request_process_cancellation();
		1
	} else {
		0
	}
}

fn create_pipe() -> io::Result<(OwnedHandle, OwnedHandle)> {
	let attributes = SECURITY_ATTRIBUTES {
		nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
		lpSecurityDescriptor: null_mut(),
		bInheritHandle: 1,
	};
	let mut read = null_mut();
	let mut write = null_mut();
	if unsafe { CreatePipe(&mut read, &mut write, &attributes, 0) } == 0 {
		return Err(io::Error::last_os_error());
	}
	let read = OwnedHandle::new(read)?;
	let write = OwnedHandle::new(write)?;
	if unsafe { SetHandleInformation(read.raw(), HANDLE_FLAG_INHERIT, 0) } == 0 {
		return Err(io::Error::last_os_error());
	}
	Ok((read, write))
}

fn open_null_input() -> io::Result<OwnedHandle> {
	let name: Vec<u16> = OsStr::new("NUL")
		.encode_wide()
		.chain(std::iter::once(0))
		.collect();
	let attributes = SECURITY_ATTRIBUTES {
		nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
		lpSecurityDescriptor: null_mut(),
		bInheritHandle: 1,
	};
	OwnedHandle::new(unsafe {
		CreateFileW(
			name.as_ptr(),
			GENERIC_READ,
			0,
			&attributes,
			OPEN_EXISTING,
			0,
			null_mut(),
		)
	})
}

fn create_kill_on_close_job() -> io::Result<OwnedHandle> {
	let job = OwnedHandle::new(unsafe { CreateJobObjectW(null(), null()) })?;
	let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
	limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
	if unsafe {
		SetInformationJobObject(
			job.raw(),
			JobObjectExtendedLimitInformation,
			&limits as *const _ as *const _,
			size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
		)
	} == 0
	{
		return Err(io::Error::last_os_error());
	}
	Ok(job)
}

fn create_process_command_line(command: &CommandSpec) -> Vec<u16> {
	let mut line = quote_process_argument(command.program());
	match command.arguments() {
		CommandArguments::Native(arguments) => {
			for argument in arguments {
				line.push(u16::from(b' '));
				line.extend(quote_process_argument(argument));
			}
		}
		CommandArguments::WindowsCommand {
			switches,
			raw_command_tail,
		} => {
			// The switches are fixed tokens; cmd.exe ignores quoted switches such as "/S".
			for argument in switches {
				line.push(u16::from(b' '));
				line.extend(argument.encode_wide());
			}
			line.push(u16::from(b' '));
			line.extend(raw_command_tail.encode_wide());
		}
	}
	line.push(0);
	line
}

fn quote_process_argument(argument: &OsStr) -> Vec<u16> {
	let value: Vec<u16> = argument.encode_wide().collect();
	let mut quoted = vec![u16::from(b'"')];
	let mut backslashes = 0;
	for unit in value {
		if unit == u16::from(b'\\') {
			backslashes += 1;
		} else {
			if unit == u16::from(b'"') {
				quoted.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes * 2 + 1));
			} else {
				quoted.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes));
			}
			backslashes = 0;
			quoted.push(unit);
		}
	}
	quoted.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes * 2));
	quoted.push(u16::from(b'"'));
	quoted
}

pub(super) fn termination(status: ExitStatus) -> ProcessTermination {
	// Windows processes always exit with a numeric code.
	ProcessTermination::NumericExit(status.code().unwrap_or(1))
}

fn exit_code(process: HANDLE) -> io::Result<ProcessTermination> {
	let mut code = 0;
	if unsafe { GetExitCodeProcess(process, &mut code) } == 0 {
		Err(io::Error::last_os_error())
	} else {
		Ok(ProcessTermination::NumericExit(code as i32))
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::cell::Cell;
	use std::time::{Duration, Instant};

	#[test]
	fn job_empty_verification_polls_until_active_processes_exit() {
		let queries = Cell::new(0);

		wait_for_job_to_empty_until(
			|| {
				queries.set(queries.get() + 1);
				Ok(u32::from(queries.get() < 3))
			},
			Instant::now() + Duration::from_secs(1),
			Instant::now,
			|_| {},
		)
		.expect("Job Object should become empty");

		assert_eq!(queries.get(), 3);
	}

	#[test]
	fn job_empty_verification_timeout_is_typed() {
		let error = wait_for_job_to_empty_until(|| Ok(1), Instant::now(), Instant::now, |_| {})
			.expect_err("active Job Object should time out");

		assert_eq!(error.kind(), io::ErrorKind::TimedOut);
	}
}
