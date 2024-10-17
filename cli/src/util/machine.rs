/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	ffi::OsString,
	path::{Path, PathBuf},
	time::Duration,
};
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

pub fn kill_pid(pid: u32) -> bool {
	let mut sys = System::new();
	let pid = Pid::from_u32(pid);
	sys.refresh_process(pid);

	if let Some(p) = sys.process(pid) {
		p.kill()
	} else {
		false
	}
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

/// Gets the canonical current exe location, referring to the "current" symlink
/// if running inside snap.
pub fn canonical_exe() -> std::io::Result<PathBuf> {
	canonical_exe_inner(
		std::env::current_exe(),
		std::env::var_os("SNAP"),
		std::env::var_os("SNAP_REVISION"),
	)
}

#[inline(always)]
#[allow(unused_variables)]
fn canonical_exe_inner(
	exe: std::io::Result<PathBuf>,
	snap: Option<OsString>,
	rev: Option<OsString>,
) -> std::io::Result<PathBuf> {
	let exe = exe?;

	#[cfg(target_os = "linux")]
	if let (Some(snap), Some(rev)) = (snap, rev) {
		if !exe.starts_with(snap) {
			return Ok(exe);
		}

		let mut out = PathBuf::new();
		for part in exe.iter() {
			if part == rev {
				out.push("current")
			} else {
				out.push(part)
			}
		}

		return Ok(out);
	}

	Ok(exe)
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::path::PathBuf;

	#[test]
	#[cfg(target_os = "linux")]
	fn test_canonical_exe_in_snap() {
		let exe = canonical_exe_inner(
			Ok(PathBuf::from("/snap/my-snap/1234/some/exe")),
			Some("/snap/my-snap/1234".into()),
			Some("1234".into()),
		)
		.unwrap();
		assert_eq!(exe, PathBuf::from("/snap/my-snap/current/some/exe"));
	}

	#[test]
	fn test_canonical_exe_not_in_snap() {
		let exe = canonical_exe_inner(
			Ok(PathBuf::from("/not-in-snap")),
			Some("/snap/my-snap/1234".into()),
			Some("1234".into()),
		)
		.unwrap();
		assert_eq!(exe, PathBuf::from("/not-in-snap"));
	}

	#[test]
	fn test_canonical_exe_not_in_snap2() {
		let exe = canonical_exe_inner(Ok(PathBuf::from("/not-in-snap")), None, None).unwrap();
		assert_eq!(exe, PathBuf::from("/not-in-snap"));
	}
}
