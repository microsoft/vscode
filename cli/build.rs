/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const FILE_HEADER: &str = "/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation. All rights reserved.\n *  Licensed under the MIT License. See License.txt in the project root for license information.\n *--------------------------------------------------------------------------------------------*/";

use std::{
	env, fs, io,
	path::PathBuf,
	process::{self, Command},
	str::FromStr,
};

fn main() {
	let files = enumerate_source_files().expect("expected to enumerate files");
	ensure_file_headers(&files).expect("expected to ensure file headers");
	apply_build_environment_variables();
}

fn apply_build_environment_variables() {
	// only do this for local, debug builds
	if env::var("PROFILE").unwrap() != "debug" || env::var("VSCODE_CLI_ALREADY_PREPARED").is_ok() {
		return;
	}

	let pkg_dir = env::var("CARGO_MANIFEST_DIR").unwrap();
	let mut cmd = Command::new(env::var("NODE_PATH").unwrap_or_else(|_| "node".to_string()));
	cmd.arg("../build/azure-pipelines/cli/prepare.js");
	cmd.current_dir(&pkg_dir);
	cmd.env("VSCODE_CLI_PREPARE_OUTPUT", "json");

	let mut distro_location = PathBuf::from_str(&pkg_dir).unwrap();
	distro_location.pop(); // vscode dir
	distro_location.pop(); // parent dir
	distro_location.push("vscode-distro"); // distro dir, perhaps?
	if distro_location.exists() {
		cmd.env("VSCODE_CLI_PREPARE_ROOT", distro_location);
		cmd.env("VSCODE_QUALITY", "insider");
	}

	let output = cmd.output().expect("expected to run prepare script");
	if !output.status.success() {
		eprint!(
			"error running prepare script: {}",
			String::from_utf8_lossy(&output.stderr)
		);
		process::exit(output.status.code().unwrap_or(1));
	}

	let vars = serde_json::from_slice::<Vec<(String, String)>>(&output.stdout)
		.expect("expected to deserialize output");
	for (key, value) in vars {
		println!("cargo:rustc-env={}={}", key, value);
	}
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
