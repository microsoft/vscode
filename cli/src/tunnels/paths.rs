/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{
    fs::{read_dir, read_to_string, remove_dir_all, write},
    path::PathBuf,
};

use serde::{Deserialize, Serialize};

use crate::{
    log, options,
    state::{LauncherPaths, PersistedState},
    util::{
        errors::{wrap, AnyError, WrappedError},
        machine,
    },
};

const INSIDERS_INSTALL_FOLDER: &str = "server-insiders";
const STABLE_INSTALL_FOLDER: &str = "server-stable";
const EXPLORATION_INSTALL_FOLDER: &str = "server-exploration";
const PIDFILE_SUFFIX: &str = ".pid";
const LOGFILE_SUFFIX: &str = ".log";

pub struct ServerPaths {
    // Directory into which the server is downloaded
    pub server_dir: PathBuf,
    // Executable path, within the server_id
    pub executable: PathBuf,
    // File where logs for the server should be written.
    pub logfile: PathBuf,
    // File where the process ID for the server should be written.
    pub pidfile: PathBuf,
}

impl ServerPaths {
    // Queries the system to determine the process ID of the running server.
    // Returns the process ID, if the server is running.
    pub fn get_running_pid(&self) -> Option<u32> {
        if let Some(pid) = self.read_pid() {
            return match machine::process_at_path_exists(pid, &self.executable) {
                true => Some(pid),
                false => None,
            };
        }

        if let Some(pid) = machine::find_running_process(&self.executable) {
            // attempt to backfill process ID:
            self.write_pid(pid).ok();
            return Some(pid);
        }

        None
    }

    /// Delete the server directory
    pub fn delete(&self) -> Result<(), WrappedError> {
        remove_dir_all(&self.server_dir).map_err(|e| {
            wrap(
                e,
                format!("error deleting server dir {}", self.server_dir.display()),
            )
        })
    }

    // VS Code Server pid
    pub fn write_pid(&self, pid: u32) -> Result<(), WrappedError> {
        write(&self.pidfile, &format!("{}", pid)).map_err(|e| {
            wrap(
                e,
                format!("error writing process id into {}", self.pidfile.display()),
            )
        })
    }

    fn read_pid(&self) -> Option<u32> {
        read_to_string(&self.pidfile)
            .ok()
            .and_then(|s| s.parse::<u32>().ok())
    }
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct InstalledServer {
    pub quality: options::Quality,
    pub commit: String,
    pub headless: bool,
}

impl InstalledServer {
    /// Gets path information about where a specific server should be stored.
    pub fn server_paths(&self, p: &LauncherPaths) -> ServerPaths {
        let base_folder = self.get_install_folder(p);
        let server_dir = base_folder.join("bin").join(&self.commit);
        ServerPaths {
            executable: server_dir
                .join("bin")
                .join(self.quality.server_entrypoint()),
            server_dir,
            logfile: base_folder.join(format!(".{}{}", self.commit, LOGFILE_SUFFIX)),
            pidfile: base_folder.join(format!(".{}{}", self.commit, PIDFILE_SUFFIX)),
        }
    }

    fn get_install_folder(&self, p: &LauncherPaths) -> PathBuf {
        let name = match self.quality {
            options::Quality::Insiders => INSIDERS_INSTALL_FOLDER,
            options::Quality::Exploration => EXPLORATION_INSTALL_FOLDER,
            options::Quality::Stable => STABLE_INSTALL_FOLDER,
        };

        p.root().join(if !self.headless {
            format!("{}-web", name)
        } else {
            name.to_string()
        })
    }
}

pub struct LastUsedServers<'a> {
    state: PersistedState<Vec<InstalledServer>>,
    paths: &'a LauncherPaths,
}

impl<'a> LastUsedServers<'a> {
    pub fn new(paths: &'a LauncherPaths) -> LastUsedServers {
        LastUsedServers {
            state: PersistedState::new(paths.root().join("last-used-servers.json")),
            paths,
        }
    }

    /// Adds a server as having been used most recently. Returns the number of retained server.
    pub fn add(&self, server: InstalledServer) -> Result<usize, WrappedError> {
        self.state.update_with(server, |server, l| {
            if let Some(index) = l.iter().position(|s| s == &server) {
                l.remove(index);
            }
            l.insert(0, server);
            l.len()
        })
    }

    /// Trims so that at most `max_servers` are saved on disk.
    pub fn trim(&self, log: &log::Logger, max_servers: usize) -> Result<(), WrappedError> {
        let mut servers = self.state.load();
        while servers.len() > max_servers {
            let server = servers.pop().unwrap();
            debug!(
                log,
                "Removing old server {}/{}",
                server.quality.get_machine_name(),
                server.commit
            );
            let server_paths = server.server_paths(self.paths);
            server_paths.delete()?;
        }
        self.state.save(servers)?;
        Ok(())
    }
}

/// Prunes servers not currently running, and returns the deleted servers.
pub fn prune_stopped_servers(launcher_paths: &LauncherPaths) -> Result<Vec<ServerPaths>, AnyError> {
    get_all_servers(launcher_paths)
        .into_iter()
        .map(|s| s.server_paths(launcher_paths))
        .filter(|s| s.get_running_pid().is_none())
        .map(|s| s.delete().map(|_| s))
        .collect::<Result<_, _>>()
        .map_err(AnyError::from)
}

// Gets a list of all servers which look like they might be running.
pub fn get_all_servers(lp: &LauncherPaths) -> Vec<InstalledServer> {
    let mut servers: Vec<InstalledServer> = vec![];
    let mut server = InstalledServer {
        commit: "".to_owned(),
        headless: false,
        quality: options::Quality::Stable,
    };

    add_server_paths_in_folder(lp, &server, &mut servers);

    server.headless = true;
    add_server_paths_in_folder(lp, &server, &mut servers);

    server.headless = false;
    server.quality = options::Quality::Insiders;
    add_server_paths_in_folder(lp, &server, &mut servers);

    server.headless = true;
    add_server_paths_in_folder(lp, &server, &mut servers);

    servers
}

fn add_server_paths_in_folder(
    lp: &LauncherPaths,
    server: &InstalledServer,
    servers: &mut Vec<InstalledServer>,
) {
    let dir = server.get_install_folder(lp).join("bin");
    if let Ok(children) = read_dir(dir) {
        for bin in children.flatten() {
            servers.push(InstalledServer {
                quality: server.quality,
                headless: server.headless,
                commit: bin.file_name().to_string_lossy().into(),
            });
        }
    }
}
