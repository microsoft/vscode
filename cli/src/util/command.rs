/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use super::errors::CodeError;
use std::{
	borrow::Cow,
	ffi::OsStr,
	process::{Output, Stdio},
};
use tokio::process::Command;

pub async fn capture_command_and_check_status(
	command_str: impl AsRef<OsStr>,
	args: &[impl AsRef<OsStr>],
) -> Result<std::process::Output, CodeError> {
	let output = capture_command(&command_str, args).await?;

	check_output_status(output, || {
		format!(
			"{} {}",
			command_str.as_ref().to_string_lossy(),
			args.iter()
				.map(|a| a.as_ref().to_string_lossy())
				.collect::<Vec<Cow<'_, str>>>()
				.join(" ")
		)
	})
}

pub fn check_output_status(
	output: Output,
	cmd_str: impl FnOnce() -> String,
) -> Result<std::process::Output, CodeError> {
	if !output.status.success() {
		return Err(CodeError::CommandFailed {
			command: cmd_str(),
			code: output.status.code().unwrap_or(-1),
			output: String::from_utf8_lossy(if output.stderr.is_empty() {
				&output.stdout
			} else {
				&output.stderr
			})
			.into(),
		});
	}

	Ok(output)
}

pub async fn capture_command<A, I, S>(
	command_str: A,
	args: I,
) -> Result<std::process::Output, CodeError>
where
	A: AsRef<OsStr>,
	I: IntoIterator<Item = S>,
	S: AsRef<OsStr>,
{
	new_tokio_command(&command_str)
		.args(args)
		.stdin(Stdio::null())
		.stdout(Stdio::piped())
		.output()
		.await
		.map_err(|e| CodeError::CommandFailed {
			command: command_str.as_ref().to_string_lossy().to_string(),
			code: -1,
			output: e.to_string(),
		})
}

/// Makes a new Command, setting flags to avoid extra windows on win32
#[cfg(windows)]
pub fn new_tokio_command(exe: impl AsRef<OsStr>) -> Command {
	let mut p = tokio::process::Command::new(exe);
	p.creation_flags(winapi::um::winbase::CREATE_NO_WINDOW);
	p
}

/// Makes a new Command, setting flags to avoid extra windows on win32
#[cfg(not(windows))]
pub fn new_tokio_command(exe: impl AsRef<OsStr>) -> Command {
	tokio::process::Command::new(exe)
}

/// Makes a new command to run the target script. For windows, ensures it's run
/// in a cmd.exe context.
#[cfg(windows)]
pub fn new_script_command(script: impl AsRef<OsStr>) -> Command {
	let mut cmd = new_tokio_command("cmd");
	cmd.arg("/Q");
	cmd.arg("/C");
	cmd.arg(script);
	cmd
}

/// Makes a new command to run the target script. For windows, ensures it's run
/// in a cmd.exe context.
#[cfg(not(windows))]
pub fn new_script_command(script: impl AsRef<OsStr>) -> Command {
	new_tokio_command(script) // it's assumed scripts are already +x and don't need extra handling
}

/// Makes a new Command, setting flags to avoid extra windows on win32
#[cfg(windows)]
pub fn new_std_command(exe: impl AsRef<OsStr>) -> std::process::Command {
	let mut p = std::process::Command::new(exe);
	std::os::windows::process::CommandExt::creation_flags(
		&mut p,
		winapi::um::winbase::CREATE_NO_WINDOW,
	);
	p
}

/// Makes a new Command, setting flags to avoid extra windows on win32
#[cfg(not(windows))]
pub fn new_std_command(exe: impl AsRef<OsStr>) -> std::process::Command {
	std::process::Command::new(exe)
}

/// Kills and processes and all of its children.
#[cfg(windows)]
pub async fn kill_tree(process_id: u32) -> Result<(), CodeError> {
	capture_command("taskkill", &["/t", "/pid", &process_id.to_string()]).await?;
	Ok(())
}

/// Kills and processes and all of its children.
#[cfg(not(windows))]
pub async fn kill_tree(process_id: u32) -> Result<(), CodeError> {
	use futures::future::join_all;
	use tokio::io::{AsyncBufReadExt, BufReader};

	async fn kill_single_pid(process_id_str: String) {
		capture_command("kill", &[&process_id_str]).await.ok();
	}

	// Rusty version of https://github.com/microsoft/vscode-js-debug/blob/main/src/targets/node/terminateProcess.sh

	let parent_id = process_id.to_string();
	let mut prgrep_cmd = Command::new("pgrep")
		.arg("-P")
		.arg(&parent_id)
		.stdin(Stdio::null())
		.stdout(Stdio::piped())
		.spawn()
		.map_err(|e| CodeError::CommandFailed {
			command: format!("pgrep -P {parent_id}"),
			code: -1,
			output: e.to_string(),
		})?;

	let mut kill_futures = vec![tokio::spawn(
		async move { kill_single_pid(parent_id).await },
	)];

	if let Some(stdout) = prgrep_cmd.stdout.take() {
		let mut reader = BufReader::new(stdout).lines();
		while let Some(line) = reader.next_line().await.unwrap_or(None) {
			kill_futures.push(tokio::spawn(async move { kill_single_pid(line).await }))
		}
	}

	join_all(kill_futures).await;
	prgrep_cmd.kill().await.ok();
	Ok(())
}
