/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
	ffi::OsString,
	path::{Path, PathBuf},
	time::Duration,
};
use sysinfo::{Pid, PidExt, ProcessExt, ProcessRefreshKind, System, SystemExt};

pub fn process_at_path_exists(pid: u32, name: &Path) -> bool {
	let mut sys = System::new();
	let pid = Pid::from_u32(pid);
	if !sys.refresh_process_specifics(pid, ProcessRefreshKind::new()) {
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
	sys.refresh_process_specifics(Pid::from_u32(pid), ProcessRefreshKind::new())
}

pub fn kill_pid(pid: u32) -> bool {
	let mut sys = System::new();
	let pid = Pid::from_u32(pid);
	sys.refresh_process_specifics(pid, ProcessRefreshKind::new());

	if let Some(p) = sys.process(pid) {
		p.kill()
	} else {
		false
	}
}

pub async fn wait_until_process_exits(pid: Pid, poll_ms: u64) {
	let mut s = System::new();
	let duration = Duration::from_millis(poll_ms);
	while s.refresh_process_specifics(pid, ProcessRefreshKind::new()) {
		tokio::time::sleep(duration).await;
	}
}

pub fn find_running_process(name: &Path) -> Option<u32> {
	let mut sys = System::new();
	sys.refresh_processes_specifics(ProcessRefreshKind::new());

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
	use std::io::Write;
	use std::path::PathBuf;
	use std::process::Stdio;
	use tokio::io::{AsyncBufReadExt, BufReader};

	#[test]
	#[ignore = "Only launched by the process lifecycle test"]
	fn process_fixture() {
		println!("process-fixture-ready");
		std::io::stdout().flush().unwrap();
		std::thread::sleep(Duration::from_secs(60));
	}

	#[tokio::test]
	async fn process_refresh_preserves_discovery_and_termination() {
		let directory = tempfile::tempdir().unwrap();
		let exe = directory
			.path()
			.join(format!("process-fixture{}", std::env::consts::EXE_SUFFIX));
		std::fs::copy(std::env::current_exe().unwrap(), &exe).unwrap();
		let mut child = tokio::process::Command::new(&exe)
			.args([
				"--exact",
				"util::machine::tests::process_fixture",
				"--ignored",
				"--nocapture",
			])
			.stdout(Stdio::piped())
			.kill_on_drop(true)
			.spawn()
			.unwrap();
		let pid = child.id().unwrap();
		let mut lines = BufReader::new(child.stdout.take().unwrap()).lines();
		tokio::time::timeout(Duration::from_secs(30), async {
			loop {
				let line = lines.next_line().await.unwrap().unwrap();
				if line.contains("process-fixture-ready") {
					break;
				}
			}
		})
		.await
		.unwrap();

		let before = (
			process_exists(pid),
			process_at_path_exists(pid, &exe),
			process_at_path_exists(pid, Path::new("not-the-process-executable")),
			find_running_process(&exe).is_some_and(|found| process_at_path_exists(found, &exe)),
		);
		let waiting = wait_until_process_exits(Pid::from_u32(pid), 10);
		tokio::pin!(waiting);
		let returned_while_alive = tokio::time::timeout(Duration::from_millis(50), &mut waiting)
			.await
			.is_ok();
		let killed = kill_pid(pid);
		if !killed {
			child.start_kill().unwrap();
		}
		let status = tokio::time::timeout(Duration::from_secs(10), child.wait())
			.await
			.unwrap()
			.unwrap();
		drop(child);
		let waited_for_exit = tokio::time::timeout(Duration::from_secs(10), waiting)
			.await
			.is_ok();
		assert_eq!(
			(
				before,
				returned_while_alive,
				killed,
				waited_for_exit,
				status.success()
			),
			((true, true, false, true), false, true, true, false),
		);
	}

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
