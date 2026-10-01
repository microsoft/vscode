/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! The `--vscode-shim probe|install` commands. They report to VS Code setup through INI files and never launch the
//! Copilot CLI. `install` also backs the interactive first-use install on Windows.

use std::ffi::OsString;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
#[cfg(windows)]
use std::time::Duration;
use std::time::Instant;

use crate::candidate::discover;
use crate::install::HostTarget;
use crate::invocation::{InstallMode, InstallOptions, ProbeOptions, ProbeScope};
use crate::runtime::{
	EnvironmentEffects, FileSystemEffects, InspectedFileType, PathInspection, PolicyEffects,
	UserInteractionEffects,
};

#[cfg(windows)]
pub(crate) mod windows;

/// Folder under `%LOCALAPPDATA%` that GitHub's per-user Copilot CLI MSI installs `copilot.exe` into.
#[cfg(windows)]
pub(crate) const CLI_INSTALL_FOLDER: &str = "GitHubCopilotCLI";

/// Version of the setup contract. VS Code setup rejects probe results that report a different version.
pub(crate) const PROTOCOL_VERSION: u32 = 1;

/// The VS Code policy that turns off the `copilot` command that VS Code provides, including installing the CLI.
pub(crate) const COPILOT_CLI_COMMAND_POLICY: &str = "CopilotCliCommand";

#[cfg(windows)]
const DEFAULT_RELEASES_URL: &str = "https://github.com/github/copilot-cli/releases";
/// Replaces the GitHub releases URL, for tests and mirrors. The Authenticode signer check still applies.
#[cfg(windows)]
const RELEASES_URL_VARIABLE: &str = "VSCODE_COPILOT_SHIM_RELEASES_URL";
#[cfg(windows)]
const EXPECTED_SIGNER: &str = "GitHub, Inc.";
#[cfg(windows)]
const INSTALL_REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
#[cfg(windows)]
const MAXIMUM_CHECKSUMS_SIZE: u64 = 64 * 1024;

#[cfg(windows)]
pub(crate) fn hex(bytes: &[u8]) -> String {
	bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Extracts the release tag from the `Location` of a `/releases/latest` redirect.
#[cfg(any(windows, test))]
pub(crate) fn parse_release_tag(location: &str) -> Option<String> {
	let (_, rest) = location.split_once("/tag/")?;
	let tag = rest.split(['/', '?', '#']).next()?;
	(!tag.is_empty()
		&& tag.chars().all(|character| {
			character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_')
		}))
	.then(|| tag.to_owned())
}

/// Finds the SHA-256 of `asset` in a `sha256sum`-style checksum list.
#[cfg(any(windows, test))]
pub(crate) fn expected_sha256(checksums: &str, asset: &str) -> Option<String> {
	checksums.lines().find_map(|line| {
		let (hash, name) = line.trim().split_once(char::is_whitespace)?;
		let name = name.trim().trim_start_matches('*');
		(name == asset
			&& hash.len() == 64
			&& hash.chars().all(|character| character.is_ascii_hexdigit()))
		.then(|| hash.to_ascii_lowercase())
	})
}

#[cfg(any(windows, test))]
pub(crate) fn msi_asset(target: Option<HostTarget>) -> Option<&'static str> {
	match target? {
		HostTarget::WindowsX64 => Some("copilot-x64.msi"),
		HostTarget::WindowsArm64 => Some("copilot-arm64.msi"),
		_ => None,
	}
}

// Result files

/// Renders an INI section. Values are single-line so `GetPrivateProfileString` reads them back unchanged.
pub(crate) fn render_ini(section: &str, entries: &[(&str, String)]) -> String {
	let mut text = format!("[{section}]\r\n");
	for (key, value) in entries {
		let value: String = value
			.chars()
			.map(|character| {
				if character.is_control() {
					' '
				} else {
					character
				}
			})
			.collect();
		text.push_str(&format!("{key}={value}\r\n"));
	}
	text
}

/// Writes an INI file as UTF-16LE with a byte order mark, which `GetPrivateProfileString` reads on every Windows
/// version. The file is replaced atomically so a reader never sees a partial result.
pub(crate) fn write_ini(path: &Path, section: &str, entries: &[(&str, String)]) -> io::Result<()> {
	let mut bytes = vec![0xFF, 0xFE];
	for unit in render_ini(section, entries).encode_utf16() {
		bytes.extend(unit.to_le_bytes());
	}
	let mut temporary = path.as_os_str().to_os_string();
	temporary.push(format!(".{}.tmp", std::process::id()));
	let temporary = PathBuf::from(temporary);
	std::fs::write(&temporary, bytes)?;
	std::fs::rename(&temporary, path).inspect_err(|_| {
		let _ = std::fs::remove_file(&temporary);
	})
}

fn flag(value: bool) -> String {
	String::from(if value { "1" } else { "0" })
}

// Discovery with an explicit search path

struct SearchPathRuntime<'a, R> {
	inner: &'a R,
	path: Option<OsString>,
}

impl<R: EnvironmentEffects> EnvironmentEffects for SearchPathRuntime<'_, R> {
	fn path(&self) -> Option<OsString> {
		self.path.clone()
	}

	fn current_executable(&self) -> io::Result<PathBuf> {
		self.inner.current_executable()
	}

	fn current_directory(&self) -> io::Result<PathBuf> {
		self.inner.current_directory()
	}

	fn environment_variable(&self, name: &str) -> Option<OsString> {
		self.inner.environment_variable(name)
	}

	#[cfg(unix)]
	fn is_root(&self) -> bool {
		self.inner.is_root()
	}
}

impl<R: FileSystemEffects> FileSystemEffects for SearchPathRuntime<'_, R> {
	fn inspect_path(&self, path: &Path) -> io::Result<Option<PathInspection>> {
		self.inner.inspect_path(path)
	}

	fn open_file(&self, path: &Path) -> io::Result<Box<dyn Read>> {
		self.inner.open_file(path)
	}
}

/// Finds the first Copilot CLI candidate without running it. Other shims and the old VS Code script shims are excluded.
fn find_cli<R>(runtime: &R, search_path: Option<OsString>) -> Result<Option<PathBuf>, String>
where
	R: EnvironmentEffects + FileSystemEffects,
{
	let runtime = SearchPathRuntime {
		inner: runtime,
		path: search_path,
	};
	discover(&runtime, crate::SHIM_MARKER)
		.map(|result| {
			result
				.candidates
				.first()
				.map(|candidate| candidate.path.clone())
		})
		.map_err(|error| {
			format!(
				"identifying the running shim failed: {:?}",
				error.error.kind
			)
		})
}

fn probe_search_path<R: EnvironmentEffects>(runtime: &R, scope: ProbeScope) -> Option<OsString> {
	match scope {
		#[cfg(windows)]
		ProbeScope::User => windows::setup_discovery_path(runtime.environment_variable("PATH")),
		#[cfg(not(windows))]
		ProbeScope::User => runtime.path(),
		#[cfg(windows)]
		ProbeScope::Machine => windows::machine_path(),
		#[cfg(not(windows))]
		ProbeScope::Machine => runtime.path(),
	}
}

fn find_power_shell<R>(runtime: &R, search_path: Option<&OsString>) -> bool
where
	R: EnvironmentEffects + FileSystemEffects,
{
	let is_file = |path: PathBuf| {
		matches!(
			runtime.inspect_path(&path),
			Ok(Some(inspection)) if inspection.file_type == InspectedFileType::RegularFile
		)
	};
	search_path
		.map(|path| {
			std::env::split_paths(path).any(|directory| is_file(directory.join("pwsh.exe")))
		})
		.unwrap_or(false)
		|| runtime
			.environment_variable("ProgramFiles")
			.is_some_and(|program_files| {
				is_file(PathBuf::from(program_files).join(r"PowerShell\7\pwsh.exe"))
			})
}

// probe

pub(crate) fn probe<R>(runtime: &R, target: Option<HostTarget>, options: &ProbeOptions) -> i32
where
	R: EnvironmentEffects + FileSystemEffects + UserInteractionEffects + PolicyEffects,
{
	let deadline = Instant::now() + options.timeout;
	let policy_disabled = runtime.copilot_cli_command_disabled();
	let search_path = probe_search_path(runtime, options.scope);
	let mut reasons = Vec::new();
	let cli = find_cli(runtime, search_path.clone()).unwrap_or_else(|error| {
		reasons.push(format!("discovery: {error}"));
		None
	});
	let cli_found = cli.is_some();
	let windows_target = matches!(
		target,
		Some(HostTarget::WindowsX64 | HostTarget::WindowsArm64)
	);
	let power_shell = !windows_target || find_power_shell(runtime, search_path.as_ref());

	// Setup doesn't offer the download when Copilot CLI is already installed, so there's nothing to check.
	let download_size = if policy_disabled {
		reasons.push(format!(
			"the {COPILOT_CLI_COMMAND_POLICY} policy is disabled"
		));
		None
	} else if cli_found {
		None
	} else if options.network {
		probe_download_before(target, deadline)
			.map_err(|error| reasons.push(format!("download: {error}")))
			.ok()
	} else {
		reasons.push(String::from("network checks were skipped"));
		None
	};

	let entries = [
		("protocol", PROTOCOL_VERSION.to_string()),
		(
			"policy",
			String::from(if policy_disabled {
				"disabled"
			} else {
				"allowed"
			}),
		),
		("cliFound", flag(cli_found)),
		// Setup shows where it found Copilot CLI when it skips its page.
		(
			"cliPath",
			cli.map(|path| path.display().to_string())
				.unwrap_or_default(),
		),
		("pwshFound", flag(power_shell)),
		("downloadAvailable", flag(download_size.is_some())),
		("downloadSize", download_size.unwrap_or(0).to_string()),
		("reason", reasons.join("; ")),
	];
	match write_ini(&options.result_file, "probe", &entries) {
		Ok(()) => 0,
		Err(error) => {
			runtime.write_diagnostic(&format!(
				"failed to write the probe result to {:?}: {error}",
				options.result_file
			));
			1
		}
	}
}

#[cfg(windows)]
fn releases_base() -> String {
	std::env::var(RELEASES_URL_VARIABLE)
		.ok()
		.filter(|value| !value.is_empty())
		.unwrap_or_else(|| String::from(DEFAULT_RELEASES_URL))
		.trim_end_matches('/')
		.to_owned()
}

#[cfg(windows)]
fn resolve_latest_tag(client: &windows::HttpClient, base: &str) -> Result<String, String> {
	let response = client
		.request("HEAD", &format!("{base}/latest"), false)
		.map_err(|error| format!("could not reach {base}: {error}"))?;
	if !(300..400).contains(&response.status) {
		return Err(format!(
			"{base}/latest returned HTTP {} instead of a redirect",
			response.status
		));
	}
	response
		.location()
		.as_deref()
		.and_then(parse_release_tag)
		.ok_or_else(|| String::from("the latest release redirect has no tag"))
}

/// Returns the size of the MSI in the latest release.
#[cfg(windows)]
fn probe_download(target: Option<HostTarget>, deadline: Instant) -> Result<u64, String> {
	let asset = msi_asset(target).ok_or("no MSI for this architecture")?;
	let remaining = |deadline: Instant| {
		deadline
			.checked_duration_since(Instant::now())
			.filter(|remaining| !remaining.is_zero())
			.ok_or_else(|| String::from("timed out"))
	};
	let base = releases_base();
	let client =
		windows::HttpClient::new(remaining(deadline)?).map_err(|error| error.to_string())?;
	let tag = resolve_latest_tag(&client, &base)?;
	remaining(deadline)?;
	let url = format!("{base}/download/{tag}/{asset}");
	let response = client
		.request("HEAD", &url, true)
		.map_err(|error| format!("could not reach {url}: {error}"))?;
	if response.status != 200 {
		return Err(format!("{url} returned HTTP {}", response.status));
	}
	Ok(response.content_length().unwrap_or(0))
}

#[cfg(not(windows))]
fn probe_download(_target: Option<HostTarget>, _deadline: Instant) -> Result<u64, String> {
	Err(String::from("unsupported on this platform"))
}

/// Runs the download check on another thread and stops waiting at the deadline. WinHTTP timeouts apply to each
/// stage separately and do not cover proxy discovery, and setup only waits a little past the probe timeout for the
/// result file. The process exits after writing the result, which ends an abandoned check.
fn probe_download_before(target: Option<HostTarget>, deadline: Instant) -> Result<u64, String> {
	let (sender, receiver) = std::sync::mpsc::channel();
	std::thread::spawn(move || {
		let _ = sender.send(probe_download(target, deadline));
	});
	receiver
		.recv_timeout(deadline.saturating_duration_since(Instant::now()))
		.unwrap_or_else(|_| Err(String::from("timed out")))
}

// install

// The MSI install only runs on Windows; the statuses and reporters stay shared so the contract compiles everywhere.
#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InstallStatus {
	Installed,
	AlreadyInstalled,
	Unsupported,
	Policy,
	Network,
	Verification,
	Msiexec,
	Cancelled,
	Error,
}

impl InstallStatus {
	pub(crate) fn name(self) -> &'static str {
		match self {
			Self::Installed => "installed",
			Self::AlreadyInstalled => "alreadyInstalled",
			Self::Unsupported => "unsupported",
			Self::Policy => "policy",
			Self::Network => "network",
			Self::Verification => "verification",
			Self::Msiexec => "msiexec",
			Self::Cancelled => "cancelled",
			Self::Error => "error",
		}
	}

	pub(crate) fn exit_code(self) -> i32 {
		match self {
			Self::Installed | Self::AlreadyInstalled => 0,
			Self::Policy => 10,
			Self::Network => 20,
			Self::Verification => 30,
			Self::Msiexec => 40,
			Self::Cancelled => 50,
			Self::Unsupported | Self::Error => 1,
		}
	}
}

#[derive(Debug)]
pub(crate) struct InstallOutcome {
	pub(crate) status: InstallStatus,
	pub(crate) reason: String,
	pub(crate) installer_exit_code: i32,
	pub(crate) cli_path: Option<PathBuf>,
	pub(crate) release_tag: Option<String>,
	pub(crate) log: Option<PathBuf>,
}

impl InstallOutcome {
	fn failed(status: InstallStatus, reason: impl Into<String>) -> Self {
		Self {
			status,
			reason: reason.into(),
			installer_exit_code: 0,
			cli_path: None,
			release_tag: None,
			log: None,
		}
	}
}

#[cfg_attr(not(windows), allow(dead_code))]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InstallPhase {
	Resolving,
	Downloading,
	Verifying,
	Installing,
}

impl InstallPhase {
	#[cfg_attr(not(windows), allow(dead_code))]
	fn name(self) -> &'static str {
		match self {
			Self::Resolving => "resolving",
			Self::Downloading => "downloading",
			Self::Verifying => "verifying",
			Self::Installing => "installing",
		}
	}
}

#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) trait InstallReporter {
	fn report(&mut self, phase: InstallPhase, current: u64, total: u64);
	fn cancelled(&self) -> bool;
}

/// Reports progress to VS Code setup through a file that is rewritten at least every second while work continues.
#[cfg_attr(not(windows), allow(dead_code))]
struct FileReporter {
	progress_file: Option<PathBuf>,
	cancel_file: Option<PathBuf>,
	heartbeat: u64,
	last: Option<(InstallPhase, std::time::Instant)>,
}

impl InstallReporter for FileReporter {
	fn report(&mut self, phase: InstallPhase, current: u64, total: u64) {
		let Some(path) = &self.progress_file else {
			return;
		};
		let now = std::time::Instant::now();
		if let Some((last_phase, last_time)) = self.last {
			if last_phase == phase
				&& now.duration_since(last_time) < std::time::Duration::from_millis(250)
			{
				return;
			}
		}
		self.heartbeat += 1;
		self.last = Some((phase, now));
		let _ = write_ini(
			path,
			"progress",
			&[
				("phase", String::from(phase.name())),
				("current", current.to_string()),
				("total", total.to_string()),
				("heartbeat", self.heartbeat.to_string()),
			],
		);
	}

	fn cancelled(&self) -> bool {
		self.cancel_file.as_ref().is_some_and(|path| path.exists())
	}
}

/// Reports progress in the terminal for the first-use install.
#[cfg_attr(not(windows), allow(dead_code))]
struct ConsoleReporter {
	last_phase: Option<InstallPhase>,
	last_percent: Option<u64>,
}

impl InstallReporter for ConsoleReporter {
	fn report(&mut self, phase: InstallPhase, current: u64, total: u64) {
		if self.last_phase != Some(phase) {
			if self.last_phase == Some(InstallPhase::Downloading) {
				eprintln!();
			}
			self.last_phase = Some(phase);
			self.last_percent = None;
			match phase {
				InstallPhase::Resolving => {
					eprintln!("Finding the latest GitHub Copilot CLI release...")
				}
				InstallPhase::Downloading => {}
				InstallPhase::Verifying => eprintln!("Verifying the download..."),
				InstallPhase::Installing => eprintln!("Installing GitHub Copilot CLI..."),
			}
		}
		if phase == InstallPhase::Downloading && total > 0 {
			let percent = current.saturating_mul(100) / total;
			if self.last_percent != Some(percent) {
				self.last_percent = Some(percent);
				eprint!(
					"\rDownloading GitHub Copilot CLI... {} MB of {} MB ({percent}%)",
					current / 1_048_576,
					total / 1_048_576
				);
			}
		}
	}

	fn cancelled(&self) -> bool {
		crate::runtime::platform::is_process_cancellation_requested()
	}
}

pub(crate) fn install<R>(runtime: &R, target: Option<HostTarget>, options: &InstallOptions) -> i32
where
	R: EnvironmentEffects + FileSystemEffects + UserInteractionEffects + PolicyEffects,
{
	let policy_outcome = runtime.copilot_cli_command_disabled().then(|| {
		InstallOutcome::failed(
			InstallStatus::Policy,
			format!(
				"installing GitHub Copilot CLI from VS Code is turned off by the {COPILOT_CLI_COMMAND_POLICY} policy"
			),
		)
	});
	match &options.mode {
		InstallMode::Interactive => {
			// The parent shim waits for this process, so Ctrl+C stops the install at the next step and the partial
			// download is removed instead of the process ending with it.
			if let Err(error) = crate::runtime::platform::install_cancellation_handler() {
				runtime.write_diagnostic(&format!("failed to handle Ctrl+C: {error}"));
			}
			let mut outcome = policy_outcome.unwrap_or_else(|| {
				let mut reporter = ConsoleReporter {
					last_phase: None,
					last_percent: None,
				};
				install_cli(target, &mut reporter)
			});
			// After Ctrl+C, a step that failed because it was interrupted is the cancellation. The parent shim reports it.
			if crate::runtime::platform::is_process_cancellation_requested()
				&& !matches!(
					outcome.status,
					InstallStatus::Installed | InstallStatus::AlreadyInstalled
				) {
				outcome.status = InstallStatus::Cancelled;
			}
			match outcome.status {
				InstallStatus::Cancelled => {}
				InstallStatus::Installed => eprintln!(
					"Installed GitHub Copilot CLI{}.",
					outcome
						.release_tag
						.as_deref()
						.map(|tag| format!(" {tag}"))
						.unwrap_or_default()
				),
				InstallStatus::AlreadyInstalled => eprintln!(
					"GitHub Copilot CLI is already installed{}.",
					outcome
						.cli_path
						.as_ref()
						.map(|path| format!(" at {}", path.display()))
						.unwrap_or_default()
				),
				// The reason is shown without verbose mode; the parent shim adds the manual install link.
				_ => runtime.write_message(&format!(
					"GitHub Copilot CLI couldn't be installed: {}",
					outcome.reason
				)),
			}
			outcome.status.exit_code()
		}
		InstallMode::Setup {
			progress_file,
			result_file,
			cancel_file,
			running_mutex,
		} => {
			#[cfg(windows)]
			let _mutex = match running_mutex {
				Some(name) => match windows::RunningMutex::acquire(name) {
					Ok(mutex) => Some(mutex),
					Err(error) => {
						runtime.write_diagnostic(&format!(
							"failed to create the running mutex: {error}"
						));
						None
					}
				},
				None => None,
			};
			#[cfg(not(windows))]
			let _ = running_mutex;

			let outcome = match policy_outcome {
				Some(outcome) => outcome,
				None => match find_cli(runtime, probe_search_path(runtime, ProbeScope::User)) {
					Ok(Some(path)) => InstallOutcome {
						status: InstallStatus::AlreadyInstalled,
						reason: String::new(),
						installer_exit_code: 0,
						cli_path: Some(path),
						release_tag: None,
						log: None,
					},
					_ => {
						let mut reporter = FileReporter {
							progress_file: progress_file.clone(),
							cancel_file: cancel_file.clone(),
							heartbeat: 0,
							last: None,
						};
						install_cli(target, &mut reporter)
					}
				},
			};
			let entries = [
				("status", String::from(outcome.status.name())),
				("exitCode", outcome.installer_exit_code.to_string()),
				(
					"cliPath",
					outcome
						.cli_path
						.as_ref()
						.map(|path| path.display().to_string())
						.unwrap_or_default(),
				),
				(
					"cliVersion",
					outcome.release_tag.clone().unwrap_or_default(),
				),
				(
					"log",
					outcome
						.log
						.as_ref()
						.map(|path| path.display().to_string())
						.unwrap_or_default(),
				),
				("reason", outcome.reason.clone()),
			];
			if let Err(error) = write_ini(result_file, "result", &entries) {
				runtime.write_diagnostic(&format!(
					"failed to write the install result to {result_file:?}: {error}"
				));
			}
			outcome.status.exit_code()
		}
	}
}

#[cfg(not(windows))]
fn install_cli(_target: Option<HostTarget>, _reporter: &mut dyn InstallReporter) -> InstallOutcome {
	InstallOutcome::failed(
		InstallStatus::Unsupported,
		"the MSI install is only available on Windows",
	)
}

/// Downloads GitHub's per-user Copilot CLI MSI from the latest release, checks it against the release's checksum list
/// and its Authenticode signer, and installs it silently without elevation.
#[cfg(windows)]
fn install_cli(target: Option<HostTarget>, reporter: &mut dyn InstallReporter) -> InstallOutcome {
	use std::io::Write;

	let Some(asset) = msi_asset(target) else {
		return InstallOutcome::failed(InstallStatus::Unsupported, "no MSI for this architecture");
	};
	// The MSI has no MajorUpgrade, so running it over an existing installation could register a second copy. Copilot CLI
	// updates itself, so this only installs where there is no Copilot CLI.
	if let Some(path) = windows::cli_install_directory()
		.map(|directory| directory.join("copilot.exe"))
		.filter(|path| path.is_file())
	{
		return InstallOutcome {
			cli_path: Some(path),
			..InstallOutcome::failed(InstallStatus::AlreadyInstalled, "")
		};
	}
	if matches!(windows::cli_msi_registered(), Ok(true)) {
		return InstallOutcome::failed(
			InstallStatus::Error,
			"GitHub Copilot CLI is registered in Installed apps, but its copilot.exe is missing; uninstall it in Settings > Apps > Installed apps and try again",
		);
	}
	let cancelled =
		|| InstallOutcome::failed(InstallStatus::Cancelled, "the install was cancelled");
	reporter.report(InstallPhase::Resolving, 0, 0);
	let base = releases_base();
	let client = match windows::HttpClient::new(INSTALL_REQUEST_TIMEOUT) {
		Ok(client) => client,
		Err(error) => return InstallOutcome::failed(InstallStatus::Network, error.to_string()),
	};
	let tag = match resolve_latest_tag(&client, &base) {
		Ok(tag) => tag,
		Err(error) => return InstallOutcome::failed(InstallStatus::Network, error),
	};
	let with_tag = |mut outcome: InstallOutcome| {
		outcome.release_tag = Some(tag.clone());
		outcome
	};

	let checksums_url = format!("{base}/download/{tag}/SHA256SUMS.txt");
	let mut checksums = String::new();
	match client.request("GET", &checksums_url, true) {
		Ok(response) if response.status == 200 => {
			if let Err(error) = response
				.take(MAXIMUM_CHECKSUMS_SIZE)
				.read_to_string(&mut checksums)
			{
				return with_tag(InstallOutcome::failed(
					InstallStatus::Network,
					error.to_string(),
				));
			}
		}
		Ok(response) => {
			return with_tag(InstallOutcome::failed(
				InstallStatus::Network,
				format!("{checksums_url} returned HTTP {}", response.status),
			))
		}
		Err(error) => {
			return with_tag(InstallOutcome::failed(
				InstallStatus::Network,
				error.to_string(),
			))
		}
	}
	let Some(expected) = expected_sha256(&checksums, asset) else {
		return with_tag(InstallOutcome::failed(
			InstallStatus::Verification,
			format!("SHA256SUMS.txt has no entry for {asset}"),
		));
	};

	let directory = match tempfile::Builder::new()
		.prefix("vscode-copilot-cli-")
		.tempdir()
	{
		Ok(directory) => directory,
		Err(error) => {
			return with_tag(InstallOutcome::failed(
				InstallStatus::Error,
				error.to_string(),
			))
		}
	};
	let msi = directory.path().join(asset);
	let url = format!("{base}/download/{tag}/{asset}");
	let download = (|| -> Result<String, InstallOutcome> {
		let mut response = client
			.request("GET", &url, true)
			.map_err(|error| InstallOutcome::failed(InstallStatus::Network, error.to_string()))?;
		if response.status != 200 {
			return Err(InstallOutcome::failed(
				InstallStatus::Network,
				format!("{url} returned HTTP {}", response.status),
			));
		}
		let total = response.content_length().unwrap_or(0);
		let mut file = std::fs::File::create(&msi)
			.map_err(|error| InstallOutcome::failed(InstallStatus::Error, error.to_string()))?;
		let mut hash = windows::Sha256::new()
			.map_err(|error| InstallOutcome::failed(InstallStatus::Error, error.to_string()))?;
		let mut buffer = vec![0_u8; 64 * 1024];
		let mut current = 0_u64;
		reporter.report(InstallPhase::Downloading, 0, total);
		loop {
			if reporter.cancelled() {
				return Err(cancelled());
			}
			let read = response.read(&mut buffer).map_err(|error| {
				InstallOutcome::failed(InstallStatus::Network, error.to_string())
			})?;
			if read == 0 {
				break;
			}
			file.write_all(&buffer[..read])
				.and_then(|()| hash.update(&buffer[..read]))
				.map_err(|error| InstallOutcome::failed(InstallStatus::Error, error.to_string()))?;
			current += read as u64;
			reporter.report(InstallPhase::Downloading, current, total);
		}
		hash.finish()
			.map(|digest| hex(&digest))
			.map_err(|error| InstallOutcome::failed(InstallStatus::Error, error.to_string()))
	})();
	let actual = match download {
		Ok(actual) => actual,
		Err(outcome) => return with_tag(outcome),
	};

	reporter.report(InstallPhase::Verifying, 0, 0);
	if actual != expected {
		return with_tag(InstallOutcome::failed(
			InstallStatus::Verification,
			format!("{asset} has SHA-256 {actual}, expected {expected}"),
		));
	}
	match windows::authenticode_signer(&msi) {
		Ok(signer) if signer == EXPECTED_SIGNER => {}
		Ok(signer) => {
			return with_tag(InstallOutcome::failed(
				InstallStatus::Verification,
				format!("{asset} is signed by {signer:?}, expected {EXPECTED_SIGNER:?}"),
			))
		}
		Err(error) => {
			return with_tag(InstallOutcome::failed(
				InstallStatus::Verification,
				error.to_string(),
			))
		}
	}

	// msiexec can't be stopped safely once it runs, so this is the last point where a cancel takes effect.
	if reporter.cancelled() {
		return with_tag(cancelled());
	}
	reporter.report(InstallPhase::Installing, 0, 0);
	let log = std::env::temp_dir().join("vscode-copilot-cli-install.log");
	let msiexec = std::env::var_os("SystemRoot")
		.map(|root| PathBuf::from(root).join(r"System32\msiexec.exe"))
		.unwrap_or_else(|| PathBuf::from("msiexec.exe"));
	let mut child = match std::process::Command::new(&msiexec)
		.arg("/i")
		.arg(&msi)
		.args(["/qn", "/norestart", "/l*v"])
		.arg(&log)
		.spawn()
	{
		Ok(child) => child,
		Err(error) => {
			return with_tag(InstallOutcome::failed(
				InstallStatus::Msiexec,
				error.to_string(),
			))
		}
	};
	let status = loop {
		match child.try_wait() {
			Ok(Some(status)) => break status,
			Ok(None) => {
				reporter.report(InstallPhase::Installing, 0, 0);
				std::thread::sleep(Duration::from_millis(500));
			}
			Err(error) => {
				return with_tag(InstallOutcome::failed(
					InstallStatus::Msiexec,
					error.to_string(),
				))
			}
		}
	};
	let installer_exit_code = status.code().unwrap_or(1);
	let mut outcome = match installer_exit_code {
		// 3010: installed, but a restart is required to complete; the CLI is usable.
		0 | 3010 => InstallOutcome::failed(InstallStatus::Installed, ""),
		1602 => InstallOutcome::failed(InstallStatus::Cancelled, "the install was cancelled"),
		code => InstallOutcome::failed(
			InstallStatus::Msiexec,
			format!("msiexec exited with {code}"),
		),
	};
	outcome.installer_exit_code = installer_exit_code;
	outcome.log = Some(log);
	if outcome.status == InstallStatus::Installed {
		let cli = windows::cli_install_directory().map(|directory| directory.join("copilot.exe"));
		match cli {
			Some(path) if path.is_file() => outcome.cli_path = Some(path),
			_ => {
				outcome.status = InstallStatus::Error;
				outcome.reason = String::from("the MSI finished but copilot.exe was not found");
			}
		}
	}
	with_tag(outcome)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn release_tags_are_parsed_from_redirects() {
		assert_eq!(
			[
				parse_release_tag("https://github.com/github/copilot-cli/releases/tag/v1.0.89"),
				parse_release_tag("http://127.0.0.1:9/releases/tag/v1.0.0-1?x=y"),
				parse_release_tag("https://github.com/github/copilot-cli/releases"),
				parse_release_tag("https://github.com/github/copilot-cli/releases/tag/"),
				parse_release_tag("https://github.com/github/copilot-cli/releases/tag/..%2F"),
			],
			[
				Some(String::from("v1.0.89")),
				Some(String::from("v1.0.0-1")),
				None,
				None,
				None,
			]
		);
	}

	#[test]
	fn checksums_are_matched_by_exact_asset_name() {
		let checksums = "c5e80e05b5f9a288dc478f1d6d4694a9466419e91bef05a6456ce0b2ccadd331  copilot-win32-arm64.zip\n\
			8F4A8A3EB38F1033ADCBBF265DA70A6A0047FCEDC07DE259930071A9471EBD8D *copilot-x64.msi\n\
			not-a-hash  copilot-arm64.msi\n";
		assert_eq!(
			[
				expected_sha256(checksums, "copilot-x64.msi"),
				expected_sha256(checksums, "copilot-arm64.msi"),
				expected_sha256(checksums, "copilot-x64"),
			],
			[
				Some(String::from(
					"8f4a8a3eb38f1033adcbbf265da70a6a0047fcedc07de259930071a9471ebd8d"
				)),
				None,
				None,
			]
		);
	}

	#[test]
	fn msi_assets_follow_the_windows_architecture() {
		assert_eq!(
			[
				msi_asset(Some(HostTarget::WindowsX64)),
				msi_asset(Some(HostTarget::WindowsArm64)),
				msi_asset(Some(HostTarget::MacosArm64)),
				msi_asset(None),
			],
			[
				Some("copilot-x64.msi"),
				Some("copilot-arm64.msi"),
				None,
				None
			]
		);
	}

	#[test]
	fn ini_values_are_single_line() {
		assert_eq!(
			render_ini(
				"probe",
				&[
					("cliFound", flag(true)),
					("reason", String::from("line one\r\nline two")),
				]
			),
			"[probe]\r\ncliFound=1\r\nreason=line one  line two\r\n"
		);
	}

	#[test]
	fn write_ini_replaces_the_file_with_utf16() {
		let directory = tempfile::tempdir().expect("create directory");
		let path = directory.path().join("result.ini");
		std::fs::write(&path, b"stale").expect("write stale result");
		write_ini(&path, "result", &[("status", String::from("installed"))]).expect("write result");
		let bytes = std::fs::read(&path).expect("read result");
		let units: Vec<u16> = bytes[2..]
			.chunks(2)
			.map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
			.collect();
		assert_eq!(
			(&bytes[..2], String::from_utf16_lossy(&units)),
			(
				&[0xFF_u8, 0xFE][..],
				String::from("[result]\r\nstatus=installed\r\n")
			)
		);
	}

	#[test]
	fn install_statuses_map_to_the_setup_exit_codes() {
		assert_eq!(
			[
				InstallStatus::Installed,
				InstallStatus::AlreadyInstalled,
				InstallStatus::Policy,
				InstallStatus::Network,
				InstallStatus::Verification,
				InstallStatus::Msiexec,
				InstallStatus::Cancelled,
				InstallStatus::Unsupported,
				InstallStatus::Error,
			]
			.map(|status| (status.name(), status.exit_code())),
			[
				("installed", 0),
				("alreadyInstalled", 0),
				("policy", 10),
				("network", 20),
				("verification", 30),
				("msiexec", 40),
				("cancelled", 50),
				("unsupported", 1),
				("error", 1),
			]
		);
	}
}
