/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const FILE_HEADER: &str = "/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation. All rights reserved.\n *  Licensed under the MIT License. See License.txt in the project root for license information.\n *--------------------------------------------------------------------------------------------*/";

use std::{env, fs, io, path::PathBuf, process};

fn main() {
	let files = enumerate_source_files().expect("expected to enumerate files");
	ensure_file_headers(&files).expect("expected to ensure file headers");
}

fn ensure_file_headers(files: &[PathBuf]) -> Result<(), io::Error> {
	let mut ok = true;

	let crlf_header_str = str::replace(FILE_HEADER, "\n", "\r\n");
	let crlf_header = crlf_header_str.as_bytes();
	let lf_header = FILE_HEADER.as_bytes();
	for file in files {
		let contents = fs::read(file)?;

		if !(contents.starts_with(lf_header) || contents.starts_with(crlf_header)) {
			eprintln!("File missing copyright header: {}", file.display());
			ok = false;
		}
	}

	if !ok {
		process::exit(1);
	}

	Ok(())
}

/// Gets all "rs" files in the source directory
fn enumerate_source_files() -> Result<Vec<PathBuf>, io::Error> {
	let mut files = vec![];
	let mut queue = vec![];

	let current_dir = env::current_dir()?.join("src");
	queue.push(current_dir);

	while !queue.is_empty() {
		for entry in fs::read_dir(queue.pop().unwrap())? {
			let entry = entry?;
			let ftype = entry.file_type()?;
			if ftype.is_dir() {
				queue.push(entry.path());
			} else if ftype.is_file() && entry.file_name().to_string_lossy().ends_with(".rs") {
				files.push(entry.path());
			}
		}
	}

	Ok(files)
}
