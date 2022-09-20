/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use std::io;

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub trait ReportCopyProgress {
    fn report_progress(&mut self, bytes_so_far: u64, total_bytes: u64);
}

/// Type that doesn't emit anything for download progress.
pub struct SilentCopyProgress();

impl ReportCopyProgress for SilentCopyProgress {
    fn report_progress(&mut self, _bytes_so_far: u64, _total_bytes: u64) {}
}

/// Copies from the reader to the writer, reporting progress to the provided
/// reporter every so often.
pub async fn copy_async_progress<T, R, W>(
    mut reporter: T,
    reader: &mut R,
    writer: &mut W,
    total_bytes: u64,
) -> io::Result<u64>
where
    R: AsyncRead + Unpin,
    W: AsyncWrite + Unpin,
    T: ReportCopyProgress,
{
    let mut buf = vec![0; 8 * 1024];
    let mut bytes_so_far = 0;
    let mut bytes_last_reported = 0;
    let report_granularity = std::cmp::min(total_bytes / 10, 2 * 1024 * 1024);

    reporter.report_progress(0, total_bytes);

    loop {
        let read_buf = match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => &buf[..n],
            Err(e) => return Err(e),
        };

        writer.write_all(read_buf).await?;

        bytes_so_far += read_buf.len() as u64;
        if bytes_so_far - bytes_last_reported > report_granularity {
            bytes_last_reported = bytes_so_far;
            reporter.report_progress(bytes_so_far, total_bytes);
        }
    }

    reporter.report_progress(bytes_so_far, total_bytes);

    Ok(bytes_so_far)
}
