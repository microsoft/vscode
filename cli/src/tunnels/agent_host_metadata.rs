/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fs;
use std::io::{self, Write};
use std::path::Path;

use serde::{Deserialize, Serialize};

pub const AGENT_HOST_METADATA_SCHEMA_VERSION: u32 = 1;
pub const AGENT_HOST_PROTOCOL_VERSION: &str = "0.1.0";

/// Persisted record describing a running `code agent host` proxy, written to
/// the per-quality lockfile (`<launcher-root>/agent-host-<quality>.lock`).
///
/// This schema is shared with the TypeScript SSH client in
/// `src/vs/platform/agentHost/common/remoteAgentHostMetadata.ts`; field
/// renames or removals MUST be coordinated across both languages.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHostMetadata {
	pub schema_version: u32,
	pub pid: u32,
	pub port: u16,
	/// Host the supervisor's TCP listener was bound to (e.g. `127.0.0.1`,
	/// `0.0.0.0`). Optional so older lockfiles still parse; consumers
	/// fall back to loopback when absent. Used by the foreground
	/// `code agent host` command to detect when a caller's requested
	/// `--host` differs from what's already running.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub host: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub connection_token: Option<String>,
	pub protocol_version: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub quality: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub tunnel_name: Option<String>,
}

impl AgentHostMetadata {
	pub fn new(pid: u32, port: u16) -> Self {
		Self {
			schema_version: AGENT_HOST_METADATA_SCHEMA_VERSION,
			pid,
			port,
			host: None,
			connection_token: None,
			protocol_version: AGENT_HOST_PROTOCOL_VERSION.to_string(),
			quality: None,
			tunnel_name: None,
		}
	}
}

pub fn read_agent_host_metadata(path: &Path) -> io::Result<Option<AgentHostMetadata>> {
	let text = match fs::read_to_string(path) {
		Ok(text) => text,
		Err(err) if err.kind() == io::ErrorKind::NotFound => return Ok(None),
		Err(err) => return Err(err),
	};

	serde_json::from_str(&text)
		.map(Some)
		.map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))
}

pub fn write_agent_host_metadata(path: &Path, metadata: &AgentHostMetadata) -> io::Result<()> {
	#[cfg(not(windows))]
	use std::os::unix::fs::PermissionsExt;

	let parent = path.parent().unwrap_or_else(|| Path::new("."));
	fs::create_dir_all(parent)?;
	#[cfg(not(windows))]
	fs::set_permissions(parent, fs::Permissions::from_mode(0o700))?;

	let mut temp = tempfile::NamedTempFile::new_in(parent)?;
	#[cfg(not(windows))]
	temp.as_file()
		.set_permissions(fs::Permissions::from_mode(0o600))?;
	temp.write_all(serde_json::to_string(metadata)?.as_bytes())?;
	temp.flush()?;
	temp.persist(path).map_err(|err| err.error)?;
	#[cfg(not(windows))]
	fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
	Ok(())
}

pub fn remove_agent_host_metadata(path: &Path) -> io::Result<()> {
	match fs::remove_file(path) {
		Ok(()) => Ok(()),
		Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(()),
		Err(err) => Err(err),
	}
}

pub fn remove_agent_host_metadata_for_pid(path: &Path, pid: u32) -> io::Result<()> {
	match read_agent_host_metadata(path)? {
		Some(metadata) if metadata.pid == pid => remove_agent_host_metadata(path),
		_ => Ok(()),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use std::path::PathBuf;

	fn metadata_path(dir: &Path) -> PathBuf {
		dir.join("agent-host.lock")
	}

	#[test]
	fn serializes_with_camel_case_fields() {
		let mut metadata = AgentHostMetadata::new(1234, 8080);
		metadata.host = Some("0.0.0.0".to_string());
		metadata.connection_token = Some("tok".to_string());
		metadata.quality = Some("insider".to_string());
		metadata.tunnel_name = Some("my-tunnel".to_string());

		let value = serde_json::to_value(&metadata).unwrap();
		assert_eq!(value["schemaVersion"], 1);
		assert_eq!(value["pid"], 1234);
		assert_eq!(value["port"], 8080);
		assert_eq!(value["host"], "0.0.0.0");
		assert_eq!(value["connectionToken"], "tok");
		assert_eq!(value["protocolVersion"], "0.1.0");
		assert_eq!(value["quality"], "insider");
		assert_eq!(value["tunnelName"], "my-tunnel");
	}

	#[test]
	fn omits_optional_fields_when_unset() {
		let metadata = AgentHostMetadata::new(1234, 8080);

		let value = serde_json::to_value(&metadata).unwrap();
		assert!(value.get("host").is_none());
		assert!(value.get("connectionToken").is_none());
		assert!(value.get("quality").is_none());
		assert!(value.get("tunnelName").is_none());
	}

	#[test]
	fn round_trips_metadata() {
		let dir = tempfile::tempdir().unwrap();
		let path = metadata_path(dir.path());
		let mut metadata = AgentHostMetadata::new(1234, 8080);
		metadata.connection_token = Some("tok".to_string());

		write_agent_host_metadata(&path, &metadata).unwrap();
		assert_eq!(read_agent_host_metadata(&path).unwrap(), Some(metadata));
	}

	#[test]
	fn missing_metadata_returns_none() {
		let dir = tempfile::tempdir().unwrap();
		let path = metadata_path(dir.path());

		assert_eq!(read_agent_host_metadata(&path).unwrap(), None);
	}

	#[test]
	fn invalid_metadata_returns_invalid_data() {
		let dir = tempfile::tempdir().unwrap();
		let path = metadata_path(dir.path());
		fs::write(&path, "not json").unwrap();

		let err = read_agent_host_metadata(&path).unwrap_err();
		assert_eq!(err.kind(), io::ErrorKind::InvalidData);
	}

	#[test]
	fn remove_metadata_ignores_missing_file() {
		let dir = tempfile::tempdir().unwrap();
		let path = metadata_path(dir.path());

		remove_agent_host_metadata(&path).unwrap();
	}

	#[test]
	fn remove_metadata_for_pid_only_removes_matching_process() {
		let dir = tempfile::tempdir().unwrap();
		let path = metadata_path(dir.path());
		let metadata = AgentHostMetadata::new(1234, 8080);

		write_agent_host_metadata(&path, &metadata).unwrap();
		remove_agent_host_metadata_for_pid(&path, 4321).unwrap();
		assert_eq!(read_agent_host_metadata(&path).unwrap(), Some(metadata));

		remove_agent_host_metadata_for_pid(&path, 1234).unwrap();
		assert_eq!(read_agent_host_metadata(&path).unwrap(), None);
	}

	#[cfg(not(windows))]
	#[test]
	fn writes_owner_only_permissions() {
		use std::os::unix::fs::PermissionsExt;

		let dir = tempfile::tempdir().unwrap();
		let path = metadata_path(dir.path());

		write_agent_host_metadata(&path, &AgentHostMetadata::new(1234, 8080)).unwrap();

		assert_eq!(
			fs::metadata(dir.path()).unwrap().permissions().mode() & 0o777,
			0o700
		);
		assert_eq!(
			fs::metadata(&path).unwrap().permissions().mode() & 0o777,
			0o600
		);
	}
}
