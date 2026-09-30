/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fs;
#[cfg(unix)]
use std::io::Write;
use std::path::Path;
use std::process::Command;
#[cfg(unix)]
use std::process::Stdio;

const SHIM_MARKER: &[u8] = b"VSCODE_COPILOT_RUST_SHIM_V1";

#[test]
fn rediscovery_and_shadowing_matrix() {
	let directory = tempfile::tempdir().expect("create fake PATH");
	write_compatible_cli(directory.path());

	let status = Command::new(env!("CARGO_BIN_EXE_copilot"))
		.arg("matrix")
		.env("PATH", directory.path())
		.status()
		.expect("run shim");

	assert_eq!(status.code(), Some(23));
}

/// VS Code setup replaces a published shim only when this version differs.
#[cfg(windows)]
#[test]
fn windows_binary_embeds_the_package_version() {
	use std::os::windows::ffi::OsStrExt;
	use windows_sys::Win32::Storage::FileSystem::{
		GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW, VS_FIXEDFILEINFO,
	};

	let path: Vec<u16> = Path::new(env!("CARGO_BIN_EXE_copilot"))
		.as_os_str()
		.encode_wide()
		.chain([0])
		.collect();
	let size = unsafe { GetFileVersionInfoSizeW(path.as_ptr(), std::ptr::null_mut()) };
	assert_ne!(size, 0, "the shim has no version resource");
	let mut data = vec![0_u8; size as usize];
	assert_ne!(
		unsafe { GetFileVersionInfoW(path.as_ptr(), 0, size, data.as_mut_ptr().cast()) },
		0
	);
	let mut fixed: *mut std::ffi::c_void = std::ptr::null_mut();
	let mut length = 0;
	let root: Vec<u16> = "\\".encode_utf16().chain([0]).collect();
	assert_ne!(
		unsafe { VerQueryValueW(data.as_ptr().cast(), root.as_ptr(), &mut fixed, &mut length) },
		0
	);
	let fixed = unsafe { &*(fixed as *const VS_FIXEDFILEINFO) };
	let expected: Vec<u32> = env!("CARGO_PKG_VERSION")
		.split(['.', '-', '+'])
		.take(3)
		.map(|part| part.parse().expect("numeric package version"))
		.collect();
	assert_eq!(
		vec![
			fixed.dwFileVersionMS >> 16,
			fixed.dwFileVersionMS & 0xFFFF,
			fixed.dwFileVersionLS >> 16,
		],
		expected,
		"the Windows version resource in {} must match Cargo.toml version {}",
		env!("CARGO_BIN_EXE_copilot"),
		env!("CARGO_PKG_VERSION"),
	);
}

#[test]
fn copied_shim_is_skipped_and_binary_marker_is_retained() {
	let directory = tempfile::tempdir().expect("create fake PATH");
	let shim_directory = directory.path().join("shim");
	let cli_directory = directory.path().join("cli");
	fs::create_dir(&shim_directory).expect("create copied shim directory");
	fs::create_dir(&cli_directory).expect("create fake CLI directory");
	let binary = Path::new(env!("CARGO_BIN_EXE_copilot"));
	let copied_shim = shim_directory.join(format!("copilot{}", std::env::consts::EXE_SUFFIX));
	fs::copy(binary, &copied_shim).expect("copy shim binary");
	write_compatible_cli(&cli_directory);
	let path = std::env::join_paths([shim_directory, cli_directory]).expect("join fake PATH");

	let status = Command::new(binary)
		.arg("copied-shim")
		.env("PATH", path)
		.status()
		.expect("run shim");
	let binary_bytes = fs::read(binary).expect("read shim binary");
	let copied_bytes = fs::read(copied_shim).expect("read copied shim binary");

	assert_eq!(
		(
			status.code(),
			contains_bytes(&binary_bytes, SHIM_MARKER),
			contains_bytes(&copied_bytes, SHIM_MARKER),
		),
		(Some(23), true, true)
	);
}

#[test]
fn diagnostics_require_the_verbose_modifier() {
	let binary = Path::new(env!("CARGO_BIN_EXE_copilot"));
	let quiet = Command::new(binary)
		.arg("--vscode-shim")
		.output()
		.expect("run quiet malformed invocation");
	let verbose = Command::new(binary)
		.args(["--vscode-shim", "verbose", "--vscode-shim"])
		.output()
		.expect("run verbose malformed invocation");

	assert_eq!(
		(
			quiet.status.code(),
			quiet.stdout,
			quiet.stderr,
			verbose.status.code(),
			verbose.stdout,
			String::from_utf8(verbose.stderr)
				.expect("UTF-8 verbose diagnostic")
				.trim_end()
				.to_owned(),
		),
		(
			Some(2),
			Vec::<u8>::new(),
			Vec::<u8>::new(),
			Some(2),
			Vec::<u8>::new(),
			String::from("--vscode-shim requires an option name"),
		)
	);
}

#[cfg(unix)]
#[test]
fn unix_black_box_preserves_launch_contract() {
	use std::os::unix::fs::PermissionsExt;

	let directory = tempfile::tempdir().expect("create black-box directory");
	let cli_directory = directory.path().join("cli");
	let working_directory = directory.path().join("working");
	fs::create_dir(&cli_directory).expect("create fake CLI directory");
	fs::create_dir(&working_directory).expect("create working directory");
	let canonical_working_directory =
		fs::canonicalize(&working_directory).expect("canonicalize working directory");
	let cli = cli_directory.join("copilot");
	fs::write(
		&cli,
		b"#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n\tprintf '1.0.82\\n'\n\texit 0\nfi\nIFS= read -r input || exit 91\nprintf 'stdin=<%s>\\nenv=<%s>\\ncwd=<%s>\\nargs=' \"$input\" \"$COPILOT_SHIM_TEST_ENV\" \"$PWD\"\nfor argument do\n\tprintf '<%s>' \"$argument\"\ndone\nprintf '\\n'\nprintf 'stderr=<visible>\\n' >&2\nexit 47\n",
	)
	.expect("write contract fake CLI");
	let mut permissions = fs::metadata(&cli)
		.expect("read fake CLI metadata")
		.permissions();
	permissions.set_mode(0o755);
	fs::set_permissions(&cli, permissions).expect("make fake CLI executable");

	let mut child = Command::new(env!("CARGO_BIN_EXE_copilot"))
		.args([
			"--vscode-shim",
			"clear",
			"--vscode-shim",
			"verbose",
			"--clear",
			"",
			"with spaces",
			"single'quote",
			"double\"quote",
			"Grüße-東京",
			"trailing\\",
			"&|<>()^%!;",
			"duplicate",
			"duplicate",
		])
		.current_dir(&working_directory)
		.env("PATH", &cli_directory)
		.env("COPILOT_SHIM_TEST_ENV", "inherited")
		.stdin(Stdio::piped())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.spawn()
		.expect("spawn shim");
	child
		.stdin
		.take()
		.expect("shim stdin")
		.write_all(b"from-stdin\n")
		.expect("write shim stdin");
	let output = child.wait_with_output().expect("wait for shim");

	assert_eq!(
		(
			output.status.code(),
			String::from_utf8(output.stdout).expect("UTF-8 stdout"),
			String::from_utf8(output.stderr).expect("UTF-8 stderr"),
		),
		(
			Some(47),
			format!(
				"stdin=<from-stdin>\nenv=<inherited>\ncwd=<{}>\nargs=<--clear><><with spaces><single'quote><double\"quote><Grüße-東京><trailing\\><&|<>()^%!;><duplicate><duplicate>\n",
				canonical_working_directory.display()
			),
			String::from("stderr=<visible>\n"),
		)
	);
}

fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
	haystack
		.windows(needle.len())
		.any(|window| window == needle)
}

#[cfg(unix)]
fn write_compatible_cli(directory: &Path) {
	use std::os::unix::fs::PermissionsExt;

	let path = directory.join("copilot");
	fs::write(
		&path,
		b"#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n\techo 1.0.82\n\texit 0\nfi\nexit 23\n",
	)
	.expect("write fake CLI");
	let mut permissions = fs::metadata(&path)
		.expect("read fake CLI metadata")
		.permissions();
	permissions.set_mode(0o755);
	fs::set_permissions(path, permissions).expect("make fake CLI executable");
}

#[cfg(windows)]
fn write_compatible_cli(directory: &Path) {
	fs::write(
		directory.join("copilot.cmd"),
		b"@echo off\r\nif \"%~1\"==\"--version\" (\r\n\techo 1.0.82\r\n\texit /b 0\r\n)\r\nexit /b 23\r\n",
	)
	.expect("write fake CLI");
}
