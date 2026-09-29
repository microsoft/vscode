/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::ffi::{OsStr, OsString};
use std::io;
use std::path::{Path, PathBuf};

use crate::model::{
	CommandArguments, CommandSpec, LaunchAdapter, ProcessError, ProcessOutcome, ProcessTermination,
	SupervisionMode, SystemError,
};
use crate::runtime::{EnvironmentEffects, FileSystemEffects, InspectedFileType, ProcessEffects};

pub(crate) const OFFICIAL_INSTALLER_URL: &str = "https://gh.io/copilot-install";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum HostTarget {
	WindowsX64,
	WindowsArm64,
	MacosX64,
	MacosArm64,
	LinuxGnuX64,
	LinuxGnuArm64,
	LinuxGnuArmhf,
	LinuxMuslX64,
	LinuxMuslArm64,
}

impl HostTarget {
	pub(crate) const fn current() -> Option<Self> {
		if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
			Some(Self::WindowsX64)
		} else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
			Some(Self::WindowsArm64)
		} else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
			Some(Self::MacosX64)
		} else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
			Some(Self::MacosArm64)
		} else if cfg!(all(
			target_os = "linux",
			target_env = "gnu",
			target_arch = "x86_64"
		)) {
			Some(Self::LinuxGnuX64)
		} else if cfg!(all(
			target_os = "linux",
			target_env = "gnu",
			target_arch = "aarch64"
		)) {
			Some(Self::LinuxGnuArm64)
		} else if cfg!(all(
			target_os = "linux",
			target_env = "gnu",
			target_arch = "arm"
		)) {
			Some(Self::LinuxGnuArmhf)
		} else if cfg!(all(
			target_os = "linux",
			target_env = "musl",
			target_arch = "x86_64"
		)) {
			Some(Self::LinuxMuslX64)
		} else if cfg!(all(
			target_os = "linux",
			target_env = "musl",
			target_arch = "aarch64"
		)) {
			Some(Self::LinuxMuslArm64)
		} else {
			None
		}
	}
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct ToolInventory {
	/// The running shim, which installs GitHub's MSI on Windows through `--vscode-shim install --interactive`.
	pub(crate) shim: Option<PathBuf>,
	pub(crate) brew: Option<PathBuf>,
	pub(crate) curl: Option<PathBuf>,
	pub(crate) wget: Option<PathBuf>,
	pub(crate) bash: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum Tool {
	Shim,
	Brew,
	Curl,
	Wget,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InstallerRoute {
	Msi,
	Homebrew,
	Curl,
	Wget,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum UnsupportedTarget {
	LinuxArmhf,
	LinuxMusl,
}

impl UnsupportedTarget {
	pub(crate) const fn guidance(self) -> &'static str {
		match self {
			Self::LinuxArmhf => {
				"Automatic installation is unavailable on GNU/Linux ARMhf. Install a supported GitHub Copilot CLI release manually."
			}
			Self::LinuxMusl => {
				"Automatic installation is unavailable for musl builds. Install the matching copilot-linuxmusl release from https://github.com/github/copilot-cli/releases."
			}
		}
	}
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum InstallerPlanError {
	Unsupported(UnsupportedTarget),
	MissingPrerequisites(Vec<Tool>),
}

pub(crate) fn installer_plan(
	target: HostTarget,
	tools: &ToolInventory,
) -> Result<Vec<InstallerRoute>, InstallerPlanError> {
	match target {
		HostTarget::WindowsX64 | HostTarget::WindowsArm64 => {
			if tools.shim.is_some() {
				Ok(vec![InstallerRoute::Msi])
			} else {
				Err(InstallerPlanError::MissingPrerequisites(vec![Tool::Shim]))
			}
		}
		HostTarget::MacosX64 | HostTarget::MacosArm64 => downloader_plan(tools, true),
		HostTarget::LinuxGnuX64 | HostTarget::LinuxGnuArm64 => downloader_plan(tools, false),
		HostTarget::LinuxGnuArmhf => Err(InstallerPlanError::Unsupported(
			UnsupportedTarget::LinuxArmhf,
		)),
		HostTarget::LinuxMuslX64 | HostTarget::LinuxMuslArm64 => Err(
			InstallerPlanError::Unsupported(UnsupportedTarget::LinuxMusl),
		),
	}
}

fn downloader_plan(
	tools: &ToolInventory,
	include_homebrew: bool,
) -> Result<Vec<InstallerRoute>, InstallerPlanError> {
	let mut routes = Vec::new();
	if include_homebrew && tools.brew.is_some() {
		routes.push(InstallerRoute::Homebrew);
	}
	if tools.curl.is_some() {
		routes.push(InstallerRoute::Curl);
	}
	if tools.wget.is_some() {
		routes.push(InstallerRoute::Wget);
	}
	if routes.is_empty() {
		let mut missing = Vec::new();
		if include_homebrew {
			missing.push(Tool::Brew);
		}
		missing.extend([Tool::Curl, Tool::Wget]);
		Err(InstallerPlanError::MissingPrerequisites(missing))
	} else {
		Ok(routes)
	}
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ToolDiscoveryError {
	pub(crate) path: PathBuf,
	pub(crate) error: SystemError,
}

pub(crate) fn discover_tools<R>(
	runtime: &R,
	target: HostTarget,
) -> Result<ToolInventory, ToolDiscoveryError>
where
	R: EnvironmentEffects + FileSystemEffects,
{
	let Some(path) = runtime.path().filter(|path| !path.is_empty()) else {
		return Ok(ToolInventory::default());
	};
	let current_directory = runtime
		.current_directory()
		.map_err(|error| ToolDiscoveryError {
			path: PathBuf::from("."),
			error: SystemError::from(&error),
		})?;
	let directories: Vec<PathBuf> = std::env::split_paths(&path)
		.map(|entry| {
			if entry.as_os_str().is_empty() {
				current_directory.clone()
			} else if entry.is_absolute() {
				entry
			} else {
				current_directory.join(entry)
			}
		})
		.collect();
	let windows = matches!(target, HostTarget::WindowsX64 | HostTarget::WindowsArm64);

	let mut inventory = ToolInventory::default();
	if windows {
		inventory.shim = runtime.current_executable().ok();
	} else {
		inventory.bash = find_first(runtime, &directories, &["bash"])?;
		inventory.curl = find_first(runtime, &directories, &["curl"])?;
		inventory.wget = find_first(runtime, &directories, &["wget"])?;
		if matches!(target, HostTarget::MacosX64 | HostTarget::MacosArm64) {
			inventory.brew = find_first(runtime, &directories, &["brew"])?;
		}
	}
	Ok(inventory)
}

fn find_first<R: FileSystemEffects>(
	runtime: &R,
	directories: &[PathBuf],
	names: &[&str],
) -> Result<Option<PathBuf>, ToolDiscoveryError> {
	for name in names {
		for directory in directories {
			let path = directory.join(name);
			match runtime.inspect_path(&path) {
				Ok(Some(inspection))
					if inspection.file_type == InspectedFileType::RegularFile
						&& inspection.executable =>
				{
					return Ok(Some(path));
				}
				Ok(_) => {}
				Err(error) => {
					return Err(ToolDiscoveryError {
						path,
						error: SystemError::from(&error),
					});
				}
			}
		}
	}
	Ok(None)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InstallerStage {
	Install,
	Download,
	RunScript,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct InstallerAttempt {
	pub(crate) route: InstallerRoute,
	pub(crate) stage: InstallerStage,
	pub(crate) result: InstallerAttemptResult,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum InstallerAttemptResult {
	NumericExit(i32),
	#[cfg(any(unix, test))]
	UnixSignal(i32),
	Cancelled(crate::model::Cancellation),
	ProcessError(ProcessError),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum InstallerFailure {
	MissingBash,
	TemporaryScript(SystemError),
	AttemptsFailed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum InstallerResult {
	Succeeded {
		attempts: Vec<InstallerAttempt>,
	},
	Cancelled {
		attempts: Vec<InstallerAttempt>,
	},
	Failed {
		failure: InstallerFailure,
		attempts: Vec<InstallerAttempt>,
	},
}

pub(crate) trait TemporaryScript {
	fn path(&self) -> &Path;
}

pub(crate) trait TemporaryScriptFactory {
	fn create(&self) -> io::Result<Box<dyn TemporaryScript>>;
}

struct NativeTemporaryScript {
	path: tempfile::TempPath,
}

impl TemporaryScript for NativeTemporaryScript {
	fn path(&self) -> &Path {
		&self.path
	}
}

pub(crate) struct NativeTemporaryScriptFactory;

impl TemporaryScriptFactory for NativeTemporaryScriptFactory {
	fn create(&self) -> io::Result<Box<dyn TemporaryScript>> {
		let file = tempfile::Builder::new()
			.prefix("vscode-copilot-install-")
			.suffix(".sh")
			.tempfile()?;
		Ok(Box::new(NativeTemporaryScript {
			path: file.into_temp_path(),
		}))
	}
}

pub(crate) fn run_installer<R: ProcessEffects>(
	runtime: &R,
	routes: &[InstallerRoute],
	tools: &ToolInventory,
) -> InstallerResult {
	run_installer_with(runtime, &NativeTemporaryScriptFactory, routes, tools)
}

pub(crate) fn run_installer_with<R, T>(
	runtime: &R,
	temporary_scripts: &T,
	routes: &[InstallerRoute],
	tools: &ToolInventory,
) -> InstallerResult
where
	R: ProcessEffects,
	T: TemporaryScriptFactory,
{
	let mut attempts = Vec::new();
	for route in routes {
		let outcome = match route {
			InstallerRoute::Msi => run_command(
				runtime,
				*route,
				InstallerStage::Install,
				msi_command(tools),
				&mut attempts,
			),
			InstallerRoute::Homebrew => run_command(
				runtime,
				*route,
				InstallerStage::Install,
				homebrew_command(tools),
				&mut attempts,
			),
			InstallerRoute::Curl | InstallerRoute::Wget => {
				let Some(bash) = tools.bash.as_ref() else {
					return InstallerResult::Failed {
						failure: InstallerFailure::MissingBash,
						attempts,
					};
				};
				let temporary_script = match temporary_scripts.create() {
					Ok(script) => script,
					Err(error) => {
						return InstallerResult::Failed {
							failure: InstallerFailure::TemporaryScript(SystemError::from(&error)),
							attempts,
						};
					}
				};
				let download = downloader_command(*route, tools, temporary_script.path());
				match run_command(
					runtime,
					*route,
					InstallerStage::Download,
					download,
					&mut attempts,
				) {
					RouteOutcome::Succeeded => run_command(
						runtime,
						*route,
						InstallerStage::RunScript,
						Some(native_command(
							bash.as_os_str(),
							vec![temporary_script.path().as_os_str().to_os_string()],
						)),
						&mut attempts,
					),
					outcome => outcome,
				}
			}
		};

		match outcome {
			RouteOutcome::Succeeded => return InstallerResult::Succeeded { attempts },
			RouteOutcome::Cancelled => return InstallerResult::Cancelled { attempts },
			RouteOutcome::Failed => {}
		}
	}
	InstallerResult::Failed {
		failure: InstallerFailure::AttemptsFailed,
		attempts,
	}
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RouteOutcome {
	Succeeded,
	Cancelled,
	Failed,
}

fn run_command<R: ProcessEffects>(
	runtime: &R,
	route: InstallerRoute,
	stage: InstallerStage,
	command: Option<CommandSpec>,
	attempts: &mut Vec<InstallerAttempt>,
) -> RouteOutcome {
	let Some(command) = command else {
		return RouteOutcome::Failed;
	};
	match runtime.supervise(&command, SupervisionMode::InteractiveBootstrap) {
		Ok(ProcessOutcome {
			termination: ProcessTermination::NumericExit(code),
			..
		}) => {
			attempts.push(InstallerAttempt {
				route,
				stage,
				result: InstallerAttemptResult::NumericExit(code),
			});
			if code == 0 {
				RouteOutcome::Succeeded
			} else {
				RouteOutcome::Failed
			}
		}
		#[cfg(any(unix, test))]
		Ok(ProcessOutcome {
			termination: ProcessTermination::UnixSignal(signal),
			..
		}) => {
			attempts.push(InstallerAttempt {
				route,
				stage,
				result: InstallerAttemptResult::UnixSignal(signal),
			});
			RouteOutcome::Failed
		}
		Ok(ProcessOutcome {
			termination: ProcessTermination::HandledCancellation(cancellation),
			..
		}) => {
			attempts.push(InstallerAttempt {
				route,
				stage,
				result: InstallerAttemptResult::Cancelled(cancellation),
			});
			RouteOutcome::Cancelled
		}
		Err(error) => {
			attempts.push(InstallerAttempt {
				route,
				stage,
				result: InstallerAttemptResult::ProcessError(error),
			});
			RouteOutcome::Failed
		}
	}
}

fn msi_command(tools: &ToolInventory) -> Option<CommandSpec> {
	tools.shim.as_ref().map(|shim| {
		native_command(
			shim.as_os_str(),
			["--vscode-shim", "install", "--interactive"]
				.into_iter()
				.map(OsString::from)
				.collect(),
		)
	})
}

fn homebrew_command(tools: &ToolInventory) -> Option<CommandSpec> {
	tools.brew.as_ref().map(|brew| {
		native_command(
			brew.as_os_str(),
			["install", "--cask", "copilot-cli"]
				.into_iter()
				.map(OsString::from)
				.collect(),
		)
	})
}

fn downloader_command(
	route: InstallerRoute,
	tools: &ToolInventory,
	destination: &Path,
) -> Option<CommandSpec> {
	match route {
		InstallerRoute::Curl => tools.curl.as_ref().map(|curl| {
			native_command(
				curl.as_os_str(),
				[
					OsString::from("-fsSL"),
					OsString::from(OFFICIAL_INSTALLER_URL),
					OsString::from("-o"),
					destination.as_os_str().to_os_string(),
				]
				.into_iter()
				.collect(),
			)
		}),
		InstallerRoute::Wget => tools.wget.as_ref().map(|wget| {
			native_command(
				wget.as_os_str(),
				[
					OsString::from("-O"),
					destination.as_os_str().to_os_string(),
					OsString::from(OFFICIAL_INSTALLER_URL),
				]
				.into_iter()
				.collect(),
			)
		}),
		InstallerRoute::Msi | InstallerRoute::Homebrew => None,
	}
}

fn native_command(program: &OsStr, arguments: Vec<OsString>) -> CommandSpec {
	CommandSpec::new(
		program.to_os_string(),
		CommandArguments::Native(arguments),
		LaunchAdapter::Direct,
	)
}

#[cfg(test)]
mod tests {
	use crate::{install, model, runtime};
	use std::cell::RefCell;
	use std::collections::{HashMap, VecDeque};
	use std::ffi::{OsStr, OsString};
	use std::io::{self, BufRead, Cursor, Read, Write};
	use std::path::{Path, PathBuf};
	use std::rc::Rc;

	use install::{
		discover_tools, installer_plan, run_installer_with, HostTarget, InstallerPlanError,
		InstallerResult, InstallerRoute, InstallerStage, TemporaryScript, TemporaryScriptFactory,
		Tool, ToolInventory, UnsupportedTarget, OFFICIAL_INSTALLER_URL,
	};
	use model::{
		Cancellation, CommandArguments, CommandSpec, FileIdentityState, ProcessError,
		ProcessOutcome, ProcessTermination, SupervisionMode,
	};
	use prompt::PromptResponse;
	use runtime::{
		prompt, EnvironmentEffects, FileSystemEffects, InspectedFileType, PathInspection,
		ProcessEffects,
	};

	fn path(name: &str) -> Option<PathBuf> {
		Some(PathBuf::from(name))
	}

	fn all_tools() -> ToolInventory {
		ToolInventory {
			shim: path("copilot.exe"),
			brew: path("brew"),
			curl: path("curl"),
			wget: path("wget"),
			bash: path("bash"),
		}
	}

	#[test]
	fn installer_policy_matrix() {
		let tools = all_tools();

		assert_eq!(
			[
				installer_plan(HostTarget::WindowsX64, &tools),
				installer_plan(HostTarget::WindowsArm64, &tools),
				installer_plan(HostTarget::MacosX64, &tools),
				installer_plan(HostTarget::MacosArm64, &tools),
				installer_plan(HostTarget::LinuxGnuX64, &tools),
				installer_plan(HostTarget::LinuxGnuArm64, &tools),
				installer_plan(HostTarget::LinuxGnuArmhf, &tools),
				installer_plan(HostTarget::LinuxMuslX64, &tools),
				installer_plan(HostTarget::LinuxMuslArm64, &tools),
			],
			[
				Ok(vec![InstallerRoute::Msi]),
				Ok(vec![InstallerRoute::Msi]),
				Ok(vec![
					InstallerRoute::Homebrew,
					InstallerRoute::Curl,
					InstallerRoute::Wget,
				]),
				Ok(vec![
					InstallerRoute::Homebrew,
					InstallerRoute::Curl,
					InstallerRoute::Wget,
				]),
				Ok(vec![InstallerRoute::Curl, InstallerRoute::Wget]),
				Ok(vec![InstallerRoute::Curl, InstallerRoute::Wget]),
				Err(InstallerPlanError::Unsupported(
					UnsupportedTarget::LinuxArmhf,
				)),
				Err(InstallerPlanError::Unsupported(
					UnsupportedTarget::LinuxMusl,
				)),
				Err(InstallerPlanError::Unsupported(
					UnsupportedTarget::LinuxMusl,
				)),
			]
		);
		assert_eq!(
			(
				UnsupportedTarget::LinuxArmhf.guidance(),
				UnsupportedTarget::LinuxMusl.guidance(),
			),
			(
				"Automatic installation is unavailable on GNU/Linux ARMhf. Install a supported GitHub Copilot CLI release manually.",
				"Automatic installation is unavailable for musl builds. Install the matching copilot-linuxmusl release from https://github.com/github/copilot-cli/releases.",
			)
		);
	}

	#[test]
	fn missing_capabilities_are_typed() {
		let no_tools = ToolInventory::default();
		let tools = all_tools();
		let mut no_brew = tools.clone();
		no_brew.brew = None;
		let mut no_curl = tools.clone();
		no_curl.curl = None;
		let mut no_wget = tools.clone();
		no_wget.wget = None;

		assert_eq!(
			(
				installer_plan(HostTarget::WindowsX64, &no_tools),
				installer_plan(HostTarget::MacosX64, &no_tools),
				installer_plan(HostTarget::LinuxGnuX64, &no_tools),
				installer_plan(HostTarget::MacosX64, &no_brew),
				installer_plan(HostTarget::MacosX64, &no_curl),
				installer_plan(HostTarget::MacosX64, &no_wget),
				installer_plan(HostTarget::LinuxGnuX64, &no_curl),
				installer_plan(HostTarget::LinuxGnuX64, &no_wget),
			),
			(
				Err(InstallerPlanError::MissingPrerequisites(vec![Tool::Shim])),
				Err(InstallerPlanError::MissingPrerequisites(vec![
					Tool::Brew,
					Tool::Curl,
					Tool::Wget,
				])),
				Err(InstallerPlanError::MissingPrerequisites(vec![
					Tool::Curl,
					Tool::Wget,
				])),
				Ok(vec![InstallerRoute::Curl, InstallerRoute::Wget]),
				Ok(vec![InstallerRoute::Homebrew, InstallerRoute::Wget]),
				Ok(vec![InstallerRoute::Homebrew, InstallerRoute::Curl]),
				Ok(vec![InstallerRoute::Wget]),
				Ok(vec![InstallerRoute::Curl]),
			)
		);
	}

	#[test]
	fn prompt_parser_is_default_no() {
		assert_eq!(
			[
				prompt::parse_response(b"y"),
				prompt::parse_response(b" \tY later"),
				prompt::parse_response(b""),
				prompt::parse_response(b" \r\n"),
				prompt::parse_response(b"yes"),
				prompt::parse_response(b"no"),
			],
			[
				PromptResponse::Accepted,
				PromptResponse::Accepted,
				PromptResponse::Declined,
				PromptResponse::Declined,
				PromptResponse::Accepted,
				PromptResponse::Declined,
			]
		);
	}

	#[test]
	fn prompts_emit_required_text_flush_and_default_no_for_eof_or_noninteractive_input() {
		let mut install_input = Cursor::new(Vec::<u8>::new());
		let mut install_output = FlushRecordingWriter::default();
		let install = prompt::prompt_with_io(&mut install_input, &mut install_output, true)
			.expect("prompt at EOF");
		let mut accepted_input = Cursor::new(b" Y\n");
		let mut accepted_output = FlushRecordingWriter::default();
		let accepted = prompt::prompt_with_io(&mut accepted_input, &mut accepted_output, true)
			.expect("accepted prompt");
		let mut noninteractive_input = FailingReader;
		let mut noninteractive_output = FlushRecordingWriter::default();
		let noninteractive =
			prompt::prompt_with_io(&mut noninteractive_input, &mut noninteractive_output, false)
				.expect("noninteractive prompt");

		assert_eq!(
			(
				install,
				String::from_utf8(install_output.bytes).unwrap(),
				install_output.flushes,
				accepted,
				accepted_output.flushes,
				noninteractive,
				noninteractive_output.flushes,
			),
			(
				PromptResponse::Declined,
				format!(
					"Installation instructions: {}\nInstall GitHub Copilot CLI? [y/N] ",
					prompt::INSTALL_DOCUMENTATION_URL
				),
				1,
				PromptResponse::Accepted,
				1,
				PromptResponse::Declined,
				1,
			)
		);
	}

	#[test]
	fn prompt_and_clear_errors_are_propagated() {
		let expected = io::ErrorKind::BrokenPipe;
		let prompt_error = prompt::prompt_with_io(
			&mut Cursor::new(b"y"),
			&mut FailingWriter { fail_flush: false },
			true,
		)
		.unwrap_err();
		let flush_error = prompt::prompt_with_io(
			&mut Cursor::new(b"y"),
			&mut FailingWriter { fail_flush: true },
			true,
		)
		.unwrap_err();
		let clear_error =
			prompt::clear_terminal_with(&mut FailingWriter { fail_flush: false }, true)
				.unwrap_err();
		let read_error = prompt::prompt_with_io(
			&mut FailingReader,
			&mut FlushRecordingWriter::default(),
			true,
		)
		.unwrap_err();

		assert_eq!(
			(
				prompt_error.kind(),
				flush_error.kind(),
				clear_error.kind(),
				read_error.kind(),
			),
			(
				expected,
				expected,
				expected,
				io::ErrorKind::PermissionDenied
			)
		);
	}

	#[test]
	fn redirected_clear_is_a_noop_and_terminal_clear_flushes() {
		let mut redirected = FlushRecordingWriter::default();
		prompt::clear_terminal_with(&mut redirected, false).expect("redirected clear");
		let mut terminal = FlushRecordingWriter::default();
		prompt::clear_terminal_with(&mut terminal, true).expect("terminal clear");

		assert_eq!(
			(
				redirected.bytes,
				redirected.flushes,
				terminal.bytes,
				terminal.flushes,
			),
			(Vec::new(), 0, b"\x1b[2J\x1b[H".to_vec(), 1)
		);
	}

	#[derive(Default)]
	struct FlushRecordingWriter {
		bytes: Vec<u8>,
		flushes: usize,
	}

	impl Write for FlushRecordingWriter {
		fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
			self.bytes.extend_from_slice(buffer);
			Ok(buffer.len())
		}

		fn flush(&mut self) -> io::Result<()> {
			self.flushes += 1;
			Ok(())
		}
	}

	struct FailingWriter {
		fail_flush: bool,
	}

	impl Write for FailingWriter {
		fn write(&mut self, buffer: &[u8]) -> io::Result<usize> {
			if self.fail_flush {
				Ok(buffer.len())
			} else {
				Err(io::Error::from(io::ErrorKind::BrokenPipe))
			}
		}

		fn flush(&mut self) -> io::Result<()> {
			Err(io::Error::from(io::ErrorKind::BrokenPipe))
		}
	}

	struct FailingReader;

	impl Read for FailingReader {
		fn read(&mut self, _buffer: &mut [u8]) -> io::Result<usize> {
			Err(io::Error::from(io::ErrorKind::PermissionDenied))
		}
	}

	impl BufRead for FailingReader {
		fn fill_buf(&mut self) -> io::Result<&[u8]> {
			Err(io::Error::from(io::ErrorKind::PermissionDenied))
		}

		fn consume(&mut self, _amount: usize) {}
	}

	#[derive(Clone)]
	enum FakeProcessResult {
		Exit(i32),
		Cancelled,
		Error(ProcessError),
	}

	struct FakeProcesses {
		results: RefCell<VecDeque<FakeProcessResult>>,
		commands: RefCell<Vec<(CommandSpec, SupervisionMode)>>,
		tracked_scripts: Rc<RefCell<Vec<TrackedPath>>>,
		scripts_existed_during_commands: RefCell<Vec<bool>>,
	}

	impl FakeProcesses {
		fn new(results: impl IntoIterator<Item = FakeProcessResult>) -> Self {
			Self {
				results: RefCell::new(results.into_iter().collect()),
				commands: RefCell::new(Vec::new()),
				tracked_scripts: Rc::new(RefCell::new(Vec::new())),
				scripts_existed_during_commands: RefCell::new(Vec::new()),
			}
		}
	}

	impl ProcessEffects for FakeProcesses {
		fn supervise(
			&self,
			command: &CommandSpec,
			mode: SupervisionMode,
		) -> Result<ProcessOutcome, ProcessError> {
			self.commands.borrow_mut().push((command.clone(), mode));
			self.scripts_existed_during_commands.borrow_mut().push(
				self.tracked_scripts
					.borrow()
					.iter()
					.filter(|script| script.active)
					.all(|script| script.path.exists()),
			);
			match self
				.results
				.borrow_mut()
				.pop_front()
				.expect("fake process result")
			{
				FakeProcessResult::Exit(code) => Ok(ProcessOutcome {
					termination: ProcessTermination::NumericExit(code),
					captured_output: None,
				}),
				FakeProcessResult::Cancelled => Ok(ProcessOutcome {
					termination: ProcessTermination::HandledCancellation(Cancellation::Requested),
					captured_output: None,
				}),
				FakeProcessResult::Error(error) => Err(error),
			}
		}
	}

	struct TrackedPath {
		path: PathBuf,
		active: bool,
	}

	struct TrackedTemporaryScript {
		path: tempfile::TempPath,
		index: usize,
		tracked: Rc<RefCell<Vec<TrackedPath>>>,
	}

	impl TemporaryScript for TrackedTemporaryScript {
		fn path(&self) -> &Path {
			&self.path
		}
	}

	impl Drop for TrackedTemporaryScript {
		fn drop(&mut self) {
			self.tracked.borrow_mut()[self.index].active = false;
		}
	}

	struct TrackedTemporaryScriptFactory {
		tracked: Rc<RefCell<Vec<TrackedPath>>>,
	}

	impl TemporaryScriptFactory for TrackedTemporaryScriptFactory {
		fn create(&self) -> io::Result<Box<dyn TemporaryScript>> {
			let path = tempfile::Builder::new()
				.prefix("copilot-shim-test-")
				.suffix(".sh")
				.tempfile()?
				.into_temp_path();
			let index = self.tracked.borrow().len();
			self.tracked.borrow_mut().push(TrackedPath {
				path: path.to_path_buf(),
				active: true,
			});
			Ok(Box::new(TrackedTemporaryScript {
				path,
				index,
				tracked: Rc::clone(&self.tracked),
			}))
		}
	}

	fn run_fake(
		results: impl IntoIterator<Item = FakeProcessResult>,
		routes: &[InstallerRoute],
		tools: &ToolInventory,
	) -> (InstallerResult, FakeProcesses) {
		let processes = FakeProcesses::new(results);
		let scripts = TrackedTemporaryScriptFactory {
			tracked: Rc::clone(&processes.tracked_scripts),
		};
		let result = run_installer_with(&processes, &scripts, routes, tools);
		(result, processes)
	}

	fn native_arguments(command: &CommandSpec) -> Vec<OsString> {
		match command.arguments() {
			CommandArguments::Native(arguments) => arguments.clone(),
			CommandArguments::WindowsCommand { .. } => panic!("installer command must be native"),
		}
	}

	#[test]
	fn installer_fallback_order_and_cancellation_are_terminal() {
		let tools = all_tools();
		let (fallback, fallback_processes) = run_fake(
			[
				FakeProcessResult::Exit(1),
				FakeProcessResult::Exit(2),
				FakeProcessResult::Exit(0),
				FakeProcessResult::Exit(0),
			],
			&[
				InstallerRoute::Homebrew,
				InstallerRoute::Curl,
				InstallerRoute::Wget,
			],
			&tools,
		);
		let (cancelled, cancelled_processes) = run_fake(
			[FakeProcessResult::Cancelled],
			&[InstallerRoute::Curl, InstallerRoute::Wget],
			&tools,
		);

		assert!(matches!(fallback, InstallerResult::Succeeded { .. }));
		assert_eq!(
			(
				fallback_processes
					.commands
					.borrow()
					.iter()
					.map(|(command, _)| command.program().to_os_string())
					.collect::<Vec<_>>(),
				fallback_processes
					.commands
					.borrow()
					.iter()
					.map(|(_, mode)| *mode)
					.collect::<Vec<_>>(),
			),
			(
				["brew", "curl", "wget", "bash"]
					.into_iter()
					.map(OsString::from)
					.collect::<Vec<_>>(),
				vec![SupervisionMode::InteractiveBootstrap; 4],
			)
		);
		assert!(matches!(&cancelled, InstallerResult::Cancelled { .. }));
		assert_eq!(cancelled_processes.commands.borrow().len(), 1);
		let InstallerResult::Cancelled { attempts } = cancelled else {
			unreachable!();
		};
		assert_eq!(
			attempts[0].result,
			install::InstallerAttemptResult::Cancelled(Cancellation::Requested)
		);
	}

	#[test]
	fn missing_bash_prevents_download_and_fallback() {
		let mut tools = all_tools();
		tools.bash = None;
		let (result, processes) = run_fake(
			Vec::<FakeProcessResult>::new(),
			&[InstallerRoute::Curl, InstallerRoute::Wget],
			&tools,
		);

		assert_eq!(
			result,
			InstallerResult::Failed {
				failure: install::InstallerFailure::MissingBash,
				attempts: Vec::new(),
			}
		);
		assert!(processes.commands.borrow().is_empty());
		assert!(processes.tracked_scripts.borrow().is_empty());
	}

	#[test]
	fn downloader_commands_use_temp_files_then_inherited_bash() {
		for (route, downloader, expected_arguments) in [
			(
				InstallerRoute::Curl,
				"curl",
				vec![
					OsString::from("-fsSL"),
					OsString::from(OFFICIAL_INSTALLER_URL),
					OsString::from("-o"),
				],
			),
			(
				InstallerRoute::Wget,
				"wget",
				vec![OsString::from("-O"), OsString::from(OFFICIAL_INSTALLER_URL)],
			),
		] {
			let (result, processes) = run_fake(
				[FakeProcessResult::Exit(0), FakeProcessResult::Exit(0)],
				&[route],
				&all_tools(),
			);
			let commands = processes.commands.borrow();
			let temporary_path = processes.tracked_scripts.borrow()[0].path.clone();
			let download_arguments = native_arguments(&commands[0].0);
			let bash_arguments = native_arguments(&commands[1].0);

			assert!(matches!(result, InstallerResult::Succeeded { .. }));
			assert_eq!(
				(
					commands[0].0.program(),
					commands[0].1,
					download_arguments
						.iter()
						.filter(|argument| *argument == temporary_path.as_os_str())
						.count(),
					expected_arguments
						.iter()
						.all(|argument| download_arguments.contains(argument)),
					commands[1].0.program(),
					commands[1].1,
					bash_arguments,
					processes.scripts_existed_during_commands.borrow().clone(),
					temporary_path.exists(),
				),
				(
					OsStr::new(downloader),
					SupervisionMode::InteractiveBootstrap,
					1,
					true,
					OsStr::new("bash"),
					SupervisionMode::InteractiveBootstrap,
					vec![temporary_path.as_os_str().to_os_string()],
					vec![true, true],
					false,
				)
			);
		}
	}

	#[test]
	fn temporary_scripts_are_cleaned_after_failure_and_cancellation_return() {
		for process_results in [
			vec![FakeProcessResult::Exit(9)],
			vec![FakeProcessResult::Exit(0), FakeProcessResult::Exit(9)],
			vec![FakeProcessResult::Exit(0), FakeProcessResult::Cancelled],
			vec![FakeProcessResult::Error(ProcessError::SpawnFailed {
				program: OsString::from("curl"),
				error: model::SystemError {
					kind: io::ErrorKind::NotFound,
					raw_os_error: None,
				},
			})],
		] {
			let command_count = process_results.len();
			let (_result, processes) =
				run_fake(process_results, &[InstallerRoute::Curl], &all_tools());
			let tracked = processes.tracked_scripts.borrow();
			assert_eq!(
				(
					processes
						.scripts_existed_during_commands
						.borrow()
						.as_slice(),
					tracked[0].active,
					tracked[0].path.exists(),
				),
				(vec![true; command_count].as_slice(), false, false)
			);
		}
	}

	#[test]
	fn windows_command_runs_the_shim_msi_install() {
		let tools = all_tools();
		let (result, processes) =
			run_fake([FakeProcessResult::Exit(0)], &[InstallerRoute::Msi], &tools);
		let commands = processes.commands.borrow();

		assert!(matches!(result, InstallerResult::Succeeded { .. }));
		assert_eq!(
			(
				commands[0].0.program(),
				native_arguments(&commands[0].0),
				commands[0].1,
			),
			(
				OsStr::new("copilot.exe"),
				["--vscode-shim", "install", "--interactive"]
					.into_iter()
					.map(OsString::from)
					.collect(),
				SupervisionMode::InteractiveBootstrap,
			)
		);
	}

	#[test]
	fn installer_diagnostics_preserve_each_failed_stage() {
		let (result, _processes) = run_fake(
			[
				FakeProcessResult::Exit(3),
				FakeProcessResult::Exit(0),
				FakeProcessResult::Exit(4),
			],
			&[InstallerRoute::Curl, InstallerRoute::Wget],
			&all_tools(),
		);
		let InstallerResult::Failed { attempts, .. } = result else {
			panic!("expected failed installers");
		};

		assert_eq!(
			attempts
				.into_iter()
				.map(|attempt| (attempt.route, attempt.stage, attempt.result))
				.collect::<Vec<_>>(),
			vec![
				(
					InstallerRoute::Curl,
					InstallerStage::Download,
					install::InstallerAttemptResult::NumericExit(3),
				),
				(
					InstallerRoute::Wget,
					InstallerStage::Download,
					install::InstallerAttemptResult::NumericExit(0),
				),
				(
					InstallerRoute::Wget,
					InstallerStage::RunScript,
					install::InstallerAttemptResult::NumericExit(4),
				),
			]
		);
	}

	#[derive(Default)]
	struct FakeFileSystem {
		path: Option<OsString>,
		current_directory: PathBuf,
		inspections: HashMap<PathBuf, PathInspection>,
	}

	impl EnvironmentEffects for FakeFileSystem {
		fn path(&self) -> Option<OsString> {
			self.path.clone()
		}

		fn current_executable(&self) -> io::Result<PathBuf> {
			Err(io::Error::from(io::ErrorKind::Unsupported))
		}

		fn current_directory(&self) -> io::Result<PathBuf> {
			Ok(self.current_directory.clone())
		}
	}

	impl FileSystemEffects for FakeFileSystem {
		fn inspect_path(&self, path: &Path) -> io::Result<Option<PathInspection>> {
			Ok(self.inspections.get(path).cloned())
		}

		fn read_directory(&self, _path: &Path) -> io::Result<Vec<OsString>> {
			Err(io::Error::from(io::ErrorKind::Unsupported))
		}

		fn open_file(&self, _path: &Path) -> io::Result<Box<dyn Read>> {
			Err(io::Error::from(io::ErrorKind::Unsupported))
		}
	}

	fn executable(path: &Path) -> PathInspection {
		PathInspection {
			canonical_path: path.to_path_buf(),
			file_identity: FileIdentityState::Unsupported,
			file_type: InspectedFileType::RegularFile,
			executable: true,
		}
	}

	#[test]
	fn tool_discovery_uses_path_order_and_executable_files() {
		let first = PathBuf::from("/first");
		let second = PathBuf::from("/second");
		let mut runtime = FakeFileSystem {
			path: Some(std::env::join_paths([&first, &second]).unwrap()),
			current_directory: PathBuf::from("/working"),
			inspections: HashMap::new(),
		};
		runtime.inspections.insert(
			first.join("curl"),
			PathInspection {
				canonical_path: first.join("curl"),
				file_identity: FileIdentityState::Unsupported,
				file_type: InspectedFileType::Directory,
				executable: true,
			},
		);
		for tool in ["bash", "curl", "wget"] {
			let candidate = second.join(tool);
			runtime
				.inspections
				.insert(candidate.clone(), executable(&candidate));
		}

		assert_eq!(
			discover_tools(&runtime, HostTarget::LinuxGnuX64).unwrap(),
			ToolInventory {
				bash: Some(second.join("bash")),
				curl: Some(second.join("curl")),
				wget: Some(second.join("wget")),
				..ToolInventory::default()
			}
		);
	}

	#[cfg(unix)]
	#[test]
	fn tool_discovery_preserves_non_utf8_path_entries() {
		use std::os::unix::ffi::OsStringExt;

		let directory = PathBuf::from(OsString::from_vec(b"/tmp/native-\xFF".to_vec()));
		let bash = directory.join("bash");
		let mut runtime = FakeFileSystem {
			path: Some(std::env::join_paths([&directory]).unwrap()),
			current_directory: PathBuf::from("/working"),
			inspections: HashMap::new(),
		};
		runtime.inspections.insert(bash.clone(), executable(&bash));

		assert_eq!(
			discover_tools(&runtime, HostTarget::LinuxGnuX64)
				.unwrap()
				.bash,
			Some(bash)
		);
	}

	#[test]
	fn official_installer_url_is_https() {
		assert_eq!(OFFICIAL_INSTALLER_URL, "https://gh.io/copilot-install");
	}

	#[test]
	fn host_target_is_selected_from_compile_time_configuration() {
		assert!(HostTarget::current().is_some());
	}
}
