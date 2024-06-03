/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::log;

#[cfg(not(windows))]
pub fn is_wsl_installed(_log: &log::Logger) -> bool {
	false
}

#[cfg(windows)]
pub fn is_wsl_installed(log: &log::Logger) -> bool {
	use std::path::PathBuf;

	use crate::util::command::new_std_command;

	let system32 = {
		let sys_root = match std::env::var("SystemRoot") {
			Ok(s) => s,
			Err(_) => return false,
		};

		let is_32_on_64 = std::env::var("PROCESSOR_ARCHITEW6432").is_ok();
		let mut system32 = PathBuf::from(sys_root);
		system32.push(if is_32_on_64 { "Sysnative" } else { "System32" });
		system32
	};

	// Windows builds < 22000
	let mut maybe_lxss = system32.join("lxss");
	maybe_lxss.push("LxssManager.dll");
	if maybe_lxss.exists() {
		trace!(log, "wsl availability detected via lxss");
		return true;
	}

	// Windows builds >= 22000
	let maybe_wsl = system32.join("wsl.exe");
	if maybe_wsl.exists() {
		if let Ok(s) = new_std_command(maybe_wsl).arg("--status").output() {
			if s.status.success() {
				trace!(log, "wsl availability detected via subprocess");
				return true;
			}
		}
	}

	trace!(log, "wsl not detected");

	false
}
