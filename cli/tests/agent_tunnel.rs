/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{process::Stdio, time::Duration};

use cli::state::LauncherPaths;
use tokio::{
	io::{AsyncBufReadExt, BufReader},
	process::Command,
};

#[tokio::test]
async fn agent_tunnel_aliases_start_without_logger_panic() {
	for command in [vec!["agent"], vec!["agent", "host"]] {
		let dir = tempfile::tempdir().unwrap();
		let paths = LauncherPaths::new_without_replacements(dir.path().to_path_buf());
		// An unopenable lockfile stops startup before authentication or external network access.
		std::fs::create_dir(paths.tunnel_lockfile()).unwrap();

		let mut child = Command::new(env!("CARGO_BIN_EXE_code"))
			.arg("--cli-data-dir")
			.arg(dir.path())
			.arg("--verbose")
			.args(&command)
			.args(["--tunnel", "--accept-server-license-terms"])
			.stdin(Stdio::null())
			.stdout(Stdio::piped())
			.stderr(Stdio::piped())
			.kill_on_drop(true)
			.spawn()
			.unwrap();
		let mut stdout = BufReader::new(child.stdout.take().unwrap()).lines();
		let started = tokio::time::timeout(Duration::from_secs(30), async {
			while let Some(line) = stdout.next_line().await.unwrap() {
				if line.contains("error access singleton, retrying:") {
					return true;
				}
			}
			false
		})
		.await;
		child.kill().await.unwrap();
		let output = child.wait_with_output().await.unwrap();

		assert!(
			matches!(started, Ok(true)),
			"{command:?} --tunnel did not reach tunnel startup: {}",
			String::from_utf8_lossy(&output.stderr)
		);
	}
}
