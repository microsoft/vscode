/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
#[cfg(any(target_os = "linux", test))]
use std::cmp::Ordering;

use crate::constants::QUALITYLESS_SERVER_NAME;
use crate::update_service::Platform;
#[cfg(any(target_os = "linux", test))]
use regex_syntax::hir::{Class, ClassUnicode, HirKind};
#[cfg(any(target_os = "linux", test))]
use std::sync::LazyLock;
use tokio::fs;

use super::errors::CodeError;

#[cfg(any(target_os = "linux", test))]
static UNICODE_DIGITS: LazyLock<ClassUnicode> = LazyLock::new(|| unicode_class(r"\d"));
#[cfg(any(target_os = "linux", test))]
static UNICODE_WHITESPACE: LazyLock<ClassUnicode> = LazyLock::new(|| unicode_class(r"\s"));
#[cfg(target_os = "linux")]
static MIN_LDD_VERSION: LazyLock<SimpleSemver> = LazyLock::new(|| SimpleSemver::new(2, 28, 0));

#[cfg(target_os = "linux")]
#[cfg(target_arch = "arm")]
static MIN_CXX_VERSION: LazyLock<SimpleSemver> = LazyLock::new(|| SimpleSemver::new(3, 4, 26));

#[cfg(target_os = "linux")]
#[cfg(not(target_arch = "arm"))]
static MIN_CXX_VERSION: LazyLock<SimpleSemver> = LazyLock::new(|| SimpleSemver::new(3, 4, 25));

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
			(Ok(true), Ok(true))
		};

		match (&gnu_a, &gnu_b, is_nixos) {
			(Ok(true), Ok(true), _) | (_, _, true) => {
				return Ok(if cfg!(target_arch = "x86_64") {
					Platform::LinuxX64
				} else if cfg!(target_arch = "arm") {
					Platform::LinuxARM32
				} else {
					Platform::LinuxARM64
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

/// Checks the glibc version, returns "true" if the default server is required.
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
/// outside the install flow.
///
/// 1) A system process can create this
///    file before the server is downloaded and installed.
///
/// 2) An environment variable declared in host
///    that contains path to a glibc sysroot satisfying the
///    minimum requirements.
#[cfg(not(windows))]
pub async fn skip_requirements_check() -> bool {
	std::env::var("VSCODE_SERVER_CUSTOM_GLIBC_LINKER").is_ok()
		|| fs::metadata("/tmp/vscode-skip-server-requirements-check")
			.await
			.is_ok()
}

#[cfg(windows)]
pub async fn skip_requirements_check() -> bool {
	false
}

/// Checks the glibc++ version, returns "true" if the default server is required.
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
	let max_version = extract_max_glibcxx_version(&contents);

	if let Some(max_version) = &max_version {
		if max_version >= &*MIN_CXX_VERSION {
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

#[cfg(any(target_os = "linux", test))]
#[allow(dead_code)]
fn extract_ldd_version(output: &[u8]) -> Option<SimpleSemver> {
	// Unicode byte regexes cannot cross invalid UTF-8, even when valid data follows it.
	let output = match std::str::from_utf8(output) {
		Ok(output) => output,
		Err(error) => std::str::from_utf8(&output[..error.valid_up_to()]).unwrap(),
	};
	let output = output.strip_prefix("ldd")?;
	// Greedy `.*` stops at LF, but the following whitespace can consume that LF.
	let leading_end = output.find('\n').map_or(output.len(), |index| index + 1);
	output[..leading_end]
		.char_indices()
		.rev()
		.filter(|(_, character)| class_contains(&UNICODE_WHITESPACE, *character))
		.find_map(|(index, character)| {
			let value = &output[index + character.len_utf8()..];
			let (major, remaining) = unicode_digits(value)?;
			let (minor, remaining) = unicode_digits(remaining.strip_prefix('.')?)?;
			let remaining = if let Some(patch) = remaining.strip_prefix('.') {
				unicode_digits(patch)?.1
			} else {
				remaining
			};
			remaining
				.chars()
				.next()
				.filter(|character| class_contains(&UNICODE_WHITESPACE, *character))?;
			Some(SimpleSemver {
				major: u32_from_bytes(major.as_bytes()),
				minor: u32_from_bytes(minor.as_bytes()),
				patch: 0,
			})
		})
}

#[cfg(any(target_os = "linux", test))]
#[allow(dead_code)]
fn extract_generic_version(output: &str) -> Option<SimpleSemver> {
	let (major, minor) = output.split_once('.')?;
	if major.is_empty()
		|| minor.is_empty()
		|| !major.bytes().all(|byte| byte.is_ascii_digit())
		|| !minor.bytes().all(|byte| byte.is_ascii_digit())
	{
		return None;
	}
	Some(SimpleSemver {
		major: major.parse().unwrap(),
		minor: minor.parse().unwrap(),
		patch: 0,
	})
}

#[cfg(any(target_os = "linux", test))]
#[allow(dead_code)]
fn extract_libstd_from_ldconfig(output: &[u8]) -> Option<String> {
	String::from_utf8_lossy(output).lines().find_map(|line| {
		let (_, value) = line.split_once("libstdc++")?;
		// Excluding the last character keeps `(.+)` nonempty, including overlapping delimiters.
		let search_end = value.len() - value.chars().next_back()?.len_utf8();
		let delimiter = " => ";
		let index = value[..search_end].rfind(delimiter)?;
		Some(value[index + delimiter.len()..].to_owned())
	})
}

#[cfg(any(target_os = "linux", test))]
fn extract_max_glibcxx_version(contents: &[u8]) -> Option<SimpleSemver> {
	contents
		.split(|byte| *byte == b'G')
		.skip(1)
		.filter_map(|value| {
			let value = value.strip_prefix(b"LIBCXX_")?;
			let (major, remaining) = ascii_digits(value)?;
			let (minor, remaining) = ascii_digits(remaining.strip_prefix(b".")?)?;
			let patch = remaining
				.strip_prefix(b".")
				.and_then(ascii_digits)
				.map_or(0, |(patch, _)| u32_from_bytes(patch));
			Some(SimpleSemver {
				major: u32_from_bytes(major),
				minor: u32_from_bytes(minor),
				patch,
			})
		})
		.max()
}

#[cfg(any(target_os = "linux", test))]
fn ascii_digits(value: &[u8]) -> Option<(&[u8], &[u8])> {
	let end = value
		.iter()
		.take_while(|byte| byte.is_ascii_digit())
		.count();
	(end > 0).then(|| value.split_at(end))
}

#[cfg(any(target_os = "linux", test))]
fn unicode_digits(value: &str) -> Option<(&str, &str)> {
	let end = value
		.char_indices()
		.find(|(_, character)| !class_contains(&UNICODE_DIGITS, *character))
		.map_or(value.len(), |(index, _)| index);
	(end > 0).then(|| value.split_at(end))
}

#[cfg(any(target_os = "linux", test))]
fn unicode_class(pattern: &str) -> ClassUnicode {
	let hir = regex_syntax::Parser::new().parse(pattern).unwrap();
	match hir.kind() {
		HirKind::Class(Class::Unicode(class)) => class.clone(),
		_ => unreachable!("expected a Unicode character class"),
	}
}

#[cfg(any(target_os = "linux", test))]
fn class_contains(class: &ClassUnicode, character: char) -> bool {
	class
		.ranges()
		.binary_search_by(|range| {
			if range.end() < character {
				Ordering::Less
			} else if range.start() > character {
				Ordering::Greater
			} else {
				Ordering::Equal
			}
		})
		.is_ok()
}

#[cfg(any(target_os = "linux", test))]
fn u32_from_bytes(b: &[u8]) -> u32 {
	String::from_utf8_lossy(b).parse::<u32>().unwrap_or(0)
}

#[cfg(any(target_os = "linux", test))]
#[derive(Debug, Default, PartialEq, Eq)]
struct SimpleSemver {
	major: u32,
	minor: u32,
	patch: u32,
}

#[cfg(any(target_os = "linux", test))]
impl PartialOrd for SimpleSemver {
	fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
		Some(self.cmp(other))
	}
}

#[cfg(any(target_os = "linux", test))]
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

#[cfg(any(target_os = "linux", test))]
impl From<&SimpleSemver> for String {
	fn from(s: &SimpleSemver) -> Self {
		format!("v{}.{}.{}", s.major, s.minor, s.patch)
	}
}

#[cfg(any(target_os = "linux", test))]
impl std::fmt::Display for SimpleSemver {
	fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
		write!(f, "{}", String::from(self))
	}
}

#[cfg(any(target_os = "linux", test))]
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
	use rand::{RngCore, SeedableRng};
	use regex::{bytes::Regex as BinRegex, Regex};

	fn legacy_ldd(regex: &BinRegex, output: &[u8]) -> Option<SimpleSemver> {
		regex.captures(output).map(|captures| SimpleSemver {
			major: u32_from_bytes(captures.get(1).unwrap().as_bytes()),
			minor: u32_from_bytes(captures.get(2).unwrap().as_bytes()),
			patch: 0,
		})
	}

	fn legacy_glibcxx(regex: &BinRegex, output: &[u8]) -> Option<SimpleSemver> {
		regex
			.captures_iter(output)
			.map(|captures| SimpleSemver {
				major: u32_from_bytes(captures.get(1).unwrap().as_bytes()),
				minor: u32_from_bytes(captures.get(2).unwrap().as_bytes()),
				patch: captures
					.get(3)
					.map_or(0, |value| u32_from_bytes(value.as_bytes())),
			})
			.max()
	}

	fn legacy_ldconfig(regex: &Regex, output: &[u8]) -> Option<String> {
		String::from_utf8_lossy(output)
			.lines()
			.find_map(|line| regex.captures(line))
			.and_then(|captures| captures.get(1))
			.map(|value| value.as_str().to_owned())
	}

	#[test]
	fn unicode_version_classes_match_legacy_regex_for_every_scalar() {
		let digits = Regex::new(r"\d").unwrap();
		let whitespace = Regex::new(r"\s").unwrap();
		let mut buffer = [0; 4];
		for value in 0..=u32::from(char::MAX) {
			if let Some(character) = char::from_u32(value) {
				let text = character.encode_utf8(&mut buffer);
				assert_eq!(
					(
						class_contains(&UNICODE_DIGITS, character),
						class_contains(&UNICODE_WHITESPACE, character)
					),
					(digits.is_match(text), whitespace.is_match(text)),
					"U+{value:04X}"
				);
			}
		}
	}

	#[test]
	fn ldd_parser_matches_legacy_greediness_and_byte_semantics() {
		let regex = BinRegex::new(r"^ldd.*\s(\d+)\.(\d+)(?:\.(\d+))?\s").unwrap();
		for prefix in ["ldd", "prefix ldd", "ldd (GNU libc)", "ldd (GLIBC 2.31-1)"] {
			for separator in ["", " ", "\t", "\r", "\n", "\u{a0}", "\u{2003}", "\u{2028}"] {
				for version in [
					"2.31",
					"2.40.9000",
					"٢.٤٠",
					"2.٣",
					"2.3.",
					"2.3.4.5",
					"2",
					"2..3",
					"02.003",
					"4294967296.3",
				] {
					for ending in ["", " ", "\n", "\r\n2.99\n", "\n2.40\n"] {
						let value = format!("{prefix}{separator}{version}{ending}");
						for suffix in [b"".as_slice(), b"\xff", b"\xc3", b" \xff"] {
							let output = [value.as_bytes(), suffix].concat();
							assert_eq!(
								extract_ldd_version(&output),
								legacy_ldd(&regex, &output),
								"{output:?}"
							);
						}
					}
				}
			}
		}
	}

	#[test]
	fn generic_version_parser_preserves_anchors_and_overflow() {
		let regex = Regex::new(r"^([0-9]+)\.([0-9]+)$").unwrap();
		for output in [
			"",
			"2.28",
			"02.003",
			"2.28\n",
			" 2.28",
			"2.28 ",
			"+2.28",
			"2.+28",
			"2.28.1",
			"٢.٢٨",
			"4294967296.1",
			"1.4294967296",
		] {
			let expected = std::panic::catch_unwind(|| {
				regex.captures(output).map(|captures| SimpleSemver {
					major: captures.get(1).unwrap().as_str().parse().unwrap(),
					minor: captures.get(2).unwrap().as_str().parse().unwrap(),
					patch: 0,
				})
			})
			.map_err(|_| ());
			let actual =
				std::panic::catch_unwind(|| extract_generic_version(output)).map_err(|_| ());
			assert_eq!(actual, expected, "{output:?}");
		}
	}

	#[test]
	fn binary_version_and_ldconfig_parsers_match_legacy() {
		let glibcxx = BinRegex::new(r"GLIBCXX_([0-9]+)\.([0-9]+)(?:\.([0-9]+))?").unwrap();
		let ldconfig = Regex::new(r"libstdc\+\+.* => (.+)").unwrap();
		let ldd = BinRegex::new(r"^ldd.*\s(\d+)\.(\d+)(?:\.(\d+))?\s").unwrap();
		let mut random = rand::rngs::StdRng::seed_from_u64(0x5a_28_34);
		let mut inputs = vec![
			b"LIBCXX_9.9.9".to_vec(),
			b"GGLIBCXX_3.4.26".to_vec(),
			b"GLIBCXX_3.4. GLIBCXX_3.4.25".to_vec(),
			b"\xffGLIBCXX_4294967296.4.25\0GLIBCXX_3.4.26".to_vec(),
			b"libstdc++ => => ".to_vec(),
			b"libstdc++ => path => ".to_vec(),
			"libstdc++ => \r\nlibstdc++ => /lib/é".as_bytes().to_vec(),
			b"ldd\xff 2.40 \n".to_vec(),
			b"ldd 2.31\n2.40 \xff".to_vec(),
		];
		for length in 0..256 {
			let mut bytes = vec![0; length];
			random.fill_bytes(&mut bytes);
			inputs.push([b"ldd ".as_slice(), &bytes, b" 2.40\n"].concat());
			inputs.push(
				[
					bytes.as_slice(),
					b"GLIBCXX_3.4.25",
					bytes.as_slice(),
					b"GLIBCXX_3.4.26",
				]
				.concat(),
			);
			inputs.push(
				[
					bytes.as_slice(),
					b"libstdc++ => ",
					bytes.as_slice(),
					b" => => ",
				]
				.concat(),
			);
		}
		for output in inputs {
			assert_eq!(
				(
					extract_max_glibcxx_version(&output),
					extract_libstd_from_ldconfig(&output),
					extract_ldd_version(&output)
				),
				(
					legacy_glibcxx(&glibcxx, &output),
					legacy_ldconfig(&ldconfig, &output),
					legacy_ldd(&ldd, &output)
				),
				"{output:?}"
			);
		}
	}

	#[test]
	fn test_regex_ldd_unicode_whitespace() {
		for (output, expected) in [
			(
				"ldd (GNU libc)\u{a0}2.40.9000\u{2003}",
				Some(SimpleSemver::new(2, 40, 0)),
			),
			("ldd 2.40", None),
			("prefix ldd 2.40\n", None),
		] {
			assert_eq!(
				extract_ldd_version(output.as_bytes()),
				expected,
				"{output:?}"
			);
		}
	}

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
