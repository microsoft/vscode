/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

pub(crate) const LEGACY_INSPECTION_LIMIT: usize = 128 * 1024;

/// Whether `bytes`, the start of a candidate file, is a script shim that an earlier version of VS Code wrote. Those
/// shims were written as UTF-8, so text in another encoding, such as a `.cmd` file in the OEM code page or a UTF-16
/// `.ps1` file, is never one.
pub(crate) fn is_legacy_wrapper(bytes: &[u8]) -> bool {
	let bytes = &bytes[..bytes.len().min(LEGACY_INSPECTION_LIMIT)];
	let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
	let text = match std::str::from_utf8(bytes) {
		Ok(text) => text,
		// The inspected prefix can end inside a character.
		Err(error) if error.error_len().is_none() => {
			std::str::from_utf8(&bytes[..error.valid_up_to()]).unwrap_or_default()
		}
		Err(_) => return false,
	};
	let normalized = text.replace("\r\n", "\n");

	is_posix_launcher(&normalized)
		|| is_git_bash_wrapper(&normalized)
		|| is_windows_bootstrapper(&normalized)
		|| is_windows_command_wrapper(&normalized)
}
fn is_posix_launcher(text: &str) -> bool {
	text.starts_with("#!/bin/sh")
		&& contains_all(
			text,
			&[
				"unset NODE_OPTIONS",
				"ELECTRON_RUN_AS_NODE=1",
				"copilotCLIShim.js",
				"\"$@\"",
			],
		)
}

fn is_git_bash_wrapper(text: &str) -> bool {
	text.starts_with("#!/bin/sh") && contains_all(text, &["exec", "copilot.bat", "\"$@\""])
}

fn is_windows_bootstrapper(text: &str) -> bool {
	let text = text.to_ascii_lowercase();
	contains_all(
		&text,
		&[
			"windows github copilot cli bootstrapper",
			"function find-realcopilot",
			"function test-andlaunchcopilot",
			"$packagename = \"@github/copilot\"",
		],
	)
}

fn is_windows_command_wrapper(text: &str) -> bool {
	let text = text.to_ascii_lowercase();
	text.starts_with("@echo off")
		&& contains_all(&text, &["powershell", "-executionpolicy bypass", "-file"])
		&& (text.contains("copilot.ps1") || text.contains("copilotclishim.ps1"))
}

fn contains_all(text: &str, markers: &[&str]) -> bool {
	markers.iter().all(|marker| text.contains(marker))
}
