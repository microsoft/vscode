/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::OsString;
#[cfg(any(windows, test))]
use std::path::{Path, PathBuf};

#[cfg(any(windows, test))]
use crate::candidate::path_directories;
use crate::candidate::{discover, DiscoveryDiagnosticKind, DiscoveryError};
use crate::command::{resolve_candidate, InterpreterInventory};
use crate::install::{
	discover_tools, installer_plan, run_installer, HostTarget, InstallerAttempt,
	InstallerAttemptResult, InstallerPlanError, InstallerResult, UnsupportedTarget,
};
use crate::invocation::{self, Invocation};
use crate::model::{
	Candidate, ProcessError, ProcessOutcome, ProcessTermination, ResolvedCandidate,
	SupervisionMode, SystemError,
};
#[cfg(any(windows, test))]
use crate::model::{CommandArguments, CommandSpec, DiscoveredFileKind, ProbeLimits};
use crate::runtime::prompt::INSTALL_DOCUMENTATION_URL;
#[cfg(any(windows, test))]
use crate::runtime::InspectedFileType;
use crate::runtime::{PromptResponse, Runtime};
use crate::setup;
#[cfg(any(windows, test))]
use crate::version::{first_version, PowerShellVersion};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum DiscoveryCycle {
	Initial,
	AfterInstall,
}

/// Exit code when Copilot CLI is missing and there is no terminal to offer an install: the code a shell uses for a
/// command it can't find.
const NOT_INSTALLED_EXIT_CODE: i32 = 127;

/// Exit code after Ctrl+C, as a shell reports a command that SIGINT ended.
const CANCELLED_EXIT_CODE: i32 = 130;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum ApplicationExit {
	Code(i32),
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
			Self::Code(code) => code,
			Self::InternalFailure => 1,
		}
	}
}

/// Interpreters for script candidates, located only when a candidate needs them. Running PowerShell to check its
/// version takes hundreds of milliseconds.
#[derive(Debug, Default)]
struct Interpreters {
	inventory: InterpreterInventory,
	#[cfg(any(windows, test))]
	command_shell_located: bool,
	#[cfg(any(windows, test))]
	power_shell_located: bool,
}

#[cfg(any(windows, test))]
fn locate_command_shell<R: Runtime>(runtime: &R, interpreters: &mut Interpreters) {
	if std::mem::replace(&mut interpreters.command_shell_located, true) {
		return;
	}
	interpreters.inventory.command_shell = match runtime
		.environment_variable("ComSpec")
		.filter(|value| !value.is_empty())
	{
		Some(value) => usable_program(runtime, PathBuf::from(value), "ComSpec"),
		None => {
			runtime.write_diagnostic("ComSpec is unavailable");
			None
		}
	};
}

#[cfg(any(windows, test))]
fn locate_power_shell<R: Runtime>(
	runtime: &R,
	interpreters: &mut Interpreters,
) -> Result<(), ApplicationExit> {
	if std::mem::replace(&mut interpreters.power_shell_located, true) {
		return Ok(());
	}
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

#[cfg(any(windows, test))]
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
		// An app execution alias, such as PowerShell from the Microsoft Store, can be started but not opened
		// (ERROR_CANT_ACCESS_FILE).
		Err(error) if error.raw_os_error() == Some(1920) => Some(path),
		Err(error) => {
			runtime.write_diagnostic(&format!("failed to inspect {role} path {path:?}: {error}"));
			None
		}
	}
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
	F: Fn(PowerShellVersion) -> bool,
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
) -> Result<Option<PowerShellVersion>, ApplicationExit> {
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
	);
	let problem = match runtime.supervise(
		&command,
		SupervisionMode::CapturedVersionProbe(ProbeLimits::PRODUCTION),
	) {
		Ok(ProcessOutcome {
			termination: ProcessTermination::NumericExit(0),
			captured_output: Some(output),
		}) => match first_version(&output.stdout) {
			Some(version) => return Ok(Some(version)),
			None => String::from("returned an unparseable version"),
		},
		Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation,
			..
		}) => return Err(ApplicationExit::Code(CANCELLED_EXIT_CODE)),
		Ok(ProcessOutcome {
			termination: ProcessTermination::NumericExit(code),
			..
		}) => format!("exited with code {code}"),
		#[cfg(any(unix, test))]
		Ok(ProcessOutcome {
			termination: ProcessTermination::UnixSignal(signal),
			..
		}) => format!("ended from signal {signal}"),
		Err(error) => describe_process_error(&error),
	};
	runtime.write_diagnostic(&format!("PowerShell host {path:?} is unusable: {problem}"));
	Ok(None)
}

#[cfg(any(windows, test))]
fn is_modern_power_shell(version: PowerShellVersion) -> bool {
	(version.major, version.minor) >= (7, 3)
}

#[cfg(any(windows, test))]
fn is_windows_power_shell_5_1(version: PowerShellVersion) -> bool {
	version.major == 5 && version.minor == 1
}

/// Selects the first Copilot CLI candidate that can be launched, without running any candidate. A candidate whose
/// interpreter is unavailable is skipped. The Copilot CLI keeps itself up to date, so there is no version check.
fn select_candidate<R: Runtime>(
	runtime: &R,
	interpreters: &mut Interpreters,
) -> Result<Option<Candidate>, ApplicationExit> {
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
				describe_system_error(&error)
			));
		}
	}

	// Unix candidates need no interpreter.
	#[cfg(not(any(windows, test)))]
	return Ok(discovery.candidates.into_iter().next().map(|discovered| {
		let ResolvedCandidate::Usable(candidate) =
			resolve_candidate(discovered, &interpreters.inventory);
		candidate
	}));

	#[cfg(any(windows, test))]
	{
		for discovered in discovery.candidates {
			match discovered.kind {
				DiscoveredFileKind::CommandScript | DiscoveredFileKind::BatchScript => {
					locate_command_shell(runtime, interpreters)
				}
				DiscoveredFileKind::PowerShellScript => locate_power_shell(runtime, interpreters)?,
				_ => {}
			}
			let path = discovered.path.clone();
			match resolve_candidate(discovered, &interpreters.inventory) {
				ResolvedCandidate::Usable(candidate) => return Ok(Some(candidate)),
				ResolvedCandidate::Unusable(reason) => runtime.write_diagnostic(&format!(
					"candidate {path:?} is unusable because its interpreter is unavailable: {reason:?}"
				)),
			}
		}
		Ok(None)
	}
}

fn prepare_workflow<R: Runtime>(
	runtime: &R,
	target: Option<HostTarget>,
	interpreters: &mut Interpreters,
) -> Result<WorkflowAction, ApplicationExit> {
	let mut cycle = DiscoveryCycle::Initial;
	loop {
		match (cycle, select_candidate(runtime, interpreters)?) {
			(_, Some(candidate)) => return Ok(WorkflowAction::Launch(candidate)),
			(DiscoveryCycle::Initial, None) => {
				match request_install(runtime, target)? {
					PromptResponse::Declined => return Ok(WorkflowAction::Exit(0)),
					// Discovery searches the MSI install folder after PATH, so it finds a Copilot CLI that was just
					// installed even though this terminal's PATH doesn't include it yet.
					PromptResponse::Accepted => cycle = DiscoveryCycle::AfterInstall,
				}
			}
			(DiscoveryCycle::AfterInstall, None) => {
				runtime.write_diagnostic(
					"the installation completed, but GitHub Copilot CLI is not visible in the current PATH; restart the terminal or update PATH and retry",
				);
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
	let invocation = invocation::parse(arguments);
	runtime.set_diagnostics_enabled(invocation.verbose);
	let (clear, arguments) = match invocation.result {
		Ok(Invocation::Launch { clear, arguments }) => (clear, arguments),
		// Commands for VS Code report and exit; they never launch the Copilot CLI.
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

	let mut interpreters = Interpreters::default();
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
	let command = match candidate.command(arguments) {
		Ok(command) => command,
		Err(error) => {
			runtime.write_diagnostic(&format!(
				"failed to build the final command for candidate {:?}: {error:?}",
				candidate.path
			));
			return ApplicationExit::InternalFailure;
		}
	};
	// On Unix the shim becomes the Copilot CLI, so this only returns if the CLI couldn't be started.
	match runtime.supervise(&command, SupervisionMode::FinalInteractiveCli) {
		Ok(ProcessOutcome {
			termination: ProcessTermination::NumericExit(code),
			..
		}) => ApplicationExit::Code(code),
		#[cfg(any(unix, test))]
		Ok(ProcessOutcome {
			termination: ProcessTermination::UnixSignal(signal),
			..
		}) => ApplicationExit::Code(128_i32.saturating_add(signal)),
		Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation,
			..
		}) => ApplicationExit::Code(CANCELLED_EXIT_CODE),
		Err(error) => {
			runtime.write_diagnostic(&format!(
				"failed to launch candidate {:?}: {}",
				candidate.path,
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

	let tools = discover_tools(runtime, target);
	let routes = installer_plan(target, &tools).map_err(|error| {
		report_installer_plan_error(runtime, &error);
		ApplicationExit::InternalFailure
	})?;
	match run_installer(runtime, &routes, &tools, runtime.diagnostics_enabled()) {
		InstallerResult::Succeeded { attempts } => {
			report_failed_installer_attempts(runtime, &attempts);
			Ok(PromptResponse::Accepted)
		}
		InstallerResult::Cancelled { attempts } => {
			report_installer_attempts(runtime, &attempts);
			Err(ApplicationExit::Code(CANCELLED_EXIT_CODE))
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
	runtime.write_diagnostic(&format!(
		"failed to identify the running shim{}: {}",
		error
			.path
			.as_ref()
			.map(|path| format!(" at {path:?}"))
			.unwrap_or_default(),
		describe_system_error(&error.error)
	));
}

fn describe_process_error(error: &ProcessError) -> String {
	match error {
		#[cfg(windows)]
		ProcessError::TimedOut(timeout) => format!("timed out after {timeout:?}"),
		#[cfg(windows)]
		ProcessError::OutputLimitExceeded(bytes) => {
			format!("exceeded the {bytes} byte output limit")
		}
		ProcessError::SpawnFailed { program, error } => format!(
			"could not start {:?}: {}",
			program,
			describe_system_error(error)
		),
		ProcessError::SupervisionFailed(diagnostic) => format!(
			"process supervision {:?} failed for {:?}: {}",
			diagnostic.operation,
			diagnostic.program,
			describe_system_error(&diagnostic.error)
		),
	}
}

/// The operating system's message for an error, in the user's display language.
fn describe_system_error(error: &SystemError) -> String {
	match error.raw_os_error {
		Some(code) => std::io::Error::from_raw_os_error(code).to_string(),
		None => format!("{:?}", error.kind),
	}
}
#[cfg(test)]
mod tests {
	use std::cell::{Cell, RefCell};
	use std::collections::{HashMap, VecDeque};
	use std::ffi::OsString;
	use std::io;
	use std::path::{Path, PathBuf};

	use super::*;
	use crate::model::{CandidateKind, CapturedOutput, FileIdentityState};
	use crate::runtime::{
		EnvironmentEffects, FileSystemEffects, PathInspection, PolicyEffects, ProcessEffects,
		UserInteractionEffects,
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
		diagnostics_enabled: Cell<bool>,
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
				diagnostics_enabled: Cell::new(true),
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
		fn set_diagnostics_enabled(&self, enabled: bool) {
			self.diagnostics_enabled.set(enabled);
		}

		fn diagnostics_enabled(&self) -> bool {
			self.diagnostics_enabled.get()
		}

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
			if self.diagnostics_enabled.get() {
				self.diagnostics.borrow_mut().push(message.to_owned());
			}
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
	fn the_first_candidate_launches_without_being_run_first() {
		let runtime = FakeRuntime::default();
		for directory in ["/first", "/second"] {
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
	fn candidate_discovery_diagnostics_require_verbose() {
		let configured_runtime = || {
			let runtime = FakeRuntime::default();
			runtime.add_program(&cli_path("/cli"));
			runtime.set_path(&[Path::new("/denied"), Path::new("/cli")]);
			runtime
				.inspection_errors
				.borrow_mut()
				.insert(cli_path("/denied"), io::ErrorKind::PermissionDenied);
			runtime.push_process_result(Ok(interactive_exit(0)));
			runtime
		};

		let quiet = configured_runtime();
		let quiet_exit = run(&quiet, Vec::new(), Some(HostTarget::LinuxGnuX64));

		let verbose = configured_runtime();
		let verbose_exit = run(
			&verbose,
			vec![OsString::from("--vscode-shim"), OsString::from("verbose")],
			Some(HostTarget::LinuxGnuX64),
		);

		assert_eq!(
			(
				quiet_exit,
				quiet.diagnostics.borrow().clone(),
				verbose_exit,
				verbose.diagnostics.borrow().iter().any(|message| message
					.contains("candidate discovery CandidateMetadata")
					&& message.contains("/denied")
					&& message.contains("PermissionDenied")),
				verbose
					.commands
					.borrow()
					.first()
					.map(|(command, _)| command.arguments().clone()),
			),
			(
				0,
				Vec::<String>::new(),
				0,
				true,
				Some(CommandArguments::Native(Vec::new())),
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

		let mut interpreters = Interpreters::default();
		locate_command_shell(&runtime, &mut interpreters);
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

		let mut interpreters = Interpreters::default();
		locate_command_shell(&runtime, &mut interpreters);
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
		runtime.set_path(&[Path::new("/empty")]);

		let mut interpreters = Interpreters::default();
		locate_command_shell(&runtime, &mut interpreters);
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
			termination: ProcessTermination::HandledCancellation,
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
				Err(ApplicationExit::Code(130)),
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
	fn a_declined_install_exits_without_launch() {
		let install = FakeRuntime::default();
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
	fn tools_after_an_uninspectable_path_entry_are_found() {
		let tools = FakeRuntime::default();
		tools.add_program(Path::new("/tools/bash"));
		tools.add_program(Path::new("/other/curl"));
		tools.set_path(&[Path::new("/tools"), Path::new("/other")]);
		tools.inspection_errors.borrow_mut().insert(
			PathBuf::from("/tools/curl"),
			io::ErrorKind::PermissionDenied,
		);
		tools.push_prompt_response(PromptResponse::Accepted);
		tools.push_process_result(Ok(interactive_exit(9)));

		let result = prepare_workflow(
			&tools,
			Some(HostTarget::LinuxGnuX64),
			&mut Interpreters::default(),
		);

		assert_eq!(
			(result, programs(&tools)),
			(
				Err(ApplicationExit::InternalFailure),
				vec![PathBuf::from("/other/curl")]
			)
		);
	}
	#[test]
	fn without_a_terminal_a_missing_cli_only_explains_exit_127_when_verbose() {
		let configured_runtime = || {
			let runtime = FakeRuntime::default();
			runtime.no_terminal.set(true);
			runtime.set_path(&[Path::new("/empty")]);
			runtime
		};

		let quiet = configured_runtime();
		let quiet_exit = run(
			&quiet,
			vec![OsString::from("-p")],
			Some(HostTarget::LinuxGnuX64),
		);

		let verbose = configured_runtime();
		let verbose_exit = run(
			&verbose,
			vec![
				OsString::from("--vscode-shim"),
				OsString::from("verbose"),
				OsString::from("-p"),
			],
			Some(HostTarget::LinuxGnuX64),
		);

		assert_eq!(
			(
				quiet_exit,
				quiet.prompts.borrow().len(),
				quiet.diagnostics.borrow().clone(),
				verbose_exit,
				verbose.prompts.borrow().len(),
				verbose.diagnostics.borrow().clone(),
			),
			(
				127,
				0,
				Vec::<String>::new(),
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
			runtime.set_path(&[Path::new(directory)]);
			runtime
		};

		let missing = policy_runtime("/empty");
		let missing_exit = run(
			&missing,
			vec![OsString::from("--vscode-shim"), OsString::from("verbose")],
			Some(HostTarget::LinuxGnuX64),
		);

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
			WorkflowAction::Launch(candidate) => Some(candidate.path),
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
			termination: ProcessTermination::HandledCancellation,
			captured_output: None,
		}));
		let cancellation_exit =
			launch_candidate(&cancelled, direct_candidate("/cancelled"), Vec::new()).code();

		let failed = FakeRuntime::default();
		failed.push_process_result(Err(ProcessError::SpawnFailed {
			program: OsString::from("/failed"),
			error: SystemError {
				kind: io::ErrorKind::PermissionDenied,
				raw_os_error: None,
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
					"failed to launch candidate \"/failed\": could not start \"/failed\": PermissionDenied",
				)],
			)
		);
	}

	fn direct_candidate(path: &str) -> Candidate {
		Candidate {
			path: PathBuf::from(path),
			kind: CandidateKind::UnixExecutable,
		}
	}
}
