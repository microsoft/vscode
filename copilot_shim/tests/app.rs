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
			"--clear",
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
