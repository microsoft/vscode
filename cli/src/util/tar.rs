/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::util::errors::{wrap, WrappedError};

use flate2::read::GzDecoder;
use std::fs::File;
use std::path::{Path, PathBuf};
use tar::Archive;

use super::io::ReportCopyProgress;

pub fn decompress_tarball<T>(
    path: &Path,
    parent_path: &Path,
    mut reporter: T,
) -> Result<(), WrappedError>
where
    T: ReportCopyProgress,
{
    let tar_gz = File::open(path).map_err(|e| {
        wrap(
            Box::new(e),
            format!("error opening file {}", path.display()),
        )
    })?;
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

            let path = parent_path.join(entry_path.iter().skip(1).collect::<PathBuf>());
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
