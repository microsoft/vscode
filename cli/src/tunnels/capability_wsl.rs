/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{ffi::OsString, io::Write, process::Stdio};

use async_trait::async_trait;
use serde::Deserialize;
use tokio::process::Command;
use url::Url;
use uuid::Uuid;

use crate::{
	constants::QUALITYLESS_PRODUCT_NAME,
	log,
	tunnels::{code_server::ServerBuilder, paths::server_paths_from_release},
	update_service::{Platform, UpdateService},
	util::{
		command::{capture_command_and_check_status, check_output_status},
		errors::{wrap, AnyError, CodeError},
		http::{BoxedHttp, SimpleResponse},
	},
};

use super::{
	capability::{Capability, SystemInteractor},
	code_server::{ResolvedServerParams, SocketCodeServer},
};

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct WslParams {
	distribution: Option<String>,
	user: Option<String>,
	system: bool,
}

pub struct WslCapability {
	pub params: WslParams,
	http: BoxedHttp,
	log: log::Logger,
}

impl WslCapability {
	pub fn new(params: WslParams, log: log::Logger, http: BoxedHttp) -> WslCapability {
		WslCapability { log, params, http }
	}

	async fn capture_wsl_command(
		&self,
		wsl_args: &[&str],
	) -> Result<std::process::Output, CodeError> {
		let args = self.make_args(wsl_args);
		capture_command_and_check_status("wsl.exe", &args).await
	}

	fn make_args(&self, wsl_args: &[&str]) -> Vec<OsString> {
		let mut args = Vec::with_capacity(wsl_args.len() + 1);

		if let Some(d) = &self.params.distribution {
			args.push(OsString::from("--distribution"));
			args.push(OsString::from(d));
		}

		if let Some(u) = &self.params.user {
			args.push(OsString::from("--user"));
			args.push(OsString::from(u));
		}

		if self.params.system {
			args.push(OsString::from("--system"));
		}

		args.push(OsString::from("--"));
		args.extend(wsl_args.into_iter().map(OsString::from));

		args
	}

	async fn extract_into_directory(
		&self,
		mut response: SimpleResponse,
		target_path: &str,
	) -> Result<(), AnyError> {
		fn failed(e: std::io::Error) -> CodeError {
			CodeError::CommandFailed {
				command: "wsl.exe tar".to_string(),
				code: -1,
				output: e.to_string(),
			}
		}

		let mut cmd = Command::new("wsl.exe")
			.args(self.make_args(&["tar", "-xf", "-", "-C", target_path]))
			.stdin(Stdio::piped())
			.stdout(Stdio::piped())
			.stderr(Stdio::piped())
			.spawn()
			.map_err(failed)?;

		let mut stdin = cmd.stdin.take().unwrap();
		let _ = tokio::io::copy(&mut response.read, &mut stdin);

		check_output_status(cmd.wait_with_output().await.map_err(failed)?, || {
			"wsl.exe tar".to_string()
		})?;
		Ok(())
	}

	async fn get_home_dir(&self) -> Result<String, CodeError> {
		let out = self.capture_wsl_command(&["echo", "$HOME"]).await?;
		Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
	}

	async fn exists(&self, path: String) -> bool {
		self.capture_wsl_command(&["test", "-e", &path])
			.await
			.is_ok()
	}
}

#[async_trait]
impl Capability for WslCapability {
	async fn platform(&self) -> Result<Platform, CodeError> {
		let (alpine, uname) = tokio::join!(
			self.capture_wsl_command(&["cat", "/etc/alpine-release"]),
			self.capture_wsl_command(&["uname", "-m"])
		);

		let uname = String::from_utf8_lossy(&uname?.stdout).trim().to_string();
		match (alpine, uname.as_str()) {
			(Ok(_), "x86_64") => Ok(Platform::LinuxAlpineX64),
			(Ok(_), "aarch64") => Ok(Platform::LinuxAlpineARM64),
			(Ok(_), _) => Ok(Platform::LinuxAlpineX64), // fallback

			(Err(_), "x86_64") => Ok(Platform::LinuxX64),
			(Err(_), "aarch64") => Ok(Platform::LinuxARM64),
			(Err(_), _) => Ok(Platform::LinuxX64), // fallback
		}
	}

	async fn start_server(
		&self,
		params: ResolvedServerParams,
	) -> Result<SocketCodeServer, AnyError> {
		let home = self.get_home_dir().await?;
		let target_dir = format!(
			"{}/.vscode-cli/servers/{}-{}",
			home, params.release.quality, params.release.commit
		);

		if !self.exists(target_dir.clone()).await {
			let staging_dir = format!("{}.staging", target_dir);
			info!(
				self.log,
				"Downloading {} server -> {}", QUALITYLESS_PRODUCT_NAME, staging_dir
			);
			let update_service = UpdateService::new(self.log.clone(), self.http.clone());
			let response = update_service.get_download_stream(&params.release).await?;

			self.capture_wsl_command(&["mkdir", "-p", &staging_dir])
				.await?;
			self.extract_into_directory(response, &staging_dir).await?;
			self.capture_wsl_command(&["mv", &staging_dir, &target_dir])
				.await?;
		}

		let server_uri = WslInteractor::uri_from_params(&self.params, &target_dir);
		let server_paths = server_paths_from_release(server_uri, &params.release);
		let builder = ServerBuilder::new(&self.log, &params, &server_paths);
		let (origin, socket) = builder
			.listen_on_socket(format!("/tmp/code-server-{}", Uuid::new_v4()))
			.await?;

		// where I left off: we should make a "WslCodeServer" that would spawn
		// some simple thing to connect to the socket on the WSL side via stdin/out.
		// Using Node from the VS Code server to spawn something would work

		unimplemented!()
	}

	async fn try_get_running(
		&self,
		_params: &ResolvedServerParams,
	) -> Result<Option<SocketCodeServer>, AnyError> {
		Ok(None)
	}
}

pub struct WslInteractor();

impl WslInteractor {
	fn uri_from_params(params: &WslParams, path: &str) -> Url {
		let mut uri = Url::parse("https://example.com").unwrap();
		uri.set_scheme(WSL_SCHEME).unwrap();
		uri.set_path(path);
		if let Some(u) = &params.user {
			uri.set_username(u).unwrap();
		} else if params.system {
			uri.set_username("system").unwrap();
		}
		if let Some(u) = &params.distribution {
			uri.set_host(Some(u)).unwrap();
		}

		uri
	}

	fn get_args(&self, url: &Url, append_args: &[&str]) -> Vec<OsString> {
		let mut args = Vec::with_capacity(append_args.len() + 1);

		if let Some(h) = url.host_str() {
			args.push(OsString::from("--distribution"));
			args.push(OsString::from(h));
		}

		match url.username() {
			"" => {}
			"system" => args.push(OsString::from("--system")),

			u => {
				args.push(OsString::from("--user"));
				args.push(OsString::from(u));
			}
		}

		args.push(OsString::from("--"));
		args.extend(append_args.into_iter().map(OsString::from));

		args
	}

	fn run_args(&self, url: &Url, args: &[&str]) -> Result<std::process::Output, AnyError> {
		let mut cmd = std::process::Command::new("wsl.exe");
		cmd.args(self.get_args(url, args));
		let output = cmd.output().map_err(|e| wrap(e, "error running wsl.exe"))?;
		let output = check_output_status(output, || {
			format!(
				"wsl.exe {}",
				self.get_args(url, args)
					.join(" ".as_ref())
					.to_string_lossy()
			)
		})?;

		Ok(output)
	}
}

const WSL_SCHEME: &str = "wsl";

impl SystemInteractor for WslInteractor {
	fn scheme(&self) -> &'static str {
		WSL_SCHEME
	}

	fn process_at_path_exists(&self, pid: u32, url: &reqwest::Url) -> bool {
		let pid_path = format!("/proc/{}/exe", pid);
		match self.run_args(url, &["readlink", "-f", &pid_path]) {
			Ok(p) => String::from_utf8_lossy(&p.stdout).trim() == url.path(),
			Err(_) => false,
		}
	}

	fn process_find_running_at_path(&self, _path: &reqwest::Url) -> Option<u32> {
		None // not implemented
	}

	fn format_command(&self, command: &reqwest::Url, args: &mut Vec<String>) -> String {
		let prepend_args = self.get_args(command, &[command.path()]);
		for (i, a) in prepend_args.iter().enumerate() {
			args.insert(i, a.to_string_lossy().to_string())
		}

		"wsl.exe".to_string()
	}

	fn fs_remove_dir_all(&self, url: &reqwest::Url) -> Result<(), AnyError> {
		self.run_args(url, &["rm", "-rf", url.path()]).map(|_| ())
	}

	fn fs_exists(&self, url: &reqwest::Url) -> bool {
		self.run_args(url, &["test", "-e", url.path()]).is_ok()
	}

	fn fs_read_all(&self, url: &reqwest::Url) -> Result<String, AnyError> {
		self.run_args(url, &["cat", url.path()])
			.map(|o| String::from_utf8_lossy(&o.stdout).to_string())
	}

	fn fs_write_all(&self, url: &reqwest::Url, content: &str) -> Result<(), AnyError> {
		let mut cmd = std::process::Command::new("wsl.exe");
		cmd.stdin(Stdio::piped());
		cmd.stdout(Stdio::piped());
		cmd.stderr(Stdio::piped());
		cmd.args(self.get_args(url, &["tee", url.path()]));
		let mut child = cmd.spawn().map_err(|e| wrap(e, "error running wsl.exe"))?;

		let _ = child.stdin.take().unwrap().write_all(content.as_bytes());

		let output = child
			.wait_with_output()
			.map_err(|e| wrap(e, "error running wsl.exe"))?;
		check_output_status(output, || format!("input > wsl.exe tee {}", url.path()))?;

		Ok(())
	}

	fn fs_open_write(
		&self,
		url: &reqwest::Url,
	) -> Result<super::capability::BoxedFileWriter, AnyError> {
		let mut cmd = std::process::Command::new("wsl.exe");
		cmd.stdin(Stdio::piped());
		cmd.stdout(Stdio::null());
		cmd.stderr(Stdio::null());
		cmd.args(self.get_args(url, &["tee", url.path()]));
		let mut child = cmd.spawn().map_err(|e| wrap(e, "error running wsl.exe"))?;

		let stdin = child.stdin.take().unwrap();
		Ok(Box::new(WslInteractedWriter { stdin }))
	}
}

struct WslInteractedWriter {
	stdin: std::process::ChildStdin,
}

impl std::io::Write for WslInteractedWriter {
	fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
		self.stdin.write(buf)
	}

	fn flush(&mut self) -> std::io::Result<()> {
		self.stdin.flush()
	}
}

impl Drop for WslInteractedWriter {
	fn drop(&mut self) {
		let _ = self.stdin.flush();
	}
}
