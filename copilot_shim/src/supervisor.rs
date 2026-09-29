/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io::{self, Read};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use super::platform::{self, CapturedChild};
use crate::model::{
	Cancellation, CapturedOutput, CommandSpec, ProbeLimits, ProcessDiagnostic, ProcessError,
	ProcessOperation, ProcessOutcome, ProcessTermination, SupervisionMode, SystemError,
};

const SUPERVISION_INTERVAL: Duration = Duration::from_millis(10);
const INTERACTIVE_CANCELLATION_GRACE: Duration = Duration::from_millis(250);
const OUTPUT_CHUNK_SIZE: usize = 8 * 1024;
static HANDLER_RESULT: OnceLock<Result<(), io::Error>> = OnceLock::new();

#[derive(Clone, Debug)]
pub(crate) struct CancellationToken {
	requested: Arc<AtomicBool>,
	observe_process_handler: bool,
}

impl CancellationToken {
	#[cfg(test)]
	pub(crate) fn new() -> Self {
		Self {
			requested: Arc::new(AtomicBool::new(false)),
			observe_process_handler: false,
		}
	}

	pub(crate) fn process_wide() -> io::Result<Self> {
		match HANDLER_RESULT.get_or_init(platform::install_cancellation_handler) {
			Ok(()) => Ok(Self {
				requested: Arc::new(AtomicBool::new(false)),
				observe_process_handler: true,
			}),
			Err(error) => Err(io::Error::new(error.kind(), error.to_string())),
		}
	}

	#[cfg(test)]
	pub(crate) fn request(&self) {
		self.requested.store(true, Ordering::SeqCst);
	}

	pub(crate) fn is_requested(&self) -> bool {
		self.requested.load(Ordering::SeqCst)
			|| (self.observe_process_handler && platform::is_process_cancellation_requested())
	}
}

pub(crate) struct ProcessSupervisor {
	cancellation: CancellationToken,
}

impl ProcessSupervisor {
	pub(crate) fn new(cancellation: CancellationToken) -> Self {
		Self { cancellation }
	}

	pub(crate) fn supervise(
		&self,
		command: &CommandSpec,
		mode: SupervisionMode,
	) -> Result<ProcessOutcome, ProcessError> {
		match mode {
			SupervisionMode::CapturedVersionProbe(limits) => {
				self.supervise_captured(command, limits)
			}
			SupervisionMode::InteractiveBootstrap => self.supervise_interactive(command, true),
			SupervisionMode::FinalInteractiveCli => self.supervise_interactive(command, false),
		}
	}

	fn supervise_captured(
		&self,
		command: &CommandSpec,
		limits: ProbeLimits,
	) -> Result<ProcessOutcome, ProcessError> {
		let mut child = platform::spawn_captured(command)?;
		let stdout = child
			.take_stdout()
			.map_err(|error| supervision_error(ProcessOperation::ReadStdout, command, &error))?;
		let stderr = child
			.take_stderr()
			.map_err(|error| supervision_error(ProcessOperation::ReadStderr, command, &error))?;
		let (sender, receiver) = mpsc::sync_channel(2);
		let stdout_reader = spawn_reader(stdout, OutputStream::Stdout, sender.clone());
		let stderr_reader = spawn_reader(stderr, OutputStream::Stderr, sender);
		let deadline = Instant::now() + limits.timeout.duration();
		let mut output = CapturedOutput {
			stdout: Vec::new(),
			stderr: Vec::new(),
		};
		let mut open_streams = 2;
		let mut termination = None;
		let mut containment_cleaned = false;

		let result = loop {
			if self.cancellation.is_requested() {
				break terminate_probe(
					&mut child,
					command,
					Ok(ProcessOutcome {
						termination: ProcessTermination::HandledCancellation(
							Cancellation::Requested,
						),
						captured_output: Some(output),
					}),
				);
			}
			if Instant::now() >= deadline {
				break terminate_probe(
					&mut child,
					command,
					Err(ProcessError::TimedOut {
						timeout: limits.timeout,
						captured_output: output,
					}),
				);
			}
			if termination.is_none() {
				match child.try_wait() {
					Ok(status) => termination = status,
					Err(error) => {
						break terminate_probe(
							&mut child,
							command,
							Err(supervision_error(ProcessOperation::Wait, command, &error)),
						);
					}
				}
			}
			if termination.is_some() && !containment_cleaned {
				if let Err(error) = cleanup_probe(&mut child, command) {
					break Err(error);
				}
				containment_cleaned = true;
			}
			if let Some(termination) = termination {
				if open_streams == 0 {
					break Ok(ProcessOutcome {
						termination,
						captured_output: Some(output),
					});
				}
			}

			let remaining = deadline.saturating_duration_since(Instant::now());
			match receiver.recv_timeout(remaining.min(SUPERVISION_INTERVAL)) {
				Ok(ReaderEvent::Data(stream, bytes)) => {
					let captured_bytes = output.stdout.len() + output.stderr.len();
					let remaining = limits.output.bytes().saturating_sub(captured_bytes);
					let retained_bytes = bytes.len().min(remaining);
					match stream {
						OutputStream::Stdout => {
							output.stdout.extend_from_slice(&bytes[..retained_bytes])
						}
						OutputStream::Stderr => {
							output.stderr.extend_from_slice(&bytes[..retained_bytes])
						}
					}
					if retained_bytes != bytes.len() {
						break terminate_probe(
							&mut child,
							command,
							Err(ProcessError::OutputLimitExceeded {
								budget: limits.output,
								captured_output: output,
							}),
						);
					}
				}
				Ok(ReaderEvent::Closed) => open_streams -= 1,
				Ok(ReaderEvent::Failed(stream, error)) => {
					let operation = match stream {
						OutputStream::Stdout => ProcessOperation::ReadStdout,
						OutputStream::Stderr => ProcessOperation::ReadStderr,
					};
					break terminate_probe(
						&mut child,
						command,
						Err(supervision_error(operation, command, &error)),
					);
				}
				Err(RecvTimeoutError::Timeout) => {}
				Err(RecvTimeoutError::Disconnected) => open_streams = 0,
			}
		};

		drop(receiver);
		Self::join_reader(stdout_reader, command)?;
		Self::join_reader(stderr_reader, command)?;
		result
	}

	fn join_reader(
		reader: thread::JoinHandle<()>,
		command: &CommandSpec,
	) -> Result<(), ProcessError> {
		reader.join().map_err(|_| {
			let error = io::Error::other("probe output reader thread terminated unexpectedly");
			supervision_error(ProcessOperation::ReadStdout, command, &error)
		})
	}

	fn supervise_interactive(
		&self,
		command: &CommandSpec,
		cancel_bootstrap: bool,
	) -> Result<ProcessOutcome, ProcessError> {
		let mut child = platform::spawn_interactive(command)?;
		if !cancel_bootstrap {
			return child
				.wait()
				.map(|termination| ProcessOutcome {
					termination,
					captured_output: None,
				})
				.map_err(|error| supervision_error(ProcessOperation::Wait, command, &error));
		}

		loop {
			if self.cancellation.is_requested() {
				let deadline = Instant::now() + INTERACTIVE_CANCELLATION_GRACE;
				while Instant::now() < deadline {
					if child
						.try_wait()
						.map_err(|error| {
							supervision_error(ProcessOperation::Wait, command, &error)
						})?
						.is_some()
					{
						return Ok(cancelled_outcome());
					}
					thread::sleep(SUPERVISION_INTERVAL);
				}

				child.terminate().map_err(|error| {
					supervision_error(ProcessOperation::Terminate, command, &error)
				})?;
				child
					.wait()
					.map_err(|error| supervision_error(ProcessOperation::Reap, command, &error))?;
				return Ok(cancelled_outcome());
			}
			if let Some(termination) = child
				.try_wait()
				.map_err(|error| supervision_error(ProcessOperation::Wait, command, &error))?
			{
				return Ok(ProcessOutcome {
					termination,
					captured_output: None,
				});
			}
			thread::sleep(SUPERVISION_INTERVAL);
		}
	}
}

fn terminate_probe(
	child: &mut CapturedChild,
	command: &CommandSpec,
	result: Result<ProcessOutcome, ProcessError>,
) -> Result<ProcessOutcome, ProcessError> {
	cleanup_probe(child, command)?;
	result
}

fn cleanup_probe(child: &mut CapturedChild, command: &CommandSpec) -> Result<(), ProcessError> {
	child.terminate_and_reap().map_err(|error| {
		ProcessError::SupervisionFailed(ProcessDiagnostic {
			operation: ProcessOperation::Terminate,
			subject: Some(command.program().into()),
			error: SystemError::from(&error),
		})
	})
}

fn cancelled_outcome() -> ProcessOutcome {
	ProcessOutcome {
		termination: ProcessTermination::HandledCancellation(Cancellation::Requested),
		captured_output: None,
	}
}

#[derive(Clone, Copy)]
enum OutputStream {
	Stdout,
	Stderr,
}

enum ReaderEvent {
	Data(OutputStream, Vec<u8>),
	Closed,
	Failed(OutputStream, io::Error),
}

fn spawn_reader(
	mut reader: impl Read + Send + 'static,
	stream: OutputStream,
	sender: SyncSender<ReaderEvent>,
) -> thread::JoinHandle<()> {
	thread::spawn(move || {
		let mut buffer = [0; OUTPUT_CHUNK_SIZE];
		loop {
			match reader.read(&mut buffer) {
				Ok(0) => {
					let _ = sender.send(ReaderEvent::Closed);
					return;
				}
				Ok(bytes_read) => {
					if sender
						.send(ReaderEvent::Data(stream, buffer[..bytes_read].to_vec()))
						.is_err()
					{
						return;
					}
				}
				Err(error) => {
					let _ = sender.send(ReaderEvent::Failed(stream, error));
					return;
				}
			}
		}
	})
}

fn supervision_error(
	operation: ProcessOperation,
	command: &CommandSpec,
	error: &io::Error,
) -> ProcessError {
	ProcessError::SupervisionFailed(ProcessDiagnostic {
		operation,
		subject: Some(command.program().into()),
		error: SystemError::from(error),
	})
}

#[cfg(test)]
mod cancellation_tests {
	use super::*;

	#[test]
	fn local_cancellation_token_records_requests() {
		let token = CancellationToken::new();
		assert!(!token.is_requested());

		token.request();

		assert!(token.is_requested());
	}
}

#[cfg(test)]
mod tests {
	use crate::{model, runtime};
	use std::ffi::OsString;
	use std::fs;
	use std::path::PathBuf;
	use std::thread;
	use std::time::{Duration, Instant};

	use model::{
		CommandArguments, CommandSpec, LaunchAdapter, OutputBudget, ProbeLimits, ProbeTimeout,
		ProcessError, ProcessTermination, SupervisionMode,
	};
	#[cfg(windows)]
	use runtime::platform;
	use runtime::supervisor::{CancellationToken, ProcessSupervisor};
	#[cfg(unix)]
	use runtime::{NativeRuntime, ProcessEffects};

	#[cfg(unix)]
	fn shell_command(script: &str) -> CommandSpec {
		CommandSpec::new(
			OsString::from("/bin/sh"),
			CommandArguments::Native(vec![OsString::from("-c"), OsString::from(script)]),
			LaunchAdapter::Direct,
		)
	}

	#[cfg(windows)]
	fn windows_command_script(script: &std::path::Path, arguments: Vec<OsString>) -> CommandSpec {
		let command_shell =
			std::env::var_os("ComSpec").unwrap_or_else(|| OsString::from("cmd.exe"));
		let raw_command_tail =
			platform::encode_windows_command_tail(script.as_os_str(), &arguments)
				.expect("test command tail should encode");
		CommandSpec::new(
			command_shell,
			CommandArguments::WindowsCommand {
				switches: ["/D", "/S", "/C"].into_iter().map(OsString::from).collect(),
				raw_command_tail,
			},
			LaunchAdapter::WindowsCommandScript {
				script: script.to_path_buf(),
				kind: match script.extension().and_then(|extension| extension.to_str()) {
					Some("cmd") => model::WindowsScriptKind::Cmd,
					_ => model::WindowsScriptKind::Batch,
				},
			},
		)
	}

	#[cfg(windows)]
	fn unique_windows_path(name: &str, extension: &str) -> PathBuf {
		std::env::temp_dir().join(format!(
			"copilot-shim-{name}-{}-{}.{}",
			std::process::id(),
			std::thread::current().name().unwrap_or("test"),
			extension
		))
	}

	#[cfg(windows)]
	fn find_windows_program(name: &str) -> Option<PathBuf> {
		let path = std::env::var_os("PATH")?;
		std::env::split_paths(&path)
			.map(|directory| directory.join(name))
			.find(|path| path.is_file())
	}

	#[cfg(unix)]
	fn process_exists(process_id: i32) -> bool {
		let result = unsafe { libc::kill(process_id, 0) };
		result == 0 || std::io::Error::last_os_error().raw_os_error() == Some(libc::EPERM)
	}

	#[cfg(unix)]
	fn stop_process(process_id: i32) {
		unsafe {
			libc::kill(process_id, libc::SIGKILL);
		}
	}

	#[cfg(windows)]
	#[test]
	fn cmd_and_batch_raw_tail_round_trip_without_injection() {
		for extension in ["cmd", "bat"] {
			let script = unique_windows_path("raw-tail", extension);
			let output = unique_windows_path("raw-tail-output", "txt");
			let sentinel = unique_windows_path("raw-tail-injected", "txt");
			fs::write(
				&script,
				format!(
					"@echo off\r\nsetlocal DisableDelayedExpansion\r\n:next\r\nif \"%~1\"==\"\" goto done\r\n>>\"{}\" <nul set /p \"=%~1\"\r\n>>\"{}\" echo(\r\nshift\r\ngoto next\r\n:done\r\nexit /b 0\r\n",
					output.display(),
					output.display()
				),
			)
			.expect("write command script");
			let argument_values = [
				String::from("with spaces"),
				String::from("Grüße-東京"),
				format!("safe&echo injected>\"{}\"", sentinel.display()),
				String::from(r"trailing\\"),
			];
			let arguments: Vec<OsString> = argument_values.iter().map(OsString::from).collect();
			let supervisor = ProcessSupervisor::new(CancellationToken::new());

			let outcome = supervisor
				.supervise(
					&windows_command_script(&script, arguments.clone()),
					SupervisionMode::CapturedVersionProbe(ProbeLimits {
						timeout: ProbeTimeout::new(Duration::from_secs(5)),
						output: OutputBudget::new(262_144),
					}),
				)
				.expect("command script should complete");

			let expected = argument_values.join("\r\n") + "\r\n";
			assert_eq!(
				(
					outcome.termination,
					fs::read_to_string(&output).expect("read command output"),
					sentinel.exists(),
				),
				(ProcessTermination::NumericExit(0), expected, false)
			);
			fs::remove_file(script).expect("remove command script");
			fs::remove_file(output).expect("remove command output");
		}
	}

	#[cfg(windows)]
	#[test]
	fn final_interactive_cli_preserves_numeric_exit() {
		let command_shell =
			std::env::var_os("ComSpec").unwrap_or_else(|| OsString::from("cmd.exe"));
		let command = CommandSpec::new(
			command_shell,
			CommandArguments::Native(
				["/D", "/S", "/C", "exit /b 23"]
					.into_iter()
					.map(OsString::from)
					.collect(),
			),
			LaunchAdapter::Direct,
		);
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let outcome = supervisor
			.supervise(&command, SupervisionMode::FinalInteractiveCli)
			.expect("final CLI should complete");

		assert_eq!(
			(outcome.termination, outcome.captured_output),
			(ProcessTermination::NumericExit(23), None)
		);
	}

	#[cfg(windows)]
	#[test]
	fn available_powershell_hosts_preserve_arguments() {
		let hosts = [
			("pwsh.exe", model::PowerShellHost::Modern),
			("powershell.exe", model::PowerShellHost::WindowsPowerShell),
		];
		for (name, host) in hosts {
			let Some(program) = find_windows_program(name) else {
				eprintln!("skipping {name}: host is unavailable");
				continue;
			};
			if host == model::PowerShellHost::Modern {
				let version = std::process::Command::new(&program)
					.args([
						"-NoLogo",
						"-NoProfile",
						"-Command",
						"$PSVersionTable.PSVersion.ToString()",
					])
					.output()
					.expect("query PowerShell version");
				let version = String::from_utf8_lossy(&version.stdout);
				let mut components = version.trim().split('.');
				let major = components
					.next()
					.and_then(|value| value.parse::<u32>().ok());
				let minor = components
					.next()
					.and_then(|value| value.parse::<u32>().ok());
				if !matches!((major, minor), (Some(major), Some(minor)) if major > 7 || (major == 7 && minor >= 3))
				{
					eprintln!("skipping {name}: PowerShell 7.3+ is unavailable");
					continue;
				}
			}

			let script = unique_windows_path("powershell-arguments", "ps1");
			let output = unique_windows_path("powershell-output", "txt");
			fs::write(
				&script,
				format!(
					"$args | ForEach-Object {{ [IO.File]::AppendAllText('{}', $_ + [Environment]::NewLine) }}",
					output.display()
				),
			)
			.expect("write PowerShell script");
			let forwarded = ["with spaces", "Grüße-東京", "trailing\\"];
			let arguments = [
				"-NoLogo",
				"-NoProfile",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				script.to_str().expect("test path is Unicode"),
			]
			.into_iter()
			.chain(forwarded)
			.map(OsString::from)
			.collect();
			let command = CommandSpec::new(
				program.into(),
				CommandArguments::Native(arguments),
				LaunchAdapter::PowerShellScript {
					script: script.clone(),
					host,
				},
			);
			let supervisor = ProcessSupervisor::new(CancellationToken::new());

			let outcome = supervisor
				.supervise(
					&command,
					SupervisionMode::CapturedVersionProbe(ProbeLimits {
						timeout: ProbeTimeout::new(Duration::from_secs(10)),
						output: OutputBudget::new(262_144),
					}),
				)
				.expect("PowerShell host should complete");

			assert_eq!(
				(
					outcome.termination,
					fs::read_to_string(&output).expect("read PowerShell output"),
				),
				(
					ProcessTermination::NumericExit(0),
					forwarded.join("\r\n") + "\r\n",
				)
			);
			fs::remove_file(script).expect("remove PowerShell script");
			fs::remove_file(output).expect("remove PowerShell output");
		}
	}

	#[cfg(unix)]
	fn probe_limits(timeout: Duration, output_bytes: usize) -> SupervisionMode {
		SupervisionMode::CapturedVersionProbe(ProbeLimits {
			timeout: ProbeTimeout::new(timeout),
			output: OutputBudget::new(output_bytes),
		})
	}

	#[cfg(unix)]
	fn read_process_id(path: &PathBuf) -> i32 {
		fs::read_to_string(path)
			.expect("descendant pid should be recorded")
			.parse()
			.expect("descendant pid should be numeric")
	}

	#[cfg(unix)]
	fn wait_for_process_id(path: &PathBuf, timeout: Duration) -> bool {
		let deadline = Instant::now() + timeout;
		while Instant::now() < deadline {
			if fs::read_to_string(path)
				.ok()
				.and_then(|value| value.parse::<i32>().ok())
				.is_some()
			{
				return true;
			}
			thread::sleep(Duration::from_millis(5));
		}
		false
	}

	#[cfg(unix)]
	fn assert_process_stopped(process_id: i32) {
		for _ in 0..50 {
			if !process_exists(process_id) {
				return;
			}
			thread::sleep(Duration::from_millis(10));
		}
		assert!(!process_exists(process_id), "descendant survived cleanup");
	}

	#[cfg(unix)]
	#[test]
	fn probe_timeout_terminates_group() {
		let pid_file = std::env::temp_dir().join(format!(
			"copilot-shim-timeout-descendant-{}",
			std::process::id()
		));
		let script = format!(
			"sleep 60 & child=$!; printf '%s' \"$child\" > '{}'; wait \"$child\"",
			pid_file.display()
		);
		let supervisor = ProcessSupervisor::new(CancellationToken::new());
		let started = Instant::now();

		let result = supervisor.supervise(
			&shell_command(&script),
			probe_limits(Duration::from_millis(250), 262_144),
		);

		assert_eq!(
			result,
			Err(ProcessError::TimedOut {
				timeout: ProbeTimeout::new(Duration::from_millis(250)),
				captured_output: model::CapturedOutput {
					stdout: Vec::new(),
					stderr: Vec::new(),
				},
			})
		);
		assert!(started.elapsed() < Duration::from_secs(5));
		assert_process_stopped(read_process_id(&pid_file));
		fs::remove_file(pid_file).expect("remove descendant pid file");
	}

	#[test]
	fn production_probe_limits_are_fixed() {
		assert_eq!(
			ProbeLimits::PRODUCTION,
			ProbeLimits {
				timeout: ProbeTimeout::new(Duration::from_secs(30)),
				output: OutputBudget::new(262_144),
			}
		);
	}

	#[cfg(unix)]
	#[test]
	fn captured_probe_drains_both_streams_and_preserves_nonzero_exit() {
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let outcome = supervisor
			.supervise(
				&shell_command("printf 'stdout-value'; printf 'stderr-value' >&2; exit 17"),
				probe_limits(Duration::from_secs(2), 262_144),
			)
			.expect("captured probe should complete");

		assert_eq!(
			outcome,
			model::ProcessOutcome {
				termination: ProcessTermination::NumericExit(17),
				captured_output: Some(model::CapturedOutput {
					stdout: b"stdout-value".to_vec(),
					stderr: b"stderr-value".to_vec(),
				}),
			}
		);
	}

	#[cfg(unix)]
	#[test]
	fn native_runtime_uses_process_supervisor() {
		let runtime = NativeRuntime;

		let outcome = runtime
			.supervise(
				&shell_command("printf 'native-runtime'"),
				probe_limits(Duration::from_secs(2), 262_144),
			)
			.expect("native runtime should supervise the probe");

		assert_eq!(
			outcome,
			model::ProcessOutcome {
				termination: ProcessTermination::NumericExit(0),
				captured_output: Some(model::CapturedOutput {
					stdout: b"native-runtime".to_vec(),
					stderr: Vec::new(),
				}),
			}
		);
	}

	#[cfg(unix)]
	#[test]
	fn immediate_exit_probes_do_not_race_process_group_lookup() {
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		for _ in 0..200 {
			let outcome = supervisor
				.supervise(
					&shell_command("exit 0"),
					probe_limits(Duration::from_secs(2), 262_144),
				)
				.expect("immediate probe should not race process-group setup");
			assert_eq!(outcome.termination, ProcessTermination::NumericExit(0));
		}
	}

	#[cfg(unix)]
	#[test]
	fn captured_probe_disconnects_stdin() {
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let outcome = supervisor
			.supervise(
				&shell_command("if read value; then exit 91; else printf 'disconnected'; fi"),
				probe_limits(Duration::from_secs(2), 262_144),
			)
			.expect("captured probe should observe EOF on stdin");

		assert_eq!(
			outcome,
			model::ProcessOutcome {
				termination: ProcessTermination::NumericExit(0),
				captured_output: Some(model::CapturedOutput {
					stdout: b"disconnected".to_vec(),
					stderr: Vec::new(),
				}),
			}
		);
	}

	#[cfg(unix)]
	#[test]
	fn combined_output_limit_is_bounded_and_terminates_group() {
		let pid_file = std::env::temp_dir().join(format!(
			"copilot-shim-overflow-descendant-{}",
			std::process::id()
		));
		let script = format!(
			"sleep 60 & child=$!; printf '%s' \"$child\" > '{}'; \
			 while :; do printf 'stdout'; printf 'stderr' >&2; done",
			pid_file.display()
		);
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let result = supervisor.supervise(
			&shell_command(&script),
			probe_limits(Duration::from_secs(2), 4_096),
		);

		let Err(ProcessError::OutputLimitExceeded {
			budget,
			captured_output,
		}) = result
		else {
			panic!("expected output limit error, got {result:?}");
		};
		assert_eq!(
			(
				budget,
				captured_output.stdout.len() + captured_output.stderr.len(),
			),
			(OutputBudget::new(4_096), 4_096)
		);
		assert_process_stopped(read_process_id(&pid_file));
		fs::remove_file(pid_file).expect("remove descendant pid file");
	}

	#[cfg(unix)]
	#[test]
	fn cancellation_is_distinct_and_terminates_group() {
		let directory = tempfile::tempdir().expect("create cancellation test directory");
		let pid_file = directory.path().join("descendant.pid");
		let script = format!(
			"sleep 60 & child=$!; printf '%s' \"$child\" > '{}'; wait \"$child\"",
			pid_file.display()
		);
		let cancellation = CancellationToken::new();
		let request = cancellation.clone();
		let readiness_file = pid_file.clone();
		let requester = thread::spawn(move || {
			let ready = wait_for_process_id(&readiness_file, Duration::from_secs(5));
			if ready {
				request.request();
			}
			ready
		});
		let supervisor = ProcessSupervisor::new(cancellation);

		let result = supervisor.supervise(
			&shell_command(&script),
			probe_limits(Duration::from_secs(10), 262_144),
		);
		let ready = requester
			.join()
			.expect("cancellation requester should finish");
		assert!(ready, "descendant PID was not recorded before the deadline");
		let outcome = result.expect("cancellation should be an outcome");

		assert_eq!(
			outcome.termination,
			ProcessTermination::HandledCancellation(model::Cancellation::Requested)
		);
		assert_process_stopped(read_process_id(&pid_file));
	}

	#[cfg(unix)]
	#[test]
	fn bootstrap_cancellation_is_terminal_and_reaps_child() {
		let cancellation = CancellationToken::new();
		let request = cancellation.clone();
		let requester = thread::spawn(move || {
			thread::sleep(Duration::from_millis(100));
			request.request();
		});
		let supervisor = ProcessSupervisor::new(cancellation);

		let outcome = supervisor
			.supervise(
				&shell_command("sleep 60"),
				SupervisionMode::InteractiveBootstrap,
			)
			.expect("bootstrap cancellation should be an outcome");
		requester
			.join()
			.expect("cancellation requester should finish");

		assert_eq!(
			outcome,
			model::ProcessOutcome {
				termination: ProcessTermination::HandledCancellation(
					model::Cancellation::Requested,
				),
				captured_output: None,
			}
		);
	}

	#[cfg(unix)]
	#[test]
	fn bootstrap_cancellation_allows_natural_exit_during_grace() {
		let marker = std::env::temp_dir().join(format!(
			"copilot-shim-bootstrap-grace-{}",
			std::process::id()
		));
		let cancellation = CancellationToken::new();
		let request = cancellation.clone();
		let requester = thread::spawn(move || {
			thread::sleep(Duration::from_millis(50));
			request.request();
		});
		let supervisor = ProcessSupervisor::new(cancellation);

		let outcome = supervisor
			.supervise(
				&shell_command(&format!(
					"sleep 0.15; printf 'natural' > '{}'",
					marker.display()
				)),
				SupervisionMode::InteractiveBootstrap,
			)
			.expect("bootstrap cancellation should preserve the cancellation outcome");
		requester
			.join()
			.expect("cancellation requester should finish");

		assert_eq!(
			(
				outcome.termination,
				fs::read_to_string(&marker).expect("read bootstrap grace marker"),
			),
			(
				ProcessTermination::HandledCancellation(model::Cancellation::Requested),
				String::from("natural"),
			)
		);
		fs::remove_file(marker).expect("remove bootstrap grace marker");
	}

	#[cfg(unix)]
	#[test]
	fn bootstrap_cancellation_forces_child_after_grace() {
		let cancellation = CancellationToken::new();
		let request = cancellation.clone();
		let requester = thread::spawn(move || {
			thread::sleep(Duration::from_millis(50));
			request.request();
		});
		let supervisor = ProcessSupervisor::new(cancellation);
		let started = Instant::now();

		let outcome = supervisor
			.supervise(
				&shell_command("sleep 60"),
				SupervisionMode::InteractiveBootstrap,
			)
			.expect("bootstrap cancellation should force an unresponsive child");
		requester
			.join()
			.expect("cancellation requester should finish");

		assert_eq!(
			outcome.termination,
			ProcessTermination::HandledCancellation(model::Cancellation::Requested)
		);
		assert!(started.elapsed() < Duration::from_secs(2));
	}

	#[cfg(unix)]
	#[test]
	fn successful_probe_cleans_background_descendant() {
		let pid_file = std::env::temp_dir().join(format!(
			"copilot-shim-success-descendant-{}",
			std::process::id()
		));
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let outcome = supervisor
			.supervise(
				&shell_command(&format!(
					"sleep 60 & printf '%s' \"$!\" > '{}'; exit 0",
					pid_file.display()
				)),
				probe_limits(Duration::from_secs(2), 262_144),
			)
			.expect("probe root should complete");
		let process_id = read_process_id(&pid_file);
		let survived = process_exists(process_id);
		if survived {
			stop_process(process_id);
		}
		fs::remove_file(pid_file).expect("remove descendant pid file");

		assert_eq!(
			(outcome.termination, survived),
			(ProcessTermination::NumericExit(0), false)
		);
	}

	#[cfg(unix)]
	#[test]
	fn interactive_modes_keep_uncaptured_foreground_execution() {
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let bootstrap = supervisor
			.supervise(
				&shell_command("exit 0"),
				SupervisionMode::InteractiveBootstrap,
			)
			.expect("bootstrap should complete");
		let final_cli = supervisor
			.supervise(
				&shell_command("exit 23"),
				SupervisionMode::FinalInteractiveCli,
			)
			.expect("final CLI should complete");

		assert_eq!(
			(
				bootstrap.termination,
				bootstrap.captured_output,
				final_cli.termination,
				final_cli.captured_output,
			),
			(
				ProcessTermination::NumericExit(0),
				None,
				ProcessTermination::NumericExit(23),
				None,
			)
		);
	}

	#[cfg(unix)]
	#[test]
	fn final_interactive_cli_preserves_unix_signal_outcome() {
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let outcome = supervisor
			.supervise(
				&shell_command("kill -TERM $$"),
				SupervisionMode::FinalInteractiveCli,
			)
			.expect("signal outcome should be reported");

		assert_eq!(
			outcome.termination,
			ProcessTermination::UnixSignal(libc::SIGTERM)
		);
	}

	#[cfg(windows)]
	#[test]
	fn probe_timeout_terminates_group() {
		let script = unique_windows_path("timeout-job", "cmd");
		let survivor = unique_windows_path("timeout-survivor", "txt");
		fs::write(
			&script,
			format!(
				"@echo off\r\nstart \"\" /b cmd.exe /D /S /C \"ping 127.0.0.1 -n 3 >NUL & echo survived>\\\"{}\\\"\"\r\nping 127.0.0.1 -n 30 >NUL\r\n",
				survivor.display()
			),
		)
		.expect("write timeout script");
		let supervisor = ProcessSupervisor::new(CancellationToken::new());

		let result = supervisor.supervise(
			&windows_command_script(&script, Vec::new()),
			SupervisionMode::CapturedVersionProbe(ProbeLimits {
				timeout: ProbeTimeout::new(Duration::from_millis(250)),
				output: OutputBudget::new(262_144),
			}),
		);

		assert_eq!(
			result,
			Err(ProcessError::TimedOut {
				timeout: ProbeTimeout::new(Duration::from_millis(250)),
				captured_output: model::CapturedOutput {
					stdout: Vec::new(),
					stderr: Vec::new(),
				},
			})
		);
		let deadline = Instant::now() + Duration::from_secs(4);
		while Instant::now() < deadline && !survivor.exists() {
			thread::sleep(Duration::from_millis(25));
		}
		assert!(!survivor.exists(), "Job Object descendant survived timeout");
		fs::remove_file(script).expect("remove timeout script");
	}

	#[cfg(not(any(unix, windows)))]
	#[test]
	fn probe_timeout_terminates_group() {
		panic!("process supervision is unsupported on this target");
	}
}
