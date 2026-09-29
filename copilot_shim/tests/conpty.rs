/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#![cfg(windows)]

use std::env;
use std::ffi::{c_void, OsStr, OsString};
use std::fs::{self, File};
use std::io;
use std::mem::size_of;
use std::net::TcpListener;
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::os::windows::io::AsRawHandle;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::ptr::{null, null_mut};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use windows_sys::Win32::Foundation::{
	CloseHandle, SetHandleInformation, HANDLE, HANDLE_FLAG_INHERIT, INVALID_HANDLE_VALUE,
	WAIT_OBJECT_0, WAIT_TIMEOUT,
};
use windows_sys::Win32::Storage::FileSystem::{ReadFile, WriteFile};
use windows_sys::Win32::System::Console::{ClosePseudoConsole, CreatePseudoConsole, COORD, HPCON};
use windows_sys::Win32::System::Pipes::CreatePipe;
use windows_sys::Win32::System::Threading::{
	CreateProcessW, DeleteProcThreadAttributeList, GetExitCodeProcess,
	InitializeProcThreadAttributeList, TerminateProcess, UpdateProcThreadAttribute,
	WaitForSingleObject, CREATE_UNICODE_ENVIRONMENT, EXTENDED_STARTUPINFO_PRESENT,
	LPPROC_THREAD_ATTRIBUTE_LIST, PROCESS_INFORMATION, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,
	STARTF_USESTDHANDLES, STARTUPINFOEXW,
};

const IO_TIMEOUT: Duration = Duration::from_secs(15);
// ConPTY may render the prompt's trailing space as a cursor movement, so the marker omits it.
const INSTALL_PROMPT: &[u8] = b"Install GitHub Copilot CLI? [y/N]";

struct OwnedHandle(HANDLE);

unsafe impl Send for OwnedHandle {}

impl OwnedHandle {
	fn new(handle: HANDLE) -> io::Result<Self> {
		if handle.is_null() || handle == INVALID_HANDLE_VALUE {
			Err(io::Error::last_os_error())
		} else {
			Ok(Self(handle))
		}
	}

	fn raw(&self) -> HANDLE {
		self.0
	}
}

impl Drop for OwnedHandle {
	fn drop(&mut self) {
		if !self.0.is_null() && self.0 != INVALID_HANDLE_VALUE {
			unsafe {
				CloseHandle(self.0);
			}
		}
	}
}

struct OwnedPseudoConsole(HPCON);

impl OwnedPseudoConsole {
	fn raw(&self) -> HPCON {
		self.0
	}
}

impl Drop for OwnedPseudoConsole {
	fn drop(&mut self) {
		unsafe {
			ClosePseudoConsole(self.0);
		}
	}
}

struct AttributeList {
	_storage: Vec<usize>,
	pointer: LPPROC_THREAD_ATTRIBUTE_LIST,
}

impl AttributeList {
	fn new(pseudo_console: HPCON) -> io::Result<Self> {
		let mut bytes = 0;
		unsafe {
			InitializeProcThreadAttributeList(null_mut(), 1, 0, &mut bytes);
		}
		if bytes == 0 {
			return Err(io::Error::last_os_error());
		}
		let words = bytes.div_ceil(size_of::<usize>());
		let mut storage = vec![0_usize; words];
		let pointer = storage.as_mut_ptr().cast();
		if unsafe { InitializeProcThreadAttributeList(pointer, 1, 0, &mut bytes) } == 0 {
			return Err(io::Error::last_os_error());
		}
		let result = unsafe {
			UpdateProcThreadAttribute(
				pointer,
				0,
				PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE as usize,
				pseudo_console as *const c_void,
				size_of::<HPCON>(),
				null_mut(),
				null(),
			)
		};
		if result == 0 {
			unsafe {
				DeleteProcThreadAttributeList(pointer);
			}
			return Err(io::Error::last_os_error());
		}
		Ok(Self {
			_storage: storage,
			pointer,
		})
	}
}

impl Drop for AttributeList {
	fn drop(&mut self) {
		unsafe {
			DeleteProcThreadAttributeList(self.pointer);
		}
	}
}

enum ReaderEvent {
	Data(Vec<u8>),
	Closed,
	Failed(io::Error),
}

struct ConPtyProcess {
	input: Option<OwnedHandle>,
	process: OwnedHandle,
	pseudo_console: Option<OwnedPseudoConsole>,
	reader: Option<JoinHandle<()>>,
	receiver: Receiver<ReaderEvent>,
	transcript: Vec<u8>,
	reaped: bool,
}

impl ConPtyProcess {
	fn spawn(
		arguments: &[OsString],
		path: &OsStr,
		current_directory: &Path,
		environment: &[(&str, &OsStr)],
	) -> Self {
		let (input_read, input_write) = create_pipe().expect("create ConPTY input pipe");
		let (output_read, output_write) = create_pipe().expect("create ConPTY output pipe");
		let mut pseudo_console = 0;
		let result = unsafe {
			CreatePseudoConsole(
				COORD { X: 120, Y: 40 },
				input_read.raw(),
				output_write.raw(),
				0,
				&mut pseudo_console,
			)
		};
		assert!(
			result >= 0,
			"create ConPTY: {}",
			io::Error::from_raw_os_error(result)
		);
		let pseudo_console = OwnedPseudoConsole(pseudo_console);
		drop(input_read);
		drop(output_write);

		let attributes =
			AttributeList::new(pseudo_console.raw()).expect("create ConPTY process attribute list");
		let mut startup = STARTUPINFOEXW::default();
		startup.StartupInfo.cb = size_of::<STARTUPINFOEXW>() as u32;
		// Without explicit invalid handles, a child can inherit the test runner's redirected stdio (as in CI) instead of
		// attaching to the pseudoconsole.
		startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
		startup.StartupInfo.hStdInput = INVALID_HANDLE_VALUE;
		startup.StartupInfo.hStdOutput = INVALID_HANDLE_VALUE;
		startup.StartupInfo.hStdError = INVALID_HANDLE_VALUE;
		startup.lpAttributeList = attributes.pointer;
		let executable = PathBuf::from(env!("CARGO_BIN_EXE_copilot"));
		let mut application_name = wide_null(executable.as_os_str());
		let mut command_line = command_line(executable.as_os_str(), arguments);
		let mut environment_block = environment_block(path, environment);
		let current_directory = wide_null(current_directory.as_os_str());
		let mut process_information = PROCESS_INFORMATION::default();
		let created = unsafe {
			CreateProcessW(
				application_name.as_mut_ptr(),
				command_line.as_mut_ptr(),
				null(),
				null(),
				0,
				EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT,
				environment_block.as_mut_ptr().cast(),
				current_directory.as_ptr(),
				&startup.StartupInfo,
				&mut process_information,
			)
		};
		assert_ne!(
			created,
			0,
			"spawn shim in ConPTY: {}",
			io::Error::last_os_error()
		);
		let process = OwnedHandle::new(process_information.hProcess).expect("own shim process");
		let thread = OwnedHandle::new(process_information.hThread).expect("own shim thread");
		drop(thread);
		drop(attributes);

		let (sender, receiver) = mpsc::sync_channel(16);
		let reader = thread::spawn(move || {
			let mut buffer = [0_u8; 4096];
			loop {
				let mut read = 0;
				let result = unsafe {
					ReadFile(
						output_read.raw(),
						buffer.as_mut_ptr(),
						buffer.len() as u32,
						&mut read,
						null_mut(),
					)
				};
				if result == 0 {
					let error = io::Error::last_os_error();
					if matches!(
						error.kind(),
						io::ErrorKind::BrokenPipe | io::ErrorKind::UnexpectedEof
					) {
						let _ = sender.send(ReaderEvent::Closed);
					} else {
						let _ = sender.send(ReaderEvent::Failed(error));
					}
					return;
				}
				if read == 0 {
					let _ = sender.send(ReaderEvent::Closed);
					return;
				}
				if sender
					.send(ReaderEvent::Data(buffer[..read as usize].to_vec()))
					.is_err()
				{
					return;
				}
			}
		});

		Self {
			input: Some(input_write),
			process,
			pseudo_console: Some(pseudo_console),
			reader: Some(reader),
			receiver,
			transcript: Vec::new(),
			reaped: false,
		}
	}

	fn wait_for(&mut self, marker: &[u8]) {
		let deadline = Instant::now() + IO_TIMEOUT;
		while !contains_bytes(&self.transcript, marker) {
			let remaining = deadline.saturating_duration_since(Instant::now());
			if remaining.is_zero() {
				self.fail(&format!(
					"ConPTY deadline expired waiting for {:?}",
					String::from_utf8_lossy(marker)
				));
			}
			match self.receiver.recv_timeout(remaining) {
				Ok(ReaderEvent::Data(bytes)) => self.transcript.extend(bytes),
				Ok(ReaderEvent::Closed) => self.fail("ConPTY output closed before marker"),
				Ok(ReaderEvent::Failed(error)) => {
					self.fail(&format!("read ConPTY output failed: {error}"))
				}
				Err(RecvTimeoutError::Timeout) => self.fail("ConPTY output deadline expired"),
				Err(RecvTimeoutError::Disconnected) => {
					self.fail("ConPTY output reader disconnected")
				}
			}
		}
	}

	fn write(&self, bytes: &[u8]) {
		let input = self.input.as_ref().expect("ConPTY input is open");
		let mut offset = 0;
		while offset < bytes.len() {
			let mut written = 0;
			let result = unsafe {
				WriteFile(
					input.raw(),
					bytes[offset..].as_ptr(),
					(bytes.len() - offset) as u32,
					&mut written,
					null_mut(),
				)
			};
			if result == 0 {
				self.fail(&format!(
					"write ConPTY input failed: {}",
					io::Error::last_os_error()
				));
			}
			if written == 0 {
				self.fail("ConPTY input closed while writing");
			}
			offset += written as usize;
		}
	}

	fn wait_for_exit(&mut self) -> i32 {
		let milliseconds = IO_TIMEOUT.as_millis().min(u32::MAX as u128) as u32;
		match unsafe { WaitForSingleObject(self.process.raw(), milliseconds) } {
			WAIT_OBJECT_0 => {}
			WAIT_TIMEOUT => self.fail("ConPTY process exit deadline expired"),
			_ => self.fail(&format!(
				"wait for ConPTY process failed: {}",
				io::Error::last_os_error()
			)),
		}
		let mut code = 0;
		if unsafe { GetExitCodeProcess(self.process.raw(), &mut code) } == 0 {
			self.fail(&format!(
				"read ConPTY process exit failed: {}",
				io::Error::last_os_error()
			));
		}
		self.reaped = true;
		code as i32
	}

	fn transcript(&self) -> &[u8] {
		&self.transcript
	}

	fn fail(&self, message: &str) -> ! {
		panic!(
			"{message}\nConPTY transcript:\n{}",
			String::from_utf8_lossy(&self.transcript)
		);
	}
}

impl Drop for ConPtyProcess {
	fn drop(&mut self) {
		if !self.reaped {
			unsafe {
				TerminateProcess(self.process.raw(), 1);
				WaitForSingleObject(self.process.raw(), IO_TIMEOUT.as_millis() as u32);
			}
			self.reaped = true;
		}
		self.input.take();
		self.pseudo_console.take();
		if let Some(reader) = self.reader.take() {
			let _ = reader.join();
		}
	}
}

#[test]
fn windows_conpty_prompt_and_cli_interaction() {
	let root = tempfile::tempdir().expect("create ConPTY test directory");
	let empty_path = root.path().join("empty-path");
	let cli_path = root.path().join("cli-path");
	let working_directory = root.path().join("working");
	let state = root.path().join("state");
	for directory in [&empty_path, &cli_path, &working_directory, &state] {
		fs::create_dir_all(directory).expect("create ConPTY test directory");
	}

	let mut prompt = ConPtyProcess::spawn(
		&[OsString::from("--vscode-shim"), OsString::from("clear")],
		empty_path.as_os_str(),
		&working_directory,
		&[],
	);
	prompt.wait_for(INSTALL_PROMPT);
	let prompt_offset = find_bytes(prompt.transcript(), INSTALL_PROMPT).expect("prompt offset");
	assert!(
		contains_bytes(&prompt.transcript()[..prompt_offset], b"\x1b[2J"),
		"attached ConPTY was not cleared before the prompt\n{}",
		String::from_utf8_lossy(prompt.transcript())
	);
	prompt.write(b"n\r");
	assert_eq!(prompt.wait_for_exit(), 0);

	let helper = cli_path.join("copilot.exe");
	build_native_helper(&helper, native_helper_source());
	let arguments = vec![
		OsString::from("--vscode-shim"),
		OsString::from("clear"),
		OsString::new(),
		OsString::from("with spaces"),
		OsString::from("double\"quote"),
		OsString::from("Grüße-東京"),
		OsString::from(r"trailing\"),
		OsString::from("&|<>()^%!;"),
	];
	let mut cli = ConPtyProcess::spawn(
		&arguments,
		cli_path.as_os_str(),
		&working_directory,
		&[
			("COPILOT_SHIM_TEST_STATE", state.as_os_str()),
			("COPILOT_SHIM_TEST_ENV", OsStr::new("inherited")),
		],
	);
	cli.wait_for(b"CLI_READY");
	cli.write(b"synchronized-input\r");
	cli.wait_for(b"CLI_STDERR_EXACT");
	let exit_code = cli.wait_for_exit();
	let expected_arguments = encode_wide_values(&arguments[2..]);
	assert_eq!(
		(
			exit_code,
			read_string(&state.join("stdin")),
			read_string(&state.join("environment")),
			observed_directory(&state),
			read_string(&state.join("arguments")),
			contains_bytes(cli.transcript(), b"CLI_STDOUT_EXACT"),
			contains_bytes(cli.transcript(), b"CLI_STDERR_EXACT"),
		),
		(
			301,
			String::from("synchronized-input"),
			encode_wide_values(&[OsString::from("inherited")]),
			fs::canonicalize(&working_directory).expect("canonicalize working directory"),
			expected_arguments,
			true,
			true,
		),
		"ConPTY transcript:\n{}",
		String::from_utf8_lossy(cli.transcript())
	);
}

#[test]
fn windows_conpty_ctrl_c_cancels_without_fallback() {
	let root = tempfile::tempdir().expect("create cancellation test directory");
	let tools = root.path().join("tools");
	let working_directory = root.path().join("working");
	let state = root.path().join("state");
	for directory in [&tools, &working_directory, &state] {
		fs::create_dir_all(directory).expect("create cancellation test directory");
	}
	fs::write(
		tools.join("copilot.cmd"),
		b"@echo off\r\nif \"%~1\"==\"--version\" exit /b 9\r\ntype nul > \"%COPILOT_SHIM_TEST_STATE%\\final-cli\"\r\nexit /b 0\r\n",
	)
	.expect("write failing fake CLI");
	// A release server that accepts the connection and never answers keeps the MSI install waiting for Ctrl+C.
	let listener = TcpListener::bind("127.0.0.1:0").expect("bind fake release server");
	let releases_url = OsString::from(format!(
		"http://{}/releases",
		listener.local_addr().expect("fake release server address")
	));
	let (connected, accepted) = mpsc::channel();
	let _server = thread::spawn(move || {
		if let Ok((connection, _)) = listener.accept() {
			let _ = connected.send(());
			thread::sleep(IO_TIMEOUT);
			drop(connection);
		}
	});
	let path = env::join_paths([tools.as_path()]).expect("join cancellation PATH");

	let mut process = ConPtyProcess::spawn(
		&[],
		&path,
		&working_directory,
		&[
			("COPILOT_SHIM_TEST_STATE", state.as_os_str()),
			("VSCODE_COPILOT_SHIM_RELEASES_URL", releases_url.as_os_str()),
		],
	);
	process.wait_for(INSTALL_PROMPT);
	process.write(b"y\r");
	process.wait_for(b"Finding the latest GitHub Copilot CLI release");
	accepted
		.recv_timeout(IO_TIMEOUT)
		.expect("the install should contact the release server");
	process.write(&[3]);
	let exit_code = process.wait_for_exit();

	assert_eq!(
		(
			exit_code,
			state.join("final-cli").exists(),
			count_bytes(process.transcript(), INSTALL_PROMPT),
		),
		(130, false, 1),
		"ConPTY transcript:\n{}",
		String::from_utf8_lossy(process.transcript())
	);
}

#[test]
fn windows_adapters_preserve_process_contract() {
	run_windows_adapter_contract_scenarios();
}

#[derive(Clone, Copy)]
enum AdapterKind {
	NativeExecutable,
	CommandScript,
	BatchScript,
	ModernPowerShell,
	LegacyPowerShell,
}

struct AdapterScenario {
	name: &'static str,
	kind: AdapterKind,
	arguments: Vec<OsString>,
	expected_exit: i32,
	host: Option<PathBuf>,
}

struct AdapterObservation {
	state: PathBuf,
	working_directory: PathBuf,
}

fn exercise_adapter(root: &Path, scenario: &AdapterScenario) -> AdapterObservation {
	let directory = root.join(scenario.name);
	let state = directory.join("state");
	let working_directory = directory.join("working");
	fs::create_dir_all(&state).expect("create adapter state directory");
	fs::create_dir_all(&working_directory).expect("create adapter working directory");
	write_adapter_candidate(&directory, scenario.kind);
	let path = adapter_path(&directory, scenario.host.as_deref());
	let mut process = ConPtyProcess::spawn(
		&scenario.arguments,
		&path,
		&working_directory,
		&[
			("COPILOT_SHIM_TEST_STATE", state.as_os_str()),
			("COPILOT_SHIM_TEST_ENV", OsStr::new("adapter-environment")),
		],
	);
	process.wait_for(b"CLI_READY");
	process.write(b"synchronized-input\r");
	process.wait_for(b"CLI_STDERR_EXACT");
	let exit_code = process.wait_for_exit();
	let transcript = process.transcript().to_vec();
	drop(process);

	assert_eq!(
		(
			exit_code,
			contains_bytes(&transcript, b"CLI_STDOUT_EXACT"),
			contains_bytes(&transcript, b"CLI_STDERR_EXACT"),
		),
		(scenario.expected_exit, true, true),
		"adapter {} ConPTY transcript:\n{}",
		scenario.name,
		String::from_utf8_lossy(&transcript)
	);
	AdapterObservation {
		state,
		working_directory,
	}
}

fn adapter_path(directory: &Path, host: Option<&Path>) -> OsString {
	env::join_paths(std::iter::once(directory).chain(host.and_then(Path::parent)))
		.expect("join adapter PATH")
}

fn run_windows_adapter_contract_scenarios() {
	let root = tempfile::tempdir().expect("create adapter contract directory");
	let native_arguments = full_argument_matrix();
	let native = AdapterScenario {
		name: "native-exe",
		kind: AdapterKind::NativeExecutable,
		arguments: native_arguments.clone(),
		expected_exit: 301,
		host: None,
	};
	let native_observation = exercise_adapter(root.path(), &native);
	assert_wide_observation(&native_observation, &native_arguments);
	eprintln!("ADAPTER_SCENARIO_PASSED {}", native.name);

	for (name, kind) in [
		("command-script", AdapterKind::CommandScript),
		("batch-script", AdapterKind::BatchScript),
	] {
		let sentinel = root.path().join(format!("{name}-injected"));
		let arguments = command_argument_matrix(&sentinel);
		let scenario = AdapterScenario {
			name,
			kind,
			arguments: arguments.clone(),
			expected_exit: 301,
			host: None,
		};
		let observation = exercise_adapter(root.path(), &scenario);
		assert_wide_observation(&observation, &arguments);
		assert!(!sentinel.exists(), "{name} argument injected a command");
		eprintln!("ADAPTER_SCENARIO_PASSED {}", scenario.name);
	}

	run_power_shell_adapter_scenarios(root.path());
}

fn full_argument_matrix() -> Vec<OsString> {
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

fn command_argument_matrix(sentinel: &Path) -> Vec<OsString> {
	[
		String::new(),
		String::from("single'quote"),
		String::from("with spaces"),
		String::from("Grüße-東京"),
		format!("safe&echo injected>\"{}\"", sentinel.display()),
		String::from(r"trailing\\"),
		String::from("&|<>()^%!;"),
		String::from("duplicate"),
		String::from("duplicate"),
	]
	.into_iter()
	.map(OsString::from)
	.collect()
}

fn write_adapter_candidate(directory: &Path, kind: AdapterKind) {
	let candidate = match kind {
		AdapterKind::NativeExecutable => {
			let path = directory.join("copilot.exe");
			build_native_helper(&path, native_helper_source());
			return;
		}
		AdapterKind::CommandScript => directory.join("copilot.cmd"),
		AdapterKind::BatchScript => directory.join("copilot.bat"),
		AdapterKind::ModernPowerShell | AdapterKind::LegacyPowerShell => {
			build_native_helper(
				&directory.join("adapter-helper.exe"),
				native_helper_source(),
			);
			let path = directory.join("copilot.ps1");
			write_power_shell_candidate(&path);
			return;
		}
	};
	build_native_helper(
		&directory.join("adapter-helper.exe"),
		native_helper_source(),
	);
	fs::write(candidate, command_script_source()).expect("write command adapter candidate");
}

fn command_script_source() -> &'static [u8] {
	b"@echo off\r\nsetlocal DisableDelayedExpansion\r\nif \"%~1\"==\"--version\" (\r\n\techo 1.0.82\r\n\texit /b 0\r\n)\r\n\"%~dp0adapter-helper.exe\" %*\r\nexit /b %ERRORLEVEL%\r\n"
}

fn assert_wide_observation(observation: &AdapterObservation, arguments: &[OsString]) {
	assert_wide_io_observation(observation);
	assert_eq!(
		read_string(&observation.state.join("arguments")),
		encode_wide_values(arguments)
	);
}

fn assert_wide_io_observation(observation: &AdapterObservation) {
	assert_eq!(
		(
			read_string(&observation.state.join("stdin")),
			read_string(&observation.state.join("environment")),
			observed_directory(&observation.state),
		),
		(
			String::from("synchronized-input"),
			encode_wide_values(&[OsString::from("adapter-environment")]),
			fs::canonicalize(&observation.working_directory).expect("canonicalize adapter cwd"),
		)
	);
}

/// Canonicalizes the working directory the helper observed, because `TEMP` can use 8.3 short names.
fn observed_directory(state: &Path) -> PathBuf {
	let observed = decode_wide_values(&read_string(&state.join("cwd")));
	assert_eq!(
		observed.len(),
		1,
		"the helper records one working directory"
	);
	fs::canonicalize(&observed[0]).expect("canonicalize observed working directory")
}

#[derive(Default)]
struct PowerShellHosts {
	modern: Option<PathBuf>,
	legacy: Option<PathBuf>,
}

fn run_power_shell_adapter_scenarios(root: &Path) {
	let hosts = power_shell_hosts();
	if let Some(host) = hosts.modern {
		let arguments = full_argument_matrix();
		let scenario = AdapterScenario {
			name: "modern-powershell",
			kind: AdapterKind::ModernPowerShell,
			arguments: arguments.clone(),
			expected_exit: 301,
			host: Some(host),
		};
		let observation = exercise_adapter(root, &scenario);
		assert_wide_observation(&observation, &arguments);
		eprintln!("ADAPTER_SCENARIO_PASSED {}", scenario.name);
	} else {
		eprintln!("ADAPTER_SCENARIO_UNAVAILABLE modern-powershell: pwsh.exe 7.3+ was not found");
	}

	if let Some(host) = hosts.legacy {
		let arguments = legacy_power_shell_arguments();
		let scenario = AdapterScenario {
			name: "legacy-powershell",
			kind: AdapterKind::LegacyPowerShell,
			arguments,
			expected_exit: 301,
			host: Some(host),
		};
		let observation = exercise_adapter(root, &scenario);
		assert_legacy_power_shell_observation(&observation);
		eprintln!("ADAPTER_SCENARIO_PASSED {}", scenario.name);
	} else {
		eprintln!(
			"ADAPTER_SCENARIO_UNAVAILABLE legacy-powershell: Windows PowerShell 5.1 was not found"
		);
	}
}

/// Arguments after the embedded quote are the last ones, because Windows PowerShell 5.1 passes the quote through
/// unescaped and the native helper then joins everything that follows it.
fn legacy_power_shell_arguments() -> Vec<OsString> {
	[
		"empty-before",
		"",
		"empty-after",
		"with spaces",
		"Grüße-東京",
		r"trailing\\",
		"&|<>()^%!;",
		"duplicate",
		"duplicate",
		"quote-before",
		"embedded\"quote",
	]
	.into_iter()
	.map(OsString::from)
	.collect()
}

fn assert_legacy_power_shell_observation(observation: &AdapterObservation) {
	assert_wide_io_observation(observation);
	let actual = decode_wide_values(&read_string(&observation.state.join("arguments")));
	let empty_after = actual
		.iter()
		.position(|argument| argument == "empty-after")
		.unwrap_or_else(|| panic!("legacy empty-after marker in {actual:?}"));
	let quote_before = actual
		.iter()
		.position(|argument| argument == "quote-before")
		.unwrap_or_else(|| panic!("legacy quote-before marker in {actual:?}"));
	let required: Vec<OsString> = [
		"with spaces",
		"Grüße-東京",
		r"trailing\\",
		"&|<>()^%!;",
		"duplicate",
		"duplicate",
	]
	.into_iter()
	.map(OsString::from)
	.collect();
	assert_eq!(
		(
			actual.first().map(OsString::as_os_str),
			actual.get(empty_after + 1..quote_before),
		),
		(Some(OsStr::new("empty-before")), Some(required.as_slice())),
		"legacy arguments {actual:?}"
	);
	let empty_behavior = &actual[1..empty_after];
	let quote_behavior = &actual[quote_before + 1..];
	eprintln!(
		"ADAPTER_WINDOWS_POWERSHELL_5_1_EMPTY_ARGUMENTS {}",
		encode_wide_values(empty_behavior)
	);
	eprintln!(
		"ADAPTER_WINDOWS_POWERSHELL_5_1_EMBEDDED_QUOTES {}",
		encode_wide_values(quote_behavior)
	);
}

fn write_power_shell_candidate(path: &Path) {
	fs::write(path, power_shell_script_source()).expect("write PowerShell adapter candidate");
}

fn power_shell_script_source() -> &'static [u8] {
	b"if ($args.Count -eq 1 -and $args[0] -ceq '--version') {\r\n\t[Console]::Out.WriteLine('1.0.82')\r\n\texit 0\r\n}\r\nif ($PSVersionTable.PSVersion -ge [Version] '7.3') {\r\n\t$PSNativeCommandArgumentPassing = 'Standard'\r\n}\r\n& (Join-Path $PSScriptRoot 'adapter-helper.exe') @args\r\nexit $LASTEXITCODE\r\n"
}

fn create_pipe() -> io::Result<(OwnedHandle, OwnedHandle)> {
	let mut read = null_mut();
	let mut write = null_mut();
	if unsafe { CreatePipe(&mut read, &mut write, null(), 0) } == 0 {
		return Err(io::Error::last_os_error());
	}
	let read = OwnedHandle::new(read)?;
	let write = OwnedHandle::new(write)?;
	if unsafe { SetHandleInformation(read.raw(), HANDLE_FLAG_INHERIT, 0) } == 0
		|| unsafe { SetHandleInformation(write.raw(), HANDLE_FLAG_INHERIT, 0) } == 0
	{
		return Err(io::Error::last_os_error());
	}
	Ok((read, write))
}

fn environment_block(path: &OsStr, overrides: &[(&str, &OsStr)]) -> Vec<u16> {
	let mut variables: Vec<(OsString, OsString)> = env::vars_os().collect();
	set_environment_variable(&mut variables, OsStr::new("PATH"), path);
	// The shim also searches %LOCALAPPDATA%\GitHubCopilotCLI; keep a Copilot CLI installed on this machine out of tests.
	let local_app_data = env::temp_dir().join("copilot-shim-test-localappdata");
	fs::create_dir_all(&local_app_data).expect("create isolated LOCALAPPDATA");
	set_environment_variable(
		&mut variables,
		OsStr::new("LOCALAPPDATA"),
		local_app_data.as_os_str(),
	);
	for (name, value) in overrides {
		set_environment_variable(&mut variables, OsStr::new(name), value);
	}
	variables.sort_by_key(|(name, _)| name.to_string_lossy().to_ascii_lowercase());
	let mut block = Vec::new();
	for (name, value) in variables {
		block.extend(name.encode_wide());
		block.push(u16::from(b'='));
		block.extend(value.encode_wide());
		block.push(0);
	}
	block.push(0);
	block
}

fn set_environment_variable(
	variables: &mut Vec<(OsString, OsString)>,
	name: &OsStr,
	value: &OsStr,
) {
	if let Some((_, existing)) = variables
		.iter_mut()
		.find(|(candidate, _)| native_ascii_eq_ignore_case(candidate, name))
	{
		*existing = value.to_os_string();
	} else {
		variables.push((name.to_os_string(), value.to_os_string()));
	}
}

fn native_ascii_eq_ignore_case(left: &OsStr, right: &OsStr) -> bool {
	left.encode_wide()
		.map(ascii_lowercase)
		.eq(right.encode_wide().map(ascii_lowercase))
}

fn ascii_lowercase(unit: u16) -> u16 {
	if (u16::from(b'A')..=u16::from(b'Z')).contains(&unit) {
		unit + u16::from(b'a' - b'A')
	} else {
		unit
	}
}

fn command_line(program: &OsStr, arguments: &[OsString]) -> Vec<u16> {
	let mut line = quote_argument(program);
	for argument in arguments {
		line.push(u16::from(b' '));
		line.extend(quote_argument(argument));
	}
	line.push(0);
	line
}

fn quote_argument(argument: &OsStr) -> Vec<u16> {
	let mut quoted = vec![u16::from(b'"')];
	let mut backslashes = 0;
	for unit in argument.encode_wide() {
		if unit == u16::from(b'\\') {
			backslashes += 1;
		} else {
			let count = if unit == u16::from(b'"') {
				backslashes * 2 + 1
			} else {
				backslashes
			};
			quoted.extend(std::iter::repeat_n(u16::from(b'\\'), count));
			backslashes = 0;
			quoted.push(unit);
		}
	}
	quoted.extend(std::iter::repeat_n(u16::from(b'\\'), backslashes * 2));
	quoted.push(u16::from(b'"'));
	quoted
}

fn wide_null(value: &OsStr) -> Vec<u16> {
	value.encode_wide().chain(std::iter::once(0)).collect()
}

fn build_native_helper(output: &Path, source: &str) {
	let source_path = output.with_extension("rs");
	fs::write(&source_path, source).expect("write native helper source");
	let rustc = env::var_os("RUSTC").unwrap_or_else(|| OsString::from("rustc.exe"));
	let capture = output.with_extension("rustc-output");
	let stdout = File::create(&capture).expect("create rustc output");
	let stderr = stdout.try_clone().expect("clone rustc output");
	let child = Command::new(rustc)
		.arg("--edition=2021")
		.arg(&source_path)
		.arg("-o")
		.arg(output)
		.stdin(Stdio::null())
		.stdout(Stdio::from(stdout))
		.stderr(Stdio::from(stderr))
		.spawn()
		.expect("spawn rustc for native helper");
	let status = wait_for_child(child, IO_TIMEOUT).expect("wait for native helper build");
	assert!(
		status.success(),
		"native helper build failed with {status}:\n{}",
		read_string(&capture)
	);
}

fn power_shell_hosts() -> PowerShellHosts {
	PowerShellHosts {
		modern: find_power_shell_host("pwsh.exe", |version| version >= (7, 3, 0)),
		legacy: find_power_shell_host("powershell.exe", |version| version.0 == 5 && version.1 == 1),
	}
}

fn find_power_shell_host(name: &str, accepts: impl Fn((u32, u32, u32)) -> bool) -> Option<PathBuf> {
	let path = env::var_os("PATH")?;
	for directory in env::split_paths(&path) {
		let candidate = directory.join(name);
		if !candidate.is_file() {
			continue;
		}
		let capture = tempfile::NamedTempFile::new().expect("create PowerShell probe output");
		let stdout = capture.reopen().expect("open PowerShell probe stdout");
		let stderr = stdout.try_clone().expect("open PowerShell probe stderr");
		let child = match Command::new(&candidate)
			.args([
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$PSVersionTable.PSVersion.ToString()",
			])
			.stdin(Stdio::null())
			.stdout(Stdio::from(stdout))
			.stderr(Stdio::from(stderr))
			.spawn()
		{
			Ok(child) => child,
			Err(error) => {
				eprintln!(
					"PowerShell candidate {} did not start: {error}",
					candidate.display()
				);
				continue;
			}
		};
		let status = match wait_for_child(child, IO_TIMEOUT) {
			Ok(status) => status,
			Err(error) => {
				eprintln!(
					"PowerShell candidate {} did not finish: {error}",
					candidate.display()
				);
				continue;
			}
		};
		if !status.success() {
			eprintln!(
				"PowerShell candidate {} exited with {status}",
				candidate.display()
			);
			continue;
		}
		let output = fs::read(capture.path()).expect("read PowerShell probe output");
		let Some(version) = first_version(&output) else {
			eprintln!(
				"PowerShell candidate {} returned an unparseable version",
				candidate.display()
			);
			continue;
		};
		if accepts(version) {
			return Some(candidate);
		}
		eprintln!(
			"PowerShell candidate {} has unsupported version {}.{}.{}",
			candidate.display(),
			version.0,
			version.1,
			version.2
		);
	}
	None
}

fn wait_for_child(mut child: Child, timeout: Duration) -> io::Result<ExitStatus> {
	let result = unsafe {
		WaitForSingleObject(
			child.as_raw_handle(),
			timeout.as_millis().min(u32::MAX as u128) as u32,
		)
	};
	match result {
		WAIT_OBJECT_0 => child.wait(),
		WAIT_TIMEOUT => {
			child.kill()?;
			let _ = child.wait();
			Err(io::Error::new(io::ErrorKind::TimedOut, "child timed out"))
		}
		_ => Err(io::Error::last_os_error()),
	}
}

fn first_version(bytes: &[u8]) -> Option<(u32, u32, u32)> {
	let text = String::from_utf8_lossy(bytes);
	for token in text.split(|character: char| !character.is_ascii_digit() && character != '.') {
		let components: Vec<u32> = token
			.split('.')
			.filter_map(|component| component.parse().ok())
			.collect();
		if let [major, minor, patch, ..] = components.as_slice() {
			return Some((*major, *minor, *patch));
		}
	}
	None
}

fn encode_wide_values(values: &[OsString]) -> String {
	let mut encoded = String::new();
	for value in values {
		for unit in value.encode_wide() {
			use std::fmt::Write as _;
			write!(encoded, "{unit:04x}").expect("encode native value");
		}
		encoded.push(';');
	}
	encoded
}

fn decode_wide_values(encoded: &str) -> Vec<OsString> {
	encoded
		.split_terminator(';')
		.map(|value| {
			assert_eq!(value.len() % 4, 0, "invalid encoded native value");
			let units: Vec<u16> = value
				.as_bytes()
				.chunks_exact(4)
				.map(|chunk| {
					let chunk = std::str::from_utf8(chunk).expect("encoded value is ASCII");
					u16::from_str_radix(chunk, 16).expect("encoded value is hexadecimal")
				})
				.collect();
			OsString::from_wide(&units)
		})
		.collect()
}

fn native_helper_source() -> &'static str {
	r#"use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::os::windows::ffi::OsStrExt;
use std::path::PathBuf;

fn encode(values: &[OsString]) -> String {
	let mut encoded = String::new();
	for value in values {
		for unit in value.encode_wide() {
			use std::fmt::Write as _;
			write!(encoded, "{unit:04x}").unwrap();
		}
		encoded.push(';');
	}
	encoded
}

fn main() {
	let state = PathBuf::from(env::var_os("COPILOT_SHIM_TEST_STATE").unwrap());
	let arguments: Vec<OsString> = env::args_os().skip(1).collect();
	if arguments.first().is_some_and(|argument| argument == "--version") {
		println!("1.0.82");
		return;
	}
	println!("CLI_READY");
	io::stdout().flush().unwrap();
	let mut input = String::new();
	io::stdin().read_line(&mut input).unwrap();
	fs::write(state.join("stdin"), input.trim_end_matches(['\r', '\n'])).unwrap();
	fs::write(state.join("environment"), encode(&[env::var_os("COPILOT_SHIM_TEST_ENV").unwrap()])).unwrap();
	fs::write(state.join("cwd"), encode(&[env::current_dir().unwrap().into_os_string()])).unwrap();
	fs::write(state.join("arguments"), encode(&arguments)).unwrap();
	println!("CLI_STDOUT_EXACT");
	eprintln!("CLI_STDERR_EXACT");
	std::process::exit(301);
}
"#
}

fn read_string(path: &Path) -> String {
	fs::read_to_string(path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}

fn find_bytes(haystack: &[u8], needle: &[u8]) -> Option<usize> {
	haystack
		.windows(needle.len())
		.position(|window| window == needle)
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
	find_bytes(haystack, needle).is_some()
}

fn count_bytes(haystack: &[u8], needle: &[u8]) -> usize {
	haystack
		.windows(needle.len())
		.filter(|window| *window == needle)
		.count()
}
