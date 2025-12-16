/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::path::{Path, PathBuf};

use async_trait::async_trait;

use crate::log;
use crate::state::LauncherPaths;
use crate::util::errors::{wrap, AnyError};
use crate::util::io::{tailf, TailEvent};

pub const SERVICE_LOG_FILE_NAME: &str = "tunnel-service.log";

#[async_trait]
pub trait ServiceContainer: Send {
	async fn run_service(
		&mut self,
		log: log::Logger,
		launcher_paths: LauncherPaths,
	) -> Result<(), AnyError>;
}

#[async_trait]
pub trait ServiceManager {
	/// Registers the current executable as a service to run with the given set
	/// of arguments.
	async fn register(&self, exe: PathBuf, args: &[&str]) -> Result<(), AnyError>;

	/// Runs the service using the given handle. The executable *must not* take
	/// any action which may fail prior to calling this to ensure service
	/// states may update.
	async fn run(
		self,
		launcher_paths: LauncherPaths,
		handle: impl 'static + ServiceContainer,
	) -> Result<(), AnyError>;

	/// Show logs from the running service to standard out.
	async fn show_logs(&self) -> Result<(), AnyError>;

	/// Gets whether the tunnel service is installed.
	async fn is_installed(&self) -> Result<bool, AnyError>;

	/// Unregisters the current executable as a service.
	async fn unregister(&self) -> Result<(), AnyError>;
}

#[cfg(target_os = "windows")]
pub type ServiceManagerImpl = super::service_windows::WindowsService;

#[cfg(target_os = "linux")]
pub type ServiceManagerImpl = super::service_linux::SystemdService;

#[cfg(target_os = "macos")]
pub type ServiceManagerImpl = super::service_macos::LaunchdService;

#[allow(unreachable_code)]
#[allow(unused_variables)]
pub fn create_service_manager(log: log::Logger, paths: &LauncherPaths) -> ServiceManagerImpl {
	#[cfg(target_os = "macos")]
	{
		super::service_macos::LaunchdService::new(log, paths)
	}
	#[cfg(target_os = "windows")]
	{
		super::service_windows::WindowsService::new(log, paths)
	}
	#[cfg(target_os = "linux")]
	{
		super::service_linux::SystemdService::new(log, paths.clone())
	}
}

#[allow(dead_code)] // unused on Linux
pub(crate) async fn tail_log_file(log_file: &Path) -> Result<(), AnyError> {
	if !log_file.exists() {
		println!("The tunnel service has not started yet.");
		return Ok(());
	}

	let file = std::fs::File::open(log_file).map_err(|e| wrap(e, "error opening log file"))?;
	let mut rx = tailf(file, 20);
	while let Some(line) = rx.recv().await {
		match line {
			TailEvent::Line(l) => print!("{l}"),
			TailEvent::Reset => println!("== Tunnel service restarted =="),
			TailEvent::Err(e) => return Err(wrap(e, "error reading log file").into()),
		}
	}

	Ok(())
}
