/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use async_trait::async_trait;
use shell_escape::windows::escape as shell_escape;
use std::os::windows::process::CommandExt;
use std::{path::PathBuf, process::Stdio};
use winapi::um::winbase::{CREATE_NEW_PROCESS_GROUP, DETACHED_PROCESS};
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

use crate::util::command::new_std_command;
use crate::{
	constants::TUNNEL_ACTIVITY_NAME,
	log,
	state::LauncherPaths,
	tunnels::{protocol, singleton_client::do_single_rpc_call},
	util::errors::{wrap, wrapdbg, AnyError},
};

use super::service::{tail_log_file, ServiceContainer, ServiceManager as CliServiceManager};

const DID_LAUNCH_AS_HIDDEN_PROCESS: &str = "VSCODE_CLI_DID_LAUNCH_AS_HIDDEN_PROCESS";

pub struct WindowsService {
	log: log::Logger,
	tunnel_lock: PathBuf,
	log_file: PathBuf,
}

impl WindowsService {
	pub fn new(log: log::Logger, paths: &LauncherPaths) -> Self {
		Self {
			log,
			tunnel_lock: paths.tunnel_lockfile(),
			log_file: paths.service_log_file(),
		}
	}

	fn open_key() -> Result<RegKey, AnyError> {
		RegKey::predef(HKEY_CURRENT_USER)
			.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Run")
			.map_err(|e| wrap(e, "error opening run registry key").into())
			.map(|(key, _)| key)
	}
}

#[async_trait]
impl CliServiceManager for WindowsService {
	async fn register(&self, exe: std::path::PathBuf, args: &[&str]) -> Result<(), AnyError> {
		let key = WindowsService::open_key()?;

		let mut reg_str = String::new();
		let mut cmd = new_std_command(&exe);
		reg_str.push_str(shell_escape(exe.to_string_lossy()).as_ref());

		let mut add_arg = |arg: &str| {
			reg_str.push(' ');
			reg_str.push_str(shell_escape((*arg).into()).as_ref());
			cmd.arg(arg);
		};

		for arg in args {
			add_arg(arg);
		}

		add_arg("--log-to-file");
		add_arg(self.log_file.to_string_lossy().as_ref());

		key.set_value(TUNNEL_ACTIVITY_NAME, &reg_str)
			.map_err(|e| AnyError::from(wrapdbg(e, "error setting registry key")))?;

		info!(self.log, "Successfully registered service...");

		cmd.stderr(Stdio::null());
		cmd.stdout(Stdio::null());
		cmd.stdin(Stdio::null());
		cmd.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS);
		cmd.spawn()
			.map_err(|e| wrapdbg(e, "error starting service"))?;

		info!(self.log, "Tunnel service successfully started");
		Ok(())
	}

	async fn show_logs(&self) -> Result<(), AnyError> {
		tail_log_file(&self.log_file).await
	}

	async fn run(
		self,
		launcher_paths: LauncherPaths,
		mut handle: impl 'static + ServiceContainer,
	) -> Result<(), AnyError> {
		if std::env::var(DID_LAUNCH_AS_HIDDEN_PROCESS).is_ok() {
			return handle.run_service(self.log, launcher_paths).await;
		}

		// Start as a hidden subprocess to avoid showing cmd.exe on startup.
		// Fixes https://github.com/microsoft/vscode/issues/184058
		// I also tried the winapi ShowWindow, but that didn't yield fruit.
		new_std_command(std::env::current_exe().unwrap())
			.args(std::env::args().skip(1))
			.env(DID_LAUNCH_AS_HIDDEN_PROCESS, "1")
			.stderr(Stdio::null())
			.stdout(Stdio::null())
			.stdin(Stdio::null())
			.creation_flags(CREATE_NEW_PROCESS_GROUP | DETACHED_PROCESS)
			.spawn()
			.map_err(|e| wrap(e, "error starting nested process"))?;

		Ok(())
	}

	async fn is_installed(&self) -> Result<bool, AnyError> {
		let key = WindowsService::open_key()?;
		Ok(key.get_raw_value(TUNNEL_ACTIVITY_NAME).is_ok())
	}

	async fn unregister(&self) -> Result<(), AnyError> {
		let key = WindowsService::open_key()?;
		match key.delete_value(TUNNEL_ACTIVITY_NAME) {
			Ok(_) => {}
			Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
			Err(e) => return Err(wrap(e, "error deleting registry key").into()),
		}

		info!(self.log, "Tunnel service uninstalled");

		let r = do_single_rpc_call::<_, ()>(
			&self.tunnel_lock,
			self.log.clone(),
			protocol::singleton::METHOD_SHUTDOWN,
			protocol::EmptyObject {},
		)
		.await;

		if r.is_err() {
			warning!(self.log, "The tunnel service has been unregistered, but we couldn't find a running tunnel process. You may need to restart or log out and back in to fully stop the tunnel.");
		} else {
			info!(self.log, "Successfully shut down running tunnel.");
		}

		Ok(())
	}
}
