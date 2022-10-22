/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::util::errors::{self, WrappedError};
use futures::stream::TryStreamExt;
use tokio::fs;
use tokio_util::compat::FuturesAsyncReadCompatExt;

use super::io::{copy_async_progress, ReportCopyProgress};

pub async fn download_into_file<T>(
	filename: &std::path::Path,
	progress: T,
	res: reqwest::Response,
) -> Result<fs::File, WrappedError>
where
	T: ReportCopyProgress,
{
	let mut file = fs::File::create(filename)
		.await
		.map_err(|e| errors::wrap(e, "failed to create file"))?;

	let content_length = res.content_length().unwrap_or(0);
	let mut read = res
		.bytes_stream()
		.map_err(|e| futures::io::Error::new(futures::io::ErrorKind::Other, e))
		.into_async_read()
		.compat();

	copy_async_progress(progress, &mut read, &mut file, content_length)
		.await
		.map_err(|e| errors::wrap(e, "failed to download file"))?;

	Ok(file)
}
