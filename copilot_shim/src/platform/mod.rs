/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(any(windows, test))]
use std::ffi::{OsStr, OsString};
use std::io;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};

#[cfg(any(windows, test))]
use crate::model::CommandBuildError;
use crate::model::{CommandArguments, CommandSpec, ProcessError, ProcessTermination, SystemError};

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

#[cfg(unix)]
use self::unix as native;
#[cfg(windows)]
use self::windows as native;
#[cfg(any(windows, test))]
use native::{os_string_from_wide, os_string_to_wide};

#[cfg(unix)]
pub(crate) use native::exec;
pub(crate) use native::install_cancellation_handler;
#[cfg(windows)]
pub(crate) use native::{spawn_captured, CapturedChild};

static PROCESS_CANCELLATION: AtomicBool = AtomicBool::new(false);

/// Runs `command` attached to the terminal and waits for it to exit.
pub(crate) fn run_interactive(command: &CommandSpec) -> Result<ProcessTermination, ProcessError> {
	let mut child = native_command(command)
		.stdin(Stdio::inherit())
		.stdout(Stdio::inherit())
		.stderr(Stdio::inherit())
		.spawn()
		.map_err(|error| spawn_error(command, &error))?;
	child.wait().map(native::termination).map_err(|error| {
		ProcessError::supervision(
			crate::model::ProcessOperation::Wait,
			command.program(),
			&error,
		)
	})
}

pub(crate) fn request_process_cancellation() {
	PROCESS_CANCELLATION.store(true, Ordering::SeqCst);
}

pub(crate) fn is_process_cancellation_requested() -> bool {
	PROCESS_CANCELLATION.load(Ordering::SeqCst)
}

fn native_command(command: &CommandSpec) -> Command {
	let mut process = Command::new(command.program());
	if let Some(path) = command.path() {
		process.env("PATH", path);
	}
	match command.arguments() {
		CommandArguments::Native(arguments) => {
			process.args(arguments);
		}
		#[cfg(windows)]
		CommandArguments::WindowsCommand {
			switches,
			raw_command_tail,
		} => {
			use std::os::windows::process::CommandExt;

			process.args(switches);
			process.raw_arg(raw_command_tail);
		}
		#[cfg(all(unix, test))]
		CommandArguments::WindowsCommand { .. } => {
			unreachable!("Windows command scripts are not executable on Unix")
		}
	}
	process
}

fn spawn_error(command: &CommandSpec, error: &io::Error) -> ProcessError {
	ProcessError::SpawnFailed {
		program: command.program().to_os_string(),
		error: SystemError::from(error),
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
	let script = os_string_to_wide(script)?;
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
		let argument = os_string_to_wide(argument)?;
		if contains_forbidden_unit(&argument) {
			return Err(CommandBuildError::UnsupportedWindowsCommandValue);
		}
		command_tail.push(u16::from(b' '));
		append_batch_argument(&mut command_tail, &argument);
	}
	command_tail.push(u16::from(b'"'));
	os_string_from_wide(&command_tail)
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

/// Decodes the output of [`encode_windows_command_tail`] back into the script and its arguments, the way a program
/// behind a batch wrapper (parsing with the Microsoft C runtime rules) receives them.
#[cfg(test)]
pub(crate) fn decode_windows_command_tail(
	value: &OsStr,
) -> Result<Vec<OsString>, CommandBuildError> {
	let quote = u16::from(b'"');
	let backslash = u16::from(b'\\');
	let space = u16::from(b' ');
	let wide = os_string_to_wide(value)?;
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
	fn path_override_is_per_command_and_preserves_inheritance() {
		let original = std::env::var_os("PATH");
		let command =
			CommandSpec::new(OsString::from("bash"), CommandArguments::Native(Vec::new()));
		let inherited = native_command(&command);
		let overridden = native_command(&command.with_path(Some(OsString::from("filtered-path"))));
		assert_eq!(
			(
				inherited.get_envs().count(),
				overridden.get_envs().collect::<Vec<_>>(),
				std::env::var_os("PATH"),
			),
			(
				0,
				vec![(OsStr::new("PATH"), Some(OsStr::new("filtered-path")))],
				original
			)
		);
	}

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
