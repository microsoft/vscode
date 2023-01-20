/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(target_os = "windows")]
pub type SleepInhibitor = NoOpSleepInhibitor;

#[cfg(target_os = "linux")]
pub type SleepInhibitor = NoOpSleepInhibitor;

#[cfg(target_os = "macos")]
pub type SleepInhibitor = super::nosleep_macos::SleepInhibitor;

/// Stub no-sleep implementation for unsupported platforms.
#[allow(dead_code)]
pub struct NoOpSleepInhibitor();

#[allow(dead_code)]
impl NoOpSleepInhibitor {
	pub fn new() -> std::io::Result<Self> {
		Ok(NoOpSleepInhibitor())
	}
}

impl Drop for NoOpSleepInhibitor {
	fn drop(&mut self) {
		// no-op
	}
}
