/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::OsString;
use std::path::{Path, PathBuf};

use crate::candidate::{discover, DiscoveryDiagnosticKind, DiscoveryError, DiscoveryOperation};
use crate::command::{resolve_candidate, InterpreterInventory};
use crate::install::{
	discover_tools, mutation_plan, run_installer, HostTarget, InstallerAttempt,
	InstallerAttemptResult, InstallerPlanError, InstallerResult, MutationKind, UnsupportedTarget,
};
use crate::invocation::{self, Invocation};
use crate::model::{
	Cancellation, Candidate, CommandArguments, CommandIntent, CommandSpec, LaunchAdapter,
	ProbeLimits, ProcessError, ProcessOutcome, ProcessTermination, ResolvedCandidate,
	SupervisionMode,
};
use crate::runtime::{InspectedFileType, PromptKind, PromptResponse, Runtime};
use crate::setup;
use crate::version::{evaluate_successful_stdout, CliVersion, SuccessfulVersion, MINIMUM_VERSION};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DiscoveryCycle {
	Initial,
	AfterMutation(MutationKind),
}

#[derive(Debug, Eq, PartialEq)]
enum CandidateSelection {
	Launch(Candidate),
	Old { path: PathBuf, version: CliVersion },
	Missing,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ApplicationExit {
	Code(i32),
	Cancelled(i32),
	InternalFailure,
}

#[derive(Debug, Eq, PartialEq)]
enum WorkflowAction {
	Launch(Candidate),
	Exit(i32),
}

impl ApplicationExit {
	pub(super) fn code(self) -> i32 {
		match self {
			Self::Code(code) | Self::Cancelled(code) => code,
			Self::InternalFailure => 1,
		}
	}
}

fn build_interpreter_inventory<R: Runtime>(
	runtime: &R,
	target: Option<HostTarget>,
) -> Result<InterpreterInventory, ApplicationExit> {
	if !matches!(
		target,
		Some(HostTarget::WindowsX64 | HostTarget::WindowsArm64)
	) {
		return Ok(InterpreterInventory::default());
	}

	let command_shell = match runtime
		.environment_variable("ComSpec")
		.filter(|value| !value.is_empty())
	{
		Some(value) => usable_program(runtime, PathBuf::from(value), "ComSpec"),
		None => {
			runtime.write_diagnostic("ComSpec is unavailable");
			None
		}
	};
	let directories = path_directories(runtime);
	let powershell_7_3_or_newer =
		select_power_shell(runtime, &directories, "pwsh.exe", is_modern_power_shell)?;
	let windows_powershell_5_1 = if powershell_7_3_or_newer.is_none() {
		select_power_shell(
			runtime,
			&directories,
			"powershell.exe",
			is_windows_power_shell_5_1,
		)?
	} else {
		None
	};

	Ok(InterpreterInventory {
		command_shell,
		powershell_7_3_or_newer,
		windows_powershell_5_1,
	})
}

fn usable_program<R: Runtime>(runtime: &R, path: PathBuf, role: &str) -> Option<PathBuf> {
	match runtime.inspect_path(&path) {
		Ok(Some(inspection))
			if inspection.file_type == InspectedFileType::RegularFile && inspection.executable =>
		{
			Some(path)
		}
		Ok(Some(_)) => {
			runtime.write_diagnostic(&format!(
				"{role} path {path:?} is not an executable regular file"
			));
			None
		}
		Ok(None) => None,
		Err(error) => {
			runtime.write_diagnostic(&format!("failed to inspect {role} path {path:?}: {error}"));
			None
		}
	}
}

fn path_directories<R: Runtime>(runtime: &R) -> Vec<PathBuf> {
	let Some(path) = runtime.path().filter(|value| !value.is_empty()) else {
		return Vec::new();
	};
	let current_directory = match runtime.current_directory() {
		Ok(path) => path,
		Err(error) => {
			runtime.write_diagnostic(&format!(
				"failed to resolve the current directory while locating interpreters: {error}"
			));
			return Vec::new();
		}
	};
	std::env::split_paths(&path)
		.map(|entry| {
			if entry.as_os_str().is_empty() {
				current_directory.clone()
			} else if entry.is_absolute() {
				entry
			} else {
				current_directory.join(entry)
			}
		})
		.collect()
}

fn select_power_shell<R, F>(
	runtime: &R,
	directories: &[PathBuf],
	name: &str,
	accepts: F,
) -> Result<Option<PathBuf>, ApplicationExit>
where
	R: Runtime,
	F: Fn(CliVersion) -> bool,
{
	for directory in directories {
		let path = directory.join(name);
		let Some(path) = usable_program(runtime, path, name) else {
			continue;
		};
		if probe_power_shell_version(runtime, &path)?.is_some_and(&accepts) {
			return Ok(Some(path));
		}
	}
	Ok(None)
}

fn probe_power_shell_version<R: Runtime>(
	runtime: &R,
	path: &Path,
) -> Result<Option<CliVersion>, ApplicationExit> {
	let command = CommandSpec::new(
		path.as_os_str().to_os_string(),
		CommandArguments::Native(
			[
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$PSVersionTable.PSVersion.ToString()",
			]
			.into_iter()
			.map(OsString::from)
			.collect(),
		),
		LaunchAdapter::Direct,
	);
	match runtime.supervise(
		&command,
		SupervisionMode::CapturedVersionProbe(ProbeLimits::PRODUCTION),
	) {
		Ok(ProcessOutcome {
			termination: ProcessTermination::NumericExit(0),
			captured_output: Some(output),
		}) => match first_version(&output.stdout) {
			Some(version) => Ok(Some(version)),
			None => {
				runtime.write_diagnostic(&format!(
					"PowerShell host {path:?} returned an unparseable version"
				));
				Ok(None)
			}
		},
		Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation(cancellation),
			..
		}) => Err(ApplicationExit::Cancelled(cancellation_code(cancellation))),
		Ok(outcome) => {
			runtime.write_diagnostic(&format!(
				"PowerShell host {:?} is unusable: {}",
				path,
				describe_outcome(&outcome)
			));
			Ok(None)
		}
		Err(error) => {
			runtime.write_diagnostic(&format!(
				"PowerShell host {:?} is unusable: {}",
				path,
				describe_process_error(&error)
			));
			Ok(None)
		}
	}
}

fn is_modern_power_shell(version: CliVersion) -> bool {
	(version.major, version.minor, version.patch) >= (7, 3, 0)
}

fn is_windows_power_shell_5_1(version: CliVersion) -> bool {
	version.major == 5 && version.minor == 1
}

fn first_version(stdout: &[u8]) -> Option<CliVersion> {
	let mut components = [0_u64; 3];
	for start in 0..stdout.len() {
		if !stdout[start].is_ascii_digit() || start > 0 && stdout[start - 1].is_ascii_digit() {
			continue;
		}
		let mut index = start;
		for (component_index, component) in components.iter_mut().enumerate() {
			let component_start = index;
			while stdout.get(index).is_some_and(u8::is_ascii_digit) {
				*component = component
					.checked_mul(10)?
					.checked_add(u64::from(stdout[index] - b'0'))?;
				index += 1;
			}
			if index == component_start {
				break;
			}
			if component_index == 2 {
				return Some(CliVersion {
					major: components[0],
					minor: components[1],
					patch: components[2],
				});
			}
			if stdout.get(index) != Some(&b'.') {
				break;
			}
			index += 1;
		}
		components = [0; 3];
	}
	None
}

fn select_candidate<R: Runtime>(
	runtime: &R,
	interpreters: &InterpreterInventory,
) -> Result<CandidateSelection, ApplicationExit> {
	let discovery = discover(runtime, crate::SHIM_MARKER).map_err(|error| {
		report_discovery_error(runtime, &error);
		ApplicationExit::InternalFailure
	})?;
	for diagnostic in discovery.diagnostics {
		if let DiscoveryDiagnosticKind::Error { operation, error } = diagnostic.kind {
			runtime.write_diagnostic(&format!(
				"candidate discovery {:?} failed for {:?}: {}",
				operation,
				diagnostic.path,
				describe_system_error(error.kind, error.raw_os_error)
			));
		}
	}

	for discovered in discovery.candidates {
		let path = discovered.discovered_path().to_path_buf();
		#[cfg(not(any(windows, test)))]
		let ResolvedCandidate::Usable(candidate) = resolve_candidate(discovered, interpreters);
		#[cfg(any(windows, test))]
		let candidate = match resolve_candidate(discovered, interpreters) {
			ResolvedCandidate::Usable(candidate) => candidate,
			ResolvedCandidate::Unusable(reason) => {
				runtime.write_diagnostic(&format!(
					"candidate {path:?} is unusable because its interpreter is unavailable: {reason:?}"
				));
				continue;
			}
		};
		let command = match candidate.command(CommandIntent::VersionProbe) {
			Ok(command) => command,
			Err(error) => {
				runtime.write_diagnostic(&format!(
					"failed to build the version probe for candidate {path:?}: {error:?}"
				));
				continue;
			}
		};
		match runtime.supervise(
			&command,
			SupervisionMode::CapturedVersionProbe(ProbeLimits::PRODUCTION),
		) {
			Ok(ProcessOutcome {
				termination: ProcessTermination::NumericExit(0),
				captured_output: Some(output),
			}) => match evaluate_successful_stdout(&output.stdout) {
				SuccessfulVersion::Compatible(_) | SuccessfulVersion::Unparseable => {
					return Ok(CandidateSelection::Launch(candidate));
				}
				SuccessfulVersion::Old(version) => {
					return Ok(CandidateSelection::Old { path, version });
				}
			},
			Ok(ProcessOutcome {
				termination: ProcessTermination::HandledCancellation(cancellation),
				..
			}) => return Err(ApplicationExit::Cancelled(cancellation_code(cancellation))),
			Ok(outcome) => {
				runtime.write_diagnostic(&format!(
					"candidate {:?} failed its version probe: {}",
					path,
					describe_outcome(&outcome)
				));
			}
			Err(error) => {
				runtime.write_diagnostic(&format!(
					"candidate {:?} failed its version probe: {}",
					path,
					describe_process_error(&error)
				));
			}
		}
	}
	Ok(CandidateSelection::Missing)
}

fn prepare_workflow<R: Runtime>(
	runtime: &R,
	target: Option<HostTarget>,
	interpreters: &InterpreterInventory,
) -> Result<WorkflowAction, ApplicationExit> {
	let mut cycle = DiscoveryCycle::Initial;
	loop {
		match (cycle, select_candidate(runtime, interpreters)?) {
			(_, CandidateSelection::Launch(candidate)) => {
				return Ok(WorkflowAction::Launch(candidate));
			}
			(DiscoveryCycle::Initial, CandidateSelection::Old { version, .. }) => {
				match request_mutation(runtime, target, MutationKind::Update, Some(version))? {
					PromptResponse::Declined => return Ok(WorkflowAction::Exit(0)),
					PromptResponse::Accepted => {
						cycle = DiscoveryCycle::AfterMutation(MutationKind::Update);
					}
				}
			}
			(DiscoveryCycle::Initial, CandidateSelection::Missing) => {
				match request_mutation(runtime, target, MutationKind::Install, None)? {
					PromptResponse::Declined => return Ok(WorkflowAction::Exit(0)),
					PromptResponse::Accepted => {
						cycle = DiscoveryCycle::AfterMutation(MutationKind::Install);
					}
				}
			}
			(
				DiscoveryCycle::AfterMutation(MutationKind::Update),
				CandidateSelection::Old { path, version },
			) => {
				runtime.write_diagnostic(&format!(
						"update completed, but first-in-PATH candidate {path:?} is still version {version}; it may shadow the updated installation. Reorder PATH, remove the old installation, or invoke the new installation explicitly"
					));
				return Err(ApplicationExit::InternalFailure);
			}
			(
				DiscoveryCycle::AfterMutation(MutationKind::Install),
				CandidateSelection::Old { path, version },
			) => {
				runtime.write_diagnostic(&format!(
						"installation completed, but first-in-PATH candidate {path:?} is version {version}; update or remove the old installation before retrying"
					));
				return Err(ApplicationExit::InternalFailure);
			}
			(DiscoveryCycle::AfterMutation(kind), CandidateSelection::Missing) => {
				report_not_visible_after_mutation(runtime, kind);
				return Err(ApplicationExit::InternalFailure);
			}
		}
	}
}

pub(crate) fn run<R: Runtime>(
	runtime: &R,
	arguments: Vec<OsString>,
	target: Option<HostTarget>,
) -> i32 {
	let (clear, arguments) = match invocation::parse(arguments) {
		Ok(Invocation::Launch { clear, arguments }) => (clear, arguments),
		// Commands for VS Code report and exit; they never launch the Copilot CLI.
		Ok(Invocation::Info) => return setup::info(),
		Ok(Invocation::Probe(options)) => return setup::probe(runtime, target, &options),
		Ok(Invocation::Install(options)) => return setup::install(runtime, target, &options),
		Err(error) => {
			runtime.write_diagnostic(&error.to_string());
			return invocation::USAGE_EXIT_CODE;
		}
	};
	if clear {
		if let Err(error) = runtime.clear_terminal() {
			runtime.write_diagnostic(&format!("failed to clear the terminal: {error}"));
			return ApplicationExit::InternalFailure.code();
		}
	}

	let result = build_interpreter_inventory(runtime, target).and_then(|interpreters| {
		prepare_workflow(runtime, target, &interpreters).map(|action| match action {
			WorkflowAction::Launch(candidate) => launch_candidate(runtime, candidate, arguments),
			WorkflowAction::Exit(code) => ApplicationExit::Code(code),
		})
	});
	result.map_or_else(ApplicationExit::code, ApplicationExit::code)
}

fn launch_candidate<R: Runtime>(
	runtime: &R,
	candidate: Candidate,
	arguments: Vec<OsString>,
) -> ApplicationExit {
	let path = candidate.discovered_path().to_path_buf();
	let command = match candidate.command(CommandIntent::FinalCli(arguments)) {
		Ok(command) => command,
		Err(error) => {
			runtime.write_diagnostic(&format!(
				"failed to build the final command for candidate {path:?}: {error:?}"
			));
			return ApplicationExit::InternalFailure;
		}
	};
	match runtime.supervise(&command, SupervisionMode::FinalInteractiveCli) {
		Ok(ProcessOutcome {
			termination: ProcessTermination::NumericExit(code),
			..
		}) => ApplicationExit::Code(code),
		#[cfg(any(unix, test))]
		Ok(ProcessOutcome {
			termination: ProcessTermination::UnixSignal(signal),
			..
		}) => ApplicationExit::Code(signal_exit_code(signal)),
		Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation(cancellation),
			..
		}) => ApplicationExit::Cancelled(cancellation_code(cancellation)),
		Err(error) => {
			runtime.write_diagnostic(&format!(
				"failed to launch candidate {:?}: {}",
				path,
				describe_process_error(&error)
			));
			ApplicationExit::InternalFailure
		}
	}
}

fn request_mutation<R: Runtime>(
	runtime: &R,
	target: Option<HostTarget>,
	kind: MutationKind,
	installed_version: Option<CliVersion>,
) -> Result<PromptResponse, ApplicationExit> {
	let Some(target) = target else {
		report_unsupported_target(runtime, kind, None);
		return Err(ApplicationExit::InternalFailure);
	};
	if let Some(unsupported) = unsupported_target(target) {
		report_unsupported_target(runtime, kind, Some(unsupported));
		return Err(ApplicationExit::InternalFailure);
	}

	let response = match (kind, installed_version) {
		(MutationKind::Install, _) => runtime.prompt(PromptKind::Install),
		(MutationKind::Update, Some(version)) => {
			let installed_version = version.to_string();
			let required_version = MINIMUM_VERSION.to_string();
			runtime.prompt(PromptKind::Update {
				installed_version: &installed_version,
				required_version: &required_version,
			})
		}
		(MutationKind::Update, None) => {
			runtime
				.write_diagnostic("internal error: update requested without an installed version");
			return Err(ApplicationExit::InternalFailure);
		}
	}
	.map_err(|error| {
		runtime.write_diagnostic(&format!("failed to read the {kind:?} prompt: {error}"));
		ApplicationExit::InternalFailure
	})?;
	if response == PromptResponse::Declined {
		return Ok(response);
	}

	let tools = discover_tools(runtime, target).map_err(|error| {
		runtime.write_diagnostic(&format!(
			"failed to discover installer tools at {:?}: {}",
			error.path,
			describe_system_error(error.error.kind, error.error.raw_os_error)
		));
		ApplicationExit::InternalFailure
	})?;
	let routes = mutation_plan(kind, target, &tools).map_err(|error| {
		report_installer_plan_error(runtime, kind, &error);
		ApplicationExit::InternalFailure
	})?;
	match run_installer(runtime, &routes, &tools) {
		InstallerResult::Succeeded { attempts } => {
			report_failed_installer_attempts(runtime, &attempts);
			Ok(PromptResponse::Accepted)
		}
		InstallerResult::Cancelled { attempts } => {
			report_installer_attempts(runtime, &attempts);
			Err(ApplicationExit::Cancelled(
				attempts
					.iter()
					.rev()
					.find_map(|attempt| match attempt.result {
						InstallerAttemptResult::Cancelled(cancellation) => {
							Some(cancellation_code(cancellation))
						}
						_ => None,
					})
					.unwrap_or(130),
			))
		}
		InstallerResult::Failed { failure, attempts } => {
			report_installer_attempts(runtime, &attempts);
			runtime.write_diagnostic(&format!(
					"{kind:?} failed at installer level {failure:?}; install GitHub Copilot CLI manually"
				));
			Err(ApplicationExit::InternalFailure)
		}
	}
}

fn unsupported_target(target: HostTarget) -> Option<UnsupportedTarget> {
	match target {
		HostTarget::LinuxGnuArmhf => Some(UnsupportedTarget::LinuxArmhf),
		HostTarget::LinuxMuslX64 | HostTarget::LinuxMuslArm64 => Some(UnsupportedTarget::LinuxMusl),
		HostTarget::WindowsX64
		| HostTarget::WindowsArm64
		| HostTarget::MacosX64
		| HostTarget::MacosArm64
		| HostTarget::LinuxGnuX64
		| HostTarget::LinuxGnuArm64 => None,
	}
}

fn report_unsupported_target<R: Runtime>(
	runtime: &R,
	kind: MutationKind,
	unsupported: Option<UnsupportedTarget>,
) {
	let action = match kind {
		MutationKind::Install => "installation",
		MutationKind::Update => "update",
	};
	match unsupported {
		Some(target) => runtime.write_diagnostic(&format!(
			"automatic {action} is unavailable: {}",
			target.guidance()
		)),
		None => runtime.write_diagnostic(&format!(
			"automatic {action} is unavailable on this target; install GitHub Copilot CLI manually"
		)),
	}
}

fn report_installer_plan_error<R: Runtime>(
	runtime: &R,
	kind: MutationKind,
	error: &InstallerPlanError,
) {
	match error {
		InstallerPlanError::Unsupported(target) => {
			report_unsupported_target(runtime, kind, Some(*target));
		}
		InstallerPlanError::MissingPrerequisites(tools) => runtime.write_diagnostic(&format!(
			"cannot perform {kind:?}; missing installer prerequisites: {tools:?}"
		)),
	}
}

fn report_failed_installer_attempts<R: Runtime>(runtime: &R, attempts: &[InstallerAttempt]) {
	for attempt in attempts {
		if !matches!(attempt.result, InstallerAttemptResult::NumericExit(0)) {
			report_installer_attempt(runtime, attempt);
		}
	}
}

fn report_installer_attempts<R: Runtime>(runtime: &R, attempts: &[InstallerAttempt]) {
	for attempt in attempts {
		report_installer_attempt(runtime, attempt);
	}
}

fn report_installer_attempt<R: Runtime>(runtime: &R, attempt: &InstallerAttempt) {
	runtime.write_diagnostic(&format!(
		"installer route {:?} stage {:?} returned {:?}",
		attempt.route, attempt.stage, attempt.result
	));
}

fn report_not_visible_after_mutation<R: Runtime>(runtime: &R, kind: MutationKind) {
	runtime.write_diagnostic(&format!(
			"{kind:?} completed, but GitHub Copilot CLI is not visible in the current PATH; restart the terminal or update PATH and retry"
		));
}

fn report_discovery_error<R: Runtime>(runtime: &R, error: &DiscoveryError) {
	let operation = match error.operation {
		DiscoveryOperation::CurrentExecutable => "identify the running shim",
		DiscoveryOperation::PathEntry => "resolve a PATH entry",
		DiscoveryOperation::CandidateMetadata
		| DiscoveryOperation::CandidateRead
		| DiscoveryOperation::LegacyRead => "inspect a candidate",
	};
	runtime.write_diagnostic(&format!(
		"failed to {operation}{}: {}",
		error
			.path
			.as_ref()
			.map(|path| format!(" at {path:?}"))
			.unwrap_or_default(),
		describe_system_error(error.error.kind, error.error.raw_os_error)
	));
}

fn describe_outcome(outcome: &ProcessOutcome) -> String {
	match outcome.termination {
		ProcessTermination::NumericExit(code) => {
			let stderr = outcome
				.captured_output
				.as_ref()
				.map(|output| String::from_utf8_lossy(&output.stderr))
				.filter(|stderr| !stderr.is_empty())
				.map(|stderr| format!("; stderr: {stderr}"))
				.unwrap_or_default();
			format!("process exited with code {code}{stderr}")
		}
		#[cfg(any(unix, test))]
		ProcessTermination::UnixSignal(signal) => {
			format!("process terminated from Unix signal {signal}")
		}
		ProcessTermination::HandledCancellation(cancellation) => {
			format!("process was cancelled: {cancellation:?}")
		}
	}
}

fn describe_process_error(error: &ProcessError) -> String {
	match error {
		ProcessError::TimedOut { timeout, .. } => {
			format!("timed out after {:?}", timeout.duration())
		}
		ProcessError::OutputLimitExceeded { budget, .. } => {
			format!("exceeded the {} byte output limit", budget.bytes())
		}
		ProcessError::SpawnFailed { program, error } => format!(
			"could not start {:?}: {}",
			program,
			describe_system_error(error.kind, error.raw_os_error)
		),
		#[cfg(any(windows, test))]
		ProcessError::InterpreterFailed { interpreter, error } => format!(
			"could not start interpreter {:?}: {}",
			interpreter,
			describe_system_error(error.kind, error.raw_os_error)
		),
		ProcessError::SupervisionFailed(diagnostic) => format!(
			"process supervision {:?} failed{}: {}",
			diagnostic.operation,
			diagnostic
				.subject
				.as_ref()
				.map(|path| format!(" for {path:?}"))
				.unwrap_or_default(),
			describe_system_error(diagnostic.error.kind, diagnostic.error.raw_os_error)
		),
	}
}

fn describe_system_error(kind: std::io::ErrorKind, raw_os_error: Option<i32>) -> String {
	match raw_os_error {
		Some(code) => format!("{kind:?} (OS error {code})"),
		None => format!("{kind:?}"),
	}
}

fn cancellation_code(cancellation: Cancellation) -> i32 {
	match cancellation {
		Cancellation::Requested => 130,
	}
}

#[cfg(any(unix, test))]
fn signal_exit_code(signal: i32) -> i32 {
	128_i32.saturating_add(signal)
}

#[cfg(test)]
mod tests {
	use std::cell::{Cell, RefCell};
	use std::collections::{HashMap, VecDeque};
	use std::ffi::OsString;
	use std::io;
	use std::path::{Path, PathBuf};

	use super::*;
	use crate::model::{
		CandidateKind, CapturedOutput, CommandSpec, FileIdentityState, ProcessError,
		ProcessOutcome, ProcessTermination, SupervisionMode, SystemError,
	};
	use crate::runtime::{
		EnvironmentEffects, FileSystemEffects, InspectedFileType, PathInspection, ProcessEffects,
		PromptKind, PromptResponse, UserInteractionEffects,
	};

	struct ProcessStep {
		result: Result<ProcessOutcome, ProcessError>,
		replacement_path: Option<OsString>,
	}

	struct FakeRuntime {
		path: RefCell<Option<OsString>>,
		environment: RefCell<HashMap<String, OsString>>,
		inspections: RefCell<HashMap<PathBuf, PathInspection>>,
		inspection_errors: RefCell<HashMap<PathBuf, io::ErrorKind>>,
		files: RefCell<HashMap<PathBuf, Vec<u8>>>,
		process_steps: RefCell<VecDeque<ProcessStep>>,
		commands: RefCell<Vec<(CommandSpec, SupervisionMode)>>,
		prompt_responses: RefCell<VecDeque<PromptResponse>>,
		prompts: RefCell<Vec<String>>,
		clears: Cell<usize>,
		diagnostics: RefCell<Vec<String>>,
	}

	impl Default for FakeRuntime {
		fn default() -> Self {
			let mut inspections = HashMap::new();
			inspections.insert(
				PathBuf::from("/shim"),
				PathInspection {
					canonical_path: PathBuf::from("/shim"),
					file_identity: FileIdentityState::Unsupported,
					file_type: InspectedFileType::RegularFile,
					executable: true,
				},
			);
			Self {
				path: RefCell::new(None),
				environment: RefCell::new(HashMap::new()),
				inspections: RefCell::new(inspections),
				inspection_errors: RefCell::new(HashMap::new()),
				files: RefCell::new(HashMap::new()),
				process_steps: RefCell::new(VecDeque::new()),
				commands: RefCell::new(Vec::new()),
				prompt_responses: RefCell::new(VecDeque::new()),
				prompts: RefCell::new(Vec::new()),
				clears: Cell::new(0),
				diagnostics: RefCell::new(Vec::new()),
			}
		}
	}

	impl FakeRuntime {
		fn set_path(&self, paths: &[&Path]) {
			*self.path.borrow_mut() =
				Some(std::env::join_paths(paths).expect("join fake PATH entries"));
		}

		fn add_directory(&self, path: &Path) {
			self.inspections.borrow_mut().insert(
				path.to_path_buf(),
				PathInspection {
					canonical_path: path.to_path_buf(),
					file_identity: FileIdentityState::Unsupported,
					file_type: InspectedFileType::Directory,
					executable: true,
				},
			);
		}

		fn add_program(&self, path: &Path) {
			self.inspections.borrow_mut().insert(
				path.to_path_buf(),
				PathInspection {
					canonical_path: path.to_path_buf(),
					file_identity: FileIdentityState::Unsupported,
					file_type: InspectedFileType::RegularFile,
					executable: true,
				},
			);
			self.files
				.borrow_mut()
				.insert(path.to_path_buf(), b"real cli".to_vec());
		}

		fn push_process_result(&self, result: Result<ProcessOutcome, ProcessError>) {
			self.process_steps.borrow_mut().push_back(ProcessStep {
				result,
				replacement_path: None,
			});
		}

		#[cfg(not(windows))]
		fn push_process_result_with_path(
			&self,
			result: Result<ProcessOutcome, ProcessError>,
			paths: &[&Path],
		) {
			self.process_steps.borrow_mut().push_back(ProcessStep {
				result,
				replacement_path: Some(
					std::env::join_paths(paths).expect("join replacement PATH entries"),
				),
			});
		}

		#[cfg(not(windows))]
		fn push_prompt_response(&self, response: PromptResponse) {
			self.prompt_responses.borrow_mut().push_back(response);
		}
	}

	impl EnvironmentEffects for FakeRuntime {
		fn path(&self) -> Option<OsString> {
			self.path.borrow().clone()
		}

		fn current_executable(&self) -> io::Result<PathBuf> {
			Ok(PathBuf::from("/shim"))
		}

		fn current_directory(&self) -> io::Result<PathBuf> {
			Ok(PathBuf::from("/"))
		}

		fn environment_variable(&self, name: &str) -> Option<OsString> {
			self.environment.borrow().get(name).cloned()
		}
	}

	impl FileSystemEffects for FakeRuntime {
		fn inspect_path(&self, path: &Path) -> io::Result<Option<PathInspection>> {
			if let Some(kind) = self.inspection_errors.borrow().get(path) {
				return Err(io::Error::new(*kind, "fake inspection failure"));
			}
			Ok(self.inspections.borrow().get(path).cloned())
		}

		fn read_directory(&self, _path: &Path) -> io::Result<Vec<OsString>> {
			Ok(Vec::new())
		}

		fn open_file(&self, path: &Path) -> io::Result<Box<dyn io::Read>> {
			self.files
				.borrow()
				.get(path)
				.cloned()
				.map(|content| Box::new(io::Cursor::new(content)) as Box<dyn io::Read>)
				.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "fake file is missing"))
		}
	}

	impl UserInteractionEffects for FakeRuntime {
		fn clear_terminal(&self) -> io::Result<()> {
			self.clears.set(self.clears.get() + 1);
			Ok(())
		}

		fn prompt(&self, kind: PromptKind<'_>) -> io::Result<PromptResponse> {
			self.prompts.borrow_mut().push(match kind {
				PromptKind::Install => String::from("install"),
				PromptKind::Update {
					installed_version,
					required_version,
				} => format!("update {installed_version} to {required_version}"),
			});
			Ok(self
				.prompt_responses
				.borrow_mut()
				.pop_front()
				.unwrap_or(PromptResponse::Declined))
		}

		fn write_diagnostic(&self, message: &str) {
			self.diagnostics.borrow_mut().push(message.to_owned());
		}
	}

	impl ProcessEffects for FakeRuntime {
		fn supervise(
			&self,
			command: &CommandSpec,
			mode: SupervisionMode,
		) -> Result<ProcessOutcome, ProcessError> {
			self.commands.borrow_mut().push((command.clone(), mode));
			let step = self
				.process_steps
				.borrow_mut()
				.pop_front()
				.expect("unexpected fake process invocation");
			if let Some(path) = step.replacement_path {
				*self.path.borrow_mut() = Some(path);
			}
			step.result
		}
	}

	fn captured_exit(code: i32, stdout: &[u8], stderr: &[u8]) -> ProcessOutcome {
		ProcessOutcome {
			termination: ProcessTermination::NumericExit(code),
			captured_output: Some(CapturedOutput {
				stdout: stdout.to_vec(),
				stderr: stderr.to_vec(),
			}),
		}
	}

	fn interactive_exit(code: i32) -> ProcessOutcome {
		ProcessOutcome {
			termination: ProcessTermination::NumericExit(code),
			captured_output: None,
		}
	}

	#[cfg(not(windows))]
	fn configure_script_installer(runtime: &FakeRuntime) {
		runtime.add_directory(Path::new("/tools"));
		runtime.add_program(Path::new("/tools/curl"));
		runtime.add_program(Path::new("/tools/bash"));
	}

	#[test]
	fn private_state_and_fake_runtime_are_ready() {
		let runtime = FakeRuntime::default();
		runtime.clear_terminal().expect("record clear");
		runtime.write_diagnostic("diagnostic");

		assert_eq!(
			(
				DiscoveryCycle::Initial,
				DiscoveryCycle::AfterMutation(MutationKind::Install),
				CandidateSelection::Missing,
				ApplicationExit::Code(17).code(),
				ApplicationExit::Cancelled(130).code(),
				ApplicationExit::InternalFailure.code(),
				runtime.clears.get(),
				runtime.diagnostics.into_inner(),
			),
			(
				DiscoveryCycle::Initial,
				DiscoveryCycle::AfterMutation(MutationKind::Install),
				CandidateSelection::Missing,
				17,
				130,
				1,
				1,
				vec![String::from("diagnostic")],
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn candidate_failures_continue_but_first_old_candidate_stops_path_search() {
		let runtime = FakeRuntime::default();
		let directories = [
			Path::new("/first"),
			Path::new("/second"),
			Path::new("/third"),
		];
		runtime.set_path(&directories);
		for directory in directories {
			runtime.add_directory(directory);
			runtime.add_program(&directory.join("copilot"));
		}
		runtime.push_process_result(Ok(captured_exit(9, b"", b"broken candidate")));
		runtime.push_process_result(Ok(captured_exit(0, b"1.0.81", b"")));

		let selection =
			select_candidate(&runtime, &InterpreterInventory::default()).expect("select candidate");

		assert_eq!(
			(
				selection,
				runtime
					.commands
					.borrow()
					.iter()
					.map(|(command, mode)| (PathBuf::from(command.program()), *mode))
					.collect::<Vec<_>>(),
				runtime.diagnostics.borrow().clone(),
			),
			(
				CandidateSelection::Old {
					path: PathBuf::from("/second/copilot"),
					version: CliVersion {
						major: 1,
						minor: 0,
						patch: 81,
					},
				},
				vec![
					(
						PathBuf::from("/first/copilot"),
						SupervisionMode::CapturedVersionProbe(ProbeLimits::PRODUCTION),
					),
					(
						PathBuf::from("/second/copilot"),
						SupervisionMode::CapturedVersionProbe(ProbeLimits::PRODUCTION),
					),
				],
				vec![String::from(
					"candidate \"/first/copilot\" failed its version probe: process exited with code 9; stderr: broken candidate",
				)],
			)
		);
	}

	#[test]
	fn windows_interpreter_inventory_requires_version_proof() {
		let runtime = FakeRuntime::default();
		let directories = [
			Path::new("/old"),
			Path::new("/modern"),
			Path::new("/legacy"),
		];
		runtime.set_path(&directories);
		runtime
			.environment
			.borrow_mut()
			.insert(String::from("ComSpec"), OsString::from("/cmd.exe"));
		runtime.add_program(Path::new("/cmd.exe"));
		runtime.add_program(Path::new("/old/pwsh.exe"));
		runtime.add_program(Path::new("/modern/pwsh.exe"));
		runtime.add_program(Path::new("/legacy/powershell.exe"));
		runtime.push_process_result(Ok(captured_exit(0, b"7.2.9", b"")));
		runtime.push_process_result(Ok(captured_exit(0, b"7.3.1", b"")));

		let inventory = build_interpreter_inventory(&runtime, Some(HostTarget::WindowsX64))
			.expect("build interpreter inventory");

		assert_eq!(
			(
				inventory,
				runtime
					.commands
					.borrow()
					.iter()
					.map(|(command, mode)| (PathBuf::from(command.program()), *mode))
					.collect::<Vec<_>>(),
			),
			(
				InterpreterInventory {
					command_shell: Some(PathBuf::from("/cmd.exe")),
					powershell_7_3_or_newer: Some(PathBuf::from("/modern/pwsh.exe")),
					windows_powershell_5_1: None,
				},
				vec![
					(
						PathBuf::from("/old/pwsh.exe"),
						SupervisionMode::CapturedVersionProbe(ProbeLimits::PRODUCTION),
					),
					(
						PathBuf::from("/modern/pwsh.exe"),
						SupervisionMode::CapturedVersionProbe(ProbeLimits::PRODUCTION),
					),
				],
			)
		);
	}

	#[test]
	fn windows_interpreter_inventory_falls_back_to_verified_5_1() {
		let runtime = FakeRuntime::default();
		let directories = [Path::new("/hosts")];
		runtime.set_path(&directories);
		runtime.add_program(Path::new("/hosts/pwsh.exe"));
		runtime.add_program(Path::new("/hosts/powershell.exe"));
		runtime.push_process_result(Ok(captured_exit(0, b"7.2.0", b"")));
		runtime.push_process_result(Ok(captured_exit(0, b"5.1.22621.2506", b"")));

		let inventory = build_interpreter_inventory(&runtime, Some(HostTarget::WindowsArm64))
			.expect("build interpreter inventory");

		assert_eq!(
			inventory,
			InterpreterInventory {
				command_shell: None,
				powershell_7_3_or_newer: None,
				windows_powershell_5_1: Some(PathBuf::from("/hosts/powershell.exe")),
			}
		);
		assert_eq!(
			runtime.diagnostics.borrow().as_slice(),
			["ComSpec is unavailable"]
		);
	}

	#[test]
	fn missing_windows_interpreters_are_explicitly_absent() {
		let runtime = FakeRuntime::default();
		runtime.add_directory(Path::new("/empty"));
		runtime.set_path(&[Path::new("/empty")]);

		let inventory = build_interpreter_inventory(&runtime, Some(HostTarget::WindowsX64))
			.expect("build empty interpreter inventory");

		assert_eq!(
			(
				inventory,
				runtime.commands.borrow().len(),
				runtime.diagnostics.borrow().clone(),
			),
			(
				InterpreterInventory::default(),
				0,
				vec![String::from("ComSpec is unavailable")],
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn install_and_update_success_rediscover_from_the_first_path_entry() {
		let install = FakeRuntime::default();
		configure_script_installer(&install);
		install.add_directory(Path::new("/installed"));
		install.add_program(Path::new("/installed/copilot"));
		install.set_path(&[Path::new("/tools")]);
		install.push_prompt_response(PromptResponse::Accepted);
		install.push_process_result(Ok(interactive_exit(0)));
		install.push_process_result_with_path(
			Ok(interactive_exit(0)),
			&[Path::new("/installed"), Path::new("/tools")],
		);
		install.push_process_result(Ok(captured_exit(0, b"1.0.82", b"")));

		let install_action = prepare_workflow(
			&install,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		)
		.expect("prepare installed CLI");

		let update = FakeRuntime::default();
		configure_script_installer(&update);
		for directory in [Path::new("/old"), Path::new("/new")] {
			update.add_directory(directory);
			update.add_program(&directory.join("copilot"));
		}
		update.set_path(&[Path::new("/old"), Path::new("/tools")]);
		update.push_prompt_response(PromptResponse::Accepted);
		update.push_process_result(Ok(captured_exit(0, b"1.0.81", b"")));
		update.push_process_result(Ok(interactive_exit(0)));
		update.push_process_result_with_path(
			Ok(interactive_exit(0)),
			&[Path::new("/new"), Path::new("/old"), Path::new("/tools")],
		);
		update.push_process_result(Ok(captured_exit(0, b"1.0.83", b"")));

		let update_action = prepare_workflow(
			&update,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		)
		.expect("prepare updated CLI");

		assert_eq!(
			(
				action_path(install_action),
				install.prompts.borrow().clone(),
				action_path(update_action),
				update.prompts.borrow().clone(),
				update
					.commands
					.borrow()
					.iter()
					.map(|(command, _)| PathBuf::from(command.program()))
					.collect::<Vec<_>>(),
			),
			(
				Some(PathBuf::from("/installed/copilot")),
				vec![String::from("install")],
				Some(PathBuf::from("/new/copilot")),
				vec![String::from("update 1.0.81 to 1.0.82")],
				vec![
					PathBuf::from("/old/copilot"),
					PathBuf::from("/tools/curl"),
					PathBuf::from("/tools/bash"),
					PathBuf::from("/new/copilot"),
				],
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn post_update_shadowing_and_path_invisibility_do_not_prompt_twice() {
		let shadowed = FakeRuntime::default();
		configure_script_installer(&shadowed);
		for directory in [Path::new("/old"), Path::new("/new")] {
			shadowed.add_directory(directory);
			shadowed.add_program(&directory.join("copilot"));
		}
		shadowed.set_path(&[Path::new("/old"), Path::new("/tools")]);
		shadowed.push_prompt_response(PromptResponse::Accepted);
		shadowed.push_process_result(Ok(captured_exit(0, b"1.0.81", b"")));
		shadowed.push_process_result(Ok(interactive_exit(0)));
		shadowed.push_process_result_with_path(
			Ok(interactive_exit(0)),
			&[Path::new("/old"), Path::new("/new"), Path::new("/tools")],
		);
		shadowed.push_process_result(Ok(captured_exit(0, b"1.0.81", b"")));

		let shadowed_result = prepare_workflow(
			&shadowed,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		);

		let invisible = FakeRuntime::default();
		configure_script_installer(&invisible);
		invisible.set_path(&[Path::new("/tools")]);
		invisible.push_prompt_response(PromptResponse::Accepted);
		invisible.push_process_result(Ok(interactive_exit(0)));
		invisible.push_process_result(Ok(interactive_exit(0)));

		let invisible_result = prepare_workflow(
			&invisible,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		);

		assert_eq!(
			(
				shadowed_result,
				shadowed.prompts.borrow().clone(),
				shadowed
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("shadow")),
				invisible_result,
				invisible.prompts.borrow().clone(),
				invisible
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("restart the terminal")),
			),
			(
				Err(ApplicationExit::InternalFailure),
				vec![String::from("update 1.0.81 to 1.0.82")],
				true,
				Err(ApplicationExit::InternalFailure),
				vec![String::from("install")],
				true,
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn installer_failure_cancellation_and_unsupported_targets_are_terminal() {
		let failed = FakeRuntime::default();
		configure_script_installer(&failed);
		failed.set_path(&[Path::new("/tools")]);
		failed.push_prompt_response(PromptResponse::Accepted);
		failed.push_process_result(Ok(interactive_exit(9)));

		let failed_result = prepare_workflow(
			&failed,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		);

		let cancelled = FakeRuntime::default();
		configure_script_installer(&cancelled);
		cancelled.set_path(&[Path::new("/tools")]);
		cancelled.push_prompt_response(PromptResponse::Accepted);
		cancelled.push_process_result(Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation(Cancellation::Requested),
			captured_output: None,
		}));

		let cancelled_result = prepare_workflow(
			&cancelled,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		);

		let unsupported = FakeRuntime::default();
		let unsupported_result = prepare_workflow(
			&unsupported,
			Some(HostTarget::LinuxGnuArmhf),
			&InterpreterInventory::default(),
		);

		assert_eq!(
			(
				failed_result,
				failed.prompts.borrow().len(),
				failed.commands.borrow().len(),
				failed
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("stage Download")
						&& message.contains("NumericExit(9)")),
				cancelled_result,
				cancelled.prompts.borrow().len(),
				cancelled.commands.borrow().len(),
				unsupported_result,
				unsupported.prompts.borrow().len(),
				unsupported
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("ARMhf")),
			),
			(
				Err(ApplicationExit::InternalFailure),
				1,
				1,
				true,
				Err(ApplicationExit::Cancelled(130)),
				1,
				1,
				Err(ApplicationExit::InternalFailure),
				0,
				true,
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn supported_install_and_update_declines_exit_without_launch() {
		let install = FakeRuntime::default();
		install.add_directory(Path::new("/empty"));
		install.set_path(&[Path::new("/empty")]);
		install.push_prompt_response(PromptResponse::Declined);

		let install_exit = run(&install, Vec::new(), Some(HostTarget::LinuxGnuX64));

		let update = FakeRuntime::default();
		update.add_directory(Path::new("/old"));
		update.add_program(Path::new("/old/copilot"));
		update.set_path(&[Path::new("/old")]);
		update.push_prompt_response(PromptResponse::Declined);
		update.push_process_result(Ok(captured_exit(0, b"1.0.81", b"")));

		let update_exit = run(&update, Vec::new(), Some(HostTarget::LinuxGnuX64));

		assert_eq!(
			(
				install_exit,
				install.prompts.borrow().clone(),
				install.commands.borrow().len(),
				update_exit,
				update.prompts.borrow().clone(),
				update.commands.borrow().len(),
			),
			(
				0,
				vec![String::from("install")],
				0,
				0,
				vec![String::from("update 1.0.81 to 1.0.82")],
				1,
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn probe_limits_and_tool_discovery_errors_are_diagnosed() {
		let candidates = FakeRuntime::default();
		for directory in [Path::new("/timed-out"), Path::new("/working")] {
			candidates.add_directory(directory);
			candidates.add_program(&directory.join("copilot"));
		}
		candidates.set_path(&[Path::new("/timed-out"), Path::new("/working")]);
		candidates.push_process_result(Err(ProcessError::TimedOut {
			timeout: crate::model::ProbeTimeout::new(std::time::Duration::from_secs(30)),
			captured_output: CapturedOutput {
				stdout: Vec::new(),
				stderr: b"still running".to_vec(),
			},
		}));
		candidates.push_process_result(Ok(captured_exit(0, b"1.0.82", b"")));

		let selected = select_candidate(&candidates, &InterpreterInventory::default())
			.expect("continue after timeout");

		let tools = FakeRuntime::default();
		tools.add_directory(Path::new("/tools"));
		tools.add_program(Path::new("/tools/bash"));
		tools.set_path(&[Path::new("/tools")]);
		tools.inspection_errors.borrow_mut().insert(
			PathBuf::from("/tools/curl"),
			io::ErrorKind::PermissionDenied,
		);
		tools.push_prompt_response(PromptResponse::Accepted);

		let tool_result = prepare_workflow(
			&tools,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		);

		assert_eq!(
			(
				action_path(WorkflowAction::Launch(match selected {
					CandidateSelection::Launch(candidate) => candidate,
					other => panic!("expected launch candidate, got {other:?}"),
				})),
				candidates
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("/timed-out/copilot")
						&& message.contains("timed out")),
				tool_result,
				tools
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("/tools/curl")
						&& message.contains("PermissionDenied")),
				tools.commands.borrow().len(),
			),
			(
				Some(PathBuf::from("/working/copilot")),
				true,
				Err(ApplicationExit::InternalFailure),
				true,
				0,
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn spawn_failure_continues_and_probe_cancellation_stops_workflow() {
		let continuation = FakeRuntime::default();
		for directory in [Path::new("/failed"), Path::new("/working")] {
			continuation.add_directory(directory);
			continuation.add_program(&directory.join("copilot"));
		}
		continuation.set_path(&[Path::new("/failed"), Path::new("/working")]);
		continuation.push_process_result(Err(ProcessError::SpawnFailed {
			program: OsString::from("/failed/copilot"),
			error: SystemError {
				kind: io::ErrorKind::PermissionDenied,
				raw_os_error: Some(13),
			},
		}));
		continuation.push_process_result(Ok(captured_exit(0, b"1.0.82", b"")));

		let selected = select_candidate(&continuation, &InterpreterInventory::default())
			.expect("continue after spawn failure");

		let cancellation = FakeRuntime::default();
		for directory in [Path::new("/cancelled"), Path::new("/unused")] {
			cancellation.add_directory(directory);
			cancellation.add_program(&directory.join("copilot"));
		}
		cancellation.set_path(&[Path::new("/cancelled"), Path::new("/unused")]);
		cancellation.push_process_result(Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation(Cancellation::Requested),
			captured_output: None,
		}));

		let cancelled = prepare_workflow(
			&cancellation,
			Some(HostTarget::LinuxGnuX64),
			&InterpreterInventory::default(),
		);

		assert_eq!(
			(
				action_path(WorkflowAction::Launch(match selected {
					CandidateSelection::Launch(candidate) => candidate,
					other => panic!("expected launch candidate, got {other:?}"),
				})),
				continuation.commands.borrow().len(),
				continuation
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("/failed/copilot")
						&& message.contains("could not start")),
				cancelled,
				cancellation.commands.borrow().len(),
				cancellation.prompts.borrow().len(),
			),
			(
				Some(PathBuf::from("/working/copilot")),
				2,
				true,
				Err(ApplicationExit::Cancelled(130)),
				1,
				0,
			)
		);
	}

	#[cfg(not(windows))]
	fn action_path(action: WorkflowAction) -> Option<PathBuf> {
		match action {
			WorkflowAction::Launch(candidate) => Some(candidate.discovered_path().to_path_buf()),
			WorkflowAction::Exit(_) => None,
		}
	}

	#[cfg(not(windows))]
	#[test]
	fn clear_forwarding_compatible_and_unparseable_launch_use_the_exact_path() {
		let compatible = FakeRuntime::default();
		compatible.add_directory(Path::new("/cli"));
		compatible.add_program(Path::new("/cli/copilot"));
		compatible.set_path(&[Path::new("/cli")]);
		compatible.push_process_result(Ok(captured_exit(0, b"1.0.82", b"")));
		compatible.push_process_result(Ok(interactive_exit(73)));

		let compatible_exit = run(
			&compatible,
			vec![
				OsString::from("--clear"),
				OsString::from("--clear"),
				OsString::new(),
				OsString::from("value"),
			],
			Some(HostTarget::LinuxGnuX64),
		);

		let unparseable = FakeRuntime::default();
		unparseable.add_directory(Path::new("/other"));
		unparseable.add_program(Path::new("/other/copilot"));
		unparseable.set_path(&[Path::new("/other")]);
		unparseable.push_process_result(Ok(captured_exit(0, b"development build", b"")));
		unparseable.push_process_result(Ok(interactive_exit(0)));

		let unparseable_exit = run(
			&unparseable,
			vec![OsString::from("argument")],
			Some(HostTarget::LinuxGnuX64),
		);

		let commands = compatible.commands.borrow();
		let final_arguments = match commands[1].0.arguments() {
			CommandArguments::Native(arguments) => arguments.clone(),
			CommandArguments::WindowsCommand { .. } => panic!("expected native command"),
		};
		assert_eq!(
			(
				compatible_exit,
				compatible.clears.get(),
				PathBuf::from(commands[0].0.program()),
				PathBuf::from(commands[1].0.program()),
				commands[1].1,
				final_arguments,
				unparseable_exit,
				unparseable.commands.borrow().len(),
			),
			(
				73,
				1,
				PathBuf::from("/cli/copilot"),
				PathBuf::from("/cli/copilot"),
				SupervisionMode::FinalInteractiveCli,
				vec![
					OsString::from("--clear"),
					OsString::new(),
					OsString::from("value"),
				],
				0,
				2,
			)
		);
	}

	#[test]
	fn final_exit_mapping_covers_numeric_signal_cancellation_and_internal_failure() {
		let numeric = FakeRuntime::default();
		numeric.push_process_result(Ok(interactive_exit(301)));
		let numeric_exit = launch_candidate(
			&numeric,
			direct_candidate("/numeric"),
			vec![OsString::from("arg")],
		)
		.code();

		let signalled = FakeRuntime::default();
		signalled.push_process_result(Ok(ProcessOutcome {
			termination: ProcessTermination::UnixSignal(9),
			captured_output: None,
		}));
		let signal_exit =
			launch_candidate(&signalled, direct_candidate("/signalled"), Vec::new()).code();

		let cancelled = FakeRuntime::default();
		cancelled.push_process_result(Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation(Cancellation::Requested),
			captured_output: None,
		}));
		let cancellation_exit =
			launch_candidate(&cancelled, direct_candidate("/cancelled"), Vec::new()).code();

		let failed = FakeRuntime::default();
		failed.push_process_result(Err(ProcessError::SpawnFailed {
			program: OsString::from("/failed"),
			error: SystemError {
				kind: io::ErrorKind::PermissionDenied,
				raw_os_error: Some(13),
			},
		}));
		let failure_exit =
			launch_candidate(&failed, direct_candidate("/failed"), Vec::new()).code();

		assert_eq!(
			(
				numeric_exit,
				signal_exit,
				cancellation_exit,
				failure_exit,
				failed.diagnostics.borrow().clone(),
			),
			(
				301,
				137,
				130,
				1,
				vec![String::from(
					"failed to launch candidate \"/failed\": could not start \"/failed\": PermissionDenied (OS error 13)",
				)],
			)
		);
	}

	fn direct_candidate(path: &str) -> Candidate {
		Candidate::new(
			PathBuf::from(path),
			PathBuf::from(path),
			FileIdentityState::Unsupported,
			CandidateKind::UnixExecutable,
		)
	}
}
