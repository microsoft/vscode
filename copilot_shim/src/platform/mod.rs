/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(any(windows, test))]
use std::ffi::{OsStr, OsString};
use std::io;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(any(windows, test))]
use crate::model::CommandBuildError;
use crate::model::{CommandArguments, CommandSpec, LaunchAdapter, ProcessError, SystemError};

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

#[cfg(all(unix, test))]
use self::unix::{os_string_from_wide, os_string_to_wide};
#[cfg(windows)]
use self::windows::{os_string_from_wide, os_string_to_wide};

static PROCESS_CANCELLATION: AtomicBool = AtomicBool::new(false);

#[cfg(unix)]
pub(crate) type CapturedChild = unix::CapturedChild;
#[cfg(windows)]
pub(crate) type CapturedChild = windows::CapturedChild;

#[cfg(unix)]
pub(crate) fn spawn_captured(command: &CommandSpec) -> Result<CapturedChild, ProcessError> {
	unix::spawn_captured(command)
}

#[cfg(windows)]
pub(crate) fn spawn_captured(command: &CommandSpec) -> Result<CapturedChild, ProcessError> {
	windows::spawn_captured(command)
}

#[cfg(unix)]
pub(crate) fn spawn_interactive(
	command: &CommandSpec,
) -> Result<unix::InteractiveChild, ProcessError> {
	unix::spawn_interactive(command)
}

#[cfg(windows)]
pub(crate) fn spawn_interactive(
	command: &CommandSpec,
) -> Result<windows::InteractiveChild, ProcessError> {
	windows::spawn_interactive(command)
}

#[cfg(unix)]
pub(crate) fn install_cancellation_handler() -> io::Result<()> {
	unix::install_cancellation_handler()
}

#[cfg(windows)]
pub(crate) fn install_cancellation_handler() -> io::Result<()> {
	windows::install_cancellation_handler()
}

pub(crate) fn request_process_cancellation() {
	PROCESS_CANCELLATION.store(true, Ordering::SeqCst);
}

pub(crate) fn is_process_cancellation_requested() -> bool {
	PROCESS_CANCELLATION.load(Ordering::SeqCst)
}

fn native_command(command: &CommandSpec) -> Result<Command, ProcessError> {
	let mut process = Command::new(command.program());
	match command.arguments() {
		CommandArguments::Native(arguments) => {
			process.args(arguments);
		}
		#[cfg(any(windows, test))]
		CommandArguments::WindowsCommand {
			switches,
			raw_command_tail,
		} => add_windows_command_arguments(&mut process, switches, raw_command_tail),
	}
	Ok(process)
}

#[cfg(all(unix, test))]
fn add_windows_command_arguments(
	_process: &mut Command,
	_switches: &[OsString],
	_raw_command_tail: &OsStr,
) {
	unreachable!("Windows command scripts are not executable on Unix")
}

#[cfg(windows)]
fn add_windows_command_arguments(
	process: &mut Command,
	switches: &[OsString],
	raw_command_tail: &OsStr,
) {
	use std::os::windows::process::CommandExt;

	process.args(switches);
	process.raw_arg(raw_command_tail);
}

fn spawn_error(command: &CommandSpec, error: &io::Error) -> ProcessError {
	match command.adapter() {
		LaunchAdapter::Direct => ProcessError::SpawnFailed {
			program: command.program().to_os_string(),
			error: SystemError::from(error),
		},
		#[cfg(any(windows, test))]
		LaunchAdapter::WindowsCommandScript { .. } | LaunchAdapter::PowerShellScript { .. } => {
			ProcessError::InterpreterFailed {
				interpreter: command.program().into(),
				error: SystemError::from(error),
			}
		}
	}
}

#[cfg(any(windows, test))]
pub(crate) fn encode_windows_command_tail(
	script: &OsStr,
	arguments: &[OsString],
) -> Result<OsString, CommandBuildError> {
	let mut encoded = Vec::new();
	for value in std::iter::once(script).chain(arguments.iter().map(OsString::as_os_str)) {
		if contains_forbidden_unit(value) {
			return Err(CommandBuildError::UnsupportedWindowsCommandValue);
		}
		let mut token = quote_windows_argument(value)?;
		for _ in 0..2 {
			token = escape_cmd_syntax(&token);
		}
		encoded.push(token);
	}

	let mut command_tail = vec![u16::from(b'"')];
	for (index, token) in encoded.into_iter().enumerate() {
		if index != 0 {
			command_tail.push(u16::from(b' '));
		}
		command_tail.extend(token);
	}
	command_tail.push(u16::from(b'"'));
	platform_string_from_wide(&command_tail)
}

#[cfg(any(windows, test))]
fn contains_forbidden_unit(value: &OsStr) -> bool {
	platform_wide(value)
		.map(|units| {
			units
				.into_iter()
				.any(|unit| unit == 0 || unit == u16::from(b'\r') || unit == u16::from(b'\n'))
		})
		.unwrap_or(true)
}

#[cfg(any(windows, test))]
fn quote_windows_argument(value: &OsStr) -> Result<Vec<u16>, CommandBuildError> {
	let units = platform_wide(value)?;
	let mut result = vec![u16::from(b'"')];
	let mut backslashes = 0;
	for unit in units {
		if unit == u16::from(b'\\') {
			backslashes += 1;
			continue;
		}
		if unit == u16::from(b'"') {
			result.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes * 2 + 1));
		} else {
			result.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes));
		}
		backslashes = 0;
		result.push(unit);
	}
	result.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes * 2));
	result.push(u16::from(b'"'));
	Ok(result)
}

#[cfg(any(windows, test))]
fn escape_cmd_syntax(value: &[u16]) -> Vec<u16> {
	let mut result = Vec::new();
	for &unit in value {
		if is_cmd_metacharacter(unit) {
			result.push(u16::from(b'^'));
		}
		result.push(unit);
	}
	result
}

#[cfg(any(windows, test))]
fn is_cmd_metacharacter(unit: u16) -> bool {
	b" ()[]%!^\"`<>&|;,*?"
		.iter()
		.any(|metacharacter| unit == u16::from(*metacharacter))
}

#[cfg(any(windows, test))]
fn platform_wide(value: &OsStr) -> Result<Vec<u16>, CommandBuildError> {
	os_string_to_wide(value)
}

#[cfg(any(windows, test))]
fn platform_string_from_wide(value: &[u16]) -> Result<OsString, CommandBuildError> {
	os_string_from_wide(value)
}

#[cfg(test)]
pub(crate) fn decode_windows_command_tail(
	value: &OsStr,
) -> Result<Vec<OsString>, CommandBuildError> {
	let wide = platform_wide(value)?;
	if wide.len() < 2
		|| wide.first() != Some(&u16::from(b'"'))
		|| wide.last() != Some(&u16::from(b'"'))
	{
		return Err(CommandBuildError::UnsupportedWindowsCommandValue);
	}

	let mut decoded = Vec::new();
	let mut encoded_token = Vec::new();
	let mut carets = 0;
	let mut index = 1;
	while index + 1 < wide.len() {
		let unit = wide[index];
		if unit == u16::from(b' ') && carets % 2 == 0 {
			decoded.push(decode_token(&encoded_token)?);
			encoded_token.clear();
			carets = 0;
		} else {
			encoded_token.push(unit);
			if unit == u16::from(b'^') {
				carets += 1;
			} else {
				carets = 0;
			}
		}
		index += 1;
	}
	decoded.push(decode_token(&encoded_token)?);
	Ok(decoded)
}

#[cfg(test)]
fn decode_token(encoded: &[u16]) -> Result<OsString, CommandBuildError> {
	let mut token = encoded.to_vec();
	for _ in 0..2 {
		token = unescape_cmd_syntax(&token)?;
	}
	if token.len() < 2
		|| token.first() != Some(&u16::from(b'"'))
		|| token.last() != Some(&u16::from(b'"'))
	{
		return Err(CommandBuildError::UnsupportedWindowsCommandValue);
	}

	let mut value = Vec::new();
	let content = &token[1..token.len() - 1];
	let mut index = 0;
	while index < content.len() {
		if content[index] != u16::from(b'\\') {
			value.push(content[index]);
			index += 1;
			continue;
		}

		let start = index;
		while index < content.len() && content[index] == u16::from(b'\\') {
			index += 1;
		}
		let backslashes = index - start;
		if index == content.len() {
			if backslashes % 2 != 0 {
				return Err(CommandBuildError::UnsupportedWindowsCommandValue);
			}
			value.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes / 2));
		} else if content[index] == u16::from(b'"') {
			if backslashes % 2 == 0 {
				return Err(CommandBuildError::UnsupportedWindowsCommandValue);
			}
			value.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes / 2));
			value.push(u16::from(b'"'));
			index += 1;
		} else {
			value.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes));
		}
	}
	platform_string_from_wide(&value)
}

#[cfg(test)]
fn unescape_cmd_syntax(encoded: &[u16]) -> Result<Vec<u16>, CommandBuildError> {
	let mut decoded = Vec::new();
	let mut index = 0;
	while index < encoded.len() {
		if encoded[index] == u16::from(b'^') {
			index += 1;
			if index == encoded.len() {
				return Err(CommandBuildError::UnsupportedWindowsCommandValue);
			}
		}
		decoded.push(encoded[index]);
		index += 1;
	}
	Ok(decoded)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn windows_command_tail_decoder_round_trips_encoder_output() {
		let script = OsStr::new(r"C:\Program Files\copilot.cmd");
		let arguments = [OsString::from("with spaces"), OsString::from("&|<>()^%!;")];
		let encoded = encode_windows_command_tail(script, &arguments).expect("encode command tail");

		assert_eq!(
			decode_windows_command_tail(&encoded).expect("decode command tail"),
			std::iter::once(script.to_os_string())
				.chain(arguments)
				.collect::<Vec<_>>()
		);
	}
}
