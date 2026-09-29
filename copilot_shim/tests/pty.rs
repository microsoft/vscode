/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#![cfg(unix)]

use std::ffi::{OsStr, OsString};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::os::fd::{AsRawFd, FromRawFd, RawFd};
use std::os::unix::ffi::{OsStrExt, OsStringExt};
use std::os::unix::fs::PermissionsExt;
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::ptr;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

const IO_TIMEOUT: Duration = Duration::from_secs(10);
const CLEAR_SEQUENCE: &[u8] = b"\x1b[2J\x1b[H";
const INSTALL_PROMPT: &[u8] = b"Install GitHub Copilot CLI? [y/N] ";

struct PtyProcess {
	master: File,
	child: Child,
	process_group: i32,
	transcript: Vec<u8>,
	reaped: bool,
}

impl PtyProcess {
	fn spawn(
		arguments: &[OsString],
		path: &OsStr,
		current_directory: &Path,
		environment: &[(&str, &OsStr)],
	) -> Self {
		let (master, slave) = open_pty().expect("create PTY");
		configure_terminal(slave).expect("configure PTY");
		set_nonblocking(master).expect("make PTY master nonblocking");

		let stdin = duplicate_file(slave).expect("duplicate PTY stdin");
		let stdout = duplicate_file(slave).expect("duplicate PTY stdout");
		let stderr = duplicate_file(slave).expect("duplicate PTY stderr");
		let mut command = Command::new(env!("CARGO_BIN_EXE_copilot"));
		command
			.args(arguments)
			.current_dir(current_directory)
			.env("PATH", path)
			.stdin(Stdio::from(stdin))
			.stdout(Stdio::from(stdout))
			.stderr(Stdio::from(stderr));
		for (name, value) in environment {
			command.env(name, value);
		}
		unsafe {
			command.pre_exec(|| {
				if libc::setsid() == -1 {
					return Err(io::Error::last_os_error());
				}
				if libc::ioctl(libc::STDIN_FILENO, libc::TIOCSCTTY.into(), 0) == -1 {
					return Err(io::Error::last_os_error());
				}
				if libc::tcsetpgrp(libc::STDIN_FILENO, libc::getpid()) == -1 {
					return Err(io::Error::last_os_error());
				}
				Ok(())
			});
		}
		let child = command.spawn().expect("spawn shim in PTY");
		unsafe {
			libc::close(slave);
		}

		Self {
			master: unsafe { File::from_raw_fd(master) },
			process_group: child.id() as i32,
			child,
			transcript: Vec::new(),
			reaped: false,
		}
	}

	fn wait_for(&mut self, marker: &[u8]) {
		let deadline = Instant::now() + IO_TIMEOUT;
		while !contains_bytes(&self.transcript, marker) {
			if let Some(status) = self.try_wait().unwrap_or_else(|error| {
				self.fail(&format!("wait for marker failed: {error}"));
			}) {
				self.fail(&format!(
					"process exited with {status} before marker {:?}",
					String::from_utf8_lossy(marker)
				));
			}
			self.read_ready(deadline);
		}
	}

	fn write(&mut self, bytes: &[u8]) {
		let deadline = Instant::now() + IO_TIMEOUT;
		let mut offset = 0;
		while offset < bytes.len() {
			match self.master.write(&bytes[offset..]) {
				Ok(0) => self.fail("PTY input closed while writing"),
				Ok(written) => offset += written,
				Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
					self.poll(libc::POLLOUT, deadline)
				}
				Err(error) => self.fail(&format!("write PTY input failed: {error}")),
			}
		}
	}

	fn wait_for_exit(&mut self) -> ExitStatus {
		let deadline = Instant::now() + IO_TIMEOUT;
		loop {
			self.drain();
			if let Some(status) = self.try_wait().unwrap_or_else(|error| {
				self.fail(&format!("wait for process failed: {error}"));
			}) {
				self.drain();
				return status;
			}
			self.poll(libc::POLLIN, deadline);
		}
	}

	fn transcript(&self) -> &[u8] {
		&self.transcript
	}

	fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> {
		let status = self.child.try_wait()?;
		if status.is_some() {
			self.reaped = true;
		}
		Ok(status)
	}

	fn read_ready(&mut self, deadline: Instant) {
		self.poll(libc::POLLIN, deadline);
		self.drain();
	}

	fn poll(&self, events: i16, deadline: Instant) {
		let remaining = deadline.saturating_duration_since(Instant::now());
		if remaining.is_zero() {
			self.fail("PTY deadline expired");
		}
		let milliseconds = remaining.as_millis().min(i32::MAX as u128) as i32;
		let mut descriptor = libc::pollfd {
			fd: self.master.as_raw_fd(),
			events,
			revents: 0,
		};
		let result = unsafe { libc::poll(&mut descriptor, 1, milliseconds.max(1)) };
		if result == 0 {
			self.fail("PTY deadline expired");
		}
		if result == -1 {
			let error = io::Error::last_os_error();
			if error.kind() != io::ErrorKind::Interrupted {
				self.fail(&format!("poll PTY failed: {error}"));
			}
		}
	}

	fn drain(&mut self) {
		let mut buffer = [0_u8; 4096];
		loop {
			match self.master.read(&mut buffer) {
				Ok(0) => return,
				Ok(read) => self.transcript.extend_from_slice(&buffer[..read]),
				Err(error)
					if error.kind() == io::ErrorKind::WouldBlock
						|| error.raw_os_error() == Some(libc::EIO) =>
				{
					return;
				}
				Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
				Err(error) => self.fail(&format!("read PTY output failed: {error}")),
			}
		}
	}

	fn fail(&self, message: &str) -> ! {
		panic!(
			"{message}\nPTY transcript:\n{}",
			String::from_utf8_lossy(&self.transcript)
		);
	}
}

impl Drop for PtyProcess {
	fn drop(&mut self) {
		if !self.reaped {
			unsafe {
				libc::killpg(self.process_group, libc::SIGKILL);
			}
			let _ = self.child.wait();
			self.reaped = true;
		}
	}
}

#[test]
fn unix_pty_preserves_prompt_and_cli_interaction() {
	let root = tempfile::tempdir().expect("create PTY test directory");
	let empty_path = root.path().join("empty-path");
	let cli_path = root.path().join("cli-path");
	let working_directory = root.path().join("working");
	let state = root.path().join("state");
	fs::create_dir_all(&empty_path).expect("create empty PATH");
	fs::create_dir_all(&cli_path).expect("create CLI PATH");
	fs::create_dir_all(&working_directory).expect("create working directory");
	fs::create_dir_all(&state).expect("create state directory");

	let mut prompt = PtyProcess::spawn(
		&[OsString::from("--clear")],
		empty_path.as_os_str(),
		&working_directory,
		&[],
	);
	prompt.wait_for(INSTALL_PROMPT);
	assert!(
		prompt.transcript().starts_with(CLEAR_SEQUENCE),
		"attached terminal was not cleared\n{}",
		String::from_utf8_lossy(prompt.transcript())
	);
	prompt.write(b"n\n");
	let prompt_status = prompt.wait_for_exit();
	assert_eq!(prompt_status.code(), Some(0), "{:?}", prompt.transcript());

	write_executable(&cli_path.join("copilot"), compatible_cli_script());
	let redirected = run_redirected(
		&[OsString::from("--clear")],
		cli_path.as_os_str(),
		&working_directory,
		root.path(),
	);
	assert_eq!(
		(
			redirected.0.code(),
			contains_bytes(&redirected.1, CLEAR_SEQUENCE),
			redirected.2,
		),
		(Some(0), false, Vec::<u8>::new())
	);

	let native_argument = OsString::from_vec(b"native-\xff".to_vec());
	let arguments = vec![
		OsString::from("--clear"),
		OsString::new(),
		OsString::from("with spaces"),
		native_argument,
	];
	let mut cli = PtyProcess::spawn(
		&arguments,
		cli_path.as_os_str(),
		&working_directory,
		&[
			("COPILOT_SHIM_TEST_STATE", state.as_os_str()),
			("COPILOT_SHIM_TEST_ENV", OsStr::new("inherited")),
		],
	);
	cli.wait_for(b"CLI_READY\n");
	cli.write(b"synchronized-input\n");
	cli.wait_for(b"CLI_STDERR_EXACT\n");
	let cli_status = cli.wait_for_exit();

	let mut expected_arguments = Vec::new();
	for argument in &arguments[1..] {
		expected_arguments.extend_from_slice(argument.as_bytes());
		expected_arguments.push(0);
	}
	let expected_cwd = fs::canonicalize(&working_directory)
		.expect("canonicalize working directory")
		.into_os_string()
		.into_vec();
	assert_eq!(
		(
			cli_status.code(),
			read(&state.join("stdin")),
			read(&state.join("environment")),
			read(&state.join("arguments")),
			trim_newline(read(&state.join("cwd"))),
			contains_bytes(
				cli.transcript(),
				b"CLI_READY\nCLI_STDOUT_EXACT\nCLI_STDERR_EXACT\n"
			),
		),
		(
			Some(47),
			b"synchronized-input".to_vec(),
			b"inherited".to_vec(),
			expected_arguments,
			expected_cwd,
			true,
		),
		"PTY transcript:\n{}",
		String::from_utf8_lossy(cli.transcript())
	);
}

#[test]
fn unix_pty_ctrl_c_cancels_without_fallback() {
	let root = tempfile::tempdir().expect("create cancellation test directory");
	let tools = root.path().join("tools");
	let working_directory = root.path().join("working");
	let state = root.path().join("state");
	let temporary = root.path().join("temporary");
	for directory in [&tools, &working_directory, &state, &temporary] {
		fs::create_dir_all(directory).expect("create cancellation test directory");
	}
	write_executable(&tools.join("copilot"), failing_cli_script());
	write_executable(&tools.join("curl"), blocking_curl_script());
	write_executable(&tools.join("wget"), &marker_script("wget-started"));
	write_executable(&tools.join("bash"), &marker_script("bash-started"));

	let mut process = PtyProcess::spawn(
		&[],
		tools.as_os_str(),
		&working_directory,
		&[
			("COPILOT_SHIM_TEST_STATE", state.as_os_str()),
			("TMPDIR", temporary.as_os_str()),
		],
	);
	process.wait_for(INSTALL_PROMPT);
	process.write(b"y\n");
	process.wait_for(b"CURL_READY\n");
	process.write(&[3]);
	let status = process.wait_for_exit();

	let curl_pid = String::from_utf8(read(&state.join("curl-pid")))
		.expect("UTF-8 curl PID")
		.parse::<i32>()
		.expect("numeric curl PID");
	let temporary_script = PathBuf::from(OsString::from_vec(read(&state.join("temporary-script"))));
	assert_eq!(
		(
			status.code(),
			process_exists(curl_pid),
			temporary_script.exists(),
			state.join("curl-completed").exists(),
			state.join("wget-started").exists(),
			state.join("bash-started").exists(),
			state.join("final-cli").exists(),
			count_bytes(process.transcript(), INSTALL_PROMPT),
		),
		(Some(130), false, false, false, false, false, false, 1),
		"PTY transcript:\n{}",
		String::from_utf8_lossy(process.transcript())
	);
}

fn open_pty() -> io::Result<(RawFd, RawFd)> {
	let mut master = -1;
	let mut slave = -1;
	let mut window = libc::winsize {
		ws_row: 40,
		ws_col: 120,
		ws_xpixel: 0,
		ws_ypixel: 0,
	};
	if unsafe {
		libc::openpty(
			&mut master,
			&mut slave,
			ptr::null_mut(),
			ptr::null_mut(),
			&mut window,
		)
	} == -1
	{
		Err(io::Error::last_os_error())
	} else {
		Ok((master, slave))
	}
}

fn configure_terminal(slave: RawFd) -> io::Result<()> {
	let mut attributes = unsafe { std::mem::zeroed::<libc::termios>() };
	if unsafe { libc::tcgetattr(slave, &mut attributes) } == -1 {
		return Err(io::Error::last_os_error());
	}
	attributes.c_lflag |= libc::ICANON | libc::ISIG;
	attributes.c_lflag &= !(libc::ECHO | libc::ECHONL);
	attributes.c_oflag &= !libc::OPOST;
	if unsafe { libc::tcsetattr(slave, libc::TCSANOW, &attributes) } == -1 {
		Err(io::Error::last_os_error())
	} else {
		Ok(())
	}
}

fn set_nonblocking(file: RawFd) -> io::Result<()> {
	let flags = unsafe { libc::fcntl(file, libc::F_GETFL) };
	if flags == -1 || unsafe { libc::fcntl(file, libc::F_SETFL, flags | libc::O_NONBLOCK) } == -1 {
		Err(io::Error::last_os_error())
	} else {
		Ok(())
	}
}

fn duplicate_file(file: RawFd) -> io::Result<File> {
	let duplicate = unsafe { libc::dup(file) };
	if duplicate == -1 {
		Err(io::Error::last_os_error())
	} else {
		Ok(unsafe { File::from_raw_fd(duplicate) })
	}
}

fn run_redirected(
	arguments: &[OsString],
	path: &OsStr,
	current_directory: &Path,
	output_directory: &Path,
) -> (ExitStatus, Vec<u8>, Vec<u8>) {
	let stdout_path = output_directory.join("redirected-stdout");
	let stderr_path = output_directory.join("redirected-stderr");
	let stdout = File::create(&stdout_path).expect("create redirected stdout");
	let stderr = File::create(&stderr_path).expect("create redirected stderr");
	let mut child = Command::new(env!("CARGO_BIN_EXE_copilot"))
		.args(arguments)
		.current_dir(current_directory)
		.env("PATH", path)
		.stdin(Stdio::null())
		.stdout(Stdio::from(stdout))
		.stderr(Stdio::from(stderr))
		.spawn()
		.expect("spawn redirected shim");
	let process = child.id() as i32;
	let (sender, receiver) = mpsc::sync_channel(1);
	let waiter = thread::spawn(move || {
		let _ = sender.send(child.wait());
	});
	let status = match receiver.recv_timeout(IO_TIMEOUT) {
		Ok(result) => result.expect("wait for redirected shim"),
		Err(error) => {
			unsafe {
				libc::kill(process, libc::SIGKILL);
			}
			let _ = waiter.join();
			panic!(
				"redirected shim timed out ({error})\nstdout:\n{}\nstderr:\n{}",
				String::from_utf8_lossy(&read(&stdout_path)),
				String::from_utf8_lossy(&read(&stderr_path))
			);
		}
	};
	waiter.join().expect("join redirected shim waiter");
	(status, read(&stdout_path), read(&stderr_path))
}

fn write_executable(path: &Path, contents: &[u8]) {
	fs::write(path, contents).expect("write executable");
	let mut permissions = fs::metadata(path)
		.expect("read executable metadata")
		.permissions();
	permissions.set_mode(0o755);
	fs::set_permissions(path, permissions).expect("make executable");
}

fn compatible_cli_script() -> &'static [u8] {
	b"#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n\tprintf '1.0.82\\n'\n\texit 0\nfi\nif [ -z \"${COPILOT_SHIM_TEST_STATE:-}\" ]; then\n\texit 0\nfi\nprintf 'CLI_READY\\n'\nIFS= read -r input || exit 91\nprintf '%s' \"$input\" > \"$COPILOT_SHIM_TEST_STATE/stdin\"\nprintf '%s' \"$COPILOT_SHIM_TEST_ENV\" > \"$COPILOT_SHIM_TEST_STATE/environment\"\npwd -P > \"$COPILOT_SHIM_TEST_STATE/cwd\"\n: > \"$COPILOT_SHIM_TEST_STATE/arguments\"\nfor argument do\n\tprintf '%s\\0' \"$argument\" >> \"$COPILOT_SHIM_TEST_STATE/arguments\"\ndone\nprintf 'CLI_STDOUT_EXACT\\n'\nprintf 'CLI_STDERR_EXACT\\n' >&2\nexit 47\n"
}

fn failing_cli_script() -> &'static [u8] {
	b"#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n\texit 9\nfi\n: > \"$COPILOT_SHIM_TEST_STATE/final-cli\"\nexit 0\n"
}

fn blocking_curl_script() -> &'static [u8] {
	b"#!/bin/sh\ndestination=\nwhile [ \"$#\" -gt 0 ]; do\n\tif [ \"$1\" = \"-o\" ]; then\n\t\tshift\n\t\tdestination=$1\n\tfi\n\tshift\ndone\nprintf '%s' \"$$\" > \"$COPILOT_SHIM_TEST_STATE/curl-pid\"\nprintf '%s' \"$destination\" > \"$COPILOT_SHIM_TEST_STATE/temporary-script\"\nprintf 'CURL_READY\\n'\ntrap 'exit 130' INT TERM HUP\nwhile :; do\n\tIFS= read -r ignored || :\ndone\n: > \"$COPILOT_SHIM_TEST_STATE/curl-completed\"\n"
}

fn marker_script(marker: &str) -> Vec<u8> {
	format!("#!/bin/sh\n: > \"$COPILOT_SHIM_TEST_STATE/{marker}\"\nexit 1\n").into_bytes()
}

fn read(path: &Path) -> Vec<u8> {
	fs::read(path).unwrap_or_else(|error| panic!("read {}: {error}", path.display()))
}

fn trim_newline(mut bytes: Vec<u8>) -> Vec<u8> {
	while bytes
		.last()
		.is_some_and(|byte| matches!(byte, b'\r' | b'\n'))
	{
		bytes.pop();
	}
	bytes
}

fn process_exists(process: i32) -> bool {
	if unsafe { libc::kill(process, 0) } == 0 {
		return true;
	}
	io::Error::last_os_error().raw_os_error() != Some(libc::ESRCH)
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
	haystack
		.windows(needle.len())
		.any(|window| window == needle)
}

fn count_bytes(haystack: &[u8], needle: &[u8]) -> usize {
	haystack
		.windows(needle.len())
		.filter(|window| *window == needle)
		.count()
}
