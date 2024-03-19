/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use super::errors::{wrap, WrappedError};
use super::io::ReportCopyProgress;
use std::fs::{self, File};
use std::io;
use std::path::Path;
use std::path::PathBuf;
use zip::read::ZipFile;
use zip::{self, ZipArchive};

// Borrowed and modified from https://github.com/zip-rs/zip/blob/master/examples/extract.rs

/// Returns whether all files in the archive start with the same path segment.
/// If so, it's an indication we should skip that segment when extracting.
fn should_skip_first_segment(archive: &mut ZipArchive<File>) -> bool {
	let first_name = {
		let file = archive
			.by_index_raw(0)
			.expect("expected not to have an empty archive");

		let path = file
			.enclosed_name()
			.expect("expected to have path")
			.iter()
			.next()
			.expect("expected to have non-empty name");

		path.to_owned()
	};

	for i in 1..archive.len() {
		if let Ok(file) = archive.by_index_raw(i) {
			if let Some(name) = file.enclosed_name() {
				if name.iter().next() != Some(&first_name) {
					return false;
				}
			}
		}
	}

	archive.len() > 1 // prefix removal is invalid if there's only a single file
}

pub fn unzip_file<T>(path: &Path, parent_path: &Path, mut reporter: T) -> Result<(), WrappedError>
where
	T: ReportCopyProgress,
{
	let file = fs::File::open(path)
		.map_err(|e| wrap(e, format!("unable to open file {}", path.display())))?;

	let mut archive = zip::ZipArchive::new(file)
		.map_err(|e| wrap(e, format!("failed to open zip archive {}", path.display())))?;

	let skip_segments_no = usize::from(should_skip_first_segment(&mut archive));
	for i in 0..archive.len() {
		reporter.report_progress(i as u64, archive.len() as u64);
		let mut file = archive
			.by_index(i)
			.map_err(|e| wrap(e, format!("could not open zip entry {}", i)))?;

		let outpath: PathBuf = match file.enclosed_name() {
			Some(path) => {
				let mut full_path = PathBuf::from(parent_path);
				full_path.push(PathBuf::from_iter(path.iter().skip(skip_segments_no)));
				full_path
			}
			None => continue,
		};

		if file.is_dir() || file.name().ends_with('/') {
			fs::create_dir_all(&outpath)
				.map_err(|e| wrap(e, format!("could not create dir for {}", outpath.display())))?;
			apply_permissions(&file, &outpath)?;
			continue;
		}

		if let Some(p) = outpath.parent() {
			fs::create_dir_all(p)
				.map_err(|e| wrap(e, format!("could not create dir for {}", outpath.display())))?;
		}

		#[cfg(unix)]
		{
			use libc::S_IFLNK;
			use std::io::Read;
			use std::os::unix::ffi::OsStringExt;

			#[cfg(target_os = "macos")]
			const S_IFLINK_32: u32 = S_IFLNK as u32;

			#[cfg(target_os = "linux")]
			const S_IFLINK_32: u32 = S_IFLNK;

			if matches!(file.unix_mode(), Some(mode) if mode & S_IFLINK_32 == S_IFLINK_32) {
				let mut link_to = Vec::new();
				file.read_to_end(&mut link_to).map_err(|e| {
					wrap(
						e,
						format!("could not read symlink linkpath {}", outpath.display()),
					)
				})?;

				let link_path = PathBuf::from(std::ffi::OsString::from_vec(link_to));
				std::os::unix::fs::symlink(link_path, &outpath).map_err(|e| {
					wrap(e, format!("could not create symlink {}", outpath.display()))
				})?;
				continue;
			}
		}

		let mut outfile = fs::File::create(&outpath).map_err(|e| {
			wrap(
				e,
				format!(
					"unable to open file to write {} (from {:?})",
					outpath.display(),
					file.enclosed_name().map(|p| p.to_string_lossy()),
				),
			)
		})?;

		io::copy(&mut file, &mut outfile)
			.map_err(|e| wrap(e, format!("error copying file {}", outpath.display())))?;

		apply_permissions(&file, &outpath)?;
	}

	reporter.report_progress(archive.len() as u64, archive.len() as u64);

	Ok(())
}

#[cfg(unix)]
fn apply_permissions(file: &ZipFile, outpath: &Path) -> Result<(), WrappedError> {
	use std::os::unix::fs::PermissionsExt;

	if let Some(mode) = file.unix_mode() {
		fs::set_permissions(outpath, fs::Permissions::from_mode(mode)).map_err(|e| {
			wrap(
				e,
				format!("error setting permissions on {}", outpath.display()),
			)
		})?;
	}

	Ok(())
}

#[cfg(windows)]
fn apply_permissions(_file: &ZipFile, _outpath: &Path) -> Result<(), WrappedError> {
	Ok(())
}
