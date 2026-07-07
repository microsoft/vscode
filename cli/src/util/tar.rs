/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::util::errors::{wrap, WrappedError};
use crate::util::extract_safety::{
	ensure_canonical_within_root, prepare_extraction_root, safe_extract_join,
};

use flate2::read::GzDecoder;
use std::fs::{self, File};
use std::io::{Read, Seek};
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
	mut tar_gz: File,
	parent_path: &Path,
	mut reporter: T,
) -> Result<(), WrappedError>
where
	T: ReportCopyProgress,
{
	let (skip_first, num_entries) = should_skip_first_segment(&tar_gz)?;
	let report_progress_every = num_entries / 20;
	let mut entries_so_far = 0;
	let mut last_reported_at = 0;

	let canonical_root = prepare_extraction_root(parent_path)?;

	// reset since skip logic read the tar already:
	tar_gz
		.rewind()
		.map_err(|e| wrap(e, "error resetting seek position"))?;

	let tar = GzDecoder::new(tar_gz);
	let mut archive = Archive::new(tar);
	archive
		.entries()
		.map_err(|e| wrap(e, "error opening archive"))?
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

			let relative: PathBuf = if skip_first {
				entry_path.iter().skip(1).collect()
			} else {
				entry_path.into_owned()
			};

			// Skip bare top-level directory entries (e.g. "vscode-server-linux-x64/")
			// once their single segment has been stripped. They contribute no file
			// to extract, and the directory will be created on demand for nested
			// entries below. Only directory entries are skipped; non-directory
			// entries with an empty relative path fall through to
			// `safe_extract_join`, which rejects them.
			if relative.as_os_str().is_empty() && entry.header().entry_type().is_dir() {
				return Ok(());
			}

			let path = safe_extract_join(&canonical_root, &relative)?;

			if let Some(p) = path.parent() {
				fs::create_dir_all(p)
					.map_err(|e| wrap(e, format!("could not create dir for {}", p.display())))?;
				ensure_canonical_within_root(&canonical_root, p)?;
			}

			entry
				.unpack(&path)
				.map_err(|e| wrapdbg(e, format!("error unpacking {}", path.display())))?;

			Ok(())
		})?;

	reporter.report_progress(num_entries, num_entries);

	Ok(())
}

pub fn has_gzip_header(path: &Path) -> std::io::Result<(File, bool)> {
	let mut file = fs::File::open(path)?;
	let mut header = [0; 2];
	let _ = file.read_exact(&mut header);

	file.rewind()?;

	Ok((file, header[0] == 0x1f && header[1] == 0x8b))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::util::io::SilentCopyProgress;
	use flate2::write::GzEncoder;
	use flate2::Compression;
	use tar::{Builder, Header};

	fn write_dir_entry(builder: &mut Builder<GzEncoder<Vec<u8>>>, name: &str) {
		let mut header = Header::new_gnu();
		header.set_size(0);
		header.set_entry_type(tar::EntryType::Directory);
		header.set_mode(0o755);
		header.set_cksum();
		builder.append_data(&mut header, name, std::io::empty()).unwrap();
	}

	fn write_file_entry(builder: &mut Builder<GzEncoder<Vec<u8>>>, name: &str, contents: &[u8]) {
		let mut header = Header::new_gnu();
		header.set_size(contents.len() as u64);
		header.set_entry_type(tar::EntryType::Regular);
		header.set_mode(0o644);
		header.set_cksum();
		builder.append_data(&mut header, name, contents).unwrap();
	}

	/// Regression test for #317660: a tarball with a bare top-level directory
	/// entry (e.g. `prefix/`) plus files underneath used to fail extraction
	/// with "extraction path resolves outside root" because the bare entry
	/// produced an empty relative path after segment-stripping, whose parent
	/// walked above the extraction root.
	#[test]
	fn decompress_tarball_with_bare_top_level_dir_entry() {
		let tmp = tempfile::tempdir().unwrap();
		let tar_path = tmp.path().join("archive.tar.gz");

		let buf: Vec<u8> = {
			let encoder = GzEncoder::new(Vec::new(), Compression::default());
			let mut builder = Builder::new(encoder);
			write_dir_entry(&mut builder, "prefix/");
			write_file_entry(&mut builder, "prefix/file.txt", b"hello");
			write_file_entry(&mut builder, "prefix/sub/nested.txt", b"world");
			builder.into_inner().unwrap().finish().unwrap()
		};

		fs::write(&tar_path, &buf).unwrap();

		let out_dir = tmp.path().join("out");
		fs::create_dir_all(&out_dir).unwrap();

		let file = fs::File::open(&tar_path).unwrap();
		decompress_tarball(file, &out_dir, SilentCopyProgress()).expect("extraction should succeed");

		assert_eq!(fs::read(out_dir.join("file.txt")).unwrap(), b"hello");
		assert_eq!(fs::read(out_dir.join("sub/nested.txt")).unwrap(), b"world");
	}
}
