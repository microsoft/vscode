/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{env, io};

use crate::constants::VSCODE_CLI_QUALITY;

pub fn is_integrated_cli() -> io::Result<bool> {
	let exe = env::current_exe()?;
	let parent = match exe.parent().and_then(|p| p.parent()) {
		Some(p) => p,
		None => return Ok(false),
	};

	let expected_file = if cfg!(windows) {
		match VSCODE_CLI_QUALITY {
			Some("insider") => "Code - Insiders.exe",
			Some("exploration") => "Code - Exploration.exe",
			_ => "Code.exe",
		}
	} else {
		match VSCODE_CLI_QUALITY {
			Some("insider") => "code-insiders",
			Some("exploration") => "code-exploration",
			_ => "code",
		}
	};

	Ok(parent.join(expected_file).exists())
}
