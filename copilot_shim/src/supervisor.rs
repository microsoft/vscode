/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io;
#[cfg(windows)]
use std::io::Read;
#[cfg(test)]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::sync::mpsc::{self, RecvTimeoutError, SyncSender};
#[cfg(test)]
use std::sync::Arc;
use std::sync::OnceLock;
#[cfg(windows)]
use std::thread;
#[cfg(windows)]
use std::time::{Duration, Instant};

use super::platform;
#[cfg(windows)]
use crate::model::{CapturedOutput, ProbeLimits, ProcessOperation};
use crate::model::{
	CommandSpec, ProcessError, ProcessOutcome, ProcessTermination, SupervisionMode,
};

#[cfg(windows)]
const SUPERVISION_INTERVAL: Duration = Duration::from_millis(10);
#[cfg(windows)]
const OUTPUT_CHUNK_SIZE: usize = 8 * 1024;
static HANDLER_RESULT: OnceLock<Result<(), io::Error>> = OnceLock::new();

#[derive(Clone, Debug)]
pub(crate) struct CancellationToken {
	/// Lets tests cancel without touching the process-wide Ctrl+C state.
	#[cfg(test)]
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
				#[cfg(test)]
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
		#[cfg(test)]
		if self.requested.load(Ordering::SeqCst) {
			return true;
		}
		self.observe_process_handler && platform::is_process_cancellation_requested()
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
		let termination = match mode {
			#[cfg(windows)]
			SupervisionMode::CapturedVersionProbe(limits) => {
				return self.supervise_captured(command, limits)
			}
			// Ctrl+C reaches the installer too, and the installer decides how to stop. The shim waits for it, so a
			// cancelled install cleans up and an install that can't be stopped finishes, and then reports the cancel.
			SupervisionMode::InteractiveBootstrap => {
				let termination = platform::run_interactive(command)?;
				if self.cancellation.is_requested() {
					ProcessTermination::HandledCancellation
				} else {
					termination
				}
			}
			#[cfg(windows)]
			SupervisionMode::FinalInteractiveCli => platform::run_interactive(command)?,
			#[cfg(not(windows))]
			_ => unreachable!("on Unix the final CLI replaces the shim, and PowerShell probes only run on Windows"),
		};
		Ok(ProcessOutcome {
			termination,
			captured_output: None,
		})
	}

	#[cfg(windows)]
	fn supervise_captured(
		&self,
		command: &CommandSpec,
		limits: ProbeLimits,
	) -> Result<ProcessOutcome, ProcessError> {
		let mut child = platform::spawn_captured(command)?;
		let stdout = child.take_stdout().map_err(|error| {
			ProcessError::supervision(ProcessOperation::ReadStdout, command.program(), &error)
		})?;
		let stderr = child.take_stderr().map_err(|error| {
			ProcessError::supervision(ProcessOperation::ReadStderr, command.program(), &error)
		})?;
		let (sender, receiver) = mpsc::sync_channel(2);
		let stdout_reader = spawn_reader(stdout, OutputStream::Stdout, sender.clone());
		let stderr_reader = spawn_reader(stderr, OutputStream::Stderr, sender);
		let deadline = Instant::now() + limits.timeout;
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
						termination: ProcessTermination::HandledCancellation,
						captured_output: Some(output),
					}),
				);
			}
			if Instant::now() >= deadline {
				break terminate_probe(
					&mut child,
					command,
					Err(ProcessError::TimedOut(limits.timeout)),
				);
			}
			if termination.is_none() {
				match child.try_wait() {
					Ok(status) => termination = status,
					Err(error) => {
						break terminate_probe(
							&mut child,
							command,
							Err(ProcessError::supervision(
								ProcessOperation::Wait,
								command.program(),
								&error,
							)),
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
					let remaining = limits.output_bytes.saturating_sub(captured_bytes);
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
							Err(ProcessError::OutputLimitExceeded(limits.output_bytes)),
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
						Err(ProcessError::supervision(
							operation,
							command.program(),
							&error,
						)),
					);
				}
				Err(RecvTimeoutError::Timeout) => {}
				Err(RecvTimeoutError::Disconnected) => open_streams = 0,
			}
		};

		drop(receiver);
		for reader in [stdout_reader, stderr_reader] {
			reader.join().map_err(|_| {
				let error = io::Error::other("probe output reader thread terminated unexpectedly");
				ProcessError::supervision(ProcessOperation::ReadStdout, command.program(), &error)
			})?;
		}
		result
	}
}

#[cfg(windows)]
fn terminate_probe(
	child: &mut platform::CapturedChild,
	command: &CommandSpec,
	result: Result<ProcessOutcome, ProcessError>,
) -> Result<ProcessOutcome, ProcessError> {
	cleanup_probe(child, command)?;
	result
}

#[cfg(windows)]
fn cleanup_probe(
	child: &mut platform::CapturedChild,
	command: &CommandSpec,
) -> Result<(), ProcessError> {
	child.terminate_and_reap().map_err(|error| {
		ProcessError::supervision(ProcessOperation::Terminate, command.program(), &error)
	})
}

#[cfg(windows)]
#[derive(Clone, Copy)]
enum OutputStream {
	Stdout,
	Stderr,
}

#[cfg(windows)]
enum ReaderEvent {
	Data(OutputStream, Vec<u8>),
	Closed,
	Failed(OutputStream, io::Error),
}

#[cfg(windows)]
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

#[cfg(test)]
mod tests {
	use crate::{model, runtime};
	use std::ffi::OsString;
	#[cfg(windows)]
	use std::fs;
	#[cfg(windows)]
	use std::path::PathBuf;
	#[cfg(windows)]
	use std::thread;
	use std::time::Duration;
	#[cfg(windows)]
	use std::time::Instant;

	use model::{CommandArguments, CommandSpec, ProcessTermination, SupervisionMode};
	#[cfg(windows)]
	use model::{ProbeLimits, ProcessError};
	#[cfg(windows)]
	use runtime::platform;
	use runtime::supervisor::{CancellationToken, ProcessSupervisor};

	/// Waits about `seconds` and exits with `code`.
	fn wait_then_exit(seconds: u32, code: i32) -> CommandSpec {
		#[cfg(unix)]
		let (program, arguments) = (
			OsString::from("/bin/sh"),
			[String::from("-c"), format!("sleep {seconds}; exit {code}")],
		);
		#[cfg(windows)]
		let (program, arguments) = (
			std::env::var_os("ComSpec").unwrap_or_else(|| OsString::from("cmd.exe")),
			[
				String::from("/C"),
				format!("ping -n {} 127.0.0.1 >NUL & exit {code}", seconds + 1),
			],
		);
		CommandSpec::new(
			program,
			CommandArguments::Native(arguments.into_iter().map(OsString::from).collect()),
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
				switches: platform::WINDOWS_COMMAND_SWITCHES
					.into_iter()
					.map(OsString::from)
					.collect(),
				raw_command_tail,
			},
		)
	}

	#[cfg(windows)]
	fn unique_windows_path(name: &str, extension: &str) -> PathBuf {
		// Test thread names contain `::`, which is not valid in Windows file names.
		let thread = std::thread::current().name().unwrap_or("test").replace(
			|c: char| !c.is_ascii_alphanumeric() && c != '-' && c != '_',
			"_",
		);
		std::env::temp_dir().join(format!(
			"copilot-shim-{name}-{}-{thread}.{extension}",
			std::process::id(),
		))
	}

	#[cfg(windows)]
	fn find_windows_program(name: &str) -> Option<PathBuf> {
		let path = std::env::var_os("PATH")?;
		std::env::split_paths(&path)
			.map(|directory| directory.join(name))
			.find(|path| path.is_file())
	}

	#[test]
	fn bootstrap_reports_its_exit_code_or_the_cancellation_after_it_exits() {
		let exited = ProcessSupervisor::new(CancellationToken::new())
			.supervise(&wait_then_exit(0, 3), SupervisionMode::InteractiveBootstrap)
			.expect("bootstrap should complete");
		let cancellation = CancellationToken::new();
		let request = cancellation.clone();
		let requester = std::thread::spawn(move || {
			std::thread::sleep(Duration::from_millis(50));
			request.request();
		});
		let cancelled = ProcessSupervisor::new(cancellation)
			.supervise(&wait_then_exit(1, 0), SupervisionMode::InteractiveBootstrap)
			.expect("a cancelled bootstrap should be an outcome");
		requester
			.join()
			.expect("cancellation requester should finish");

		assert_eq!(
			(exited.termination, cancelled.termination),
			(
				ProcessTermination::NumericExit(3),
				ProcessTermination::HandledCancellation
			)
		);
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
					"@echo off\r\nchcp 65001 >nul\r\nsetlocal DisableDelayedExpansion\r\n:next\r\nif \"%~1\"==\"\" goto done\r\n>>\"{}\" <nul set /p \"=%~1\"\r\n>>\"{}\" echo(\r\nshift\r\ngoto next\r\n:done\r\nexit /b 0\r\n",
					output.display(),
					output.display()
				),
			)
			.expect("write command script");
			// `%~1` shows what cmd itself passes to the script. Arguments containing `"` are covered by the decoder test,
			// since cmd hands them to the script with doubled quotes for the program behind the wrapper to parse.
			let argument_values = [
				String::from("with spaces"),
				String::from("Grüße-東京"),
				String::from("&|<>()^!;"),
				String::from("100%PATH%"),
				format!("safe&echo injected>{}", sentinel.display()),
				String::from("--resume"),
			];
			let arguments: Vec<OsString> = argument_values.iter().map(OsString::from).collect();
			let supervisor = ProcessSupervisor::new(CancellationToken::new());

			let outcome = supervisor
				.supervise(
					&windows_command_script(&script, arguments.clone()),
					SupervisionMode::CapturedVersionProbe(ProbeLimits {
						timeout: Duration::from_secs(5),
						output_bytes: 262_144,
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
		for name in ["pwsh.exe", "powershell.exe"] {
			let Some(program) = find_windows_program(name) else {
				eprintln!("skipping {name}: host is unavailable");
				continue;
			};
			if name == "pwsh.exe" {
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
			let command = CommandSpec::new(program.into(), CommandArguments::Native(arguments));
			let supervisor = ProcessSupervisor::new(CancellationToken::new());

			let outcome = supervisor
				.supervise(
					&command,
					SupervisionMode::CapturedVersionProbe(ProbeLimits {
						timeout: Duration::from_secs(10),
						output_bytes: 262_144,
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
				timeout: Duration::from_millis(250),
				output_bytes: 262_144,
			}),
		);

		assert_eq!(
			result,
			Err(ProcessError::TimedOut(Duration::from_millis(250)))
		);
		let deadline = Instant::now() + Duration::from_secs(4);
		while Instant::now() < deadline && !survivor.exists() {
			thread::sleep(Duration::from_millis(25));
		}
		assert!(!survivor.exists(), "Job Object descendant survived timeout");
		fs::remove_file(script).expect("remove timeout script");
	}
}
