/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use async_trait::async_trait;
use shell_escape::windows::escape as shell_escape;
use std::{
	path::PathBuf,
	process::{Command, Stdio},
};
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

use crate::{
	constants::TUNNEL_ACTIVITY_NAME,
	log,
	state::LauncherPaths,
	tunnels::{protocol, singleton_client::do_single_rpc_call},
	util::errors::{wrap, wrapdbg, AnyError},
};

use super::service::{tail_log_file, ServiceContainer, ServiceManager as CliServiceManager};

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
		let mut cmd = Command::new(&exe);
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
		handle.run_service(self.log, launcher_paths).await
	}

	async fn unregister(&self) -> Result<(), AnyError> {
		let key = WindowsService::open_key()?;
		key.delete_value(TUNNEL_ACTIVITY_NAME)
			.map_err(|e| AnyError::from(wrap(e, "error deleting registry key")))?;
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
