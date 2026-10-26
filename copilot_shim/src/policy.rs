/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

#[cfg(any(target_os = "linux", test))]
const LINUX_POLICY_PATH: &str = "/etc/vscode/policy.json";

#[cfg(any(target_os = "linux", test))]
fn linux_policy_disabled(contents: &str) -> bool {
	serde_json::from_str::<serde_json::Value>(contents)
		.ok()
		.and_then(|value| value.as_object().cloned())
		.and_then(|object| {
			object
				.get("CopilotCliCommand")
				.and_then(serde_json::Value::as_bool)
		}) == Some(false)
}

#[cfg(any(target_os = "linux", test))]
fn linux_copilot_cli_command_disabled_at(path: &std::path::Path) -> bool {
	std::fs::read_to_string(path)
		.ok()
		.is_some_and(|contents| linux_policy_disabled(&contents))
}

#[cfg(target_os = "linux")]
fn linux_copilot_cli_command_disabled() -> bool {
	linux_copilot_cli_command_disabled_at(std::path::Path::new(LINUX_POLICY_PATH))
}

#[cfg(target_os = "macos")]
const MACOS_POLICY_DOMAINS: &[&str] = &[
	"com.microsoft.VSCode",
	"com.microsoft.VSCodeInsiders",
	"com.microsoft.VSCodeExploration",
	"com.visualstudio.code.oss",
];

#[cfg(target_os = "macos")]
fn macos_copilot_cli_command_disabled() -> bool {
	unsafe {
		macos_copilot_cli_command_disabled_with(MACOS_POLICY_DOMAINS, |key, domain| {
			core_foundation_sys::preferences::CFPreferencesCopyAppValue(key, domain)
		})
	}
}

#[cfg(target_os = "macos")]
/// # Safety
///
/// Each callback result must be null or a valid Core Foundation object with a +1 ownership
/// reference transferred to this helper for exactly one release. Callback key and domain arguments
/// are borrowed valid strings for the callback invocation; they must not be released or retained
/// for later use without an explicit retain.
unsafe fn macos_copilot_cli_command_disabled_with<F>(domains: &[&str], mut copy_value: F) -> bool
where
	F: FnMut(
		core_foundation_sys::string::CFStringRef,
		core_foundation_sys::string::CFStringRef,
	) -> core_foundation_sys::propertylist::CFPropertyListRef,
{
	domains.iter().any(|domain| unsafe {
		// Scalar policies use the effective app value, not CFPreferencesAppValueIsForced. The copied value is owned.
		let Some(key) = cf_string("CopilotCliCommand") else {
			return false;
		};
		let Some(domain) = cf_string(domain) else {
			core_foundation_sys::base::CFRelease(key.cast());
			return false;
		};
		let value = copy_value(key, domain);
		core_foundation_sys::base::CFRelease(key.cast());
		core_foundation_sys::base::CFRelease(domain.cast());
		macos_owned_value_disables_command(value)
	})
}

#[cfg(target_os = "macos")]
unsafe fn macos_owned_value_disables_command(
	value: core_foundation_sys::propertylist::CFPropertyListRef,
) -> bool {
	if value.is_null() {
		return false;
	}

	// The reader transfers ownership of every non-null value to this reducer.
	let disabled = core_foundation_sys::base::CFGetTypeID(value)
		== core_foundation_sys::number::CFBooleanGetTypeID()
		&& !core_foundation_sys::number::CFBooleanGetValue(value.cast());
	core_foundation_sys::base::CFRelease(value);
	disabled
}

#[cfg(target_os = "macos")]
unsafe fn cf_string(value: &str) -> Option<core_foundation_sys::string::CFStringRef> {
	let value = core_foundation_sys::string::CFStringCreateWithBytes(
		std::ptr::null(),
		value.as_ptr(),
		value.len() as core_foundation_sys::base::CFIndex,
		core_foundation_sys::string::kCFStringEncodingUTF8,
		0,
	);
	(!value.is_null()).then_some(value)
}

pub(crate) fn copilot_cli_command_disabled() -> bool {
	#[cfg(windows)]
	{
		return crate::setup::windows::copilot_cli_command_disabled();
	}
	#[cfg(target_os = "linux")]
	{
		return linux_copilot_cli_command_disabled();
	}
	#[cfg(target_os = "macos")]
	{
		return macos_copilot_cli_command_disabled();
	}
	#[allow(unreachable_code)]
	false
}

#[cfg(test)]
mod tests {
	use super::{linux_copilot_cli_command_disabled_at, linux_policy_disabled, LINUX_POLICY_PATH};
	use std::path::Path;

	#[test]
	fn linux_parser_accepts_only_a_false_boolean_member() {
		for (contents, expected) in [
			(r#"{"CopilotCliCommand":false}"#, true),
			(r#"{"CopilotCliCommand":true}"#, false),
			(r#"{}"#, false),
			(r#"{"CopilotCliCommand":false"#, false),
			(r#"false"#, false),
			(r#"{"CopilotCliCommand":0}"#, false),
			(r#"{"CopilotCliCommand":"false"}"#, false),
			(r#"{"CopilotCliCommand":null}"#, false),
			(r#"{"CopilotCliCommand":[]}"#, false),
			(r#"{"CopilotCliCommand":{}}"#, false),
		] {
			assert_eq!(linux_policy_disabled(contents), expected, "{contents}");
		}
	}

	#[test]
	fn linux_reader_observes_changed_file_contents_and_fails_open() {
		assert_eq!(LINUX_POLICY_PATH, "/etc/vscode/policy.json");

		let file = tempfile::NamedTempFile::new().expect("create temporary policy");
		std::fs::write(file.path(), r#"{"CopilotCliCommand":false}"#)
			.expect("write disabled policy");
		assert!(linux_copilot_cli_command_disabled_at(file.path()));

		std::fs::write(file.path(), r#"{"CopilotCliCommand":true}"#).expect("write enabled policy");
		assert!(!linux_copilot_cli_command_disabled_at(file.path()));

		assert!(!linux_copilot_cli_command_disabled_at(
			&file.path().with_file_name("missing-policy.json")
		));

		let directory = tempfile::tempdir().expect("create temporary directory");
		assert!(!linux_copilot_cli_command_disabled_at(Path::new(
			directory.path()
		)));
	}

	#[cfg(target_os = "macos")]
	mod macos {
		use std::cell::Cell;
		use std::sync::atomic::{AtomicUsize, Ordering};

		use core_foundation_sys::base::{CFRelease, CFRetain, CFTypeRef};
		use core_foundation_sys::number::{
			kCFBooleanFalse, kCFBooleanTrue, kCFNumberIntType, CFNumberCreate,
		};

		use super::super::{
			cf_string, macos_copilot_cli_command_disabled_with, MACOS_POLICY_DOMAINS,
		};

		static NEXT_DOMAIN: AtomicUsize = AtomicUsize::new(0);

		unsafe fn retained(
			value: CFTypeRef,
		) -> core_foundation_sys::propertylist::CFPropertyListRef {
			CFRetain(value)
		}

		#[test]
		fn production_domains_are_fixed() {
			assert_eq!(
				MACOS_POLICY_DOMAINS,
				[
					"com.microsoft.VSCode",
					"com.microsoft.VSCodeInsiders",
					"com.microsoft.VSCodeExploration",
					"com.visualstudio.code.oss",
				]
			);
		}

		#[test]
		fn reader_accepts_only_false_booleans_and_releases_owned_values() {
			unsafe {
				assert!(macos_copilot_cli_command_disabled_with(
					&["test"],
					|_, _| retained(kCFBooleanFalse.cast())
				));
				assert!(!macos_copilot_cli_command_disabled_with(
					&["test"],
					|_, _| retained(kCFBooleanTrue.cast())
				));
			}
			unsafe {
				assert!(!macos_copilot_cli_command_disabled_with(
					&["test"],
					|_, _| { std::ptr::null() }
				));
			}

			let zero = 0_i32;
			let zero = unsafe {
				CFNumberCreate(
					std::ptr::null(),
					kCFNumberIntType,
					(&zero as *const i32).cast(),
				)
			};
			unsafe {
				assert!(!macos_copilot_cli_command_disabled_with(
					&["test"],
					|_, _| { retained(zero.cast()) }
				));
			}

			let false_string = unsafe { cf_string("false").expect("create false string") };
			unsafe {
				assert!(!macos_copilot_cli_command_disabled_with(
					&["test"],
					|_, _| { retained(false_string.cast()) }
				));
				CFRelease(zero.cast());
				CFRelease(false_string.cast());
			}
		}

		#[test]
		fn false_stops_later_domain_reads_and_reader_is_not_cached() {
			let reads = Cell::new(0);
			unsafe {
				assert!(macos_copilot_cli_command_disabled_with(
					&["first", "later"],
					|_, _| {
						reads.set(reads.get() + 1);
						retained(if reads.get() == 1 {
							kCFBooleanTrue.cast()
						} else {
							kCFBooleanFalse.cast()
						})
					}
				));
			}
			assert_eq!(reads.get(), 2);

			reads.set(0);
			unsafe {
				assert!(macos_copilot_cli_command_disabled_with(
					&["first", "later"],
					|_, _| {
						reads.set(reads.get() + 1);
						retained(kCFBooleanFalse.cast())
					}
				));
			}
			assert_eq!(reads.get(), 1);

			let false_value = unsafe { retained(kCFBooleanFalse.cast()) };
			let true_value = unsafe { retained(kCFBooleanTrue.cast()) };
			let backing = Cell::new(false_value);
			unsafe {
				assert!(macos_copilot_cli_command_disabled_with(
					&["test"],
					|_, _| retained(backing.get())
				));
			}
			backing.set(true_value);
			unsafe {
				assert!(!macos_copilot_cli_command_disabled_with(
					&["test"],
					|_, _| retained(backing.get())
				));
			}
			unsafe {
				CFRelease(false_value);
				CFRelease(true_value);
			}
		}

		#[test]
		fn production_copier_fails_open_for_a_unique_never_written_domain() {
			let domain = format!(
				"com.microsoft.vscode.copilot-shim-test-never-written-{}-{}",
				std::process::id(),
				NEXT_DOMAIN.fetch_add(1, Ordering::Relaxed)
			);
			unsafe {
				assert!(!macos_copilot_cli_command_disabled_with(
					&[&domain],
					|key, domain| {
						core_foundation_sys::preferences::CFPreferencesCopyAppValue(key, domain)
					}
				));
			}
		}
	}
}
