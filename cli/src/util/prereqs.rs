/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use std::cmp::Ordering;

use crate::constants::QUALITYLESS_SERVER_NAME;
use crate::update_service::Platform;
use lazy_static::lazy_static;
use regex::bytes::Regex as BinRegex;
use regex::Regex;
use tokio::fs;

use super::errors::CodeError;

lazy_static! {
	static ref LDCONFIG_STDC_RE: Regex = Regex::new(r"libstdc\+\+.* => (.+)").unwrap();
	static ref LDD_VERSION_RE: BinRegex = BinRegex::new(r"^ldd.*\s(\d+)\.(\d+)(?:\.(\d+))?\s").unwrap();
	static ref GENERIC_VERSION_RE: Regex = Regex::new(r"^([0-9]+)\.([0-9]+)$").unwrap();
	static ref LIBSTD_CXX_VERSION_RE: BinRegex =
		BinRegex::new(r"GLIBCXX_([0-9]+)\.([0-9]+)(?:\.([0-9]+))?").unwrap();
	static ref MIN_LDD_VERSION: SimpleSemver = SimpleSemver::new(2, 28, 0);
	static ref MIN_LEGACY_LDD_VERSION: SimpleSemver = SimpleSemver::new(2, 17, 0);
}

#[cfg(target_arch = "arm")]
lazy_static! {
	static ref MIN_CXX_VERSION: SimpleSemver = SimpleSemver::new(3, 4, 26);
	static ref MIN_LEGACY_CXX_VERSION: SimpleSemver = SimpleSemver::new(3, 4, 22);
}

#[cfg(not(target_arch = "arm"))]
lazy_static! {
	static ref MIN_CXX_VERSION: SimpleSemver = SimpleSemver::new(3, 4, 25);
	static ref MIN_LEGACY_CXX_VERSION: SimpleSemver = SimpleSemver::new(3, 4, 19);
}

const NIXOS_TEST_PATH: &str = "/etc/NIXOS";

pub struct PreReqChecker {}

impl Default for PreReqChecker {
	fn default() -> Self {
		Self::new()
	}
}

impl PreReqChecker {
	pub fn new() -> PreReqChecker {
		PreReqChecker {}
	}

	#[cfg(not(target_os = "linux"))]
	pub async fn verify(&self) -> Result<Platform, CodeError> {
		Platform::env_default().ok_or_else(|| {
			CodeError::UnsupportedPlatform(format!(
				"{} {}",
				std::env::consts::OS,
				std::env::consts::ARCH
			))
		})
	}

	#[cfg(target_os = "linux")]
	pub async fn verify(&self) -> Result<Platform, CodeError> {
		let (is_nixos, skip_glibc_checks, or_musl) = tokio::join!(
			check_is_nixos(),
			skip_requirements_check(),
			check_musl_interpreter()
		);

		let (gnu_a, gnu_b) = if !skip_glibc_checks {
			tokio::join!(check_glibc_version(), check_glibcxx_version())
		} else {
			println!("!!! WARNING: Skipping server pre-requisite check !!!");
			println!("!!! Server stability is not guaranteed. Proceed at your own risk. !!!");
			// Use the legacy server for #210029
			(Ok(true), Ok(true))
		};

		match (&gnu_a, &gnu_b, is_nixos) {
			(Ok(false), Ok(false), _) | (_, _, true) => {
				return Ok(if cfg!(target_arch = "x86_64") {
					Platform::LinuxX64
				} else if cfg!(target_arch = "arm") {
					Platform::LinuxARM32
				} else {
					Platform::LinuxARM64
				});
			}
			(Ok(_), Ok(_), _) => {
				return Ok(if cfg!(target_arch = "x86_64") {
					Platform::LinuxX64Legacy
				} else if cfg!(target_arch = "arm") {
					Platform::LinuxARM32Legacy
				} else {
					Platform::LinuxARM64Legacy
				});
			}
			_ => {}
		};

		if or_musl.is_ok() {
			return Ok(if cfg!(target_arch = "x86_64") {
				Platform::LinuxAlpineX64
			} else {
				Platform::LinuxAlpineARM64
			});
		}

		let mut errors: Vec<String> = vec![];
		if let Err(e) = gnu_a {
			errors.push(e);
		} else if let Err(e) = gnu_b {
			errors.push(e);
		}

		if let Err(e) = or_musl {
			errors.push(e);
		}

		let bullets = errors
			.iter()
			.map(|e| format!("  - {e}"))
			.collect::<Vec<String>>()
			.join("\n");

		Err(CodeError::PrerequisitesFailed {
			bullets,
			name: QUALITYLESS_SERVER_NAME,
		})
	}
}

#[allow(dead_code)]
async fn check_musl_interpreter() -> Result<(), String> {
	const MUSL_PATH: &str = if cfg!(target_arch = "aarch64") {
		"/lib/ld-musl-aarch64.so.1"
	} else {
		"/lib/ld-musl-x86_64.so.1"
	};

	if fs::metadata(MUSL_PATH).await.is_err() {
		return Err(format!(
			"find {MUSL_PATH}, which is required to run the {QUALITYLESS_SERVER_NAME} in musl environments"
		));
	}

	Ok(())
}

/// Checks the glibc version, returns "true" if the legacy server is required.
#[cfg(target_os = "linux")]
async fn check_glibc_version() -> Result<bool, String> {
	#[cfg(target_env = "gnu")]
	let version = {
		let v = unsafe { libc::gnu_get_libc_version() };
		let v = unsafe { std::ffi::CStr::from_ptr(v) };
		let v = v.to_str().unwrap();
		extract_generic_version(v)
	};
	#[cfg(not(target_env = "gnu"))]
	let version = {
		super::command::capture_command("ldd", ["--version"])
			.await
			.ok()
			.and_then(|o| extract_ldd_version(&o.stdout))
	};

	if let Some(v) = version {
		return if v >= *MIN_LDD_VERSION {
			Ok(false)
		} else if v >= *MIN_LEGACY_LDD_VERSION {
			Ok(true)
		} else {
			Err(format!(
				"find GLIBC >= {} (but found {} instead) for GNU environments",
				*MIN_LDD_VERSION, v
			))
		};
	}

	Ok(false)
}

/// Check for nixos to avoid mandating glibc versions. See:
/// https://github.com/microsoft/vscode-remote-release/issues/7129
#[allow(dead_code)]
async fn check_is_nixos() -> bool {
	fs::metadata(NIXOS_TEST_PATH).await.is_ok()
}

/// Do not remove this check.
/// Provides a way to skip the server glibc requirements check from
/// outside the install flow. A system process can create this
/// file before the server is downloaded and installed.
#[cfg(not(windows))]
pub async fn skip_requirements_check() -> bool {
	fs::metadata("/tmp/vscode-skip-server-requirements-check")
		.await
		.is_ok()
}

#[cfg(windows)]
pub async fn skip_requirements_check() -> bool {
	false
}

/// Checks the glibc++ version, returns "true" if the legacy server is required.
#[cfg(target_os = "linux")]
async fn check_glibcxx_version() -> Result<bool, String> {
	let mut libstdc_path: Option<String> = None;

	#[cfg(any(target_arch = "x86_64", target_arch = "aarch64"))]
	const DEFAULT_LIB_PATH: &str = "/usr/lib64/libstdc++.so.6";
	#[cfg(any(target_arch = "x86", target_arch = "arm"))]
	const DEFAULT_LIB_PATH: &str = "/usr/lib/libstdc++.so.6";
	const LDCONFIG_PATH: &str = "/sbin/ldconfig";

	if fs::metadata(DEFAULT_LIB_PATH).await.is_ok() {
		libstdc_path = Some(DEFAULT_LIB_PATH.to_owned());
	} else if fs::metadata(LDCONFIG_PATH).await.is_ok() {
		libstdc_path = super::command::capture_command(LDCONFIG_PATH, ["-p"])
			.await
			.ok()
			.and_then(|o| extract_libstd_from_ldconfig(&o.stdout));
	}

	match libstdc_path {
		Some(path) => match fs::read(&path).await {
			Ok(contents) => check_for_sufficient_glibcxx_versions(contents),
			Err(e) => Err(format!(
				"validate GLIBCXX version for GNU environments, but could not: {e}"
			)),
		},
		None => Err("find libstdc++.so or ldconfig for GNU environments".to_owned()),
	}
}

#[cfg(target_os = "linux")]
fn check_for_sufficient_glibcxx_versions(contents: Vec<u8>) -> Result<bool, String> {
	let max_version = LIBSTD_CXX_VERSION_RE
		.captures_iter(&contents)
		.map(|m| SimpleSemver {
			major: m.get(1).map_or(0, |s| u32_from_bytes(s.as_bytes())),
			minor: m.get(2).map_or(0, |s| u32_from_bytes(s.as_bytes())),
			patch: m.get(3).map_or(0, |s| u32_from_bytes(s.as_bytes())),
		})
		.max();

	if let Some(max_version) = &max_version {
		if max_version >= &*MIN_CXX_VERSION {
			return Ok(false);
		}

		if max_version >= &*MIN_LEGACY_CXX_VERSION {
			return Ok(true);
		}
	}

	Err(format!(
		"find GLIBCXX >= {} (but found {} instead) for GNU environments",
		*MIN_CXX_VERSION,
		max_version
			.as_ref()
			.map(String::from)
			.unwrap_or("none".to_string())
	))
}

#[allow(dead_code)]
fn extract_ldd_version(output: &[u8]) -> Option<SimpleSemver> {
	LDD_VERSION_RE.captures(output).map(|m| SimpleSemver {
		major: m.get(1).map_or(0, |s| u32_from_bytes(s.as_bytes())),
		minor: m.get(2).map_or(0, |s| u32_from_bytes(s.as_bytes())),
		patch: 0,
	})
}

#[allow(dead_code)]
fn extract_generic_version(output: &str) -> Option<SimpleSemver> {
	GENERIC_VERSION_RE.captures(output).map(|m| SimpleSemver {
		major: m.get(1).map_or(0, |s| s.as_str().parse().unwrap()),
		minor: m.get(2).map_or(0, |s| s.as_str().parse().unwrap()),
		patch: 0,
	})
}

#[allow(dead_code)]
fn extract_libstd_from_ldconfig(output: &[u8]) -> Option<String> {
	String::from_utf8_lossy(output)
		.lines()
		.find_map(|l| LDCONFIG_STDC_RE.captures(l))
		.and_then(|cap| cap.get(1))
		.map(|cap| cap.as_str().to_owned())
}

fn u32_from_bytes(b: &[u8]) -> u32 {
	String::from_utf8_lossy(b).parse::<u32>().unwrap_or(0)
}

#[derive(Debug, Default, PartialEq, Eq)]
struct SimpleSemver {
	major: u32,
	minor: u32,
	patch: u32,
}

impl PartialOrd for SimpleSemver {
	fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
		Some(self.cmp(other))
	}
}

impl Ord for SimpleSemver {
	fn cmp(&self, other: &Self) -> Ordering {
		let major = self.major.cmp(&other.major);
		if major != Ordering::Equal {
			return major;
		}

		let minor = self.minor.cmp(&other.minor);
		if minor != Ordering::Equal {
			return minor;
		}

		self.patch.cmp(&other.patch)
	}
}

impl From<&SimpleSemver> for String {
	fn from(s: &SimpleSemver) -> Self {
		format!("v{}.{}.{}", s.major, s.minor, s.patch)
	}
}

impl std::fmt::Display for SimpleSemver {
	fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
		write!(f, "{}", String::from(self))
	}
}

#[allow(dead_code)]
impl SimpleSemver {
	fn new(major: u32, minor: u32, patch: u32) -> SimpleSemver {
		SimpleSemver {
			major,
			minor,
			patch,
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_extract_libstd_from_ldconfig() {
		let actual = "
							libstoken.so.1 (libc6,x86-64) => /lib/x86_64-linux-gnu/libstoken.so.1
							libstemmer.so.0d (libc6,x86-64) => /lib/x86_64-linux-gnu/libstemmer.so.0d
							libstdc++.so.6 (libc6,x86-64) => /lib/x86_64-linux-gnu/libstdc++.so.6
							libstartup-notification-1.so.0 (libc6,x86-64) => /lib/x86_64-linux-gnu/libstartup-notification-1.so.0
							libssl3.so (libc6,x86-64) => /lib/x86_64-linux-gnu/libssl3.so
					".to_owned().into_bytes();

		assert_eq!(
			extract_libstd_from_ldconfig(&actual),
			Some("/lib/x86_64-linux-gnu/libstdc++.so.6".to_owned()),
		);

		assert_eq!(
			extract_libstd_from_ldconfig(&"nothing here!".to_owned().into_bytes()),
			None,
		);
	}

	#[test]
	fn test_gte() {
		assert!(SimpleSemver::new(1, 2, 3) >= SimpleSemver::new(1, 2, 3));
		assert!(SimpleSemver::new(1, 2, 3) >= SimpleSemver::new(0, 10, 10));
		assert!(SimpleSemver::new(1, 2, 3) >= SimpleSemver::new(1, 1, 10));

		assert!(SimpleSemver::new(1, 2, 3) < SimpleSemver::new(1, 2, 10));
		assert!(SimpleSemver::new(1, 2, 3) < SimpleSemver::new(1, 3, 1));
		assert!(SimpleSemver::new(1, 2, 3) < SimpleSemver::new(2, 2, 1));
	}

	#[test]
	fn check_for_sufficient_glibcxx_versions() {
		let actual = "ldd (Ubuntu GLIBC 2.31-0ubuntu9.7) 2.31
					Copyright (C) 2020 Free Software Foundation, Inc.
					This is free software; see the source for copying conditions.  There is NO
					warranty; not even for MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
					Written by Roland McGrath and Ulrich Drepper."
			.to_owned()
			.into_bytes();

		assert_eq!(
			extract_ldd_version(&actual),
			Some(SimpleSemver::new(2, 31, 0)),
		);

		let actual2 = "ldd (GNU libc) 2.40.9000
					Copyright (C) 2024 Free Software Foundation, Inc.
					This is free software; see the source for copying conditions.  There is NO
					warranty; not even for MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
					Written by Roland McGrath and Ulrich Drepper."
			.to_owned()
			.into_bytes();
		assert_eq!(
			extract_ldd_version(&actual2),
			Some(SimpleSemver::new(2, 40, 0)),
		);
	}

}
