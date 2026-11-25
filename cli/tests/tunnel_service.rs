/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#![cfg(windows)]

use std::{process::Stdio, time::Duration};

use tokio::{
	io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
	net::TcpListener,
	process::Command,
};

/// Run with `cargo test --release --test tunnel_service` to exercise the
/// production profile and Windows' default 1 MiB main-thread stack.
#[tokio::test]
async fn internal_run_reaches_authentication_without_overflowing_the_stack() {
	let binary = std::env::var_os("VSCODE_CLI_TEST_BINARY")
		.unwrap_or_else(|| env!("CARGO_BIN_EXE_code").into());
	for (credential, host) in [(false, "github.com"), (true, "api.github.com")] {
		let dir = tempfile::tempdir().unwrap();
		if credential {
			let token = serde_json::json!({
				"p": "Github", "a": "offline-test-token", "r": null, "e": null,
			});
			std::fs::write(
				dir.path().join("token.json"),
				serde_json::to_string(&token.to_string()).unwrap(),
			)
			.unwrap();
		}

		// Reject every request locally: exercise auth without credentials,
		// a login flow, or access to a live tunnel service.
		let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
		let proxy = format!("http://{}", listener.local_addr().unwrap());
		let mut command = Command::new(&binary);
		command
			.args(["--verbose", "--cli-data-dir"])
			.arg(dir.path())
			.args(["tunnel", "service", "internal-run"])
			.env("VSCODE_CLI_DID_LAUNCH_AS_HIDDEN_PROCESS", "1")
			.env("VSCODE_CLI_USE_FILE_KEYCHAIN", "1")
			.env("VSCODE_CLI_DISABLE_KEYCHAIN_ENCRYPT", "1")
			.env("NO_PROXY", "")
			.env("no_proxy", "")
			.stdin(Stdio::null())
			.stdout(Stdio::piped())
			.stderr(Stdio::piped())
			.kill_on_drop(true);
		for name in [
			"HTTP_PROXY",
			"http_proxy",
			"HTTPS_PROXY",
			"https_proxy",
			"ALL_PROXY",
			"all_proxy",
		] {
			command.env(name, &proxy);
		}
		let child = command.spawn().unwrap();
		let output = child.wait_with_output();
		tokio::pin!(output);
		let mut first_request = None;
		let output = tokio::time::timeout(Duration::from_secs(30), async {
			loop {
				tokio::select! {
					output = &mut output => break output.unwrap(),
					connection = listener.accept() => {
						let (mut stream, _) = connection.unwrap();
						let mut request = String::new();
						BufReader::new(&mut stream).read_line(&mut request).await.unwrap();
						first_request.get_or_insert(request);
						stream.write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").await.unwrap();
					}
				}
			}
		})
		.await
		.expect("internal-run did not exit after the rejected authentication request");

		assert_eq!(
			(output.status.code(), first_request),
			(Some(1), Some(format!("CONNECT {host}:443 HTTP/1.1\r\n"))),
			"internal-run failed before authentication: {}",
			String::from_utf8_lossy(&output.stderr)
		);
	}
}
