/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::OsString;
#[cfg(any(windows, test))]
use std::path::Path;
use std::path::PathBuf;

use crate::candidate::{discover, DiscoveryDiagnosticKind, DiscoveryError, DiscoveryOperation};
use crate::command::{resolve_candidate, InterpreterInventory};
use crate::install::{
	discover_tools, installer_plan, run_installer, HostTarget, InstallerAttempt,
	InstallerAttemptResult, InstallerPlanError, InstallerResult, UnsupportedTarget,
};
use crate::invocation::{self, Invocation};
use crate::model::{
	Cancellation, Candidate, ProcessError, ProcessOutcome, ProcessTermination, ResolvedCandidate,
	SupervisionMode,
};
#[cfg(any(windows, test))]
use crate::model::{
	CommandArguments, CommandSpec, DiscoveredCandidate, DiscoveredFileKind, LaunchAdapter,
	ProbeLimits,
};
use crate::runtime::prompt::INSTALL_DOCUMENTATION_URL;
use crate::runtime::{InspectedFileType, PromptResponse, Runtime};
use crate::setup;
#[cfg(any(windows, test))]
use crate::version::{first_version, CliVersion};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DiscoveryCycle {
	Initial,
	AfterInstall,
}

#[derive(Debug, Eq, PartialEq)]
enum CandidateSelection {
	Launch(Candidate),
	Missing,
}

/// Exit code when Copilot CLI is missing and there is no terminal to offer an install: the code a shell uses for a
/// command it can't find.
const NOT_INSTALLED_EXIT_CODE: i32 = 127;

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

/// Interpreters for script candidates. PowerShell is located only when a `.ps1` candidate needs it, because running
/// it to check its version takes hundreds of milliseconds.
#[derive(Debug, Default)]
struct Interpreters {
	inventory: InterpreterInventory,
	#[cfg(any(windows, test))]
	power_shell_located: bool,
}

fn command_shell_interpreters<R: Runtime>(runtime: &R, target: Option<HostTarget>) -> Interpreters {
	if !matches!(
		target,
		Some(HostTarget::WindowsX64 | HostTarget::WindowsArm64)
	) {
		return Interpreters::default();
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
	let mut interpreters = Interpreters::default();
	interpreters.inventory.command_shell = command_shell;
	interpreters
}

#[cfg(any(windows, test))]
fn locate_power_shell<R: Runtime>(
	runtime: &R,
	interpreters: &mut Interpreters,
) -> Result<(), ApplicationExit> {
	if interpreters.power_shell_located {
		return Ok(());
	}
	interpreters.power_shell_located = true;
	let directories = path_directories(runtime);
	interpreters.inventory.powershell_7_3_or_newer =
		select_power_shell(runtime, &directories, "pwsh.exe", is_modern_power_shell)?;
	if interpreters.inventory.powershell_7_3_or_newer.is_none() {
		interpreters.inventory.windows_powershell_5_1 = select_power_shell(
			runtime,
			&directories,
			"powershell.exe",
			is_windows_power_shell_5_1,
		)?;
	}
	Ok(())
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

#[cfg(any(windows, test))]
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

#[cfg(any(windows, test))]
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

#[cfg(any(windows, test))]
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

#[cfg(any(windows, test))]
fn is_modern_power_shell(version: CliVersion) -> bool {
	(version.major, version.minor, version.patch) >= (7, 3, 0)
}

#[cfg(any(windows, test))]
fn is_windows_power_shell_5_1(version: CliVersion) -> bool {
	version.major == 5 && version.minor == 1
}

/// Selects the first Copilot CLI candidate that can be launched, without running any candidate. A candidate whose
/// interpreter is unavailable is skipped. The Copilot CLI keeps itself up to date, so there is no version check.
fn select_candidate<R: Runtime>(
	runtime: &R,
	interpreters: &mut Interpreters,
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

	#[cfg(not(any(windows, test)))]
	let selection = discovery.candidates.into_iter().next().map(|discovered| {
		let ResolvedCandidate::Usable(candidate) =
			resolve_candidate(discovered, &interpreters.inventory);
		candidate
	});
	#[cfg(any(windows, test))]
	let selection = {
		let mut selection = None;
		for discovered in discovery.candidates {
			if discovered.kind() == DiscoveredFileKind::PowerShellScript {
				locate_power_shell(runtime, interpreters)?;
			}
			let path = discovered.discovered_path().to_path_buf();
			match resolve_candidate(discovered, &interpreters.inventory) {
				ResolvedCandidate::Usable(candidate) => {
					selection = Some(candidate);
					break;
				}
				ResolvedCandidate::Unusable(reason) => runtime.write_diagnostic(&format!(
					"candidate {path:?} is unusable because its interpreter is unavailable: {reason:?}"
				)),
			}
		}
		selection
	};
	Ok(selection.map_or(CandidateSelection::Missing, CandidateSelection::Launch))
}

fn prepare_workflow<R: Runtime>(
	runtime: &R,
	target: Option<HostTarget>,
	interpreters: &mut Interpreters,
) -> Result<WorkflowAction, ApplicationExit> {
	let mut cycle = DiscoveryCycle::Initial;
	loop {
		match (cycle, select_candidate(runtime, interpreters)?) {
			(_, CandidateSelection::Launch(candidate)) => {
				return Ok(WorkflowAction::Launch(candidate));
			}
			(DiscoveryCycle::Initial, CandidateSelection::Missing) => {
				match request_install(runtime, target)? {
					PromptResponse::Declined => return Ok(WorkflowAction::Exit(0)),
					PromptResponse::Accepted => {
						if let Some(candidate) =
							installed_msi_candidate(runtime, target, interpreters)
						{
							return Ok(WorkflowAction::Launch(candidate));
						}
						cycle = DiscoveryCycle::AfterInstall;
					}
				}
			}
			(DiscoveryCycle::AfterInstall, CandidateSelection::Missing) => {
				runtime.write_diagnostic(
					"the installation completed, but GitHub Copilot CLI is not visible in the current PATH; restart the terminal or update PATH and retry",
				);
				return Err(ApplicationExit::InternalFailure);
			}
		}
	}
}

/// The Copilot CLI that GitHub's per-user MSI installs, launched by its full path right after installing: the MSI adds
/// its folder to the user PATH, which this process and its terminal don't see yet.
#[cfg(any(windows, test))]
fn installed_msi_candidate<R: Runtime>(
	runtime: &R,
	target: Option<HostTarget>,
	interpreters: &Interpreters,
) -> Option<Candidate> {
	if !matches!(
		target,
		Some(HostTarget::WindowsX64 | HostTarget::WindowsArm64)
	) {
		return None;
	}
	let path = PathBuf::from(runtime.environment_variable("LOCALAPPDATA")?)
		.join(setup::CLI_INSTALL_FOLDER)
		.join("copilot.exe");
	let inspection = runtime
		.inspect_path(&path)
		.ok()
		.flatten()
		.filter(|inspection| inspection.file_type == InspectedFileType::RegularFile)?;
	let discovered = DiscoveredCandidate::new(
		path,
		inspection.canonical_path,
		inspection.file_identity,
		DiscoveredFileKind::WindowsExecutable,
	);
	match resolve_candidate(discovered, &interpreters.inventory) {
		ResolvedCandidate::Usable(candidate) => Some(candidate),
		ResolvedCandidate::Unusable(_) => None,
	}
}

#[cfg(not(any(windows, test)))]
fn installed_msi_candidate<R: Runtime>(
	_runtime: &R,
	_target: Option<HostTarget>,
	_interpreters: &Interpreters,
) -> Option<Candidate> {
	None
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

	let mut interpreters = command_shell_interpreters(runtime, target);
	let result = prepare_workflow(runtime, target, &mut interpreters).map(|action| match action {
		WorkflowAction::Launch(candidate) => launch_candidate(runtime, candidate, arguments),
		WorkflowAction::Exit(code) => ApplicationExit::Code(code),
	});
	result.map_or_else(ApplicationExit::code, ApplicationExit::code)
}

fn launch_candidate<R: Runtime>(
	runtime: &R,
	candidate: Candidate,
	arguments: Vec<OsString>,
) -> ApplicationExit {
	let path = candidate.discovered_path().to_path_buf();
	let command = match candidate.command(arguments) {
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

fn request_install<R: Runtime>(
	runtime: &R,
	target: Option<HostTarget>,
) -> Result<PromptResponse, ApplicationExit> {
	if runtime.copilot_cli_command_disabled() {
		runtime.write_diagnostic(&format!(
			"GitHub Copilot CLI was not found. Installing it from VS Code is turned off by the {} policy; contact your administrator.",
			setup::COPILOT_CLI_COMMAND_POLICY
		));
		return Err(ApplicationExit::Code(
			setup::InstallStatus::Policy.exit_code(),
		));
	}
	if !runtime.can_prompt() {
		runtime.write_diagnostic(&format!(
			"GitHub Copilot CLI was not found. Run copilot in a terminal to install it, or see {INSTALL_DOCUMENTATION_URL}"
		));
		return Err(ApplicationExit::Code(NOT_INSTALLED_EXIT_CODE));
	}
	let Some(target) = target else {
		report_unsupported_target(runtime, None);
		return Err(ApplicationExit::InternalFailure);
	};
	if let Some(unsupported) = unsupported_target(target) {
		report_unsupported_target(runtime, Some(unsupported));
		return Err(ApplicationExit::InternalFailure);
	}

	let response = runtime.prompt().map_err(|error| {
		runtime.write_diagnostic(&format!("failed to read the install prompt: {error}"));
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
	let routes = installer_plan(target, &tools).map_err(|error| {
		report_installer_plan_error(runtime, &error);
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
				"the installation failed at installer level {failure:?}; install GitHub Copilot CLI manually"
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

fn report_unsupported_target<R: Runtime>(runtime: &R, unsupported: Option<UnsupportedTarget>) {
	match unsupported {
		Some(target) => runtime.write_diagnostic(&format!(
			"automatic installation is unavailable: {}",
			target.guidance()
		)),
		None => runtime.write_diagnostic(
			"automatic installation is unavailable on this target; install GitHub Copilot CLI manually",
		),
	}
}

fn report_installer_plan_error<R: Runtime>(runtime: &R, error: &InstallerPlanError) {
	match error {
		InstallerPlanError::Unsupported(target) => {
			report_unsupported_target(runtime, Some(*target));
		}
		InstallerPlanError::MissingPrerequisites(tools) => runtime.write_diagnostic(&format!(
			"cannot install; missing installer prerequisites: {tools:?}"
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

#[cfg(any(windows, test))]
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
		EnvironmentEffects, FileSystemEffects, InspectedFileType, PathInspection, PolicyEffects,
		ProcessEffects, PromptResponse, UserInteractionEffects,
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
		policy_disabled: Cell<bool>,
		no_terminal: Cell<bool>,
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
					file_size: 0,
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
				policy_disabled: Cell::new(false),
				no_terminal: Cell::new(false),
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
					file_size: 0,
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
					file_size: 0,
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

		fn read_directory(&self, path: &Path) -> io::Result<Vec<OsString>> {
			Ok(self
				.inspections
				.borrow()
				.keys()
				.filter(|entry| entry.parent() == Some(path))
				.filter_map(|entry| entry.file_name().map(OsString::from))
				.collect())
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

		fn can_prompt(&self) -> bool {
			!self.no_terminal.get()
		}

		fn prompt(&self) -> io::Result<PromptResponse> {
			self.prompts.borrow_mut().push(String::from("install"));
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

	impl PolicyEffects for FakeRuntime {
		fn copilot_cli_command_disabled(&self) -> bool {
			self.policy_disabled.get()
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

	/// The file name that discovery launches on this host.
	const CLI: &str = if cfg!(windows) {
		"copilot.exe"
	} else {
		"copilot"
	};

	fn cli_path(directory: &str) -> PathBuf {
		Path::new(directory).join(CLI)
	}

	fn programs(runtime: &FakeRuntime) -> Vec<PathBuf> {
		runtime
			.commands
			.borrow()
			.iter()
			.map(|(command, _)| PathBuf::from(command.program()))
			.collect()
	}

	#[test]
	fn private_state_and_fake_runtime_are_ready() {
		let runtime = FakeRuntime::default();
		runtime.clear_terminal().expect("record clear");
		runtime.write_diagnostic("diagnostic");

		assert_eq!(
			(
				DiscoveryCycle::Initial,
				DiscoveryCycle::AfterInstall,
				CandidateSelection::Missing,
				ApplicationExit::Code(17).code(),
				ApplicationExit::Cancelled(130).code(),
				ApplicationExit::InternalFailure.code(),
				runtime.clears.get(),
				runtime.diagnostics.into_inner(),
			),
			(
				DiscoveryCycle::Initial,
				DiscoveryCycle::AfterInstall,
				CandidateSelection::Missing,
				17,
				130,
				1,
				1,
				vec![String::from("diagnostic")],
			)
		);
	}

	#[test]
	fn the_first_candidate_launches_without_being_run_first() {
		let runtime = FakeRuntime::default();
		for directory in ["/first", "/second"] {
			runtime.add_directory(Path::new(directory));
			runtime.add_program(&cli_path(directory));
		}
		runtime.set_path(&[Path::new("/first"), Path::new("/second")]);
		runtime.push_process_result(Ok(interactive_exit(73)));

		let exit = run(
			&runtime,
			vec![
				OsString::from("--vscode-shim"),
				OsString::from("clear"),
				OsString::from("--clear"),
				OsString::new(),
				OsString::from("value"),
			],
			Some(HostTarget::LinuxGnuX64),
		);

		assert_eq!(
			(
				exit,
				runtime.clears.get(),
				runtime
					.commands
					.borrow()
					.iter()
					.map(|(command, mode)| (
						PathBuf::from(command.program()),
						command.arguments().clone(),
						*mode
					))
					.collect::<Vec<_>>(),
			),
			(
				73,
				1,
				vec![(
					cli_path("/first"),
					CommandArguments::Native(vec![
						OsString::from("--clear"),
						OsString::new(),
						OsString::from("value"),
					]),
					SupervisionMode::FinalInteractiveCli,
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

		let mut interpreters = command_shell_interpreters(&runtime, Some(HostTarget::WindowsX64));
		locate_power_shell(&runtime, &mut interpreters).expect("locate PowerShell");

		assert_eq!(
			(
				interpreters.inventory,
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

		let mut interpreters = command_shell_interpreters(&runtime, Some(HostTarget::WindowsArm64));
		locate_power_shell(&runtime, &mut interpreters).expect("locate PowerShell");

		assert_eq!(
			(interpreters.inventory, runtime.diagnostics.borrow().clone()),
			(
				InterpreterInventory {
					command_shell: None,
					powershell_7_3_or_newer: None,
					windows_powershell_5_1: Some(PathBuf::from("/hosts/powershell.exe")),
				},
				vec![String::from("ComSpec is unavailable")],
			)
		);
	}

	#[test]
	fn missing_windows_interpreters_are_explicitly_absent() {
		let runtime = FakeRuntime::default();
		runtime.add_directory(Path::new("/empty"));
		runtime.set_path(&[Path::new("/empty")]);

		let mut interpreters = command_shell_interpreters(&runtime, Some(HostTarget::WindowsX64));
		locate_power_shell(&runtime, &mut interpreters).expect("locate PowerShell");

		assert_eq!(
			(
				interpreters.inventory,
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

	#[cfg(windows)]
	#[test]
	fn power_shell_is_located_only_for_ps1_candidates() {
		let with_hosts = |script: &str| {
			let runtime = FakeRuntime::default();
			for directory in ["/cli", "/hosts"] {
				runtime.add_directory(Path::new(directory));
			}
			runtime.add_program(&Path::new("/cli").join(script));
			runtime.add_program(Path::new("/hosts/pwsh.exe"));
			runtime.set_path(&[Path::new("/cli"), Path::new("/hosts")]);
			runtime
		};

		let native = with_hosts("copilot.exe");
		native.push_process_result(Ok(interactive_exit(0)));
		let native_exit = run(&native, Vec::new(), Some(HostTarget::WindowsX64));

		let script = with_hosts("copilot.ps1");
		script.push_process_result(Ok(captured_exit(0, b"7.4.6", b"")));
		script.push_process_result(Ok(interactive_exit(0)));
		let script_exit = run(&script, Vec::new(), Some(HostTarget::WindowsX64));

		assert_eq!(
			(
				native_exit,
				programs(&native),
				script_exit,
				programs(&script)
			),
			(
				0,
				vec![Path::new("/cli").join("copilot.exe")],
				0,
				vec![
					PathBuf::from("/hosts/pwsh.exe"),
					PathBuf::from("/hosts/pwsh.exe")
				],
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn install_success_rediscovers_from_the_first_path_entry() {
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

		let action = prepare_workflow(
			&install,
			Some(HostTarget::LinuxGnuX64),
			&mut Interpreters::default(),
		)
		.expect("prepare installed CLI");

		assert_eq!(
			(
				action_path(action),
				install.prompts.borrow().clone(),
				programs(&install),
			),
			(
				Some(PathBuf::from("/installed/copilot")),
				vec![String::from("install")],
				vec![PathBuf::from("/tools/curl"), PathBuf::from("/tools/bash")],
			)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn an_install_that_is_not_visible_in_path_does_not_prompt_twice() {
		let invisible = FakeRuntime::default();
		configure_script_installer(&invisible);
		invisible.set_path(&[Path::new("/tools")]);
		invisible.push_prompt_response(PromptResponse::Accepted);
		invisible.push_process_result(Ok(interactive_exit(0)));
		invisible.push_process_result(Ok(interactive_exit(0)));

		let result = prepare_workflow(
			&invisible,
			Some(HostTarget::LinuxGnuX64),
			&mut Interpreters::default(),
		);

		assert_eq!(
			(
				result,
				invisible.prompts.borrow().clone(),
				invisible
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("restart the terminal")),
			),
			(
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
			&mut Interpreters::default(),
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
			&mut Interpreters::default(),
		);

		let unsupported = FakeRuntime::default();
		let unsupported_result = prepare_workflow(
			&unsupported,
			Some(HostTarget::LinuxGnuArmhf),
			&mut Interpreters::default(),
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

	#[test]
	fn windows_installs_launch_the_msi_cli_by_its_full_path() {
		let runtime = FakeRuntime::default();
		runtime.add_directory(Path::new("/stale-path"));
		runtime.set_path(&[Path::new("/stale-path")]);
		runtime
			.environment
			.borrow_mut()
			.insert(String::from("LOCALAPPDATA"), OsString::from("/local"));
		let installed = Path::new("/local")
			.join(setup::CLI_INSTALL_FOLDER)
			.join("copilot.exe");
		runtime.push_prompt_response(PromptResponse::Accepted);
		// The interactive install succeeds and creates the CLI outside the terminal's PATH.
		runtime.push_process_result(Ok(interactive_exit(0)));
		runtime.push_process_result(Ok(interactive_exit(5)));
		runtime.add_program(&installed);

		let exit = run(
			&runtime,
			vec![OsString::from("-p")],
			Some(HostTarget::WindowsX64),
		);

		assert_eq!(
			(exit, runtime.prompts.borrow().len(), programs(&runtime)),
			(5, 1, vec![PathBuf::from("/shim"), installed])
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn a_declined_install_exits_without_launch() {
		let install = FakeRuntime::default();
		install.add_directory(Path::new("/empty"));
		install.set_path(&[Path::new("/empty")]);
		install.push_prompt_response(PromptResponse::Declined);

		let exit = run(&install, Vec::new(), Some(HostTarget::LinuxGnuX64));

		assert_eq!(
			(
				exit,
				install.prompts.borrow().clone(),
				install.commands.borrow().len(),
			),
			(0, vec![String::from("install")], 0)
		);
	}

	#[cfg(not(windows))]
	#[test]
	fn tool_discovery_errors_are_diagnosed() {
		let tools = FakeRuntime::default();
		tools.add_directory(Path::new("/tools"));
		tools.add_program(Path::new("/tools/bash"));
		tools.set_path(&[Path::new("/tools")]);
		tools.inspection_errors.borrow_mut().insert(
			PathBuf::from("/tools/curl"),
			io::ErrorKind::PermissionDenied,
		);
		tools.push_prompt_response(PromptResponse::Accepted);

		let result = prepare_workflow(
			&tools,
			Some(HostTarget::LinuxGnuX64),
			&mut Interpreters::default(),
		);

		assert_eq!(
			(
				result,
				tools
					.diagnostics
					.borrow()
					.iter()
					.any(|message| message.contains("/tools/curl")
						&& message.contains("PermissionDenied")),
				tools.commands.borrow().len(),
			),
			(Err(ApplicationExit::InternalFailure), true, 0)
		);
	}

	#[test]
	fn without_a_terminal_a_missing_cli_exits_127_without_a_prompt() {
		let missing = FakeRuntime::default();
		missing.no_terminal.set(true);
		missing.add_directory(Path::new("/empty"));
		missing.set_path(&[Path::new("/empty")]);

		let exit = run(
			&missing,
			vec![OsString::from("-p")],
			Some(HostTarget::LinuxGnuX64),
		);

		assert_eq!(
			(exit, missing.prompts.borrow().len(), missing.diagnostics.borrow().clone()),
			(
				127,
				0,
				vec![format!(
					"GitHub Copilot CLI was not found. Run copilot in a terminal to install it, or see {INSTALL_DOCUMENTATION_URL}"
				)]
			)
		);
	}

	#[test]
	fn policy_blocks_install_but_launches_an_installed_cli() {
		let policy_runtime = |directory: &str| {
			let runtime = FakeRuntime::default();
			runtime.policy_disabled.set(true);
			runtime.add_directory(Path::new(directory));
			runtime.set_path(&[Path::new(directory)]);
			runtime
		};

		let missing = policy_runtime("/empty");
		let missing_exit = run(&missing, Vec::new(), Some(HostTarget::LinuxGnuX64));

		let installed = policy_runtime("/cli");
		installed.add_program(&cli_path("/cli"));
		installed.push_process_result(Ok(interactive_exit(7)));
		let installed_exit = run(
			&installed,
			vec![OsString::from("--resume")],
			Some(HostTarget::LinuxGnuX64),
		);

		assert_eq!(
			(
				missing_exit,
				missing.prompts.borrow().len(),
				missing.diagnostics.borrow().clone(),
				installed_exit,
				programs(&installed),
			),
			(
				10,
				0,
				vec![String::from(
					"GitHub Copilot CLI was not found. Installing it from VS Code is turned off by the CopilotCliCommand policy; contact your administrator."
				)],
				7,
				vec![cli_path("/cli")],
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
