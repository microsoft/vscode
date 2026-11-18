/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Resolves the platform "user data" directory used to home the
//! agent-host discovery registry (`<userDataPath>/agent-host/local-endpoint/entries/`,
//! a directory of one atomic entry file per agent host instance).
//!
//! Mirrors the precedence and per-platform rules implemented by the
//! TypeScript resolver in `src/vs/platform/environment/node/userDataPath.ts`
//! (which is passed `product.nameShort`), with one deliberate ordering
//! change: an explicit `--user-data-dir` always wins here. In the Electron
//! main process, `VSCODE_PORTABLE`/`VSCODE_APPDATA` are checked *before* the
//! CLI argument only to work around Electron implicitly re-injecting
//! `--user-data-dir` into argv; that quirk does not apply to this
//! standalone-CLI-only flag, so we can use the simpler, more predictable
//! "explicit flag always wins" order.

use std::path::PathBuf;

use crate::constants::PRODUCT_NAME_SHORT;

/// The platform family used to select default user-data directory rules.
/// Kept distinct from `std::env::consts::OS` so unit tests can exercise all
/// three branches regardless of the host running the tests.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UserDataOs {
	Windows,
	MacOs,
	Linux,
}

impl UserDataOs {
	pub fn current() -> Self {
		if cfg!(target_os = "windows") {
			UserDataOs::Windows
		} else if cfg!(target_os = "macos") {
			UserDataOs::MacOs
		} else {
			UserDataOs::Linux
		}
	}
}

/// Snapshot of the environment variables (and home directory) consulted by
/// the resolver. Injectable so tests never need to mutate real process-wide
/// environment variables (which would make tests order-dependent / racy).
#[derive(Debug, Clone, Default)]
pub struct UserDataPathEnv {
	pub vscode_portable: Option<String>,
	pub vscode_appdata: Option<String>,
	pub appdata: Option<String>,
	pub userprofile: Option<String>,
	pub xdg_config_home: Option<String>,
	pub home_dir: Option<PathBuf>,
}

impl UserDataPathEnv {
	/// Reads the real process environment / home directory.
	pub fn from_process() -> Self {
		Self {
			vscode_portable: non_empty_env("VSCODE_PORTABLE"),
			vscode_appdata: non_empty_env("VSCODE_APPDATA"),
			appdata: non_empty_env("APPDATA"),
			userprofile: non_empty_env("USERPROFILE"),
			xdg_config_home: non_empty_env("XDG_CONFIG_HOME"),
			home_dir: dirs::home_dir(),
		}
	}
}

fn non_empty_env(name: &str) -> Option<String> {
	match std::env::var(name) {
		Ok(v) if !v.is_empty() => Some(v),
		_ => None,
	}
}

/// Resolves the user data directory using the real process environment and
/// the built-in [`PRODUCT_NAME_SHORT`].
pub fn resolve_user_data_path(explicit: Option<&str>) -> PathBuf {
	resolve_user_data_path_with(
		explicit,
		PRODUCT_NAME_SHORT,
		UserDataOs::current(),
		&UserDataPathEnv::from_process(),
	)
}

/// Core, dependency-injected resolver. Precedence:
///  1. Explicit `--user-data-dir`, if provided.
///  2. `VSCODE_PORTABLE` -> `<portable>/user-data`.
///  3. `VSCODE_APPDATA` -> `<appdata>/<productName>`.
///  4. The platform default (see [`default_user_data_path_with`]).
///
/// Relative paths (explicit or portable) are resolved against the current
/// working directory, matching the TypeScript resolver's behavior of
/// resolving non-absolute paths against `process.cwd()`.
pub fn resolve_user_data_path_with(
	explicit: Option<&str>,
	product_name: &str,
	os: UserDataOs,
	env: &UserDataPathEnv,
) -> PathBuf {
	if let Some(explicit) = explicit {
		return resolve_relative_to_cwd(explicit, os);
	}

	if let Some(portable) = &env.vscode_portable {
		return join_component(resolve_relative_to_cwd(portable, os), "user-data", os);
	}

	if let Some(appdata) = &env.vscode_appdata {
		return join_component(resolve_relative_to_cwd(appdata, os), product_name, os);
	}

	default_user_data_path_with(product_name, os, env)
}

/// Resolves the platform default user data directory using the real process
/// environment and the built-in [`PRODUCT_NAME_SHORT`].
pub fn default_user_data_path() -> PathBuf {
	default_user_data_path_with(
		PRODUCT_NAME_SHORT,
		UserDataOs::current(),
		&UserDataPathEnv::from_process(),
	)
}

/// Core, dependency-injected platform-default resolver, mirroring
/// `getDefaultUserDataPath` in the TypeScript resolver:
///  - Windows: `%APPDATA%\<productName>`, falling back to
///    `%USERPROFILE%\AppData\Roaming\<productName>`.
///  - macOS: `~/Library/Application Support/<productName>`.
///  - Linux: `${XDG_CONFIG_HOME:-~/.config}/<productName>`.
pub fn default_user_data_path_with(
	product_name: &str,
	os: UserDataOs,
	env: &UserDataPathEnv,
) -> PathBuf {
	match os {
		UserDataOs::Windows => {
			let base = if let Some(appdata) = &env.appdata {
				PathBuf::from(appdata)
			} else if let Some(userprofile) = &env.userprofile {
				let base = join_component(PathBuf::from(userprofile), "AppData", os);
				join_component(base, "Roaming", os)
			} else {
				home_dir_or_empty(env)
			};
			join_component(base, product_name, os)
		}
		UserDataOs::MacOs => {
			let base = join_component(home_dir_or_empty(env), "Library", os);
			let base = join_component(base, "Application Support", os);
			join_component(base, product_name, os)
		}
		UserDataOs::Linux => {
			let base = if let Some(xdg) = &env.xdg_config_home {
				PathBuf::from(xdg)
			} else {
				join_component(home_dir_or_empty(env), ".config", os)
			};
			join_component(base, product_name, os)
		}
	}
}

fn home_dir_or_empty(env: &UserDataPathEnv) -> PathBuf {
	env.home_dir.clone().unwrap_or_else(|| PathBuf::from(""))
}

/// Returns whether `path` is absolute under the *given* platform's rules,
/// independent of the host the code is actually compiled/running on. Plain
/// `Path::is_absolute` can't be used here because on Windows it returns
/// `false` for POSIX-style rooted paths like `/mnt/portable` (they're
/// "drive-relative", not absolute), which would otherwise let a supposedly
/// absolute override silently get re-rooted under the current directory.
/// This only matters for exercising all three `UserDataOs` branches from a
/// single test host; in production `os` always matches the real host.
fn is_absolute_for_os(path: &str, os: UserDataOs) -> bool {
	match os {
		UserDataOs::Windows => {
			let bytes = path.as_bytes();
			let has_drive_root = bytes.len() >= 3
				&& bytes[0].is_ascii_alphabetic()
				&& bytes[1] == b':'
				&& (bytes[2] == b'\\' || bytes[2] == b'/');
			has_drive_root || path.starts_with("\\\\") || path.starts_with("//")
		}
		UserDataOs::MacOs | UserDataOs::Linux => path.starts_with('/'),
	}
}

/// Joins `component` onto `base` using the path separator for `os`, without
/// going through `PathBuf::join`'s host-native (and, for a rooted-but-no-prefix
/// `base` on Windows, surprising) semantics.
fn join_component(base: PathBuf, component: &str, os: UserDataOs) -> PathBuf {
	let sep = match os {
		UserDataOs::Windows => '\\',
		UserDataOs::MacOs | UserDataOs::Linux => '/',
	};
	let mut s = base.to_string_lossy().into_owned();
	if !s.ends_with(['/', '\\']) {
		s.push(sep);
	}
	s.push_str(component);
	PathBuf::from(s)
}

fn resolve_relative_to_cwd(path: &str, os: UserDataOs) -> PathBuf {
	if is_absolute_for_os(path, os) {
		return PathBuf::from(path);
	}

	match std::env::current_dir() {
		Ok(cwd) => cwd.join(path),
		Err(_) => PathBuf::from(path),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn env_with_home(home: &str) -> UserDataPathEnv {
		UserDataPathEnv {
			home_dir: Some(PathBuf::from(home)),
			..Default::default()
		}
	}

	#[test]
	fn default_windows_path_uses_appdata() {
		let mut env = env_with_home(r"C:\Users\test");
		env.appdata = Some(r"C:\Users\test\AppData\Roaming".to_string());
		let path = default_user_data_path_with("Code - OSS", UserDataOs::Windows, &env);
		// Compared as a raw string (not `PathBuf`) so the assertion still
		// catches host-native (as opposed to target-OS-aware) joins on
		// hosts where `Path`'s separator-normalizing `PartialEq` would
		// otherwise mask a wrong separator (e.g. Windows treats `/` and
		// `\` as equivalent component separators).
		assert_eq!(
			path.to_string_lossy(),
			r"C:\Users\test\AppData\Roaming\Code - OSS"
		);
	}

	#[test]
	fn default_windows_path_falls_back_to_userprofile() {
		let mut env = env_with_home(r"C:\Users\test");
		env.userprofile = Some(r"C:\Users\test".to_string());
		let path = default_user_data_path_with("Code - OSS", UserDataOs::Windows, &env);
		assert_eq!(
			path.to_string_lossy(),
			r"C:\Users\test\AppData\Roaming\Code - OSS"
		);
	}

	#[test]
	fn default_macos_path_uses_application_support() {
		let env = env_with_home("/Users/test");
		let path = default_user_data_path_with("Code - OSS", UserDataOs::MacOs, &env);
		assert_eq!(
			path.to_string_lossy(),
			"/Users/test/Library/Application Support/Code - OSS"
		);
	}

	#[test]
	fn default_linux_path_uses_xdg_config_home() {
		let mut env = env_with_home("/home/test");
		env.xdg_config_home = Some("/home/test/.config".to_string());
		let path = default_user_data_path_with("Code - OSS", UserDataOs::Linux, &env);
		assert_eq!(path.to_string_lossy(), "/home/test/.config/Code - OSS");
	}

	#[test]
	fn default_linux_path_falls_back_to_home_dot_config() {
		let env = env_with_home("/home/test");
		let path = default_user_data_path_with("Code - OSS", UserDataOs::Linux, &env);
		assert_eq!(path.to_string_lossy(), "/home/test/.config/Code - OSS");
	}

	#[test]
	fn vscode_portable_overrides_default() {
		let mut env = env_with_home("/home/test");
		env.vscode_portable = Some("/mnt/portable".to_string());
		let path = resolve_user_data_path_with(None, "Code - OSS", UserDataOs::Linux, &env);
		assert_eq!(path, PathBuf::from("/mnt/portable/user-data"));
	}

	#[test]
	fn vscode_appdata_overrides_default() {
		let mut env = env_with_home("/home/test");
		env.vscode_appdata = Some("/mnt/appdata".to_string());
		let path = resolve_user_data_path_with(None, "Code - OSS", UserDataOs::Linux, &env);
		assert_eq!(path, PathBuf::from("/mnt/appdata/Code - OSS"));
	}

	#[test]
	fn explicit_dir_takes_precedence_over_portable_and_appdata() {
		let mut env = env_with_home("/home/test");
		env.vscode_portable = Some("/mnt/portable".to_string());
		env.vscode_appdata = Some("/mnt/appdata".to_string());
		let path = resolve_user_data_path_with(
			Some("/explicit/dir"),
			"Code - OSS",
			UserDataOs::Linux,
			&env,
		);
		assert_eq!(path, PathBuf::from("/explicit/dir"));
	}

	#[test]
	fn relative_explicit_dir_resolves_against_cwd() {
		let env = env_with_home("/home/test");
		let path = resolve_user_data_path_with(
			Some("relative-dir"),
			"Code - OSS",
			UserDataOs::Linux,
			&env,
		);
		assert_eq!(path, std::env::current_dir().unwrap().join("relative-dir"));
	}

	#[test]
	fn falls_back_to_platform_default_when_nothing_set() {
		let env = env_with_home("/home/test");
		let path = resolve_user_data_path_with(None, "Code - OSS", UserDataOs::Linux, &env);
		assert_eq!(path, PathBuf::from("/home/test/.config/Code - OSS"));
	}
}
