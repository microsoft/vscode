/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	fs::{rename, set_permissions},
	path::Path,
};
use tempfile::tempdir;

use crate::{
	constants::{VSCODE_CLI_COMMIT, VSCODE_CLI_QUALITY},
	options::Quality,
	update_service::{Platform, Release, TargetKind, UpdateService},
	util::{
		errors::{wrap, AnyError, UpdatesNotConfigured},
		http,
		io::ReportCopyProgress,
	},
};

pub struct SelfUpdate<'a> {
	commit: &'static str,
	quality: Quality,
	platform: Platform,
	update_service: &'a UpdateService,
}

impl<'a> SelfUpdate<'a> {
	pub fn new(update_service: &'a UpdateService) -> Result<Self, AnyError> {
		let commit = VSCODE_CLI_COMMIT
			.ok_or_else(|| UpdatesNotConfigured("unknown build commit".to_string()))?;

		let quality = VSCODE_CLI_QUALITY
			.ok_or_else(|| UpdatesNotConfigured("no configured quality".to_string()))
			.and_then(|q| Quality::try_from(q).map_err(UpdatesNotConfigured))?;

		let platform = Platform::env_default().ok_or_else(|| {
			UpdatesNotConfigured("Unknown platform, please report this error".to_string())
		})?;

		Ok(Self {
			commit,
			quality,
			platform,
			update_service,
		})
	}

	/// Gets the current release
	pub async fn get_current_release(&self) -> Result<Release, AnyError> {
		self.update_service
			.get_latest_commit(self.platform, TargetKind::Cli, self.quality)
			.await
	}

	/// Gets whether the given release is what this CLI is built against
	pub fn is_up_to_date_with(&self, release: &Release) -> bool {
		release.commit == self.commit
	}

	/// Updates the CLI to the given release.
	pub async fn do_update(
		&self,
		release: &Release,
		progress: impl ReportCopyProgress,
	) -> Result<(), AnyError> {
		let stream = self.update_service.get_download_stream(release).await?;
		let target_path =
			std::env::current_exe().map_err(|e| wrap(e, "could not get current exe"))?;
		let staging_path = target_path.with_extension(".update");

		http::download_into_file(&staging_path, progress, stream).await?;

		copy_file_metadata(&target_path, &staging_path)
			.map_err(|e| wrap(e, "failed to set file permissions"))?;

		// Try to rename the old CLI to a tempdir, where it can get cleaned up by the
		// OS later. However, this can fail if the tempdir is on a different drive
		// than the installation dir. In this case just rename it to ".old".
		let disposal_dir = tempdir().map_err(|e| wrap(e, "Failed to create disposal dir"))?;
		if rename(&target_path, &disposal_dir.path().join("old-code-cli")).is_err() {
			rename(&target_path, &target_path.with_extension(".old"))
				.map_err(|e| wrap(e, "failed to rename old CLI"))?;
		}

		rename(&staging_path, &target_path)
			.map_err(|e| wrap(e, "failed to rename newly installed CLI"))?;

		Ok(())
	}
}

#[cfg(target_os = "windows")]
fn copy_file_metadata(from: &Path, to: &Path) -> Result<(), std::io::Error> {
	let permissions = from.metadata()?.permissions();
	set_permissions(&to, permissions)?;
	Ok(())
}

#[cfg(not(target_os = "windows"))]
fn copy_file_metadata(from: &Path, to: &Path) -> Result<(), std::io::Error> {
	use std::os::unix::ffi::OsStrExt;
	use std::os::unix::fs::MetadataExt;

	let metadata = from.metadata()?;
	set_permissions(&to, metadata.permissions())?;

	// based on coreutils' chown https://github.com/uutils/coreutils/blob/72b4629916abe0852ad27286f4e307fbca546b6e/src/chown/chown.rs#L266-L281
	let s = std::ffi::CString::new(to.as_os_str().as_bytes()).unwrap();
	let ret = unsafe { libc::chown(s.as_ptr(), metadata.uid(), metadata.gid()) };
	if ret != 0 {
		return Err(std::io::Error::last_os_error());
	}

	Ok(())
}
