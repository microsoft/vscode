/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{path::Path, time::Duration};
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};

pub fn process_at_path_exists(pid: u32, name: &Path) -> bool {
	let mut sys = System::new();
	let pid = Pid::from_u32(pid);
	if !sys.refresh_process(pid) {
		return false;
	}

	let name_str = format!("{}", name.display());
	if let Some(process) = sys.process(pid) {
		for cmd in process.cmd() {
			if cmd.contains(&name_str) {
				return true;
			}
		}
	}

	false
}
pub fn process_exists(pid: u32) -> bool {
	let mut sys = System::new();
	sys.refresh_process(Pid::from_u32(pid))
}

pub async fn wait_until_process_exits(pid: Pid, poll_ms: u64) {
	let mut s = System::new();
	let duration = Duration::from_millis(poll_ms);
	while s.refresh_process(pid) {
		tokio::time::sleep(duration).await;
	}
}

pub fn find_running_process(name: &Path) -> Option<u32> {
	let mut sys = System::new();
	sys.refresh_processes();

	let name_str = format!("{}", name.display());

	for (pid, process) in sys.processes() {
		for cmd in process.cmd() {
			if cmd.contains(&name_str) {
				return Some(pid.as_u32());
			}
		}
	}
	None
}

pub async fn wait_until_exe_deleted(current_exe: &Path, poll_ms: u64) {
	let duration = Duration::from_millis(poll_ms);
	while current_exe.exists() {
		tokio::time::sleep(duration).await;
	}
}
