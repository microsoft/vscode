/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::path::PathBuf;

use async_trait::async_trait;
use tokio::sync::mpsc;

use crate::commands::tunnels::ShutdownSignal;
use crate::log;
use crate::state::LauncherPaths;
use crate::util::errors::AnyError;

pub const SERVICE_LOG_FILE_NAME: &str = "tunnel-service.log";

#[async_trait]
pub trait ServiceContainer: Send {
	async fn run_service(
		&mut self,
		log: log::Logger,
		launcher_paths: LauncherPaths,
		shutdown_rx: mpsc::Receiver<ShutdownSignal>,
	) -> Result<(), AnyError>;
}

pub trait ServiceManager {
	/// Registers the current executable as a service to run with the given set
	/// of arguments.
	fn register(&self, exe: PathBuf, args: &[&str]) -> Result<(), AnyError>;

	/// Runs the service using the given handle. The executable *must not* take
	/// any action which may fail prior to calling this to ensure service
	/// states may update.
	fn run(
		&self,
		launcher_paths: LauncherPaths,
		handle: impl 'static + ServiceContainer,
	) -> Result<(), AnyError>;

	/// Unregisters the current executable as a service.
	fn unregister(&self) -> Result<(), AnyError>;
}

#[cfg(target_os = "windows")]
pub type ServiceManagerImpl = super::service_windows::WindowsService;

#[cfg(not(target_os = "windows"))]
pub type ServiceManagerImpl = UnimplementedServiceManager;

#[allow(unreachable_code)]
pub fn create_service_manager(log: log::Logger) -> ServiceManagerImpl {
	ServiceManagerImpl::new(log)
}

pub struct UnimplementedServiceManager();

#[allow(dead_code)]
impl UnimplementedServiceManager {
	fn new(_log: log::Logger) -> Self {
		Self()
	}
}

impl ServiceManager for UnimplementedServiceManager {
	fn register(&self, _exe: PathBuf, _args: &[&str]) -> Result<(), AnyError> {
		unimplemented!("Service management is not supported on this platform");
	}

	fn run(
		&self,
		_launcher_paths: LauncherPaths,
		_handle: impl 'static + ServiceContainer,
	) -> Result<(), AnyError> {
		unimplemented!("Service management is not supported on this platform");
	}

	fn unregister(&self) -> Result<(), AnyError> {
		unimplemented!("Service management is not supported on this platform");
	}
}
