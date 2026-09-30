/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::{OsStr, OsString};
use std::path::{Path, PathBuf};
#[cfg(any(windows, test))]
use std::time::Duration;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum FileIdentity {
	#[cfg(unix)]
	Unix { device: u64, inode: u64 },
	#[cfg(windows)]
	Windows { volume: u64, file_id: u128 },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum FileIdentityState {
	Supported(FileIdentity),
	#[cfg(any(windows, test))]
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
	pub(crate) path: PathBuf,
	pub(crate) kind: DiscoveredFileKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum CandidateKind {
	#[cfg(any(not(windows), test))]
	UnixExecutable,
	#[cfg(any(windows, test))]
	WindowsExecutable,
	/// A `.cmd` or `.bat` file, run by `cmd.exe`.
	#[cfg(any(windows, test))]
	CommandScript { interpreter: PathBuf },
	#[cfg(any(windows, test))]
	PowerShell { interpreter: PathBuf },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Candidate {
	pub(crate) path: PathBuf,
	pub(crate) kind: CandidateKind,
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
}

impl CommandSpec {
	pub(crate) fn new(program: OsString, arguments: CommandArguments) -> Self {
		Self { program, arguments }
	}

	pub(crate) fn program(&self) -> &OsStr {
		&self.program
	}

	pub(crate) fn arguments(&self) -> &CommandArguments {
		&self.arguments
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

/// Limits for a PowerShell version probe.
#[cfg(any(windows, test))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ProbeLimits {
	pub(crate) timeout: Duration,
	pub(crate) output_bytes: usize,
}

#[cfg(any(windows, test))]
impl ProbeLimits {
	pub(crate) const PRODUCTION: Self = Self {
		timeout: Duration::from_secs(30),
		output_bytes: 262_144,
	};
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SupervisionMode {
	/// Runs a PowerShell host with captured output to read its version; only `.ps1` candidates on Windows need it.
	#[cfg(any(windows, test))]
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
pub(crate) enum ProcessTermination {
	NumericExit(i32),
	#[cfg(any(unix, test))]
	UnixSignal(i32),
	/// The user pressed Ctrl+C.
	HandledCancellation,
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
	#[cfg(windows)]
	ReadStdout,
	#[cfg(windows)]
	ReadStderr,
	#[cfg(windows)]
	Terminate,
	#[cfg(windows)]
	Contain,
	#[cfg(windows)]
	Resume,
	InstallCancellationHandler,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ProcessDiagnostic {
	pub(crate) operation: ProcessOperation,
	pub(crate) program: PathBuf,
	pub(crate) error: SystemError,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ProcessError {
	#[cfg(windows)]
	TimedOut(Duration),
	#[cfg(windows)]
	OutputLimitExceeded(usize),
	SpawnFailed {
		program: OsString,
		error: SystemError,
	},
	SupervisionFailed(ProcessDiagnostic),
}

impl ProcessError {
	pub(crate) fn supervision(
		operation: ProcessOperation,
		program: &OsStr,
		error: &std::io::Error,
	) -> Self {
		Self::SupervisionFailed(ProcessDiagnostic {
			operation,
			program: Path::new(program).to_path_buf(),
			error: SystemError::from(error),
		})
	}
}
