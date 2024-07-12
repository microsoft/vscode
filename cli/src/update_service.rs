/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::{ffi::OsStr, fmt, path::Path};

use serde::{Deserialize, Serialize};

use crate::{
	constants::VSCODE_CLI_UPDATE_ENDPOINT,
	debug, log, options, spanf,
	util::{
		errors::{AnyError, CodeError, WrappedError},
		http::{BoxedHttp, SimpleResponse},
		io::ReportCopyProgress,
		tar, zipper,
	},
};

/// Implementation of the VS Code Update service for use in the CLI.
#[derive(Clone)]
pub struct UpdateService {
	client: BoxedHttp,
	log: log::Logger,
}

/// Describes a specific release, can be created manually or returned from the update service.
#[derive(Clone, Eq, PartialEq)]
pub struct Release {
	pub name: String,
	pub platform: Platform,
	pub target: TargetKind,
	pub quality: options::Quality,
	pub commit: String,
}

impl std::fmt::Display for Release {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(f, "{} (commit {})", self.name, self.commit)
	}
}

#[derive(Deserialize)]
struct UpdateServerVersion {
	pub version: String,
	pub name: String,
}

fn quality_download_segment(quality: options::Quality) -> &'static str {
	match quality {
		options::Quality::Stable => "stable",
		options::Quality::Insiders => "insider",
		options::Quality::Exploration => "exploration",
	}
}

fn get_update_endpoint() -> Result<&'static str, CodeError> {
	VSCODE_CLI_UPDATE_ENDPOINT.ok_or_else(|| CodeError::UpdatesNotConfigured("no service url"))
}

impl UpdateService {
	pub fn new(log: log::Logger, http: BoxedHttp) -> Self {
		UpdateService { client: http, log }
	}

	pub async fn get_release_by_semver_version(
		&self,
		platform: Platform,
		target: TargetKind,
		quality: options::Quality,
		version: &str,
	) -> Result<Release, AnyError> {
		let update_endpoint = get_update_endpoint()?;
		let download_segment = target
			.download_segment(platform)
			.ok_or_else(|| CodeError::UnsupportedPlatform(platform.to_string()))?;
		let download_url = format!(
			"{}/api/versions/{}/{}/{}",
			update_endpoint,
			version,
			download_segment,
			quality_download_segment(quality),
		);

		let mut response = spanf!(
			self.log,
			self.log.span("server.version.resolve"),
			self.client.make_request("GET", download_url)
		)?;

		if !response.status_code.is_success() {
			return Err(response.into_err().await.into());
		}

		let res = response.json::<UpdateServerVersion>().await?;
		debug!(self.log, "Resolved version {} to {}", version, res.version);

		Ok(Release {
			target,
			platform,
			quality,
			name: res.name,
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
		let update_endpoint = get_update_endpoint()?;
		let download_segment = target
			.download_segment(platform)
			.ok_or_else(|| CodeError::UnsupportedPlatform(platform.to_string()))?;
		let download_url = format!(
			"{}/api/latest/{}/{}",
			update_endpoint,
			download_segment,
			quality_download_segment(quality),
		);

		let mut response = spanf!(
			self.log,
			self.log.span("server.version.resolve"),
			self.client.make_request("GET", download_url)
		)?;

		if !response.status_code.is_success() {
			return Err(response.into_err().await.into());
		}

		let res = response.json::<UpdateServerVersion>().await?;
		debug!(self.log, "Resolved quality {} to {}", quality, res.version);

		Ok(Release {
			target,
			platform,
			quality,
			name: res.name,
			commit: res.version,
		})
	}

	/// Gets the download stream for the release.
	pub async fn get_download_stream(&self, release: &Release) -> Result<SimpleResponse, AnyError> {
		let update_endpoint = get_update_endpoint()?;
		let download_segment = release
			.target
			.download_segment(release.platform)
			.ok_or_else(|| CodeError::UnsupportedPlatform(release.platform.to_string()))?;

		let download_url = format!(
			"{}/commit:{}/{}/{}",
			update_endpoint,
			release.commit,
			download_segment,
			quality_download_segment(release.quality),
		);

		let response = self.client.make_request("GET", download_url).await?;
		if !response.status_code.is_success() {
			return Err(response.into_err().await.into());
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
	if compressed_file.extension() == Some(OsStr::new("zip")) {
		zipper::unzip_file(compressed_file, target_dir, reporter)
	} else {
		tar::decompress_tarball(compressed_file, target_dir, reporter)
	}
}

#[derive(Eq, PartialEq, Copy, Clone)]
pub enum TargetKind {
	Server,
	Archive,
	Web,
	Cli,
}

impl TargetKind {
	fn download_segment(&self, platform: Platform) -> Option<String> {
		match *self {
			TargetKind::Server => Some(platform.headless()),
			TargetKind::Archive => platform.archive(),
			TargetKind::Web => Some(platform.web()),
			TargetKind::Cli => Some(platform.cli()),
		}
	}
}

#[derive(Debug, Copy, Clone, Eq, PartialEq, Serialize, Deserialize)]
pub enum Platform {
	LinuxAlpineX64,
	LinuxAlpineARM64,
	LinuxX64,
	LinuxX64Legacy,
	LinuxARM64,
	LinuxARM64Legacy,
	LinuxARM32,
	LinuxARM32Legacy,
	DarwinX64,
	DarwinARM64,
	WindowsX64,
	WindowsX86,
	WindowsARM64,
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
			Platform::WindowsARM64 => Some("win32-arm64-archive".to_owned()),
			_ => None,
		}
	}
	pub fn headless(&self) -> String {
		match self {
			Platform::LinuxAlpineARM64 => "server-alpine-arm64",
			Platform::LinuxAlpineX64 => "server-linux-alpine",
			Platform::LinuxX64 => "server-linux-x64",
			Platform::LinuxX64Legacy => "server-linux-legacy-x64",
			Platform::LinuxARM64 => "server-linux-arm64",
			Platform::LinuxARM64Legacy => "server-linux-legacy-arm64",
			Platform::LinuxARM32 => "server-linux-armhf",
			Platform::LinuxARM32Legacy => "server-linux-legacy-armhf",
			Platform::DarwinX64 => "server-darwin",
			Platform::DarwinARM64 => "server-darwin-arm64",
			Platform::WindowsX64 => "server-win32-x64",
			Platform::WindowsX86 => "server-win32",
			Platform::WindowsARM64 => "server-win32-x64", // we don't publish an arm64 server build yet
		}
		.to_owned()
	}

	pub fn cli(&self) -> String {
		match self {
			Platform::LinuxAlpineARM64 => "cli-alpine-arm64",
			Platform::LinuxAlpineX64 => "cli-alpine-x64",
			Platform::LinuxX64 => "cli-linux-x64",
			Platform::LinuxX64Legacy => "cli-linux-x64",
			Platform::LinuxARM64 => "cli-linux-arm64",
			Platform::LinuxARM64Legacy => "cli-linux-arm64",
			Platform::LinuxARM32 => "cli-linux-armhf",
			Platform::LinuxARM32Legacy => "cli-linux-armhf",
			Platform::DarwinX64 => "cli-darwin-x64",
			Platform::DarwinARM64 => "cli-darwin-arm64",
			Platform::WindowsARM64 => "cli-win32-arm64",
			Platform::WindowsX64 => "cli-win32-x64",
			Platform::WindowsX86 => "cli-win32",
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
		} else if cfg!(all(target_os = "linux", target_arch = "arm")) {
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
		} else if cfg!(all(target_os = "windows", target_arch = "aarch64")) {
			Some(Platform::WindowsARM64)
		} else {
			None
		}
	}
}

impl fmt::Display for Platform {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		f.write_str(match self {
			Platform::LinuxAlpineARM64 => "LinuxAlpineARM64",
			Platform::LinuxAlpineX64 => "LinuxAlpineX64",
			Platform::LinuxX64 => "LinuxX64",
			Platform::LinuxX64Legacy => "LinuxX64Legacy",
			Platform::LinuxARM64 => "LinuxARM64",
			Platform::LinuxARM64Legacy => "LinuxARM64Legacy",
			Platform::LinuxARM32 => "LinuxARM32",
			Platform::LinuxARM32Legacy => "LinuxARM32Legacy",
			Platform::DarwinX64 => "DarwinX64",
			Platform::DarwinARM64 => "DarwinARM64",
			Platform::WindowsX64 => "WindowsX64",
			Platform::WindowsX86 => "WindowsX86",
			Platform::WindowsARM64 => "WindowsARM64",
		})
	}
}
