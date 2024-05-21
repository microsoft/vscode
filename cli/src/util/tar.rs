/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::util::errors::{wrap, WrappedError};

use flate2::read::GzDecoder;
use std::fs;
use std::io::Seek;
use std::path::{Path, PathBuf};
use tar::Archive;

use super::errors::wrapdbg;
use super::io::ReportCopyProgress;

fn should_skip_first_segment(file: &fs::File) -> Result<(bool, u64), WrappedError> {
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

	let mut num_entries = 1;
	let mut had_different_prefixes = false;
	for file in entries.flatten() {
		if !had_different_prefixes {
			if let Ok(name) = file.path() {
				if name.iter().next() != Some(&first_name) {
					had_different_prefixes = true;
				}
			}
		}

		num_entries += 1;
	}

	Ok((!had_different_prefixes && num_entries > 1, num_entries)) // prefix removal is invalid if there's only a single file
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

	let (skip_first, num_entries) = should_skip_first_segment(&tar_gz)?;
	let report_progress_every = num_entries / 20;
	let mut entries_so_far = 0;
	let mut last_reported_at = 0;

	// reset since skip logic read the tar already:
	tar_gz
		.rewind()
		.map_err(|e| wrap(e, "error resetting seek position"))?;

	let tar = GzDecoder::new(tar_gz);
	let mut archive = Archive::new(tar);
	archive
		.entries()
		.map_err(|e| wrap(e, format!("error opening archive {}", path.display())))?
		.filter_map(|e| e.ok())
		.try_for_each::<_, Result<_, WrappedError>>(|mut entry| {
			// approximate progress based on where we are in the archive:
			entries_so_far += 1;
			if entries_so_far - last_reported_at > report_progress_every {
				reporter.report_progress(entries_so_far, num_entries);
				entries_so_far += 1;
				last_reported_at = entries_so_far;
			}

			let entry_path = entry
				.path()
				.map_err(|e| wrap(e, "error reading entry path"))?;

			let path = parent_path.join(if skip_first {
				entry_path.iter().skip(1).collect::<PathBuf>()
			} else {
				entry_path.into_owned()
			});

			if let Some(p) = path.parent() {
				fs::create_dir_all(p)
					.map_err(|e| wrap(e, format!("could not create dir for {}", p.display())))?;
			}

			entry
				.unpack(&path)
				.map_err(|e| wrapdbg(e, format!("error unpacking {}", path.display())))?;

			Ok(())
		})?;

	reporter.report_progress(num_entries, num_entries);

	Ok(())
}
