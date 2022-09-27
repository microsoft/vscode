/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::constants::{LAUNCHER_ASSET_NAME, LAUNCHER_VERSION};
use crate::util::{errors, http, io::SilentCopyProgress};
use serde::Deserialize;
use std::{
    fs::{rename, set_permissions},
    path::Path,
};

pub struct Update {
    client: reqwest::Client,
}
const LATEST_URL: &str = "https://aka.ms/vscode-server-launcher/update";

impl Default for Update {
    fn default() -> Self {
        Self::new()
    }
}

impl Update {
    // Creates a new Update instance without authentication
    pub fn new() -> Update {
        Update {
            client: reqwest::Client::new(),
        }
    }

    // Gets the asset to update to, or None if the current launcher is up to date.
    pub async fn get_latest_release(&self) -> Result<LauncherRelease, errors::AnyError> {
        let res = self
            .client
            .get(LATEST_URL)
            .header(
                "User-Agent",
                format!(
                    "vscode-server-launcher/{}",
                    LAUNCHER_VERSION.unwrap_or("dev")
                ),
            )
            .send()
            .await?;

        if !res.status().is_success() {
            return Err(errors::StatusError::from_res(res).await?.into());
        }

        Ok(res.json::<LauncherRelease>().await?)
    }

    pub async fn switch_to_release(
        &self,
        update: &LauncherRelease,
        target_path: &Path,
    ) -> Result<(), errors::AnyError> {
        let mut staging_path = target_path.to_owned();
        staging_path.set_file_name(format!(
            "{}.next",
            target_path.file_name().unwrap().to_string_lossy()
        ));

        let an = LAUNCHER_ASSET_NAME.unwrap();
        let mut url = format!("{}/{}/{}", update.url, an, an);
        if cfg!(target_os = "windows") {
            url += ".exe";
        }

        let res = self.client.get(url).send().await?;

        if !res.status().is_success() {
            return Err(errors::StatusError::from_res(res).await?.into());
        }

        http::download_into_file(&staging_path, SilentCopyProgress(), res).await?;

        copy_file_metadata(target_path, &staging_path)
            .map_err(|e| errors::wrap(e, "failed to set file permissions"))?;

        rename(&staging_path, &target_path)
            .map_err(|e| errors::wrap(e, "failed to copy new launcher version"))?;

        Ok(())
    }
}

#[derive(Deserialize, Clone)]
pub struct LauncherRelease {
    pub version: String,
    pub url: String,
    pub released_at: u64,
}

#[cfg(target_os = "windows")]
fn copy_file_metadata(from: &Path, to: &Path) -> Result<(), std::io::Error> {
    let permissions = from.metadata()?.permissions();
    set_permissions(&to, permissions)?;
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn copy_file_metadata(from: &Path, to: &Path) -> Result<(), std::io::Error> {
    use std::os::unix::ffi::OsStrExt;
    use std::os::unix::fs::MetadataExt;

    let metadata = from.metadata()?;
    set_permissions(&to, metadata.permissions())?;

    // based on coreutils' chown https://github.com/uutils/coreutils/blob/72b4629916abe0852ad27286f4e307fbca546b6e/src/chown/chown.rs#L266-L281
    let s = std::ffi::CString::new(to.as_os_str().as_bytes()).unwrap();
    let ret = unsafe { libc::chown(s.as_ptr(), metadata.uid(), metadata.gid()) };
    if ret != 0 {
        return Err(std::io::Error::last_os_error());
    }

    Ok(())
}
