/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Parses the `--vscode-shim` options that VS Code passes to the shim.
//!
//! The options form a prefix of the command line:
//!
//! ```text
//! copilot [--vscode-shim <clear|verbose>]... [--] [copilot arguments...]
//! copilot [--vscode-shim verbose]... --vscode-shim <info|probe|install> [command options...]
//! ```
//!
//! Modifiers are removed and the remaining arguments are forwarded to the Copilot CLI. Commands run and exit without
//! ever launching the Copilot CLI. `verbose` may precede a command, while `clear` may not. Parsing stops at the first
//! argument that is not a `--vscode-shim` option, so arguments meant for the Copilot CLI are never consumed.

use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::time::Duration;

pub(crate) const OPTION: &str = "--vscode-shim";

/// Exit code for a malformed or unknown `--vscode-shim` option.
pub(crate) const USAGE_EXIT_CODE: i32 = 2;

const DEFAULT_PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const MAXIMUM_PROBE_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum Invocation {
	Launch {
		clear: bool,
		arguments: Vec<OsString>,
	},
	Info,
	Probe(ProbeOptions),
	Install(InstallOptions),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ParsedInvocation {
	pub(crate) verbose: bool,
	pub(crate) result: Result<Invocation, InvocationError>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ProbeScope {
	User,
	Machine,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProbeOptions {
	pub(crate) scope: ProbeScope,
	pub(crate) network: bool,
	pub(crate) timeout: Duration,
	pub(crate) result_file: PathBuf,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum InstallMode {
	/// Invoked from the terminal after the user accepted the install prompt: reports progress on the console.
	Interactive,
	/// Invoked by VS Code setup: reports progress and the result through files.
	Setup {
		progress_file: Option<PathBuf>,
		result_file: PathBuf,
		cancel_file: Option<PathBuf>,
		running_mutex: Option<OsString>,
	},
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct InstallOptions {
	pub(crate) mode: InstallMode,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum InvocationError {
	MissingOptionName,
	UnknownOption(OsString),
	CommandAfterClear(OsString),
	UnknownCommandOption {
		command: &'static str,
		option: OsString,
	},
	MissingValue {
		command: &'static str,
		option: &'static str,
	},
	InvalidValue {
		command: &'static str,
		option: &'static str,
		value: OsString,
	},
	MissingRequiredOption {
		command: &'static str,
		option: &'static str,
	},
}

impl std::fmt::Display for InvocationError {
	fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			Self::MissingOptionName => write!(formatter, "{OPTION} requires an option name"),
			Self::UnknownOption(name) => write!(formatter, "unknown {OPTION} option {name:?}"),
			Self::CommandAfterClear(name) => write!(
				formatter,
				"{OPTION} {name:?} cannot be combined with {OPTION} clear"
			),
			Self::UnknownCommandOption { command, option } => {
				write!(
					formatter,
					"unknown option {option:?} for {OPTION} {command}"
				)
			}
			Self::MissingValue { command, option } => {
				write!(
					formatter,
					"{option} requires a value for {OPTION} {command}"
				)
			}
			Self::InvalidValue {
				command,
				option,
				value,
			} => write!(
				formatter,
				"invalid value {value:?} for {option} of {OPTION} {command}"
			),
			Self::MissingRequiredOption { command, option } => {
				write!(formatter, "{OPTION} {command} requires {option}")
			}
		}
	}
}

pub(crate) fn parse(arguments: Vec<OsString>) -> ParsedInvocation {
	let mut verbose = false;
	let result = parse_invocation(arguments, &mut verbose);
	ParsedInvocation { verbose, result }
}

fn parse_invocation(
	arguments: Vec<OsString>,
	verbose: &mut bool,
) -> Result<Invocation, InvocationError> {
	let mut clear = false;
	let mut index = 0;
	while arguments
		.get(index)
		.is_some_and(|argument| argument == OPTION)
	{
		let Some(name) = arguments.get(index + 1) else {
			return Err(InvocationError::MissingOptionName);
		};
		match name.to_str() {
			Some("clear") => {
				clear = true;
				index += 2;
			}
			Some("verbose") => {
				*verbose = true;
				index += 2;
			}
			Some("info" | "probe" | "install") if clear => {
				return Err(InvocationError::CommandAfterClear(name.clone()));
			}
			Some("info") => return parse_info(&arguments[index + 2..]),
			Some("probe") => return parse_probe(&arguments[index + 2..]),
			Some("install") => return parse_install(&arguments[index + 2..]),
			_ => return Err(InvocationError::UnknownOption(name.clone())),
		}
	}

	// An explicit `--` ends the prefix, but only right after at least one option: a bare `--` belongs to the CLI.
	if index > 0
		&& arguments
			.get(index)
			.is_some_and(|argument| argument == "--")
	{
		index += 1;
	}

	Ok(Invocation::Launch {
		clear,
		arguments: arguments.into_iter().skip(index).collect(),
	})
}

fn parse_info(options: &[OsString]) -> Result<Invocation, InvocationError> {
	match options.first() {
		Some(option) => Err(InvocationError::UnknownCommandOption {
			command: "info",
			option: option.clone(),
		}),
		None => Ok(Invocation::Info),
	}
}

fn parse_probe(options: &[OsString]) -> Result<Invocation, InvocationError> {
	const COMMAND: &str = "probe";
	let mut scope = ProbeScope::User;
	let mut network = true;
	let mut timeout = DEFAULT_PROBE_TIMEOUT;
	let mut result_file = None;

	let mut options = options.iter();
	while let Some(option) = options.next() {
		match option.to_str() {
			Some("--scope") => {
				let value = required_value(&mut options, COMMAND, "--scope")?;
				scope = match value.to_str() {
					Some("user") => ProbeScope::User,
					Some("machine") => ProbeScope::Machine,
					_ => {
						return Err(InvocationError::InvalidValue {
							command: COMMAND,
							option: "--scope",
							value: value.clone(),
						})
					}
				};
			}
			Some("--no-network") => network = false,
			Some("--timeout-ms") => {
				let value = required_value(&mut options, COMMAND, "--timeout-ms")?;
				let milliseconds = value
					.to_str()
					.and_then(|value| value.parse::<u64>().ok())
					.filter(|milliseconds| *milliseconds > 0)
					.ok_or_else(|| InvocationError::InvalidValue {
						command: COMMAND,
						option: "--timeout-ms",
						value: value.clone(),
					})?;
				timeout = Duration::from_millis(milliseconds).min(MAXIMUM_PROBE_TIMEOUT);
			}
			Some("--result-file") => {
				result_file = Some(PathBuf::from(required_value(
					&mut options,
					COMMAND,
					"--result-file",
				)?));
			}
			_ => {
				return Err(InvocationError::UnknownCommandOption {
					command: COMMAND,
					option: option.clone(),
				})
			}
		}
	}

	Ok(Invocation::Probe(ProbeOptions {
		scope,
		network,
		timeout,
		result_file: result_file.ok_or(InvocationError::MissingRequiredOption {
			command: COMMAND,
			option: "--result-file",
		})?,
	}))
}

fn parse_install(options: &[OsString]) -> Result<Invocation, InvocationError> {
	const COMMAND: &str = "install";
	let mut interactive = false;
	let mut non_interactive = false;
	let mut consent = false;
	let mut progress_file = None;
	let mut result_file = None;
	let mut cancel_file = None;
	let mut running_mutex = None;

	let mut options = options.iter();
	while let Some(option) = options.next() {
		match option.to_str() {
			Some("--interactive") => interactive = true,
			Some("--non-interactive") => non_interactive = true,
			Some("--consent=installer") => consent = true,
			Some("--progress-file") => {
				progress_file = Some(PathBuf::from(required_value(
					&mut options,
					COMMAND,
					"--progress-file",
				)?));
			}
			Some("--result-file") => {
				result_file = Some(PathBuf::from(required_value(
					&mut options,
					COMMAND,
					"--result-file",
				)?));
			}
			Some("--cancel-file") => {
				cancel_file = Some(PathBuf::from(required_value(
					&mut options,
					COMMAND,
					"--cancel-file",
				)?));
			}
			Some("--running-mutex") => {
				running_mutex =
					Some(required_value(&mut options, COMMAND, "--running-mutex")?.clone());
			}
			_ => {
				return Err(InvocationError::UnknownCommandOption {
					command: COMMAND,
					option: option.clone(),
				})
			}
		}
	}

	let mode = match (interactive, non_interactive) {
		(true, false) => InstallMode::Interactive,
		(false, true) => {
			// A silent install must carry the consent that setup collected on its page or command line.
			if !consent {
				return Err(InvocationError::MissingRequiredOption {
					command: COMMAND,
					option: "--consent=installer",
				});
			}
			InstallMode::Setup {
				progress_file,
				result_file: result_file.ok_or(InvocationError::MissingRequiredOption {
					command: COMMAND,
					option: "--result-file",
				})?,
				cancel_file,
				running_mutex,
			}
		}
		_ => {
			return Err(InvocationError::MissingRequiredOption {
				command: COMMAND,
				option: "exactly one of --interactive or --non-interactive",
			})
		}
	};
	Ok(Invocation::Install(InstallOptions { mode }))
}

fn required_value<'a>(
	options: &mut std::slice::Iter<'a, OsString>,
	command: &'static str,
	option: &'static str,
) -> Result<&'a OsString, InvocationError> {
	options
		.next()
		.filter(|value| !value.is_empty() && value.as_os_str() != OsStr::new(OPTION))
		.ok_or(InvocationError::MissingValue { command, option })
}

#[cfg(test)]
mod tests {
	use super::*;

	fn arguments(values: &[&str]) -> Vec<OsString> {
		values.iter().map(OsString::from).collect()
	}

	fn parsed(verbose: bool, result: Result<Invocation, InvocationError>) -> ParsedInvocation {
		ParsedInvocation { verbose, result }
	}

	fn launch(verbose: bool, clear: bool, forwarded: &[&str]) -> ParsedInvocation {
		parsed(
			verbose,
			Ok(Invocation::Launch {
				clear,
				arguments: arguments(forwarded),
			}),
		)
	}

	#[test]
	fn modifiers_are_removed_and_everything_else_is_forwarded() {
		assert_eq!(
			[
				parse(arguments(&[])),
				parse(arguments(&["--resume", "id"])),
				parse(arguments(&["--vscode-shim", "clear", "--resume", "id"])),
				parse(arguments(&[
					"--vscode-shim",
					"clear",
					"--vscode-shim",
					"verbose",
					"--",
					"--vscode-shim",
					"clear"
				])),
				parse(arguments(&[
					"--vscode-shim",
					"verbose",
					"--vscode-shim",
					"verbose"
				])),
				parse(arguments(&["--", "--vscode-shim", "clear"])),
				parse(arguments(&["-p", "--vscode-shim", "clear"])),
				parse(arguments(&["--clear", "x"])),
			],
			[
				launch(false, false, &[]),
				launch(false, false, &["--resume", "id"]),
				launch(false, true, &["--resume", "id"]),
				launch(true, true, &["--vscode-shim", "clear"]),
				launch(true, false, &[]),
				launch(false, false, &["--", "--vscode-shim", "clear"]),
				launch(false, false, &["-p", "--vscode-shim", "clear"]),
				launch(false, false, &["--clear", "x"]),
			]
		);
	}

	#[test]
	fn commands_never_launch_and_parse_their_options() {
		assert_eq!(
			[
				parse(arguments(&["--vscode-shim", "info"])),
				parse(arguments(&[
					"--vscode-shim",
					"verbose",
					"--vscode-shim",
					"probe",
					"--scope",
					"machine",
					"--no-network",
					"--timeout-ms",
					"250",
					"--result-file",
					"probe.ini",
				])),
				parse(arguments(&[
					"--vscode-shim",
					"install",
					"--non-interactive",
					"--consent=installer",
					"--progress-file",
					"progress.ini",
					"--result-file",
					"result.ini",
					"--cancel-file",
					"cancel",
					"--running-mutex",
					"mutex",
				])),
				parse(arguments(&[
					"--vscode-shim",
					"verbose",
					"--vscode-shim",
					"install",
					"--interactive"
				])),
			],
			[
				parsed(false, Ok(Invocation::Info)),
				parsed(
					true,
					Ok(Invocation::Probe(ProbeOptions {
						scope: ProbeScope::Machine,
						network: false,
						timeout: Duration::from_millis(250),
						result_file: PathBuf::from("probe.ini"),
					}))
				),
				parsed(
					false,
					Ok(Invocation::Install(InstallOptions {
						mode: InstallMode::Setup {
							progress_file: Some(PathBuf::from("progress.ini")),
							result_file: PathBuf::from("result.ini"),
							cancel_file: Some(PathBuf::from("cancel")),
							running_mutex: Some(OsString::from("mutex")),
						},
					}))
				),
				parsed(
					true,
					Ok(Invocation::Install(InstallOptions {
						mode: InstallMode::Interactive,
					}))
				),
			]
		);
	}

	#[test]
	fn malformed_options_are_rejected() {
		assert_eq!(
			[
				parse(arguments(&["--vscode-shim"])),
				parse(arguments(&["--vscode-shim", "future-option", "--resume"])),
				parse(arguments(&[
					"--vscode-shim",
					"clear",
					"--vscode-shim",
					"verbose",
					"--vscode-shim",
					"probe"
				])),
				parse(arguments(&["--vscode-shim", "info", "extra"])),
				parse(arguments(&[
					"--vscode-shim",
					"verbose",
					"--vscode-shim",
					"probe"
				])),
				parse(arguments(&[
					"--vscode-shim",
					"probe",
					"--scope",
					"everyone",
					"--result-file",
					"x"
				])),
				parse(arguments(&[
					"--vscode-shim",
					"probe",
					"--timeout-ms",
					"0",
					"--result-file",
					"x"
				])),
				parse(arguments(&["--vscode-shim", "probe", "--result-file"])),
				parse(arguments(&[
					"--vscode-shim",
					"install",
					"--non-interactive",
					"--result-file",
					"x"
				])),
				parse(arguments(&["--vscode-shim", "install"])),
			],
			[
				parsed(false, Err(InvocationError::MissingOptionName)),
				parsed(
					false,
					Err(InvocationError::UnknownOption(OsString::from(
						"future-option"
					)))
				),
				parsed(
					true,
					Err(InvocationError::CommandAfterClear(OsString::from("probe")))
				),
				parsed(
					false,
					Err(InvocationError::UnknownCommandOption {
						command: "info",
						option: OsString::from("extra"),
					})
				),
				parsed(
					true,
					Err(InvocationError::MissingRequiredOption {
						command: "probe",
						option: "--result-file",
					})
				),
				parsed(
					false,
					Err(InvocationError::InvalidValue {
						command: "probe",
						option: "--scope",
						value: OsString::from("everyone"),
					})
				),
				parsed(
					false,
					Err(InvocationError::InvalidValue {
						command: "probe",
						option: "--timeout-ms",
						value: OsString::from("0"),
					})
				),
				parsed(
					false,
					Err(InvocationError::MissingValue {
						command: "probe",
						option: "--result-file",
					})
				),
				parsed(
					false,
					Err(InvocationError::MissingRequiredOption {
						command: "install",
						option: "--consent=installer",
					})
				),
				parsed(
					false,
					Err(InvocationError::MissingRequiredOption {
						command: "install",
						option: "exactly one of --interactive or --non-interactive",
					})
				),
			]
		);
	}
}
