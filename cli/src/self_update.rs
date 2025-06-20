/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{fs, path::Path};
use tempfile::tempdir;

use crate::{
	constants::{VSCODE_CLI_COMMIT, VSCODE_CLI_QUALITY},
	options::Quality,
	update_service::{unzip_downloaded_release, Platform, Release, TargetKind, UpdateService},
	util::{
		command::new_std_command,
		errors::{wrap, AnyError, CodeError, CorruptDownload},
		http,
		io::{ReportCopyProgress, SilentCopyProgress},
	},
};

pub struct SelfUpdate<'a> {
	commit: &'static str,
	quality: Quality,
	platform: Platform,
	update_service: &'a UpdateService,
}

static OLD_UPDATE_EXTENSION: &str = "Updating CLI";

impl<'a> SelfUpdate<'a> {
	pub fn new(update_service: &'a UpdateService) -> Result<Self, AnyError> {
		let commit = VSCODE_CLI_COMMIT
			.ok_or_else(|| CodeError::UpdatesNotConfigured("unknown build commit"))?;

		let quality = VSCODE_CLI_QUALITY
			.ok_or_else(|| CodeError::UpdatesNotConfigured("no configured quality"))
			.and_then(|q| {
				Quality::try_from(q).map_err(|_| CodeError::UpdatesNotConfigured("unknown quality"))
			})?;

		let platform = Platform::env_default().ok_or_else(|| {
			CodeError::UpdatesNotConfigured("Unknown platform, please report this error")
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

	/// Cleans up old self-updated binaries. Should be called with regularity.
	/// May fail if old versions are still running.
	pub fn cleanup_old_update(&self) -> Result<(), std::io::Error> {
		let current_path = std::env::current_exe()?;
		let old_path = current_path.with_extension(OLD_UPDATE_EXTENSION);
		if old_path.exists() {
			fs::remove_file(old_path)?;
		}

		Ok(())
	}

	/// Updates the CLI to the given release.
	pub async fn do_update(
		&self,
		release: &Release,
		progress: impl ReportCopyProgress,
	) -> Result<(), AnyError> {
		// 1. Download the archive into a temporary directory
		let tempdir = tempdir().map_err(|e| wrap(e, "Failed to create temp dir"))?;
		let stream = self.update_service.get_download_stream(release).await?;
		let archive_path = tempdir.path().join(stream.url_path_basename().unwrap());
		http::download_into_file(&archive_path, progress, stream).await?;

		// 2. Unzip the archive and get the binary
		let target_path =
			std::env::current_exe().map_err(|e| wrap(e, "could not get current exe"))?;
		let staging_path = target_path.with_extension(".update");
		let archive_contents_path = tempdir.path().join("content");
		// unzipping the single binary is pretty small and fast--don't bother with passing progress
		unzip_downloaded_release(&archive_path, &archive_contents_path, SilentCopyProgress())?;
		copy_updated_cli_to_path(&archive_contents_path, &staging_path)?;

		// 3. Copy file metadata, make sure the new binary is executable\
		copy_file_metadata(&target_path, &staging_path)
			.map_err(|e| wrap(e, "failed to set file permissions"))?;
		validate_cli_is_good(&staging_path)?;

		// Try to rename the old CLI to the tempdir, where it can get cleaned up by the
		// OS later. However, this can fail if the tempdir is on a different drive
		// than the installation dir. In this case just rename it to ".old".
		if fs::rename(&target_path, tempdir.path().join("old-code-cli")).is_err() {
			fs::rename(
				&target_path,
				target_path.with_extension(OLD_UPDATE_EXTENSION),
			)
			.map_err(|e| wrap(e, "failed to rename old CLI"))?;
		}

		fs::rename(&staging_path, &target_path)
			.map_err(|e| wrap(e, "failed to rename newly installed CLI"))?;

		Ok(())
	}
}

fn validate_cli_is_good(exe_path: &Path) -> Result<(), AnyError> {
	let o = new_std_command(exe_path)
		.args(["--version"])
		.output()
		.map_err(|e| CorruptDownload(format!("could not execute new binary, aborting: {e}")))?;

	if !o.status.success() {
		let msg = format!(
			"could not execute new binary, aborting. Stdout:\n\n{}\n\nStderr:\n\n{}",
			String::from_utf8_lossy(&o.stdout),
			String::from_utf8_lossy(&o.stderr),
		);

		return Err(CorruptDownload(msg).into());
	}

	Ok(())
}

fn copy_updated_cli_to_path(unzipped_content: &Path, staging_path: &Path) -> Result<(), AnyError> {
	let unzipped_files = fs::read_dir(unzipped_content)
		.map_err(|e| wrap(e, "could not read update contents"))?
		.collect::<Vec<_>>();
	if unzipped_files.len() != 1 {
		let msg = format!(
			"expected exactly one file in update, got {}",
			unzipped_files.len()
		);
		return Err(CorruptDownload(msg).into());
	}

	let archive_file = unzipped_files[0]
		.as_ref()
		.map_err(|e| wrap(e, "error listing update files"))?;
	fs::copy(archive_file.path(), staging_path)
		.map_err(|e| wrap(e, "error copying to staging file"))?;
	Ok(())
}

#[cfg(target_os = "windows")]
fn copy_file_metadata(from: &Path, to: &Path) -> Result<(), std::io::Error> {
	let permissions = from.metadata()?.permissions();
	fs::set_permissions(to, permissions)?;
	Ok(())
}

#[cfg(not(target_os = "windows"))]
fn copy_file_metadata(from: &Path, to: &Path) -> Result<(), std::io::Error> {
	use std::os::unix::ffi::OsStrExt;
	use std::os::unix::fs::MetadataExt;

	let metadata = from.metadata()?;
	fs::set_permissions(to, metadata.permissions())?;

	// based on coreutils' chown https://github.com/uutils/coreutils/blob/72b4629916abe0852ad27286f4e307fbca546b6e/src/chown/chown.rs#L266-L281
	let s = std::ffi::CString::new(to.as_os_str().as_bytes()).unwrap();
	let ret = unsafe { libc::chown(s.as_ptr(), metadata.uid(), metadata.gid()) };
	if ret != 0 {
		return Err(std::io::Error::last_os_error());
	}

	Ok(())
}
