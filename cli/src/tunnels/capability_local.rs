/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{path::PathBuf, sync::Arc};

use super::{
	capability::{Capability, SystemInteractor},
	code_server::{ResolvedServerParams, SocketCodeServer},
	download_cache::DownloadCache,
	paths::server_paths_from_release,
};
use crate::{
	constants::{APPLICATION_NAME, QUALITYLESS_PRODUCT_NAME, QUALITYLESS_SERVER_NAME},
	log,
	state::LauncherPaths,
	tunnels::{
		capability::get_scheme_interactor,
		code_server::{
			do_extension_install_on_running_server, parse_socket_from, CodeServerOrigin,
			ServerBuilder,
		},
		paths::SERVER_FOLDER_NAME,
	},
	update_service::{unzip_downloaded_release, Platform, Release, UpdateService},
	util::{
		errors::{wrap, AnyError, CodeError},
		http::{self, BoxedHttp},
		io::SilentCopyProgress,
		prereqs::PreReqChecker,
	},
};
use async_trait::async_trait;
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};
use url::Url;

pub struct LocalCapability {
	log: log::Logger,
	cache: DownloadCache,
	http: BoxedHttp,
}

impl LocalCapability {
	pub fn new(log: log::Logger, paths: LauncherPaths, http: BoxedHttp) -> Self {
		LocalCapability {
			log,
			http,
			cache: DownloadCache::new(paths.root().join("servers")),
		}
	}
}

fn get_cache_key(release: &Release) -> String {
	format!("{}-{}", release.quality, release.commit)
}

#[async_trait]
impl Capability for LocalCapability {
	async fn platform(&self) -> Result<Platform, CodeError> {
		PreReqChecker::new().verify().await
	}

	async fn try_get_running(
		&self,
		params: &ResolvedServerParams,
	) -> Result<Option<SocketCodeServer>, AnyError> {
		let path = match self.cache.exists(&get_cache_key(&params.release)) {
			Some(p) => p,
			None => return Ok(None),
		};

		let server_paths =
			server_paths_from_release(url::Url::from_file_path(path).unwrap(), &params.release);
		info!(
			self.log,
			"Checking {} and {} for a running server...",
			server_paths.logfile.path(),
			server_paths.pidfile.path()
		);

		let pid = match server_paths.get_running_pid() {
			Some(pid) => pid,
			None => return Ok(None),
		};

		info!(self.log, "Found running server (pid={})", pid);
		let interactor = get_scheme_interactor(server_paths.logfile.scheme());
		if !interactor.fs_exists(&server_paths.logfile) {
			warning!(self.log, "{} Server is running but its logfile is missing. Don't delete the {} Server manually, run the command '{} prune'.", QUALITYLESS_PRODUCT_NAME, QUALITYLESS_PRODUCT_NAME, APPLICATION_NAME);
			return Ok(None);
		}

		do_extension_install_on_running_server(
			&server_paths.executable,
			&params.code_server_args.install_extensions,
			&self.log,
		)
		.await?;

		let origin = Arc::new(CodeServerOrigin::Existing(pid));
		let contents = interactor.fs_read_all(&server_paths.logfile)?;

		if let Some(socket) = parse_socket_from(&contents) {
			Ok(Some(SocketCodeServer {
				commit_id: params.release.commit.clone(),
				socket: PathBuf::from(socket),
				origin,
			}))
		} else {
			Ok(None)
		}
	}

	async fn start_server(
		&self,
		params: ResolvedServerParams,
	) -> Result<SocketCodeServer, AnyError> {
		let update_service = UpdateService::new(self.log.clone(), self.http.clone());
		let release = params.release.clone();
		let server_path = self
			.cache
			.create(get_cache_key(&params.release), |target_dir| async move {
				debug!(
					self.log,
					"Installing and setting up {}...", QUALITYLESS_SERVER_NAME
				);

				let tmpdir =
					tempfile::tempdir().map_err(|e| wrap(e, "error creating temp download dir"))?;

				let response = update_service.get_download_stream(&release).await?;

				let archive_path = tmpdir.path().join("server");

				info!(
					self.log,
					"Downloading {} server -> {}",
					QUALITYLESS_PRODUCT_NAME,
					archive_path.display()
				);

				http::download_into_file(
					&archive_path,
					self.log.get_download_logger("server download progress:"),
					response,
				)
				.await?;

				unzip_downloaded_release(
					&archive_path,
					&target_dir.join(SERVER_FOLDER_NAME),
					SilentCopyProgress(),
				)?;

				Ok(())
			})
			.await?;

		let server_paths = server_paths_from_release(
			url::Url::from_file_path(server_path).unwrap(),
			&params.release,
		);
		let builder = ServerBuilder::new(&self.log, &params, &server_paths);
		builder.listen_on_default_socket().await
	}
}

pub struct LocalInteractor();

impl SystemInteractor for LocalInteractor {
	fn scheme(&self) -> &'static str {
		"file"
	}

	fn process_at_path_exists(&self, pid: u32, url: &Url) -> bool {
		let mut sys = System::new();
		let pid = Pid::from_u32(pid);
		if !sys.refresh_process(pid) {
			return false;
		}

		let path = url.to_file_path().unwrap();
		let path = path.to_string_lossy();
		if let Some(process) = sys.process(pid) {
			for cmd in process.cmd() {
				if cmd.contains(path.as_ref()) {
					return true;
				}
			}
		}

		false
	}

	fn process_find_running_at_path(&self, url: &Url) -> Option<u32> {
		let mut sys = System::new();
		sys.refresh_processes();

		let path = url.to_file_path().unwrap();
		let path = path.to_string_lossy();
		for (pid, process) in sys.processes() {
			for cmd in process.cmd() {
				if cmd.contains(path.as_ref()) {
					return Some(pid.as_u32());
				}
			}
		}
		None
	}

	fn fs_remove_dir_all(&self, url: &Url) -> Result<(), AnyError> {
		let path = url.to_file_path().unwrap();
		std::fs::remove_dir_all(&path)
			.map_err(|e| wrap(e, format!("error deleting dir {}", path.display())).into())
	}

	fn format_command(&self, command: &Url, _args: &mut Vec<String>) -> String {
		command
			.to_file_path()
			.unwrap()
			.to_string_lossy()
			.to_string()
	}

	fn fs_exists(&self, url: &Url) -> bool {
		url.to_file_path().unwrap().exists()
	}

	fn fs_read_all(&self, url: &Url) -> Result<String, AnyError> {
		let path = url.to_file_path().unwrap();
		std::fs::read_to_string(&path)
			.map_err(|e| wrap(e, format!("error reading {}", path.display())).into())
	}

	fn fs_write_all(&self, url: &Url, content: &str) -> Result<(), AnyError> {
		let path = url.to_file_path().unwrap();
		std::fs::write(&path, content.as_bytes())
			.map_err(|e| wrap(e, format!("error writing {}", path.display())).into())
	}

	fn fs_open_write(&self, url: &Url) -> Result<super::capability::BoxedFileWriter, AnyError> {
		let path = url.to_file_path().unwrap();
		let f = std::fs::File::open(&path)
			.map_err(|e| wrap(e, format!("error opening {}", path.display())))?;

		Ok(Box::new(f))
	}
}
