/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{env, io};

/// Gets whether the current CLI seems like it's running in integrated mode,
/// by looking at the location of the exe and known VS Code files.
pub fn is_integrated_cli() -> io::Result<bool> {
	let exe = env::current_exe()?;

	let parent = match exe.parent() {
		Some(parent) if parent.file_name().and_then(|n| n.to_str()) == Some("bin") => parent,
		_ => return Ok(false),
	};

	let parent = match parent.parent() {
		Some(p) => p,
		None => return Ok(false),
	};

	let expected_file = if cfg!(target_os = "macos") {
		"node_modules.asar"
	} else {
		"resources.pak"
	};

	Ok(parent.join(expected_file).exists())
}
