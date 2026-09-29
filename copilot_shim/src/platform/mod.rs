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

/// The `cmd.exe` switches for running a `.cmd` or `.bat` candidate: command extensions on (required by the `%`
/// neutralization below), delayed expansion off (so `!` is literal), no AutoRun, and strip only the outer quotes.
#[cfg(any(windows, test))]
pub(crate) const WINDOWS_COMMAND_SWITCHES: [&str; 5] = ["/E:ON", "/V:OFF", "/D", "/S", "/C"];

/// Builds the command that `cmd.exe /S /C` runs for a batch script, using the same encoding as the Rust standard
/// library's batch-file hardening (CVE-2024-24576):
///
/// - the script path is quoted and must not contain `"` or end with `\`;
/// - an argument is quoted when it is empty, ends with `\`, or contains anything other than letters, digits,
///   and `#$*+-./:?@\_`, so cmd treats metacharacters inside it as text;
/// - a `"` is doubled, and backslashes before a `"` or the closing quote are doubled for programs that parse their
///   command line with the Microsoft C runtime rules (for example `node.exe` behind an npm wrapper);
/// - a `%` becomes `%%cd:~,%`, an empty substring expansion that stops cmd from expanding `%VARIABLE%`.
#[cfg(any(windows, test))]
pub(crate) fn encode_windows_command_tail(
	script: &OsStr,
	arguments: &[OsString],
) -> Result<OsString, CommandBuildError> {
	let script = platform_wide(script)?;
	if script.is_empty()
		|| script.contains(&u16::from(b'"'))
		|| script.last() == Some(&u16::from(b'\\'))
		|| contains_forbidden_unit(&script)
	{
		return Err(CommandBuildError::UnsupportedWindowsCommandValue);
	}

	let mut command_tail = vec![u16::from(b'"'), u16::from(b'"')];
	command_tail.extend(script);
	command_tail.push(u16::from(b'"'));
	for argument in arguments {
		let argument = platform_wide(argument)?;
		if contains_forbidden_unit(&argument) {
			return Err(CommandBuildError::UnsupportedWindowsCommandValue);
		}
		command_tail.push(u16::from(b' '));
		append_batch_argument(&mut command_tail, &argument);
	}
	command_tail.push(u16::from(b'"'));
	platform_string_from_wide(&command_tail)
}

#[cfg(any(windows, test))]
fn contains_forbidden_unit(units: &[u16]) -> bool {
	units
		.iter()
		.any(|unit| *unit == 0 || *unit == u16::from(b'\r') || *unit == u16::from(b'\n'))
}

#[cfg(any(windows, test))]
fn append_batch_argument(command_tail: &mut Vec<u16>, argument: &[u16]) {
	const UNQUOTED: &[u8] = br"#$*+-./:?@\_";
	let quote = argument.is_empty()
		|| argument.last() == Some(&u16::from(b'\\'))
		|| argument.iter().any(|unit| {
			char::from_u32(u32::from(*unit)).is_none_or(|character| {
				character.is_control()
					|| character.is_ascii()
						&& !(character.is_ascii_alphanumeric()
							|| UNQUOTED.contains(&(character as u8)))
			})
		});

	if quote {
		command_tail.push(u16::from(b'"'));
	}
	let mut backslashes = 0;
	for &unit in argument {
		if unit == u16::from(b'\\') {
			backslashes += 1;
		} else {
			if unit == u16::from(b'"') {
				command_tail.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes));
				command_tail.push(u16::from(b'"'));
			} else if unit == u16::from(b'%') {
				command_tail.extend("%%cd:~,".encode_utf16());
			}
			backslashes = 0;
		}
		command_tail.push(unit);
	}
	if quote {
		command_tail.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes));
		command_tail.push(u16::from(b'"'));
	}
}

#[cfg(any(windows, test))]
fn platform_wide(value: &OsStr) -> Result<Vec<u16>, CommandBuildError> {
	os_string_to_wide(value)
}

#[cfg(any(windows, test))]
fn platform_string_from_wide(value: &[u16]) -> Result<OsString, CommandBuildError> {
	os_string_from_wide(value)
}

/// Decodes the output of [`encode_windows_command_tail`] back into the script and its arguments, the way a program
/// behind a batch wrapper (parsing with the Microsoft C runtime rules) receives them.
#[cfg(test)]
pub(crate) fn decode_windows_command_tail(
	value: &OsStr,
) -> Result<Vec<OsString>, CommandBuildError> {
	let quote = u16::from(b'"');
	let backslash = u16::from(b'\\');
	let space = u16::from(b' ');
	let wide = platform_wide(value)?;
	if wide.len() < 2 || wide.first() != Some(&quote) || wide.last() != Some(&quote) {
		return Err(CommandBuildError::UnsupportedWindowsCommandValue);
	}

	let inner = &wide[1..wide.len() - 1];
	let mut decoded = Vec::new();
	let mut index = 0;
	while index < inner.len() {
		if inner[index] == space {
			index += 1;
			continue;
		}
		let mut value = Vec::new();
		if inner[index] == quote {
			index += 1;
			loop {
				let start = index;
				while inner.get(index) == Some(&backslash) {
					index += 1;
				}
				let backslashes = index - start;
				let Some(&unit) = inner.get(index) else {
					return Err(CommandBuildError::UnsupportedWindowsCommandValue);
				};
				if unit == quote {
					value.extend(std::iter::repeat_n(backslash, backslashes / 2));
					index += 1;
					if inner.get(index) == Some(&quote) {
						value.push(quote);
						index += 1;
						continue;
					}
					break;
				}
				value.extend(std::iter::repeat_n(backslash, backslashes));
				value.push(unit);
				index += 1;
			}
		} else {
			while index < inner.len() && inner[index] != space {
				value.push(inner[index]);
				index += 1;
			}
		}
		let text = String::from_utf16(&value)
			.map_err(|_| CommandBuildError::UnsupportedWindowsCommandValue)?
			.replace("%%cd:~,%", "%");
		decoded.push(OsString::from(text));
	}
	Ok(decoded)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn windows_command_tail_decoder_round_trips_encoder_output() {
		let script = OsStr::new(r"C:\Program Files\copilot.cmd");
		let arguments = [
			OsString::from("with spaces"),
			OsString::from("&|<>()^%!;"),
			OsString::from(""),
			OsString::from(r#"quote " and \" inside"#),
			OsString::from(r"trailing\"),
			OsString::from("--resume"),
		];
		let encoded = encode_windows_command_tail(script, &arguments).expect("encode command tail");

		assert_eq!(
			(
				encoded.to_string_lossy().into_owned(),
				decode_windows_command_tail(&encoded).expect("decode command tail"),
			),
			(
				String::from(
					r#"""C:\Program Files\copilot.cmd" "with spaces" "&|<>()^%%cd:~,%!;" "" "quote "" and \\"" inside" "trailing\\" --resume""#
				),
				std::iter::once(script.to_os_string())
					.chain(arguments)
					.collect::<Vec<_>>(),
			)
		);
	}

	#[test]
	fn windows_command_tail_rejects_unsafe_scripts_and_line_breaks() {
		assert_eq!(
			[
				encode_windows_command_tail(OsStr::new(r#"C:\a"b.cmd"#), &[]),
				encode_windows_command_tail(OsStr::new("C:\\dir\\"), &[]),
				encode_windows_command_tail(
					OsStr::new(r"C:\copilot.cmd"),
					&[OsString::from("line\nbreak")]
				),
			],
			[
				Err(CommandBuildError::UnsupportedWindowsCommandValue),
				Err(CommandBuildError::UnsupportedWindowsCommandValue),
				Err(CommandBuildError::UnsupportedWindowsCommandValue),
			]
		);
	}
}
