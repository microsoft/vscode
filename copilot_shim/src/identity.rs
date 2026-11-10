/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::io::{self, Read};

use crate::model::FileIdentityState;
use crate::runtime::PathInspection;

const READ_BUFFER_SIZE: usize = 8 * 1024;

pub(crate) fn is_same_file(current: &PathInspection, candidate: &PathInspection) -> bool {
	current.canonical_path == candidate.canonical_path
		|| matches!(
			(&current.file_identity, &candidate.file_identity),
			(
				FileIdentityState::Supported(current),
				FileIdentityState::Supported(candidate)
			) if current == candidate
		)
}

pub(crate) fn contains_marker(mut reader: impl Read, marker: &[u8]) -> io::Result<bool> {
	if marker.is_empty() {
		return Ok(true);
	}

	let mut buffer = [0; READ_BUFFER_SIZE];
	let mut overlap = Vec::with_capacity(marker.len().saturating_sub(1));
	loop {
		let bytes_read = reader.read(&mut buffer)?;
		if bytes_read == 0 {
			return Ok(false);
		}

		let mut searchable = Vec::with_capacity(overlap.len() + bytes_read);
		searchable.extend_from_slice(&overlap);
		searchable.extend_from_slice(&buffer[..bytes_read]);
		if searchable
			.windows(marker.len())
			.any(|window| window == marker)
		{
			return Ok(true);
		}

		let overlap_length = searchable.len().min(marker.len().saturating_sub(1));
		overlap.clear();
		overlap.extend_from_slice(&searchable[searchable.len() - overlap_length..]);
	}
}
