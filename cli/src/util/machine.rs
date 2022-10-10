/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::util::errors;
use std::path::Path;
use sysinfo::{Pid, PidExt, ProcessExt, System, SystemExt};

pub fn process_at_path_exists(pid: u32, name: &Path) -> bool {
    // TODO https://docs.rs/sysinfo/latest/sysinfo/index.html#usage
    let mut sys = System::new_all();
    sys.refresh_processes();

    let name_str = format!("{}", name.display());
    match sys.process(Pid::from_u32(pid)) {
        Some(process) => {
            for cmd in process.cmd() {
                if cmd.contains(&name_str) {
                    return true;
                }
            }
        }
        None => {
            return false;
        }
    }

    false
}
pub fn process_exists(pid: u32) -> bool {
    let mut sys = System::new_all();
    sys.refresh_processes();
    sys.process(Pid::from_u32(pid)).is_some()
}

pub fn find_running_process(name: &Path) -> Option<u32> {
    // TODO https://docs.rs/sysinfo/latest/sysinfo/index.html#usage
    let mut sys = System::new_all();
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

#[cfg(not(target_family = "unix"))]
pub async fn set_executable_permission<P: AsRef<std::path::Path>>(
    _file: P,
) -> Result<(), errors::WrappedError> {
    Ok(())
}

#[cfg(target_family = "unix")]
pub async fn set_executable_permission<P: AsRef<std::path::Path>>(
    file: P,
) -> Result<(), errors::WrappedError> {
    use std::os::unix::prelude::PermissionsExt;

    let mut permissions = tokio::fs::metadata(&file)
        .await
        .map_err(|e| errors::wrap(e, "failed to read executable file metadata"))?
        .permissions();

    permissions.set_mode(0o750);

    tokio::fs::set_permissions(&file, permissions)
        .await
        .map_err(|e| errors::wrap(e, "failed to set executable permissions"))?;

    Ok(())
}
