/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const FILE_HEADER: &str = "/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation. All rights reserved.\n *  Licensed under the MIT License. See License.txt in the project root for license information.\n *--------------------------------------------------------------------------------------------*/";

use std::{
	collections::HashMap,
	env, fs, io,
	path::{Path, PathBuf},
	process::{self},
	str::FromStr,
};

use serde::{de::DeserializeOwned, Deserialize};
use serde_json::Value;

fn main() {
	let files = enumerate_source_files().expect("expected to enumerate files");
	ensure_file_headers(&files).expect("expected to ensure file headers");
	apply_build_environment_variables();
}

fn camel_case_to_constant_case(key: &str) -> String {
	let mut output = String::new();
	let mut prev_upper = false;
	for c in key.chars() {
		if c.is_uppercase() {
			if prev_upper {
				output.push(c.to_ascii_lowercase());
			} else {
				output.push('_');
				output.push(c.to_ascii_uppercase());
			}
			prev_upper = true;
		} else if c.is_lowercase() {
			output.push(c.to_ascii_uppercase());
			prev_upper = false;
		} else {
			output.push(c);
			prev_upper = false;
		}
	}

	output
}

fn set_env_vars_from_map_keys(prefix: &str, map: impl IntoIterator<Item = (String, Value)>) {
	let mut win32_app_ids = vec![];

	for (key, value) in map {
		//#region special handling
		let value = match key.as_str() {
			"tunnelServerQualities" | "serverLicense" => {
				Value::String(serde_json::to_string(&value).unwrap())
			}
			"nameLong" => {
				if let Value::String(s) = &value {
					let idx = s.find(" - ");
					println!(
						"cargo:rustc-env=VSCODE_CLI_QUALITYLESS_PRODUCT_NAME={}",
						idx.map(|i| &s[..i]).unwrap_or(s)
					);
				}

				value
			}
			"tunnelApplicationConfig" => {
				if let Value::Object(v) = value {
					set_env_vars_from_map_keys(&format!("{}_{}", prefix, "TUNNEL"), v);
				}
				continue;
			}
			_ => value,
		};
		if key.contains("win32") && key.contains("AppId") {
			if let Value::String(s) = value {
				win32_app_ids.push(s);
				continue;
			}
		}
		//#endregion

		if let Value::String(s) = value {
			println!(
				"cargo:rustc-env={}_{}={}",
				prefix,
				camel_case_to_constant_case(&key),
				s
			);
		}
	}

	if !win32_app_ids.is_empty() {
		println!(
			"cargo:rustc-env=VSCODE_CLI_WIN32_APP_IDS={}",
			win32_app_ids.join(",")
		);
	}
}

fn read_json_from_path<T>(path: &Path) -> T
where
	T: DeserializeOwned,
{
	let mut file = fs::File::open(path).expect("failed to open file");
	serde_json::from_reader(&mut file).expect("failed to deserialize JSON")
}

fn apply_build_from_product_json(path: &Path) {
	let json: HashMap<String, Value> = read_json_from_path(path);
	set_env_vars_from_map_keys("VSCODE_CLI", json);
}

#[derive(Deserialize)]
struct PackageJson {
	pub version: String,
}

fn apply_build_environment_variables() {
	let repo_dir = env::current_dir().unwrap().join("..");
	let package_json = read_json_from_path::<PackageJson>(&repo_dir.join("package.json"));
	println!(
		"cargo:rustc-env=VSCODE_CLI_VERSION={}",
		package_json.version
	);

	match env::var("VSCODE_CLI_PRODUCT_JSON") {
		Ok(v) => {
			let path = if cfg!(windows) {
				PathBuf::from_str(&v.replace('/', "\\")).unwrap()
			} else {
				PathBuf::from_str(&v).unwrap()
			};
			println!("cargo:warning=loading product.json from <{:?}>", path);
			apply_build_from_product_json(&path);
		}

		Err(_) => {
			apply_build_from_product_json(&repo_dir.join("product.json"));

			let overrides = repo_dir.join("product.overrides.json");
			if overrides.exists() {
				apply_build_from_product_json(&overrides);
			}
		}
	};
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
