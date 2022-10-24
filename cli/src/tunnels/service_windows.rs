/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use dialoguer::{theme::ColorfulTheme, Input, Password};
use lazy_static::lazy_static;
use std::{ffi::OsString, sync::Mutex, thread, time::Duration};
use tokio::sync::mpsc;
use windows_service::{
	define_windows_service,
	service::{
		ServiceAccess, ServiceControl, ServiceControlAccept, ServiceErrorControl, ServiceExitCode,
		ServiceInfo, ServiceStartType, ServiceState, ServiceStatus, ServiceType,
	},
	service_control_handler::{self, ServiceControlHandlerResult},
	service_dispatcher,
	service_manager::{ServiceManager, ServiceManagerAccess},
};

use crate::{
	commands::tunnels::ShutdownSignal,
	util::errors::{wrap, AnyError, WindowsNeedsElevation},
};
use crate::{
	log::{self, FileLogSink},
	state::LauncherPaths,
};

use super::service::{
	ServiceContainer, ServiceManager as CliServiceManager, SERVICE_LOG_FILE_NAME,
};

pub struct WindowsService {
	log: log::Logger,
}

const SERVICE_NAME: &str = "code_tunnel";
const SERVICE_TYPE: ServiceType = ServiceType::OWN_PROCESS;

impl WindowsService {
	pub fn new(log: log::Logger) -> Self {
		Self { log }
	}
}

impl CliServiceManager for WindowsService {
	fn register(&self, exe: std::path::PathBuf, args: &[&str]) -> Result<(), AnyError> {
		let service_manager = ServiceManager::local_computer(
			None::<&str>,
			ServiceManagerAccess::CONNECT | ServiceManagerAccess::CREATE_SERVICE,
		)
		.map_err(|e| WindowsNeedsElevation(format!("error getting service manager: {}", e)))?;

		let mut service_info = ServiceInfo {
			name: OsString::from(SERVICE_NAME),
			display_name: OsString::from("VS Code Tunnel"),
			service_type: SERVICE_TYPE,
			start_type: ServiceStartType::AutoStart,
			error_control: ServiceErrorControl::Normal,
			executable_path: exe,
			launch_arguments: args.iter().map(OsString::from).collect(),
			dependencies: vec![],
			account_name: None,
			account_password: None,
		};

		let existing_service = service_manager.open_service(
			SERVICE_NAME,
			ServiceAccess::QUERY_STATUS | ServiceAccess::START | ServiceAccess::CHANGE_CONFIG,
		);
		let service = if let Ok(service) = existing_service {
			service
				.change_config(&service_info)
				.map_err(|e| wrap(e, "error updating existing service"))?;
			service
		} else {
			loop {
				let (username, password) = prompt_credentials()?;
				service_info.account_name = Some(format!(".\\{}", username).into());
				service_info.account_password = Some(password.into());

				match service_manager.create_service(
					&service_info,
					ServiceAccess::CHANGE_CONFIG | ServiceAccess::START,
				) {
					Ok(service) => break service,
					Err(windows_service::Error::Winapi(e)) if Some(1057) == e.raw_os_error() => {
						error!(
							self.log,
							"Invalid username or password, please try again..."
						);
					}
					Err(e) => return Err(wrap(e, "error registering service").into()),
				}
			}
		};

		service
			.set_description("Service that runs `code tunnel` for access on vscode.dev")
			.ok();

		info!(self.log, "Successfully registered service...");

		let status = service
			.query_status()
			.map(|s| s.current_state)
			.unwrap_or(ServiceState::Stopped);

		if status == ServiceState::Stopped {
			service
				.start::<&str>(&[])
				.map_err(|e| wrap(e, "error starting service"))?;
		}

		info!(self.log, "Tunnel service successfully started");
		Ok(())
	}

	#[allow(unused_must_use)] // triggers incorrectly on `define_windows_service!`
	fn run(
		&self,
		launcher_paths: LauncherPaths,
		handle: impl 'static + ServiceContainer,
	) -> Result<(), AnyError> {
		let log = match FileLogSink::new(
			log::Level::Debug,
			&launcher_paths.root().join(SERVICE_LOG_FILE_NAME),
		) {
			Ok(sink) => self.log.tee(sink),
			Err(e) => {
				warning!(self.log, "Failed to create service log file: {}", e);
				self.log.clone()
			}
		};

		// We put the handle into the global "impl" type and then take it out in
		// my_service_main. This is needed just since we have to have that
		// function at the root level, but need to pass in data later here...
		SERVICE_IMPL.lock().unwrap().replace(ServiceImpl {
			container: Box::new(handle),
			launcher_paths,
			log,
		});

		define_windows_service!(ffi_service_main, service_main);

		service_dispatcher::start(SERVICE_NAME, ffi_service_main)
			.map_err(|e| wrap(e, "error starting service dispatcher").into())
	}

	fn unregister(&self) -> Result<(), AnyError> {
		let service_manager =
			ServiceManager::local_computer(None::<&str>, ServiceManagerAccess::CONNECT)
				.map_err(|e| wrap(e, "error getting service manager"))?;

		let service = service_manager.open_service(
			SERVICE_NAME,
			ServiceAccess::QUERY_STATUS | ServiceAccess::STOP | ServiceAccess::DELETE,
		);

		let service = match service {
			Ok(service) => service,
			// Service does not exist:
			Err(windows_service::Error::Winapi(e)) if Some(1060) == e.raw_os_error() => {
				return Ok(())
			}
			Err(e) => return Err(wrap(e, "error getting service handle").into()),
		};

		let service_status = service
			.query_status()
			.map_err(|e| wrap(e, "error getting service status"))?;

		if service_status.current_state != ServiceState::Stopped {
			service
				.stop()
				.map_err(|e| wrap(e, "error getting stopping service"))?;

			while let Ok(ServiceState::Stopped) = service.query_status().map(|s| s.current_state) {
				info!(self.log, "Polling for service to stop...");
				thread::sleep(Duration::from_secs(1));
			}
		}

		service
			.delete()
			.map_err(|e| wrap(e, "error deleting service"))?;

		Ok(())
	}
}

struct ServiceImpl {
	container: Box<dyn ServiceContainer>,
	launcher_paths: LauncherPaths,
	log: log::Logger,
}

lazy_static! {
	static ref SERVICE_IMPL: Mutex<Option<ServiceImpl>> = Mutex::new(None);
}

/// "main" function that the service calls in its own thread.
fn service_main(_arguments: Vec<OsString>) -> Result<(), AnyError> {
	let mut service = SERVICE_IMPL.lock().unwrap().take().unwrap();

	// Create a channel to be able to poll a stop event from the service worker loop.
	let (shutdown_tx, shutdown_rx) = mpsc::channel::<ShutdownSignal>(5);
	let mut shutdown_tx = Some(shutdown_tx);

	// Define system service event handler that will be receiving service events.
	let event_handler = move |control_event| -> ServiceControlHandlerResult {
		match control_event {
			ServiceControl::Interrogate => ServiceControlHandlerResult::NoError,
			ServiceControl::Stop => {
				shutdown_tx.take().and_then(|tx| tx.blocking_send(ShutdownSignal::ServiceStopped).ok());
				ServiceControlHandlerResult::NoError
			}
			_ => ServiceControlHandlerResult::NotImplemented,
		}
	};

	let status_handle = service_control_handler::register(SERVICE_NAME, event_handler)
		.map_err(|e| wrap(e, "error registering service event handler"))?;

	// Tell the system that service is running
	status_handle
		.set_service_status(ServiceStatus {
			service_type: SERVICE_TYPE,
			current_state: ServiceState::Running,
			controls_accepted: ServiceControlAccept::STOP,
			exit_code: ServiceExitCode::Win32(0),
			checkpoint: 0,
			wait_hint: Duration::default(),
			process_id: None,
		})
		.map_err(|e| wrap(e, "error marking service as running"))?;

	let result = tokio::runtime::Builder::new_multi_thread()
		.enable_all()
		.build()
		.unwrap()
		.block_on(
			service
				.container
				.run_service(service.log, service.launcher_paths, shutdown_rx),
		);

	status_handle
		.set_service_status(ServiceStatus {
			service_type: SERVICE_TYPE,
			current_state: ServiceState::Stopped,
			controls_accepted: ServiceControlAccept::empty(),
			exit_code: ServiceExitCode::Win32(0),
			checkpoint: 0,
			wait_hint: Duration::default(),
			process_id: None,
		})
		.map_err(|e| wrap(e, "error marking service as stopped"))?;

	result
}

fn prompt_credentials() -> Result<(String, String), AnyError> {
	println!("Running a Windows service under your user requires your username and password.");
	println!("These are sent to the Windows Service Manager and are not stored by VS Code.");

	let username: String = Input::with_theme(&ColorfulTheme::default())
		.with_prompt("Windows username:")
		.interact_text()
		.map_err(|e| wrap(e, "Failed to read username"))?;

	let password = Password::with_theme(&ColorfulTheme::default())
		.with_prompt("Windows password:")
		.interact()
		.map_err(|e| wrap(e, "Failed to read password"))?;

	Ok((username, password))
}
