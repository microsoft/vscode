/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::OsString;
use std::path::PathBuf;

#[cfg(any(windows, test))]
use crate::model::ResolutionFailure;
use crate::model::{
	Candidate, CandidateKind, CommandArguments, CommandBuildError, CommandSpec,
	DiscoveredCandidate, DiscoveredFileKind, ResolvedCandidate,
};
#[cfg(any(windows, test))]
use crate::platform;

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct InterpreterInventory {
	pub(crate) command_shell: Option<PathBuf>,
	pub(crate) powershell_7_3_or_newer: Option<PathBuf>,
	pub(crate) windows_powershell_5_1: Option<PathBuf>,
}

pub(crate) fn resolve_candidate(
	discovered: DiscoveredCandidate,
	interpreters: &InterpreterInventory,
) -> ResolvedCandidate {
	#[cfg(not(any(windows, test)))]
	let _ = interpreters;
	let kind = match discovered.kind {
		#[cfg(any(not(windows), test))]
		DiscoveredFileKind::UnixExecutable => CandidateKind::UnixExecutable,
		#[cfg(any(windows, test))]
		DiscoveredFileKind::WindowsExecutable => CandidateKind::WindowsExecutable,
		#[cfg(any(windows, test))]
		DiscoveredFileKind::CommandScript | DiscoveredFileKind::BatchScript => {
			let Some(interpreter) = &interpreters.command_shell else {
				return ResolvedCandidate::Unusable(ResolutionFailure::MissingCommandShell);
			};
			CandidateKind::CommandScript {
				interpreter: interpreter.clone(),
			}
		}
		#[cfg(any(windows, test))]
		DiscoveredFileKind::PowerShellScript => {
			let Some(interpreter) = interpreters
				.powershell_7_3_or_newer
				.as_ref()
				.or(interpreters.windows_powershell_5_1.as_ref())
			else {
				return ResolvedCandidate::Unusable(ResolutionFailure::MissingPowerShellHost);
			};
			CandidateKind::PowerShell {
				interpreter: interpreter.clone(),
			}
		}
	};

	ResolvedCandidate::Usable(Candidate {
		path: discovered.path,
		kind,
	})
}

impl Candidate {
	/// The command that launches this candidate with the arguments forwarded to the Copilot CLI.
	pub(crate) fn command(
		&self,
		forwarded_arguments: Vec<OsString>,
	) -> Result<CommandSpec, CommandBuildError> {
		match &self.kind {
			#[cfg(any(not(windows), test))]
			CandidateKind::UnixExecutable => Ok(CommandSpec::new(
				self.path.clone().into_os_string(),
				CommandArguments::Native(forwarded_arguments),
			)),
			#[cfg(any(windows, test))]
			CandidateKind::WindowsExecutable => Ok(CommandSpec::new(
				self.path.clone().into_os_string(),
				CommandArguments::Native(forwarded_arguments),
			)),
			#[cfg(any(windows, test))]
			CandidateKind::CommandScript { interpreter } => Ok(CommandSpec::new(
				interpreter.clone().into_os_string(),
				CommandArguments::WindowsCommand {
					switches: platform::WINDOWS_COMMAND_SWITCHES
						.into_iter()
						.map(OsString::from)
						.collect(),
					raw_command_tail: platform::encode_windows_command_tail(
						self.path.as_os_str(),
						&forwarded_arguments,
					)?,
				},
			)),
			#[cfg(any(windows, test))]
			CandidateKind::PowerShell { interpreter } => {
				let arguments = [
					"-NoLogo",
					"-NoProfile",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
				]
				.into_iter()
				.map(OsString::from)
				.chain([self.path.clone().into_os_string()])
				.chain(forwarded_arguments)
				.collect();
				Ok(CommandSpec::new(
					interpreter.clone().into_os_string(),
					CommandArguments::Native(arguments),
				))
			}
		}
	}
}
#[cfg(test)]
mod tests {
	use crate::platform;
	use std::ffi::OsString;
	use std::path::PathBuf;

	use super::{resolve_candidate, InterpreterInventory};
	use crate::model::{
		Candidate, CommandArguments, DiscoveredCandidate, DiscoveredFileKind, ResolutionFailure,
		ResolvedCandidate,
	};

	fn discovered(path: &str, kind: DiscoveredFileKind) -> DiscoveredCandidate {
		DiscoveredCandidate {
			path: PathBuf::from(path),
			kind,
		}
	}

	fn arguments() -> Vec<OsString> {
		[
			"",
			"with spaces",
			"single'quote",
			"double\"quote",
			"Grüße-東京",
			r"trailing\\",
			"&|<>()^%!;",
			"duplicate",
			"duplicate",
		]
		.into_iter()
		.map(OsString::from)
		.collect()
	}

	fn assert_native_round_trip(candidate: &Candidate, expected_prefix: &[&str]) {
		let forwarded = arguments();
		let final_command = candidate
			.command(forwarded.clone())
			.expect("build final command");

		let CommandArguments::Native(final_arguments) = final_command.arguments() else {
			panic!("expected native arguments");
		};
		let expected: Vec<OsString> = expected_prefix
			.iter()
			.map(OsString::from)
			.chain(forwarded)
			.collect();
		assert_eq!(final_arguments.as_slice(), expected.as_slice());
	}

	/// cmd treats `&|<>()^` as syntax only outside quotes, so every one of them must be inside a quoted argument.
	fn assert_cmd_metacharacters_are_quoted(raw_command_tail: &std::ffi::OsStr) {
		let command_tail = raw_command_tail
			.to_str()
			.expect("test command tail should be Unicode");
		let inner = &command_tail[1..command_tail.len() - 1];
		let mut quoted = false;
		for character in inner.chars() {
			if character == '"' {
				quoted = !quoted;
			} else if !quoted && "&|<>()^".contains(character) {
				panic!("unquoted cmd metacharacter in {command_tail:?}");
			}
		}
		assert!(!quoted, "unbalanced quotes in {command_tail:?}");
	}

	#[test]
	fn argument_round_trip_matrix() {
		let inventory = InterpreterInventory {
			command_shell: Some(PathBuf::from(r"C:\hostile & shell\cmd.exe")),
			powershell_7_3_or_newer: Some(PathBuf::from(r"C:\hostile & shell\pwsh.exe")),
			windows_powershell_5_1: Some(PathBuf::from(
				r"C:\hostile & shell\WindowsPowerShell\v1.0\powershell.exe",
			)),
		};

		let direct = resolve_candidate(
			discovered(
				"/hostile & native/copilot",
				DiscoveredFileKind::UnixExecutable,
			),
			&inventory,
		);
		let ResolvedCandidate::Usable(direct) = direct else {
			panic!("direct candidate should resolve");
		};
		assert_native_round_trip(&direct, &[]);
		assert_eq!(
			direct
				.command(Vec::new())
				.expect("build empty direct command")
				.arguments(),
			&CommandArguments::Native(Vec::new())
		);

		let windows_direct = resolve_candidate(
			discovered(
				r"C:\hostile & native\copilot.exe",
				DiscoveredFileKind::WindowsExecutable,
			),
			&inventory,
		);
		let ResolvedCandidate::Usable(windows_direct) = windows_direct else {
			panic!("Windows direct candidate should resolve");
		};
		assert_native_round_trip(&windows_direct, &[]);

		for kind in [
			DiscoveredFileKind::CommandScript,
			DiscoveredFileKind::BatchScript,
		] {
			let resolved = resolve_candidate(
				discovered(r"C:\hostile & script\copilot.cmd", kind),
				&inventory,
			);
			let ResolvedCandidate::Usable(candidate) = resolved else {
				panic!("cmd candidate should resolve");
			};
			let command = candidate.command(arguments()).expect("build cmd command");
			let CommandArguments::WindowsCommand {
				switches,
				raw_command_tail,
			} = command.arguments()
			else {
				panic!("expected raw Windows command tail");
			};
			assert_cmd_metacharacters_are_quoted(raw_command_tail);
			assert_eq!(
				(
					command.program(),
					switches.as_slice(),
					platform::decode_windows_command_tail(raw_command_tail)
						.expect("decode reviewed command-tail encoding"),
				),
				(
					inventory.command_shell.as_ref().unwrap().as_os_str(),
					platform::WINDOWS_COMMAND_SWITCHES
						.map(OsString::from)
						.as_slice(),
					std::iter::once(OsString::from(r"C:\hostile & script\copilot.cmd"))
						.chain(arguments())
						.collect(),
				)
			);
		}

		for inventory in [
			inventory.clone(),
			InterpreterInventory {
				command_shell: inventory.command_shell.clone(),
				powershell_7_3_or_newer: None,
				windows_powershell_5_1: inventory.windows_powershell_5_1.clone(),
			},
		] {
			let resolved = resolve_candidate(
				discovered(
					r"C:\hostile & script\copilot.ps1",
					DiscoveredFileKind::PowerShellScript,
				),
				&inventory,
			);
			let ResolvedCandidate::Usable(candidate) = resolved else {
				panic!("PowerShell candidate should resolve");
			};
			assert_native_round_trip(
				&candidate,
				&[
					"-NoLogo",
					"-NoProfile",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
					r"C:\hostile & script\copilot.ps1",
				],
			);
			let command = candidate
				.command(Vec::new())
				.expect("build PowerShell command without forwarded arguments");
			let CommandArguments::Native(arguments) = command.arguments() else {
				panic!("expected native PowerShell arguments");
			};
			assert_eq!(
				(
					command.program(),
					arguments.iter().any(|value| value == "-NonInteractive")
				),
				(
					inventory
						.powershell_7_3_or_newer
						.as_ref()
						.or(inventory.windows_powershell_5_1.as_ref())
						.unwrap()
						.as_os_str(),
					false
				)
			);
		}

		assert_eq!(
			resolve_candidate(
				discovered("copilot.cmd", DiscoveredFileKind::CommandScript),
				&InterpreterInventory::default(),
			),
			ResolvedCandidate::Unusable(ResolutionFailure::MissingCommandShell)
		);
		assert_eq!(
			resolve_candidate(
				discovered("copilot.ps1", DiscoveredFileKind::PowerShellScript),
				&InterpreterInventory::default(),
			),
			ResolvedCandidate::Unusable(ResolutionFailure::MissingPowerShellHost)
		);
	}
}
