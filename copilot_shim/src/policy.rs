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

pub(crate) fn copilot_cli_command_disabled() -> bool {
	#[cfg(windows)]
	{
		return crate::setup::windows::copilot_cli_command_disabled();
	}
	#[cfg(target_os = "linux")]
	{
		return linux_copilot_cli_command_disabled();
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
}
