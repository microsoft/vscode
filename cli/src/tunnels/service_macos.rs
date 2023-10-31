/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	fs::{remove_file, File},
	io::{self, Write},
	path::{Path, PathBuf},
};

use async_trait::async_trait;

use crate::{
	constants::APPLICATION_NAME,
	log,
	state::LauncherPaths,
	util::{
		command::capture_command_and_check_status,
		errors::{wrap, AnyError, CodeError, MissingHomeDirectory},
	},
};

use super::{service::tail_log_file, ServiceManager};

pub struct LaunchdService {
	log: log::Logger,
	log_file: PathBuf,
}

impl LaunchdService {
	pub fn new(log: log::Logger, paths: &LauncherPaths) -> Self {
		Self {
			log,
			log_file: paths.service_log_file(),
		}
	}
}

#[async_trait]
impl ServiceManager for LaunchdService {
	async fn register(
		&self,
		exe: std::path::PathBuf,
		args: &[&str],
	) -> Result<(), crate::util::errors::AnyError> {
		let service_file = get_service_file_path()?;
		write_service_file(&service_file, &self.log_file, exe, args)
			.map_err(|e| wrap(e, "error creating service file"))?;

		info!(self.log, "Successfully registered service...");

		capture_command_and_check_status(
			"launchctl",
			&["load", service_file.as_os_str().to_string_lossy().as_ref()],
		)
		.await?;

		capture_command_and_check_status("launchctl", &["start", &get_service_label()]).await?;

		info!(self.log, "Tunnel service successfully started");

		Ok(())
	}

	async fn show_logs(&self) -> Result<(), AnyError> {
		tail_log_file(&self.log_file).await
	}

	async fn run(
		self,
		launcher_paths: crate::state::LauncherPaths,
		mut handle: impl 'static + super::ServiceContainer,
	) -> Result<(), crate::util::errors::AnyError> {
		handle.run_service(self.log, launcher_paths).await
	}

	async fn is_installed(&self) -> Result<bool, AnyError> {
		let cmd = capture_command_and_check_status("launchctl", &["list"]).await?;
		Ok(String::from_utf8_lossy(&cmd.stdout).contains(&get_service_label()))
	}

	async fn unregister(&self) -> Result<(), crate::util::errors::AnyError> {
		let service_file = get_service_file_path()?;

		match capture_command_and_check_status("launchctl", &["stop", &get_service_label()]).await {
			Ok(_) => {}
			// status 3 == "no such process"
			Err(CodeError::CommandFailed { code, .. }) if code == 3 => {}
			Err(e) => return Err(wrap(e, "error stopping service").into()),
		};

		info!(self.log, "Successfully stopped service...");

		capture_command_and_check_status(
			"launchctl",
			&[
				"unload",
				service_file.as_os_str().to_string_lossy().as_ref(),
			],
		)
		.await?;

		info!(self.log, "Tunnel service uninstalled");

		if let Ok(f) = get_service_file_path() {
			remove_file(f).ok();
		}

		Ok(())
	}
}

fn get_service_label() -> String {
	format!("com.visualstudio.{}.tunnel", APPLICATION_NAME)
}

fn get_service_file_path() -> Result<PathBuf, MissingHomeDirectory> {
	match dirs::home_dir() {
		Some(mut d) => {
			d.push(format!("{}.plist", get_service_label()));
			Ok(d)
		}
		None => Err(MissingHomeDirectory()),
	}
}

fn write_service_file(
	path: &PathBuf,
	log_file: &Path,
	exe: std::path::PathBuf,
	args: &[&str],
) -> io::Result<()> {
	let mut f = File::create(path)?;
	let log_file = log_file.as_os_str().to_string_lossy();
	// todo: we may be able to skip file logging and use the ASL instead
	// if/when we no longer need to support older macOS versions.
	write!(
		&mut f,
		"<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
		<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
		<plist version=\"1.0\">\n\
		<dict>\n\
			<key>Label</key>\n\
			<string>{}</string>\n\
			<key>LimitLoadToSessionType</key>\n\
			<string>Aqua</string>\n\
			<key>ProgramArguments</key>\n\
			<array>\n\
				<string>{}</string>\n\
				<string>{}</string>\n\
			</array>\n\
			<key>KeepAlive</key>\n\
			<true/>\n\
			<key>StandardErrorPath</key>\n\
			<string>{}</string>\n\
			<key>StandardOutPath</key>\n\
			<string>{}</string>\n\
		</dict>\n\
		</plist>",
		get_service_label(),
		exe.into_os_string().to_string_lossy(),
		args.join("</string><string>"),
		log_file,
		log_file
	)?;
	Ok(())
}
