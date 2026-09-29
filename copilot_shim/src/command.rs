/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(any(windows, test))]
use std::ffi::OsString;
use std::path::PathBuf;

use crate::model::{
	Candidate, CandidateKind, CommandArguments, CommandBuildError, CommandIntent, CommandSpec,
	DiscoveredCandidate, DiscoveredFileKind, LaunchAdapter, ResolvedCandidate,
};
#[cfg(any(windows, test))]
use crate::model::{PowerShellHost, ResolutionFailure, WindowsScriptKind};
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
	let kind = match discovered.kind() {
		#[cfg(any(not(windows), test))]
		DiscoveredFileKind::UnixExecutable => CandidateKind::UnixExecutable,
		#[cfg(any(windows, test))]
		DiscoveredFileKind::WindowsExecutable => CandidateKind::WindowsExecutable,
		#[cfg(any(windows, test))]
		DiscoveredFileKind::CommandScript => {
			let Some(interpreter) = &interpreters.command_shell else {
				return ResolvedCandidate::Unusable(ResolutionFailure::MissingCommandShell);
			};
			CandidateKind::Cmd {
				interpreter: interpreter.clone(),
			}
		}
		#[cfg(any(windows, test))]
		DiscoveredFileKind::BatchScript => {
			let Some(interpreter) = &interpreters.command_shell else {
				return ResolvedCandidate::Unusable(ResolutionFailure::MissingCommandShell);
			};
			CandidateKind::Batch {
				interpreter: interpreter.clone(),
			}
		}
		#[cfg(any(windows, test))]
		DiscoveredFileKind::PowerShellScript => {
			let (interpreter, host) =
				if let Some(interpreter) = &interpreters.powershell_7_3_or_newer {
					(interpreter, PowerShellHost::Modern)
				} else if let Some(interpreter) = &interpreters.windows_powershell_5_1 {
					(interpreter, PowerShellHost::WindowsPowerShell)
				} else {
					return ResolvedCandidate::Unusable(ResolutionFailure::MissingPowerShellHost);
				};
			CandidateKind::PowerShell {
				interpreter: interpreter.clone(),
				host,
			}
		}
	};

	ResolvedCandidate::Usable(Candidate::new(
		discovered.discovered_path().to_path_buf(),
		discovered.canonical_path().to_path_buf(),
		discovered.file_identity().clone(),
		kind,
	))
}

impl Candidate {
	pub(crate) fn command(&self, intent: CommandIntent) -> Result<CommandSpec, CommandBuildError> {
		let forwarded_arguments = intent.arguments();
		match self.kind() {
			#[cfg(any(not(windows), test))]
			CandidateKind::UnixExecutable => Ok(CommandSpec::new(
				self.discovered_path().as_os_str().to_os_string(),
				CommandArguments::Native(forwarded_arguments),
				LaunchAdapter::Direct,
			)),
			#[cfg(any(windows, test))]
			CandidateKind::WindowsExecutable => Ok(CommandSpec::new(
				self.discovered_path().as_os_str().to_os_string(),
				CommandArguments::Native(forwarded_arguments),
				LaunchAdapter::Direct,
			)),
			#[cfg(any(windows, test))]
			CandidateKind::Cmd { interpreter } | CandidateKind::Batch { interpreter } => {
				let kind = if matches!(self.kind(), CandidateKind::Cmd { .. }) {
					WindowsScriptKind::Cmd
				} else {
					WindowsScriptKind::Batch
				};
				let raw_command_tail = platform::encode_windows_command_tail(
					self.discovered_path().as_os_str(),
					&forwarded_arguments,
				)?;
				Ok(CommandSpec::new(
					interpreter.as_os_str().to_os_string(),
					CommandArguments::WindowsCommand {
						switches: platform::WINDOWS_COMMAND_SWITCHES
							.into_iter()
							.map(OsString::from)
							.collect(),
						raw_command_tail,
					},
					LaunchAdapter::WindowsCommandScript {
						script: self.discovered_path().to_path_buf(),
						kind,
					},
				))
			}
			#[cfg(any(windows, test))]
			CandidateKind::PowerShell { interpreter, host } => {
				let arguments = [
					"-NoLogo",
					"-NoProfile",
					"-ExecutionPolicy",
					"Bypass",
					"-File",
				]
				.into_iter()
				.map(OsString::from)
				.chain([self.discovered_path().as_os_str().to_os_string()])
				.chain(forwarded_arguments)
				.collect();
				Ok(CommandSpec::new(
					interpreter.as_os_str().to_os_string(),
					CommandArguments::Native(arguments),
					LaunchAdapter::PowerShellScript {
						script: self.discovered_path().to_path_buf(),
						host: *host,
					},
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
		Candidate, CommandArguments, CommandIntent, DiscoveredCandidate, DiscoveredFileKind,
		FileIdentityState, LaunchAdapter, PowerShellHost, ResolutionFailure, ResolvedCandidate,
	};

	fn discovered(path: &str, kind: DiscoveredFileKind) -> DiscoveredCandidate {
		DiscoveredCandidate::new(
			PathBuf::from(path),
			PathBuf::from(format!("{path}.canonical")),
			FileIdentityState::Unsupported,
			kind,
		)
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
			.command(CommandIntent::FinalCli(forwarded.clone()))
			.expect("build final command");
		let probe = candidate
			.command(CommandIntent::VersionProbe)
			.expect("build probe command");

		let CommandArguments::Native(final_arguments) = final_command.arguments() else {
			panic!("expected native arguments");
		};
		let expected: Vec<OsString> = expected_prefix
			.iter()
			.map(OsString::from)
			.chain(forwarded)
			.collect();
		assert_eq!(
			(
				final_arguments.as_slice(),
				probe.program(),
				probe.arguments(),
				probe.adapter(),
			),
			(
				expected.as_slice(),
				final_command.program(),
				&CommandArguments::Native(
					expected_prefix
						.iter()
						.map(OsString::from)
						.chain([OsString::from("--version")])
						.collect()
				),
				final_command.adapter(),
			)
		);
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
				.command(CommandIntent::FinalCli(Vec::new()))
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
			let command = candidate
				.command(CommandIntent::FinalCli(arguments()))
				.expect("build cmd command");
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
			let probe = candidate
				.command(CommandIntent::VersionProbe)
				.expect("build cmd probe");
			let CommandArguments::WindowsCommand {
				raw_command_tail, ..
			} = probe.arguments()
			else {
				panic!("expected raw Windows command tail");
			};
			assert_eq!(
				platform::decode_windows_command_tail(raw_command_tail)
					.expect("decode probe command tail"),
				[
					OsString::from(r"C:\hostile & script\copilot.cmd"),
					OsString::from("--version")
				]
			);
		}

		for (inventory, expected_host) in [
			(inventory.clone(), PowerShellHost::Modern),
			(
				InterpreterInventory {
					command_shell: inventory.command_shell.clone(),
					powershell_7_3_or_newer: None,
					windows_powershell_5_1: inventory.windows_powershell_5_1.clone(),
				},
				PowerShellHost::WindowsPowerShell,
			),
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
				.command(CommandIntent::FinalCli(Vec::new()))
				.expect("build PowerShell command without forwarded arguments");
			assert!(matches!(
				command.adapter(),
				LaunchAdapter::PowerShellScript { host, .. } if *host == expected_host
			));
			let CommandArguments::Native(arguments) = command.arguments() else {
				panic!("expected native PowerShell arguments");
			};
			assert!(!arguments.iter().any(|value| value == "-NonInteractive"));
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
