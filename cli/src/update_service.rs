/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::path::Path;

use serde::Deserialize;

use crate::{
    constants::VSCODE_CLI_UPDATE_ENDPOINT,
    debug, log, options, spanf,
    util::{
        errors::{
            AnyError, StatusError, UnsupportedPlatformError, UpdatesNotConfigured, WrappedError,
        },
        io::ReportCopyProgress,
    },
};

/// Implementation of the VS Code Update service for use in the CLI.
pub struct UpdateService {
    client: reqwest::Client,
    log: log::Logger,
}

/// Describes a specific release, can be created manually or returned from the update service.
pub struct Release {
    pub platform: Platform,
    pub target: TargetKind,
    pub quality: options::Quality,
    pub commit: String,
}

#[derive(Deserialize)]
struct UpdateServerVersion {
    pub version: String,
}

fn quality_download_segment(quality: options::Quality) -> &'static str {
    match quality {
        options::Quality::Stable => "stable",
        options::Quality::Insiders => "insider",
        options::Quality::Exploration => "exploration",
    }
}

impl UpdateService {
    pub fn new(log: log::Logger, client: reqwest::Client) -> Self {
        UpdateService { client, log }
    }

    pub async fn get_release_by_semver_version(
        &self,
        platform: Platform,
        target: TargetKind,
        quality: options::Quality,
        version: &str,
    ) -> Result<Release, AnyError> {
        let update_endpoint = VSCODE_CLI_UPDATE_ENDPOINT.ok_or(UpdatesNotConfigured())?;
        let download_segment = target
            .download_segment(platform)
            .ok_or(UnsupportedPlatformError())?;
        let download_url = format!(
            "{}/api/versions/{}/{}/{}",
            update_endpoint,
            version,
            download_segment,
            quality_download_segment(quality),
        );

        let response = spanf!(
            self.log,
            self.log.span("server.version.resolve"),
            self.client.get(download_url).send()
        )?;

        if !response.status().is_success() {
            return Err(StatusError::from_res(response).await?.into());
        }

        let res = response.json::<UpdateServerVersion>().await?;
        debug!(self.log, "Resolved version {} to {}", version, res.version);

        Ok(Release {
            target,
            platform,
            quality,
            commit: res.version,
        })
    }

    /// Gets the latest commit for the target of the given quality.
    pub async fn get_latest_commit(
        &self,
        platform: Platform,
        target: TargetKind,
        quality: options::Quality,
    ) -> Result<Release, AnyError> {
        let update_endpoint = VSCODE_CLI_UPDATE_ENDPOINT.ok_or(UpdatesNotConfigured())?;
        let download_segment = target
            .download_segment(platform)
            .ok_or(UnsupportedPlatformError())?;
        let download_url = format!(
            "{}/api/latest/{}/{}",
            update_endpoint,
            download_segment,
            quality_download_segment(quality),
        );

        let response = spanf!(
            self.log,
            self.log.span("server.version.resolve"),
            self.client.get(download_url).send()
        )?;

        if !response.status().is_success() {
            return Err(StatusError::from_res(response).await?.into());
        }

        let res = response.json::<UpdateServerVersion>().await?;
        debug!(self.log, "Resolved quality {} to {}", quality, res.version);

        Ok(Release {
            target,
            platform,
            quality,
            commit: res.version,
        })
    }

    /// Gets the download stream for the release.
    pub async fn get_download_stream(
        &self,
        release: &Release,
    ) -> Result<reqwest::Response, AnyError> {
        let update_endpoint = VSCODE_CLI_UPDATE_ENDPOINT.ok_or(UpdatesNotConfigured())?;
        let download_segment = release
            .target
            .download_segment(release.platform)
            .ok_or(UnsupportedPlatformError())?;

        let download_url = format!(
            "{}/commit:{}/{}/{}",
            update_endpoint,
            release.commit,
            download_segment,
            quality_download_segment(release.quality),
        );

        let response = reqwest::get(&download_url).await?;
        if !response.status().is_success() {
            return Err(StatusError::from_res(response).await?.into());
        }

        Ok(response)
    }
}

pub fn unzip_downloaded_release<T>(
    compressed_file: &Path,
    target_dir: &Path,
    reporter: T,
) -> Result<(), WrappedError>
where
    T: ReportCopyProgress,
{
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        use crate::util::zipper;
        zipper::unzip_file(compressed_file, target_dir, reporter)
    }
    #[cfg(target_os = "linux")]
    {
        use crate::util::tar;
        tar::decompress_tarball(compressed_file, target_dir, reporter)
    }
}

#[derive(Eq, PartialEq, Copy, Clone)]
pub enum TargetKind {
    Server,
    Archive,
    Web,
}

impl TargetKind {
    fn download_segment(&self, platform: Platform) -> Option<String> {
        match *self {
            TargetKind::Server => Some(platform.headless()),
            TargetKind::Archive => platform.archive(),
            TargetKind::Web => Some(platform.web()),
        }
    }
}

#[derive(Debug, Copy, Clone)]
pub enum Platform {
    LinuxAlpineX64,
    LinuxAlpineARM64,
    LinuxX64,
    LinuxARM64,
    LinuxARM32,
    DarwinX64,
    DarwinARM64,
    WindowsX64,
    WindowsX86,
}

impl Platform {
    pub fn archive(&self) -> Option<String> {
        match self {
            Platform::LinuxX64 => Some("linux-x64".to_owned()),
            Platform::LinuxARM64 => Some("linux-arm64".to_owned()),
            Platform::LinuxARM32 => Some("linux-armhf".to_owned()),
            Platform::DarwinX64 => Some("darwin".to_owned()),
            Platform::DarwinARM64 => Some("darwin-arm64".to_owned()),
            Platform::WindowsX64 => Some("win32-x64-archive".to_owned()),
            Platform::WindowsX86 => Some("win32-archive".to_owned()),
            _ => None,
        }
    }
    pub fn headless(&self) -> String {
        match self {
            Platform::LinuxAlpineARM64 => "server-alpine-arm64",
            Platform::LinuxAlpineX64 => "server-linux-alpine",
            Platform::LinuxX64 => "server-linux-x64",
            Platform::LinuxARM64 => "server-linux-arm64",
            Platform::LinuxARM32 => "server-linux-armhf",
            Platform::DarwinX64 => "server-darwin",
            Platform::DarwinARM64 => "server-darwin-arm64",
            Platform::WindowsX64 => "server-win32-x64",
            Platform::WindowsX86 => "server-win32",
        }
        .to_owned()
    }

    pub fn web(&self) -> String {
        format!("{}-web", self.headless())
    }

    pub fn env_default() -> Option<Platform> {
        if cfg!(all(
            target_os = "linux",
            target_arch = "x86_64",
            target_env = "musl"
        )) {
            Some(Platform::LinuxAlpineX64)
        } else if cfg!(all(
            target_os = "linux",
            target_arch = "aarch64",
            target_env = "musl"
        )) {
            Some(Platform::LinuxAlpineARM64)
        } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
            Some(Platform::LinuxX64)
        } else if cfg!(all(target_os = "linux", target_arch = "armhf")) {
            Some(Platform::LinuxARM32)
        } else if cfg!(all(target_os = "linux", target_arch = "aarch64")) {
            Some(Platform::LinuxARM64)
        } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
            Some(Platform::DarwinX64)
        } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
            Some(Platform::DarwinARM64)
        } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
            Some(Platform::WindowsX64)
        } else if cfg!(all(target_os = "windows", target_arch = "x86")) {
            Some(Platform::WindowsX86)
        } else {
            None
        }
    }
}
