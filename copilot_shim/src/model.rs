/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
use std::time::Duration;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum FileIdentity {
	#[cfg(any(unix, test))]
	Unix { device: u64, inode: u64 },
	#[cfg(any(windows, test))]
	Windows { volume: u64, file_id: u128 },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum FileIdentityState {
	Supported(FileIdentity),
	#[cfg(any(not(unix), test))]
	Unsupported,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DiscoveredFileKind {
	#[cfg(any(not(windows), test))]
	UnixExecutable,
	#[cfg(any(windows, test))]
	WindowsExecutable,
	#[cfg(any(windows, test))]
	CommandScript,
	#[cfg(any(windows, test))]
	BatchScript,
	#[cfg(any(windows, test))]
	PowerShellScript,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DiscoveredCandidate {
	discovered_path: PathBuf,
	canonical_path: PathBuf,
	file_identity: FileIdentityState,
	kind: DiscoveredFileKind,
}

impl DiscoveredCandidate {
	pub(crate) fn new(
		discovered_path: PathBuf,
		canonical_path: PathBuf,
		file_identity: FileIdentityState,
		kind: DiscoveredFileKind,
	) -> Self {
		Self {
			discovered_path,
			canonical_path,
			file_identity,
			kind,
		}
	}

	pub(crate) fn discovered_path(&self) -> &Path {
		&self.discovered_path
	}

	pub(crate) fn canonical_path(&self) -> &Path {
		&self.canonical_path
	}

	pub(crate) fn file_identity(&self) -> &FileIdentityState {
		&self.file_identity
	}

	pub(crate) fn kind(&self) -> DiscoveredFileKind {
		self.kind
	}
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PowerShellHost {
	Modern,
	WindowsPowerShell,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum CandidateKind {
	#[cfg(any(not(windows), test))]
	UnixExecutable,
	#[cfg(any(windows, test))]
	WindowsExecutable,
	#[cfg(any(windows, test))]
	Cmd { interpreter: PathBuf },
	#[cfg(any(windows, test))]
	Batch { interpreter: PathBuf },
	#[cfg(any(windows, test))]
	PowerShell {
		interpreter: PathBuf,
		host: PowerShellHost,
	},
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum WindowsScriptKind {
	Cmd,
	Batch,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum LaunchAdapter {
	Direct,
	#[cfg(any(windows, test))]
	WindowsCommandScript {
		script: PathBuf,
		kind: WindowsScriptKind,
	},
	#[cfg(any(windows, test))]
	PowerShellScript {
		script: PathBuf,
		host: PowerShellHost,
	},
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Candidate {
	discovered_path: PathBuf,
	canonical_path: PathBuf,
	file_identity: FileIdentityState,
	kind: CandidateKind,
}

impl Candidate {
	pub(crate) fn new(
		discovered_path: PathBuf,
		canonical_path: PathBuf,
		file_identity: FileIdentityState,
		kind: CandidateKind,
	) -> Self {
		Self {
			discovered_path,
			canonical_path,
			file_identity,
			kind,
		}
	}

	pub(crate) fn discovered_path(&self) -> &Path {
		&self.discovered_path
	}

	#[cfg(test)]
	pub(crate) fn canonical_path(&self) -> &Path {
		&self.canonical_path
	}

	#[cfg(test)]
	pub(crate) fn file_identity(&self) -> &FileIdentityState {
		&self.file_identity
	}

	pub(crate) fn kind(&self) -> &CandidateKind {
		&self.kind
	}
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum CommandIntent {
	VersionProbe,
	FinalCli(Vec<OsString>),
}

impl CommandIntent {
	pub(crate) fn arguments(self) -> Vec<OsString> {
		match self {
			Self::VersionProbe => vec![OsString::from("--version")],
			Self::FinalCli(arguments) => arguments,
		}
	}
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum CommandArguments {
	Native(Vec<OsString>),
	#[cfg(any(windows, test))]
	WindowsCommand {
		switches: Vec<OsString>,
		raw_command_tail: OsString,
	},
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct CommandSpec {
	program: OsString,
	arguments: CommandArguments,
	launch_adapter: LaunchAdapter,
}

impl CommandSpec {
	pub(crate) fn new(
		program: OsString,
		arguments: CommandArguments,
		launch_adapter: LaunchAdapter,
	) -> Self {
		Self {
			program,
			arguments,
			launch_adapter,
		}
	}

	pub(crate) fn program(&self) -> &OsStr {
		&self.program
	}

	pub(crate) fn arguments(&self) -> &CommandArguments {
		&self.arguments
	}

	pub(crate) fn adapter(&self) -> &LaunchAdapter {
		&self.launch_adapter
	}
}

#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ResolutionFailure {
	MissingCommandShell,
	MissingPowerShellHost,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ResolvedCandidate {
	Usable(Candidate),
	#[cfg(any(windows, test))]
	Unusable(ResolutionFailure),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CommandBuildError {
	#[cfg(any(windows, test))]
	UnsupportedWindowsCommandValue,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ProbeTimeout(Duration);

impl ProbeTimeout {
	#[cfg(test)]
	pub(crate) fn new(duration: Duration) -> Self {
		Self(duration)
	}

	pub(crate) fn duration(self) -> Duration {
		self.0
	}
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct OutputBudget(usize);

impl OutputBudget {
	#[cfg(test)]
	pub(crate) fn new(bytes: usize) -> Self {
		Self(bytes)
	}

	pub(crate) fn bytes(self) -> usize {
		self.0
	}
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ProbeLimits {
	pub(crate) timeout: ProbeTimeout,
	pub(crate) output: OutputBudget,
}

impl ProbeLimits {
	pub(crate) const PRODUCTION: Self = Self {
		timeout: ProbeTimeout(Duration::from_secs(30)),
		output: OutputBudget(262_144),
	};
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SupervisionMode {
	CapturedVersionProbe(ProbeLimits),
	InteractiveBootstrap,
	FinalInteractiveCli,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct CapturedOutput {
	pub(crate) stdout: Vec<u8>,
	pub(crate) stderr: Vec<u8>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Cancellation {
	Requested,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ProcessTermination {
	NumericExit(i32),
	#[cfg(any(unix, test))]
	UnixSignal(i32),
	HandledCancellation(Cancellation),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProcessOutcome {
	pub(crate) termination: ProcessTermination,
	pub(crate) captured_output: Option<CapturedOutput>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct SystemError {
	pub(crate) kind: std::io::ErrorKind,
	pub(crate) raw_os_error: Option<i32>,
}

impl From<&std::io::Error> for SystemError {
	fn from(error: &std::io::Error) -> Self {
		Self {
			kind: error.kind(),
			raw_os_error: error.raw_os_error(),
		}
	}
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ProcessOperation {
	Wait,
	ReadStdout,
	ReadStderr,
	Terminate,
	Reap,
	#[cfg(any(windows, test))]
	Contain,
	#[cfg(any(windows, test))]
	Resume,
	InstallCancellationHandler,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProcessDiagnostic {
	pub(crate) operation: ProcessOperation,
	pub(crate) subject: Option<PathBuf>,
	pub(crate) error: SystemError,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ProcessError {
	TimedOut {
		timeout: ProbeTimeout,
		captured_output: CapturedOutput,
	},
	OutputLimitExceeded {
		budget: OutputBudget,
		captured_output: CapturedOutput,
	},
	SpawnFailed {
		program: OsString,
		error: SystemError,
	},
	#[cfg(any(windows, test))]
	InterpreterFailed {
		interpreter: PathBuf,
		error: SystemError,
	},
	SupervisionFailed(ProcessDiagnostic),
}

#[cfg(test)]
mod tests {
	use std::ffi::OsString;
	use std::path::PathBuf;
	use std::time::Duration;

	use super::*;

	#[cfg(unix)]
	fn native_value(value: &[u8]) -> OsString {
		use std::os::unix::ffi::OsStringExt;

		OsString::from_vec(value.to_vec())
	}

	#[cfg(windows)]
	fn native_value(value: &[u8]) -> OsString {
		use std::os::windows::ffi::OsStringExt;

		let mut wide: Vec<u16> = value.iter().map(|byte| u16::from(*byte)).collect();
		wide.push(0xD800);
		OsString::from_wide(&wide)
	}

	#[test]
	fn contract_round_trip() {
		let discovered_path = PathBuf::from(native_value(b"native candidate \xFF path"));
		let canonical_path = PathBuf::from(native_value(b"canonical candidate \xFE path"));
		let interpreter = PathBuf::from(native_value(b"native interpreter \xFD path"));
		let adapter = CandidateKind::PowerShell {
			interpreter: interpreter.clone(),
			host: PowerShellHost::Modern,
		};
		let candidate = Candidate::new(
			discovered_path.clone(),
			canonical_path.clone(),
			FileIdentityState::Supported(FileIdentity::Unix {
				device: 17,
				inode: 23,
			}),
			adapter.clone(),
		);
		let windows_identity = FileIdentity::Windows {
			volume: 29,
			file_id: 31,
		};

		assert_eq!(
			(
				candidate.discovered_path(),
				candidate.canonical_path(),
				candidate.file_identity(),
				candidate.kind(),
				windows_identity,
				[ProcessOperation::Contain, ProcessOperation::Resume],
			),
			(
				discovered_path.as_path(),
				canonical_path.as_path(),
				&FileIdentityState::Supported(FileIdentity::Unix {
					device: 17,
					inode: 23,
				}),
				&adapter,
				FileIdentity::Windows {
					volume: 29,
					file_id: 31,
				},
				[ProcessOperation::Contain, ProcessOperation::Resume],
			)
		);
	}

	#[test]
	fn probe_limits_are_exclusive_to_captured_mode() {
		let limits = ProbeLimits {
			timeout: ProbeTimeout::new(Duration::from_secs(30)),
			output: OutputBudget::new(262_144),
		};
		let modes = [
			SupervisionMode::CapturedVersionProbe(limits),
			SupervisionMode::InteractiveBootstrap,
			SupervisionMode::FinalInteractiveCli,
		];

		assert_eq!(
			modes,
			[
				SupervisionMode::CapturedVersionProbe(ProbeLimits {
					timeout: ProbeTimeout::new(Duration::from_secs(30)),
					output: OutputBudget::new(262_144),
				}),
				SupervisionMode::InteractiveBootstrap,
				SupervisionMode::FinalInteractiveCli,
			]
		);
	}
}
