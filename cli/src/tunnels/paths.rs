/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{fs::read_dir, path::PathBuf};
use url::Url;

use serde::{Deserialize, Serialize};

use crate::{
	options::{self, Quality},
	state::LauncherPaths,
	update_service::Release,
	util::errors::AnyError,
};

use super::capability::get_scheme_interactor;

const PIDFILE_SUFFIX: &str = ".pid";
const LOGFILE_SUFFIX: &str = ".log";
pub const SERVER_FOLDER_NAME: &str = "server";

pub struct ServerPaths {
	// Directory into which the server is downloaded
	pub server_dir: Url,
	// Executable path, within the server_id
	pub executable: Url,
	// File where logs for the server should be written.
	pub logfile: Url,
	// File where the process ID for the server should be written.
	pub pidfile: Url,
}

impl ServerPaths {
	// Queries the system to determine the process ID of the running server.
	// Returns the process ID, if the server is running.
	pub fn get_running_pid(&self) -> Option<u32> {
		let interactor = get_scheme_interactor(self.server_dir.scheme());

		if let Some(pid) = self.read_pid() {
			return match interactor.process_at_path_exists(pid, &self.executable) {
				true => Some(pid),
				false => None,
			};
		}

		if let Some(pid) = interactor.process_find_running_at_path(&self.executable) {
			// attempt to backfill process ID:
			self.write_pid(pid).ok();
			return Some(pid);
		}

		None
	}

	/// Delete the server directory
	pub fn delete(&self) -> Result<(), AnyError> {
		get_scheme_interactor(self.server_dir.scheme()).fs_remove_dir_all(&self.server_dir)
	}

	// VS Code Server pid
	pub fn write_pid(&self, pid: u32) -> Result<(), AnyError> {
		get_scheme_interactor(self.pidfile.scheme())
			.fs_write_all(&self.pidfile, &format!("{}", pid))
	}

	fn read_pid(&self) -> Option<u32> {
		get_scheme_interactor(self.pidfile.scheme())
			.fs_read_all(&self.pidfile)
			.ok()
			.and_then(|s| s.parse::<u32>().ok())
	}
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct InstalledServer {
	pub quality: options::Quality,
	pub commit: String,
	pub base_path: PathBuf,
}

impl InstalledServer {
	pub fn server_paths(&self) -> ServerPaths {
		server_paths_from_parts(
			url::Url::from_file_path(&self.base_path).unwrap(),
			self.quality,
			&self.commit,
		)
	}
}

/// Gets server paths in the base folder from the target release.
pub fn server_paths_from_release(base_path: url::Url, release: &Release) -> ServerPaths {
	server_paths_from_parts(base_path, release.quality, &release.commit)
}

fn server_paths_from_parts(base_path: url::Url, quality: Quality, commit: &str) -> ServerPaths {
	let server_dir = base_path.join("server").unwrap();
	ServerPaths {
		executable: server_dir
			.join("bin")
			.unwrap()
			.join(&quality.server_entrypoint(base_path.scheme() == "file" && cfg!(windows)))
			.unwrap(),
		server_dir: server_dir,
		logfile: base_path
			.join(&format!("{}{}", commit, LOGFILE_SUFFIX))
			.unwrap(),
		pidfile: base_path
			.join(&format!("{}{}", commit, PIDFILE_SUFFIX))
			.unwrap(),
	}
}

// Gets a list of all servers which look like they might be running.
pub fn get_all_servers(lp: &LauncherPaths) -> Vec<InstalledServer> {
	let mut servers: Vec<InstalledServer> = vec![];
	let dir = lp.root().join("servers");
	if let Ok(children) = read_dir(dir) {
		for child in children.flatten() {
			let fname = child.file_name();
			let fname = fname.to_string_lossy();
			let (quality, commit) = match fname.split_once('-') {
				Some(r) => r,
				None => continue,
			};

			let quality = match options::Quality::try_from(quality) {
				Ok(q) => q,
				Err(_) => continue,
			};

			servers.push(InstalledServer {
				quality,
				commit: commit.to_string(),
				base_path: child.path(),
			});
		}
	}

	servers
}
