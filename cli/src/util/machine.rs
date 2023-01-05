/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::path::Path;
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
