/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::util::errors::{wrap, WrappedError};

use flate2::read::GzDecoder;
use std::fs;
use std::io::{Seek, SeekFrom};
use std::path::{Path, PathBuf};
use tar::Archive;

use super::io::ReportCopyProgress;

fn should_skip_first_segment(file: &fs::File) -> Result<bool, WrappedError> {
	// unfortunately, we need to re-read the archive here since you cannot reuse
	// `.entries()`. But this will generally only look at one or two files, so this
	// should be acceptably speedy... If not, we could hardcode behavior for
	// different types of archives.

	let tar = GzDecoder::new(file);
	let mut archive = Archive::new(tar);
	let mut entries = archive
		.entries()
		.map_err(|e| wrap(e, "error opening archive"))?;

	let first_name = {
		let file = entries
			.next()
			.expect("expected not to have an empty archive")
			.map_err(|e| wrap(e, "error reading entry file"))?;

		let path = file.path().expect("expected to have path");

		path.iter()
			.next()
			.expect("expected to have non-empty name")
			.to_owned()
	};

	let mut had_multiple = false;
	for file in entries.flatten() {
		had_multiple = true;
		if let Ok(name) = file.path() {
			if name.iter().next() != Some(&first_name) {
				return Ok(false);
			}
		}
	}

	Ok(had_multiple) // prefix removal is invalid if there's only a single file
}

pub fn decompress_tarball<T>(
	path: &Path,
	parent_path: &Path,
	mut reporter: T,
) -> Result<(), WrappedError>
where
	T: ReportCopyProgress,
{
	let mut tar_gz = fs::File::open(path)
		.map_err(|e| wrap(e, format!("error opening file {}", path.display())))?;
	let skip_first = should_skip_first_segment(&tar_gz)?;

	// reset since skip logic read the tar already:
	tar_gz
		.seek(SeekFrom::Start(0))
		.map_err(|e| wrap(e, "error resetting seek position"))?;

	let tar = GzDecoder::new(tar_gz);
	let mut archive = Archive::new(tar);

	let results = archive
		.entries()
		.map_err(|e| wrap(e, format!("error opening archive {}", path.display())))?
		.filter_map(|e| e.ok())
		.map(|mut entry| {
			let entry_path = entry
				.path()
				.map_err(|e| wrap(e, "error reading entry path"))?;

			let path = parent_path.join(if skip_first {
				entry_path.iter().skip(1).collect::<PathBuf>()
			} else {
				entry_path.into_owned()
			});

			if let Some(p) = path.parent() {
				fs::create_dir_all(&p)
					.map_err(|e| wrap(e, format!("could not create dir for {}", p.display())))?;
			}

			entry
				.unpack(&path)
				.map_err(|e| wrap(e, format!("error unpacking {}", path.display())))?;
			Ok(path)
		})
		.collect::<Result<Vec<PathBuf>, WrappedError>>()?;

	// Tarballs don't have a way to get the number of entries ahead of time
	reporter.report_progress(results.len() as u64, results.len() as u64);

	Ok(())
}
