/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Rust CLI writer/reader for the shared local agent-host endpoint registry
//! under `<userDataPath>/agent-host/local-endpoint/`.
//!
//! Each live agent host owns one immutable `entries/<sha256hex>.json` file
//! named from its `(type, pid, instanceId)` identity, written atomically via a
//! temp-file + rename, so publishers never need a lock. Readers enumerate
//! `entries/`, merge a read-only legacy `metadata.json` array from older builds,
//! prune dead PIDs, and dedupe by identity. The protocol is documented in
//! `src/vs/platform/agentHost/LOCAL_ENDPOINT.md` and MUST stay in lock-step with
//! the TypeScript implementation under `src/vs/platform/agentHost/`.
//!
//! The standalone `code agent host` CLI only publishes a `standalone`/`tcp`
//! entry; it must never publish or select an `editor` entry (owned by running
//! VS Code windows).

use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::net::TcpStream;
use uuid::Uuid;

use crate::async_pipe::get_socket_rw_stream;
use crate::log;
use crate::util::machine::process_exists;

/// Schema version for the shared registry. See module docs: version 1 was
/// the editor-only, socket-path-only shape; version 2 generalizes the
/// registry to hold both editor (socket/pipe) and standalone CLI (TCP)
/// endpoints. Entries with any other `schemaVersion` are ignored on read
/// (not rejected wholesale) so one writer's unsupported entry can never hide
/// another live writer's endpoint.
pub const AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION: u32 = 2;

/// AHP protocol version this CLI build implements, recorded on every
/// registry entry it publishes.
pub const AGENT_HOST_PROTOCOL_VERSION: &str = "0.1.0";

const METADATA_DIRECTORY_NAME: &str = "agent-host";
const ENDPOINT_DIRECTORY_NAME: &str = "local-endpoint";
const ENTRIES_DIRECTORY_NAME: &str = "entries";
/// Read-only fallback: the single shared array file older builds wrote. It is
/// never written or locked; its still-live entries are merged on read and age
/// out naturally as their owning processes exit.
const LEGACY_METADATA_FILE_NAME: &str = "metadata.json";
const ENDPOINT_REACHABILITY_TIMEOUT: Duration = Duration::from_secs(2);

// ---- Schema -----------------------------------------------------------------

/// Kind of process that owns an agent host endpoint. Controls
/// ownership/default-selection policy on the client; it is not by itself a
/// measure of trust or of registry identity (see [`AgentHostEndpointIdentity`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentHostServerType {
	Editor,
	Standalone,
}

/// How to physically connect to an endpoint. Editor endpoints are always a
/// Unix domain socket or Windows named pipe; the standalone Rust CLI
/// currently only ever publishes a `tcp` endpoint.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum AgentHostEndpointAddress {
	Socket { path: String },
	Tcp { host: String, port: u16 },
}

/// One entry of the shared local agent-host endpoint registry. Each live
/// agent host serializes exactly one of these as its own
/// `entries/<sha256hex>.json` file; a legacy `metadata.json` (and the
/// `code agent endpoints` SSH inventory) instead carries a JSON array of them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentHostEndpointMetadata {
	pub schema_version: u32,
	#[serde(rename = "type")]
	pub server_type: AgentHostServerType,
	pub pid: u32,
	pub instance_id: String,
	pub protocol_version: String,
	pub connection_token: String,
	pub endpoint: AgentHostEndpointAddress,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub quality: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub tunnel_name: Option<String>,
}

/// The subset of [`AgentHostEndpointMetadata`] that identifies a unique
/// registry entry/owner: `(type, pid, instanceId)`. `instance_id` makes
/// identity safe across PID reuse; `pid` alone is not a safe key because
/// operating systems recycle PIDs.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct AgentHostEndpointIdentity {
	pub server_type: AgentHostServerType,
	pub pid: u32,
	pub instance_id: String,
}

impl AgentHostEndpointMetadata {
	/// Builds a `standalone` entry, as published by `code agent host`.
	#[allow(clippy::too_many_arguments)]
	pub fn new_standalone(
		pid: u32,
		instance_id: String,
		host: String,
		port: u16,
		connection_token: String,
		protocol_version: String,
		quality: Option<String>,
		tunnel_name: Option<String>,
	) -> Self {
		Self {
			schema_version: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Standalone,
			pid,
			instance_id,
			protocol_version,
			connection_token,
			endpoint: AgentHostEndpointAddress::Tcp { host, port },
			quality,
			tunnel_name,
		}
	}

	pub fn identity(&self) -> AgentHostEndpointIdentity {
		AgentHostEndpointIdentity {
			server_type: self.server_type,
			pid: self.pid,
			instance_id: self.instance_id.clone(),
		}
	}

	/// The connectable address as a short human string: `host:port` for a
	/// `tcp` endpoint, or the raw socket/pipe path for a `socket` endpoint.
	pub fn address_label(&self) -> String {
		match &self.endpoint {
			AgentHostEndpointAddress::Tcp { host, port } => format!("{host}:{port}"),
			AgentHostEndpointAddress::Socket { path } => path.clone(),
		}
	}

	/// A stable, human-readable identifier for disambiguating this entry
	/// from other discovered hosts in `ps`/`logs`/`stop`/`kill` output. Not
	/// meant to be machine-parsed; see [`Self::identity`] for that.
	pub fn label(&self) -> String {
		let kind = match self.server_type {
			AgentHostServerType::Editor => "editor",
			AgentHostServerType::Standalone => "standalone",
		};
		let mut label = format!("{kind} (pid {}, {})", self.pid, self.address_label());
		if let Some(quality) = &self.quality {
			label.push_str(&format!(" [{quality}]"));
		}
		if let Some(tunnel_name) = &self.tunnel_name {
			label.push_str(&format!(" (tunnel {tunnel_name})"));
		}
		label
	}
}

/// Deterministic sort rank for [`AgentHostServerType`]: standalone first (the
/// more likely single-instance case), then editor.
fn server_type_sort_rank(server_type: AgentHostServerType) -> u8 {
	match server_type {
		AgentHostServerType::Standalone => 0,
		AgentHostServerType::Editor => 1,
	}
}

/// The wire name for a server type, matching serde's `rename_all =
/// "lowercase"` and the TypeScript `AgentHostServerType` string union. Used
/// to build the identity hash input, so it MUST stay in sync with both.
fn server_type_wire_name(server_type: AgentHostServerType) -> &'static str {
	match server_type {
		AgentHostServerType::Editor => "editor",
		AgentHostServerType::Standalone => "standalone",
	}
}

/// Canonical UTF-8 input hashed to derive an identity's entry file name. The
/// `\0` separators are unambiguous (no field contains NUL) and this encoding is
/// shared byte-for-byte with the TypeScript `getAgentHostEndpointIdentityHashInput`;
/// it MUST NOT change without a coordinated update on both sides.
fn identity_hash_input(identity: &AgentHostEndpointIdentity) -> String {
	format!(
		"{}\0{}\0{}",
		server_type_wire_name(identity.server_type),
		identity.pid,
		identity.instance_id
	)
}

/// The `<sha256hex>.json` file name for `identity`, keeping the raw
/// `instanceId` out of the path. The editor derives the same name.
fn entry_file_name(identity: &AgentHostEndpointIdentity) -> String {
	let digest = Sha256::digest(identity_hash_input(identity).as_bytes());
	let mut hex = String::with_capacity(digest.len() * 2 + 5);
	for byte in digest {
		hex.push_str(&format!("{byte:02x}"));
	}
	hex.push_str(".json");
	hex
}

/// Structurally validates one raw registry entry. Unsupported schema versions
/// are ignored; malformed entries return an error for the caller to log.
fn parse_registry_entry(
	raw: &serde_json::Value,
) -> Result<Option<AgentHostEndpointMetadata>, String> {
	let schema_version = raw
		.get("schemaVersion")
		.and_then(serde_json::Value::as_u64)
		.ok_or_else(|| "schemaVersion must be a positive integer".to_string())?;
	if schema_version != AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION as u64 {
		return Ok(None);
	}

	let entry: AgentHostEndpointMetadata =
		serde_json::from_value(raw.clone()).map_err(|error| error.to_string())?;
	if entry.pid == 0 {
		return Err("pid must be greater than zero".to_string());
	}
	if let AgentHostEndpointAddress::Tcp { port, .. } = entry.endpoint {
		if port == 0 {
			return Err("TCP endpoint port must be greater than zero".to_string());
		}
	}

	Ok(Some(entry))
}

/// Parses an array-shaped registry payload (`AgentHostEndpointMetadata[]`) —
/// a legacy `metadata.json` file or the `code agent endpoints` SSH inventory.
/// Every entry is validated independently.
fn parse_registry(log: &log::Logger, raw: &[serde_json::Value]) -> Vec<AgentHostEndpointMetadata> {
	raw.iter()
		.enumerate()
		.filter_map(|(index, raw)| match parse_registry_entry(raw) {
			Ok(entry) => entry,
			Err(error) => {
				warning!(
					log,
					"Ignoring malformed agent host registry entry at index {}: {}",
					index,
					error
				);
				None
			}
		})
		.collect()
}

/// Deduplicates `entries` by identity. Mirrors `dedupeAgentHostEndpointMetadata`
/// in TS: the surviving entry keeps the position of its first occurrence but the
/// value of its last, so a later entry wins a collision.
fn dedupe_entries(entries: Vec<AgentHostEndpointMetadata>) -> Vec<AgentHostEndpointMetadata> {
	let mut result: Vec<AgentHostEndpointMetadata> = Vec::with_capacity(entries.len());
	let mut index_by_identity: HashMap<AgentHostEndpointIdentity, usize> = HashMap::new();
	for entry in entries {
		let identity = entry.identity();
		if let Some(&index) = index_by_identity.get(&identity) {
			result[index] = entry;
		} else {
			index_by_identity.insert(identity, result.len());
			result.push(entry);
		}
	}
	result
}

/// Drops entries whose PID is confirmed dead. Entries are only ever pruned
/// here (i.e. when death is certain via a PID liveness check); a live PID is
/// always kept.
fn prune_dead_entries(
	log: &log::Logger,
	entries: Vec<AgentHostEndpointMetadata>,
) -> Vec<AgentHostEndpointMetadata> {
	entries
		.into_iter()
		.filter(|e| {
			if process_exists(e.pid) {
				true
			} else {
				info!(
					log,
					"Pruning stale local endpoint registry entry: {:?} PID {} (instance {}) is no longer running",
					e.server_type,
					e.pid,
					e.instance_id
				);
				false
			}
		})
		.collect()
}

// ---- Paths --------------------------------------------------------------------

fn metadata_directory(user_data_path: &Path) -> PathBuf {
	user_data_path
		.join(METADATA_DIRECTORY_NAME)
		.join(ENDPOINT_DIRECTORY_NAME)
}

/// Directory holding the per-instance `entries/<sha256hex>.json` files.
fn entries_directory(user_data_path: &Path) -> PathBuf {
	metadata_directory(user_data_path).join(ENTRIES_DIRECTORY_NAME)
}

/// Path to the read-only legacy shared array file, merged on read only.
fn legacy_metadata_path(user_data_path: &Path) -> PathBuf {
	metadata_directory(user_data_path).join(LEGACY_METADATA_FILE_NAME)
}

/// The final path of `identity`'s own entry file.
fn entry_path(user_data_path: &Path, identity: &AgentHostEndpointIdentity) -> PathBuf {
	entries_directory(user_data_path).join(entry_file_name(identity))
}

// ---- Directory security -------------------------------------------------------

/// Creates and secures the metadata directory and the `entries/` directory
/// beneath it (Unix: `0700`; Windows: an owner-only ACL). The entries directory
/// is secured explicitly rather than relying on ACL inheritance timing.
fn prepare_metadata_directory(user_data_path: &Path) -> io::Result<()> {
	prepare_owner_only_directory(&metadata_directory(user_data_path))?;
	prepare_owner_only_directory(&entries_directory(user_data_path))?;
	Ok(())
}

fn prepare_owner_only_directory(dir: &Path) -> io::Result<()> {
	fs::create_dir_all(dir)?;

	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		fs::set_permissions(dir, fs::Permissions::from_mode(0o700))?;
	}

	#[cfg(windows)]
	super::agent_host_registry_acl_windows::apply_owner_only_acl(dir)?;

	Ok(())
}

// ---- Read ---------------------------------------------------------------------

/// Reads and validates every PID-live entry in the registry without taking a
/// lock, merging a read-only legacy `metadata.json` array left by older builds.
/// Confirmed-dead entries are pruned (and their own files best-effort removed);
/// the rest are deduped by identity — a live entry file winning over a colliding
/// legacy entry — and returned in a deterministic order (standalone before
/// editor, then by `instanceId`). [`list_live_endpoints`] additionally verifies
/// endpoint reachability before reporting an entry as live.
pub fn read_registry(
	log: &log::Logger,
	user_data_path: &Path,
) -> io::Result<Vec<AgentHostEndpointMetadata>> {
	// Legacy entries first so a live entry file wins the dedupe on collision.
	let legacy = read_legacy_registry(log, &legacy_metadata_path(user_data_path))?;
	let mut live = prune_dead_entries(log, legacy);

	for (entry, path) in read_entry_files(log, &entries_directory(user_data_path))? {
		if process_exists(entry.pid) {
			live.push(entry);
		} else {
			info!(
				log,
				"Pruning stale local endpoint registry entry: {:?} PID {} (instance {}) is no longer running",
				entry.server_type,
				entry.pid,
				entry.instance_id
			);
			let _ = fs::remove_file(&path);
		}
	}

	let mut result = dedupe_entries(live);
	result.sort_by(|a, b| {
		server_type_sort_rank(a.server_type)
			.cmp(&server_type_sort_rank(b.server_type))
			.then_with(|| a.instance_id.cmp(&b.instance_id))
	});
	Ok(result)
}

/// Enumerates the `entries/` directory, returning each parsed entry with its
/// path. Non-`.json` files (including `*.tmp` staging files) are ignored
/// quietly; malformed, unsupported, or misnamed entries log a warning and are
/// skipped without hiding any other entry.
fn read_entry_files(
	log: &log::Logger,
	entries_dir: &Path,
) -> io::Result<Vec<(AgentHostEndpointMetadata, PathBuf)>> {
	let read_dir = match fs::read_dir(entries_dir) {
		Ok(rd) => rd,
		Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
		Err(e) => return Err(e),
	};

	let mut out = Vec::new();
	for dir_entry in read_dir {
		// A failure to stat one directory entry must not hide every other
		// endpoint, so skip it rather than failing the whole read.
		let dir_entry = match dir_entry {
			Ok(e) => e,
			Err(error) => {
				warning!(
					log,
					"Ignoring unreadable agent host endpoint directory entry: {}",
					error
				);
				continue;
			}
		};
		let file_name = dir_entry.file_name();
		let name = file_name.to_string_lossy();
		if !name.ends_with(".json") {
			continue;
		}
		let path = dir_entry.path();
		let entry = match read_entry_file(log, &path) {
			Ok(Some(entry)) => entry,
			Ok(None) => continue,
			// An entry we cannot read is an entry we cannot use, but it must
			// not hide the ones we can. This is reached routinely on Windows:
			// a file deleted by a concurrent prune stays listed in the
			// directory until its last handle closes, and opening it in that
			// window fails with `PermissionDenied` rather than `NotFound`.
			Err(error) => {
				warning!(
					log,
					"Ignoring unreadable agent host endpoint entry at {}: {}",
					path.display(),
					error
				);
				continue;
			}
		};
		// A valid entry must live under its own canonical identity file name;
		// otherwise a misnamed copy could shadow or delete the real entry.
		if name.as_ref() != entry_file_name(&entry.identity()).as_str() {
			warning!(
				log,
				"Ignoring agent host endpoint entry at {} whose file name does not match its identity",
				path.display()
			);
			continue;
		}
		out.push((entry, path));
	}
	Ok(out)
}

fn read_entry_file(
	log: &log::Logger,
	path: &Path,
) -> io::Result<Option<AgentHostEndpointMetadata>> {
	let metadata = match fs::symlink_metadata(path) {
		Ok(m) => m,
		Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
		Err(e) => return Err(e),
	};
	if !metadata.is_file() {
		// A directory or a symlink (defends against a symlink swap attack;
		// genuine entries are only ever written via rename).
		return Ok(None);
	}

	let raw = match fs::read_to_string(path) {
		Ok(s) => s,
		Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
		Err(e) => return Err(e),
	};

	let value: serde_json::Value = match serde_json::from_str(&raw) {
		Ok(v) => v,
		Err(error) => {
			warning!(
				log,
				"Ignoring malformed agent host endpoint entry at {}: {}",
				path.display(),
				error
			);
			return Ok(None);
		}
	};

	match parse_registry_entry(&value) {
		// `Ok(None)` here is an entry with an unsupported schema version:
		// skip this file only, never the whole directory.
		Ok(entry) => Ok(entry),
		Err(error) => {
			warning!(
				log,
				"Ignoring invalid agent host endpoint entry at {}: {}",
				path.display(),
				error
			);
			Ok(None)
		}
	}
}

/// Reads the read-only legacy `metadata.json` array, if present. A missing
/// file, a non-file path (directory/symlink), or malformed JSON all yield an
/// empty list rather than an error.
fn read_legacy_registry(
	log: &log::Logger,
	path: &Path,
) -> io::Result<Vec<AgentHostEndpointMetadata>> {
	let metadata = match fs::symlink_metadata(path) {
		Ok(m) => m,
		Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
		Err(e) => return Err(e),
	};
	if !metadata.is_file() {
		return Ok(Vec::new());
	}

	let raw = match fs::read_to_string(path) {
		Ok(s) => s,
		Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
		Err(e) => return Err(e),
	};

	let values: Vec<serde_json::Value> = match serde_json::from_str(&raw) {
		Ok(v) => v,
		Err(error) => {
			warning!(
				log,
				"Ignoring malformed legacy agent host endpoint registry at {}: {}",
				path.display(),
				error
			);
			return Ok(Vec::new());
		}
	};

	Ok(parse_registry(log, &values))
}

// ---- Atomic write ---------------------------------------------------------------

/// Atomically writes `metadata` to `final_path` via a uniquely named,
/// mode-`0600` temp file (fsync'd, then renamed), cleaning up on failure.
fn write_entry_atomic(
	entries_dir: &Path,
	final_path: &Path,
	metadata: &AgentHostEndpointMetadata,
) -> io::Result<()> {
	let temp_path = entries_dir.join(format!("{}.tmp", Uuid::new_v4()));
	let json = serde_json::to_vec(metadata)?;

	let mut open_options = OpenOptions::new();
	open_options.write(true).create_new(true);
	#[cfg(unix)]
	{
		use std::os::unix::fs::OpenOptionsExt;
		open_options.mode(0o600);
	}

	{
		let mut file = open_options.open(&temp_path)?;
		file.write_all(&json)?;
		file.sync_all()?;
	}

	let rename_result = rename_replacing(&temp_path, final_path);
	let _ = fs::remove_file(&temp_path); // no-op once the rename succeeded
	rename_result?;

	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		fs::set_permissions(final_path, fs::Permissions::from_mode(0o600))?;
	}

	Ok(())
}

/// Renames `from` onto `to`. On Windows a replacing rename can transiently fail
/// while the destination is momentarily held open; since we only ever write our
/// own single-owner file, removing it and retrying once is race-safe.
fn rename_replacing(from: &Path, to: &Path) -> io::Result<()> {
	match fs::rename(from, to) {
		Ok(()) => Ok(()),
		Err(e) => {
			#[cfg(windows)]
			if is_windows_rename_contention(&e) {
				let _ = fs::remove_file(to);
				return fs::rename(from, to);
			}
			Err(e)
		}
	}
}

#[cfg(windows)]
fn is_windows_rename_contention(error: &io::Error) -> bool {
	// ACCESS_DENIED (5), SHARING_VIOLATION (32), ALREADY_EXISTS (183).
	matches!(error.raw_os_error(), Some(5) | Some(32) | Some(183))
		|| error.kind() == io::ErrorKind::PermissionDenied
}

// ---- Publish / remove -----------------------------------------------------------

/// Publishes (or refreshes) this host's own `entries/<sha256hex>.json` file by
/// atomically renaming a freshly written temp file into place. Because every
/// writer only touches its own single-owner file, no lock is needed. Returns an
/// error on any filesystem failure; callers must stay running but
/// undiscoverable rather than retrying non-atomically.
pub fn publish_agent_host_endpoint(
	_log: &log::Logger,
	user_data_path: &Path,
	metadata: &AgentHostEndpointMetadata,
) -> io::Result<()> {
	prepare_metadata_directory(user_data_path)?;
	let entries_dir = entries_directory(user_data_path);
	let final_path = entries_dir.join(entry_file_name(&metadata.identity()));
	write_entry_atomic(&entries_dir, &final_path, metadata)
}

/// Removes exactly `identity`'s own entry file, whose path is derived from its
/// identity, so this can never delete another writer's entry. Best-effort: the
/// shared entries directory is left in place to avoid racing concurrent
/// publishers, and failures are logged, never returned as fatal.
pub fn remove_agent_host_endpoint(
	log: &log::Logger,
	user_data_path: &Path,
	identity: &AgentHostEndpointIdentity,
) {
	let path = entry_path(user_data_path, identity);
	match fs::remove_file(&path) {
		Ok(()) => {}
		Err(e) if e.kind() == io::ErrorKind::NotFound => {}
		Err(e) => {
			warning!(
				log,
				"Failed to remove our entry from the local agent host endpoint registry at {}: {}",
				path.display(),
				e
			);
		}
	}
}

// ---- Endpoint enumeration ---------------------------------------------------------

/// Reads the registry and returns every live endpoint (both `editor` and
/// `standalone`), deduped by identity, pruned of dead-process entries, with the
/// newest published entry first (and a deterministic type/`instanceId`
/// tie-break). Backs `code agent ps|logs|stop`'s auto-discovery.
pub async fn list_live_endpoints(
	log: &log::Logger,
	user_data_path: &Path,
) -> Vec<AgentHostEndpointMetadata> {
	let entries = match read_registry(log, user_data_path) {
		Ok(entries) => entries,
		Err(e) => {
			debug!(
				log,
				"Could not read the local agent host endpoint registry at {}: {}",
				metadata_directory(user_data_path).display(),
				e
			);
			return Vec::new();
		}
	};

	let reachability = futures::future::join_all(entries.iter().map(endpoint_is_reachable)).await;
	let mut live = Vec::with_capacity(entries.len());
	for (entry, reachability) in entries.into_iter().zip(reachability) {
		match reachability {
			Ok(()) => live.push((entry_publish_time(user_data_path, &entry), entry)),
			Err(reason) => {
				debug!(
					log,
					"Filtering unreachable local agent host endpoint registry entry (instanceId {}): {}",
					entry.instance_id,
					reason
				);
			}
		}
	}

	live.sort_by(|(a_published_at, a), (b_published_at, b)| {
		b_published_at
			.cmp(a_published_at)
			.then_with(|| {
				server_type_sort_rank(a.server_type).cmp(&server_type_sort_rank(b.server_type))
			})
			.then_with(|| a.instance_id.cmp(&b.instance_id))
	});
	live.into_iter().map(|(_, entry)| entry).collect()
}

/// Like [`list_live_endpoints`], but restricted to `standalone` entries;
/// `editor` entries are owned by running VS Code windows and must never be
/// selected, replaced, or killed by the standalone CLI.
pub async fn list_live_standalone_endpoints(
	log: &log::Logger,
	user_data_path: &Path,
) -> Vec<AgentHostEndpointMetadata> {
	list_live_endpoints(log, user_data_path)
		.await
		.into_iter()
		.filter(|e| e.server_type == AgentHostServerType::Standalone)
		.collect()
}

/// A live `standalone` registry entry selected for reuse by `code agent
/// host` / `code agent ps|stop|logs|kill`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiveStandaloneEndpoint {
	pub pid: u32,
	pub instance_id: String,
	pub host: String,
	pub port: u16,
	/// Empty when the standalone host was started with
	/// `--without-connection-token`.
	pub connection_token: String,
	pub quality: Option<String>,
	pub tunnel_name: Option<String>,
}

/// Reads the registry and returns a live `standalone` `tcp` entry to reuse, if
/// any, backing `code agent host`'s single-target TCP reuse. `editor` and
/// non-`tcp` entries are never considered. When several live standalone entries
/// exist, the most recently published is selected and a warning recommends
/// `--address` to disambiguate. Callers wanting every live
/// standalone entry should use [`list_live_standalone_endpoints`].
pub async fn select_live_standalone_endpoint(
	log: &log::Logger,
	user_data_path: &Path,
) -> Option<LiveStandaloneEndpoint> {
	let live: Vec<LiveStandaloneEndpoint> = list_live_standalone_endpoints(log, user_data_path)
		.await
		.into_iter()
		.filter_map(|e| match e.endpoint {
			AgentHostEndpointAddress::Tcp { host, port } => Some(LiveStandaloneEndpoint {
				pid: e.pid,
				instance_id: e.instance_id,
				host,
				port,
				connection_token: e.connection_token,
				quality: e.quality,
				tunnel_name: e.tunnel_name,
			}),
			AgentHostEndpointAddress::Socket { .. } => None,
		})
		.collect();

	if live.is_empty() {
		return None;
	}

	if live.len() > 1 {
		warning!(
			log,
			"Multiple live standalone agent hosts are registered; selecting most recently published instance {}. Pass --address to target a specific one.",
			live[0].instance_id
		);
	}

	live.into_iter().next()
}

/// Returns whether an endpoint accepted a new connection within a bounded
/// interval. The connection is immediately dropped without sending bytes or
/// performing the agent-host handshake.
async fn endpoint_is_reachable(entry: &AgentHostEndpointMetadata) -> Result<(), String> {
	let result = tokio::time::timeout(ENDPOINT_REACHABILITY_TIMEOUT, async {
		match &entry.endpoint {
			AgentHostEndpointAddress::Socket { path } => {
				let _stream = get_socket_rw_stream(Path::new(path))
					.await
					.map_err(|error| error.to_string())?;
			}
			AgentHostEndpointAddress::Tcp { host, port } => {
				let _stream = TcpStream::connect((host.as_str(), *port))
					.await
					.map_err(|error| error.to_string())?;
			}
		}
		Ok::<(), String>(())
	})
	.await;

	match result {
		Ok(result) => result,
		Err(_) => Err(format!(
			"connection timed out after {} seconds",
			ENDPOINT_REACHABILITY_TIMEOUT.as_secs()
		)),
	}
}

/// Returns the timestamp of the per-instance entry file that was atomically
/// published by its owner. Legacy-only entries use the legacy file's timestamp.
fn entry_publish_time(user_data_path: &Path, entry: &AgentHostEndpointMetadata) -> SystemTime {
	fs::metadata(entry_path(user_data_path, &entry.identity()))
		.and_then(|metadata| metadata.modified())
		.or_else(|_| {
			fs::metadata(legacy_metadata_path(user_data_path))
				.and_then(|metadata| metadata.modified())
		})
		.unwrap_or(SystemTime::UNIX_EPOCH)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::async_pipe::{get_socket_name, listen_socket_rw_stream, AsyncPipeListener};
	use tokio::net::TcpListener;

	fn standalone(pid: u32, instance_id: &str, port: u16) -> AgentHostEndpointMetadata {
		AgentHostEndpointMetadata::new_standalone(
			pid,
			instance_id.to_string(),
			"127.0.0.1".to_string(),
			port,
			"tok".to_string(),
			"0.1.0".to_string(),
			None,
			None,
		)
	}

	async fn tcp_listener() -> TcpListener {
		TcpListener::bind(("127.0.0.1", 0)).await.unwrap()
	}

	fn standalone_for_listener(
		listener: &TcpListener,
		instance_id: &str,
	) -> AgentHostEndpointMetadata {
		standalone(
			std::process::id(),
			instance_id,
			listener.local_addr().unwrap().port(),
		)
	}

	async fn socket_listener() -> (AsyncPipeListener, String) {
		let path = get_socket_name();
		let listener = listen_socket_rw_stream(&path).await.unwrap();
		(listener, path.to_string_lossy().to_string())
	}

	#[tokio::test]
	async fn select_live_standalone_ignores_editor_entries() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let editor = AgentHostEndpointMetadata {
			schema_version: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid: std::process::id(),
			instance_id: "editor-a".to_string(),
			protocol_version: "0.1.0".to_string(),
			connection_token: "editor-tok".to_string(),
			endpoint: AgentHostEndpointAddress::Socket {
				path: "/tmp/editor.sock".to_string(),
			},
			quality: None,
			tunnel_name: None,
		};
		publish_agent_host_endpoint(&log, dir.path(), &editor).unwrap();

		assert_eq!(
			select_live_standalone_endpoint(&log, dir.path()).await,
			None
		);
	}

	#[tokio::test]
	async fn select_live_standalone_returns_live_entry() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let listener = tcp_listener().await;
		let entry = standalone_for_listener(&listener, "instance-a");
		publish_agent_host_endpoint(&log, dir.path(), &entry).unwrap();

		let selected = select_live_standalone_endpoint(&log, dir.path())
			.await
			.unwrap();
		assert_eq!(selected.pid, std::process::id());
		assert_eq!(selected.instance_id, "instance-a");
		assert_eq!(selected.host, "127.0.0.1");
		assert_eq!(selected.port, listener.local_addr().unwrap().port());
	}

	#[tokio::test]
	async fn select_live_standalone_prefers_most_recently_published_entry() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let first_listener = tcp_listener().await;
		let second_listener = tcp_listener().await;
		let first = standalone_for_listener(&first_listener, "a-instance");
		let second = standalone_for_listener(&second_listener, "b-instance");
		publish_agent_host_endpoint(&log, dir.path(), &first).unwrap();
		std::thread::sleep(Duration::from_millis(20));
		publish_agent_host_endpoint(&log, dir.path(), &second).unwrap();

		let selected = select_live_standalone_endpoint(&log, dir.path())
			.await
			.unwrap();
		assert_eq!(selected.instance_id, "b-instance");
	}

	#[tokio::test]
	async fn list_live_endpoints_filters_unreachable_entry_without_deleting_it() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let listener = tcp_listener().await;
		let port = listener.local_addr().unwrap().port();
		drop(listener);
		let entry = standalone(std::process::id(), "unreachable", port);
		publish_agent_host_endpoint(&log, dir.path(), &entry).unwrap();
		let path = entry_path(dir.path(), &entry.identity());

		assert!(list_live_endpoints(&log, dir.path()).await.is_empty());
		assert!(path.exists());
	}

	#[tokio::test]
	async fn list_live_endpoints_includes_reachable_entry() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let listener = tcp_listener().await;
		let entry = standalone_for_listener(&listener, "reachable");
		publish_agent_host_endpoint(&log, dir.path(), &entry).unwrap();

		assert_eq!(list_live_endpoints(&log, dir.path()).await, vec![entry]);
	}

	#[tokio::test]
	async fn list_live_endpoints_prefers_most_recently_published_entry() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let first_listener = tcp_listener().await;
		let second_listener = tcp_listener().await;
		let first = standalone_for_listener(&first_listener, "a-instance");
		let second = standalone_for_listener(&second_listener, "b-instance");
		publish_agent_host_endpoint(&log, dir.path(), &first).unwrap();
		std::thread::sleep(Duration::from_millis(20));
		publish_agent_host_endpoint(&log, dir.path(), &second).unwrap();

		let instance_ids: Vec<_> = list_live_endpoints(&log, dir.path())
			.await
			.into_iter()
			.map(|entry| entry.instance_id)
			.collect();
		assert_eq!(instance_ids, vec!["b-instance", "a-instance"]);
	}

	#[test]
	fn serializes_with_camel_case_and_type_tag() {
		let mut metadata = standalone(42, "instance-a", 8080);
		metadata.quality = Some("insider".to_string());
		metadata.tunnel_name = Some("my-tunnel".to_string());

		let value = serde_json::to_value(&metadata).unwrap();
		assert_eq!(value["schemaVersion"], 2);
		assert_eq!(value["type"], "standalone");
		assert_eq!(value["pid"], 42);
		assert_eq!(value["instanceId"], "instance-a");
		assert_eq!(value["protocolVersion"], "0.1.0");
		assert_eq!(value["connectionToken"], "tok");
		assert_eq!(value["endpoint"]["type"], "tcp");
		assert_eq!(value["endpoint"]["host"], "127.0.0.1");
		assert_eq!(value["endpoint"]["port"], 8080);
		assert_eq!(value["quality"], "insider");
		assert_eq!(value["tunnelName"], "my-tunnel");
	}

	#[test]
	fn omits_optional_fields_when_unset() {
		let metadata = standalone(42, "instance-a", 8080);
		let value = serde_json::to_value(&metadata).unwrap();
		assert!(value.get("quality").is_none());
		assert!(value.get("tunnelName").is_none());
	}

	#[test]
	fn parse_entry_ignores_unsupported_schema_version() {
		let raw = serde_json::json!({
			"schemaVersion": 1,
			"type": "editor",
			"pid": 42,
			"instanceId": "a",
			"endpointPath": "/tmp/foo.sock",
			"connectionToken": "tok",
			"protocolVersion": "0.1.0",
		});
		assert!(parse_registry_entry(&raw).unwrap().is_none());
	}

	#[test]
	fn parse_registry_ignores_unknown_server_type_without_dropping_known_entries() {
		let unknown = serde_json::json!({
			"schemaVersion": 2,
			"type": "future-host",
			"pid": 42,
			"instanceId": "unknown",
			"protocolVersion": "1",
			"connectionToken": "tok",
			"endpoint": { "type": "tcp", "host": "127.0.0.1", "port": 8080 }
		});
		let known = standalone(43, "known", 8081);
		let raw = vec![unknown, serde_json::to_value(&known).unwrap()];

		assert_eq!(parse_registry(&log::Logger::test(), &raw), vec![known]);
	}

	#[test]
	fn parse_entry_ignores_zero_pid_and_zero_port() {
		let mut raw = serde_json::to_value(standalone(0, "a", 8080)).unwrap();
		assert!(parse_registry_entry(&raw).is_err());

		raw = serde_json::to_value(standalone(42, "a", 0)).unwrap();
		assert!(parse_registry_entry(&raw).is_err());
	}

	#[test]
	fn parse_entry_accepts_well_formed_editor_socket_entry() {
		let raw = serde_json::json!({
			"schemaVersion": 2,
			"type": "editor",
			"pid": 42,
			"instanceId": "a",
			"protocolVersion": "0.1.0",
			"connectionToken": "tok",
			"endpoint": { "type": "socket", "path": "/tmp/foo.sock" },
		});
		let entry = parse_registry_entry(&raw).unwrap().unwrap();
		assert_eq!(entry.server_type, AgentHostServerType::Editor);
		assert_eq!(
			entry.endpoint,
			AgentHostEndpointAddress::Socket {
				path: "/tmp/foo.sock".to_string()
			}
		);
	}

	#[test]
	fn identity_hash_input_and_entry_file_name_match_fixed_cross_language_vectors() {
		// These vectors are shared byte-for-byte with the TypeScript
		// implementation (`getAgentHostEndpointIdentityHashInput` +
		// `createHash('sha256')` in `common/agentHostEndpointRegistry.ts` /
		// `node/localAgentHostMetadata.ts`); both languages must derive the
		// same `entries/<sha256hex>.json` name for a given identity.
		let editor_identity = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Editor,
			pid: 1234,
			instance_id: "fixed-instance-id".to_string(),
		};
		let standalone_identity = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Standalone,
			pid: 4321,
			instance_id: "abc-XYZ_123".to_string(),
		};

		assert_eq!(
			identity_hash_input(&editor_identity),
			"editor\u{0}1234\u{0}fixed-instance-id"
		);
		assert_eq!(
			entry_file_name(&editor_identity),
			"029edbd47070427f394376710b64ae91d13904edadc1d26ac520a12995168a37.json"
		);
		assert_eq!(
			entry_file_name(&standalone_identity),
			"5457fbcae051e99f111749d6e9a1064acae7dd701b87802314c28d273986413e.json"
		);
	}

	#[test]
	fn dedupe_entries_keeps_first_position_but_last_value_for_duplicate_identity() {
		// A crashed writer can leave a stale copy of its own identity behind
		// (e.g. an earlier publish that raced a later one before this
		// writer's own cleanup ran). The later occurrence's value must win,
		// but — matching the TS `Map`-based reference — the surviving
		// entry's position is that of the *first* occurrence, not the last.
		let stale = standalone(1, "a", 100);
		let other = standalone(2, "b", 200);
		let fresh = standalone(1, "a", 999);
		let entries = vec![stale, other, fresh];

		let deduped = dedupe_entries(entries);

		assert_eq!(deduped.len(), 2);
		assert_eq!(deduped[0].instance_id, "a");
		assert_eq!(
			deduped[0].endpoint,
			AgentHostEndpointAddress::Tcp {
				host: "127.0.0.1".to_string(),
				port: 999
			}
		);
		assert_eq!(deduped[1].instance_id, "b");
	}

	#[test]
	fn prune_dead_entries_keeps_live_and_drops_dead() {
		let log = log::Logger::test();
		let live_pid = std::process::id();
		let dead_pid = u32::MAX - 1;
		let entries = vec![
			standalone(live_pid, "live", 100),
			standalone(dead_pid, "dead", 200),
		];

		let pruned = prune_dead_entries(&log, entries);

		assert_eq!(pruned.len(), 1);
		assert_eq!(pruned[0].instance_id, "live");
	}

	#[test]
	fn publish_then_read_round_trips() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let metadata = standalone(std::process::id(), "instance-a", 8080);

		publish_agent_host_endpoint(&log, dir.path(), &metadata).unwrap();

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![metadata]);
	}

	#[test]
	fn publish_preserves_concurrent_writers_entries() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let editor = AgentHostEndpointMetadata {
			schema_version: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid: std::process::id(),
			instance_id: "editor-a".to_string(),
			protocol_version: "0.1.0".to_string(),
			connection_token: "editor-tok".to_string(),
			endpoint: AgentHostEndpointAddress::Socket {
				path: "/tmp/editor.sock".to_string(),
			},
			quality: None,
			tunnel_name: None,
		};
		publish_agent_host_endpoint(&log, dir.path(), &editor).unwrap();

		let standalone_entry = standalone(std::process::id(), "standalone-a", 9090);
		publish_agent_host_endpoint(&log, dir.path(), &standalone_entry).unwrap();

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries.len(), 2);
		assert!(entries.contains(&editor));
		assert!(entries.contains(&standalone_entry));
	}

	#[test]
	fn read_prunes_dead_entry_and_best_effort_removes_its_file() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let dead = standalone(u32::MAX - 1, "dead", 100);
		publish_agent_host_endpoint(&log, dir.path(), &dead).unwrap();

		let live = standalone(std::process::id(), "live", 200);
		publish_agent_host_endpoint(&log, dir.path(), &live).unwrap();

		let dead_path = entry_path(dir.path(), &dead.identity());
		assert!(dead_path.exists());

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![live]);
		assert!(!dead_path.exists());
	}

	#[test]
	fn remove_deletes_only_own_file_and_leaves_the_entries_dir() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let metadata = standalone(std::process::id(), "instance-a", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &metadata).unwrap();
		let path = entry_path(dir.path(), &metadata.identity());
		assert!(path.exists());

		remove_agent_host_endpoint(&log, dir.path(), &metadata.identity());

		assert!(!path.exists());
		// The shared entries directory is intentionally retained to avoid
		// racing a concurrent publisher.
		assert!(entries_directory(dir.path()).exists());
	}

	#[test]
	fn remove_only_removes_exact_owner_leaving_other_entries() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let mine = standalone(std::process::id(), "mine", 8080);
		let theirs = standalone(std::process::id(), "theirs", 9090);
		publish_agent_host_endpoint(&log, dir.path(), &mine).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &theirs).unwrap();

		remove_agent_host_endpoint(&log, dir.path(), &mine.identity());

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![theirs]);
	}

	#[test]
	fn remove_does_not_delete_newer_process_entry_with_same_pid() {
		// PID reuse: removal must target the exact (type, pid, instanceId), not the PID alone.
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let ours = standalone(std::process::id(), "ours", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &ours).unwrap();

		let newer = standalone(std::process::id(), "newer-same-pid", 9090);
		publish_agent_host_endpoint(&log, dir.path(), &newer).unwrap();

		remove_agent_host_endpoint(&log, dir.path(), &ours.identity());

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![newer]);
	}

	#[test]
	fn concurrent_publishes_preserve_every_entry_without_a_lock() {
		use std::sync::{Arc, Barrier};

		let dir = tempfile::tempdir().unwrap();
		let user_data_path = Arc::new(dir.path().to_path_buf());
		let writer_count = 8;
		let barrier = Arc::new(Barrier::new(writer_count));

		let handles: Vec<_> = (0..writer_count)
			.map(|index| {
				let user_data_path = Arc::clone(&user_data_path);
				let barrier = Arc::clone(&barrier);
				std::thread::spawn(move || {
					let log = log::Logger::test();
					let entry = standalone(
						std::process::id(),
						&format!("instance-{index}"),
						8000 + index as u16,
					);
					// Release all threads simultaneously to maximize overlap.
					barrier.wait();
					publish_agent_host_endpoint(&log, &user_data_path, &entry).unwrap();
				})
			})
			.collect();
		for handle in handles {
			handle.join().unwrap();
		}

		let entries = read_registry(&log::Logger::test(), &user_data_path).unwrap();
		let mut got: Vec<String> = entries.into_iter().map(|e| e.instance_id).collect();
		got.sort();
		let mut expected: Vec<String> =
			(0..writer_count).map(|i| format!("instance-{i}")).collect();
		expected.sort();
		assert_eq!(got, expected);
	}

	#[test]
	fn publish_creates_no_lock_artifact() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let metadata = standalone(std::process::id(), "instance-a", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &metadata).unwrap();

		let names: Vec<String> = fs::read_dir(metadata_directory(dir.path()))
			.unwrap()
			.map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
			.collect();
		assert!(
			!names.iter().any(|name| name.ends_with(".lock")),
			"unexpected lock artifact in {names:?}"
		);
	}

	#[test]
	fn read_ignores_malformed_unsupported_temp_and_non_entry_files() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let live = standalone(std::process::id(), "live", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &live).unwrap();

		let entries_dir = entries_directory(dir.path());
		fs::write(entries_dir.join("malformed.json"), b"{ not json").unwrap();
		let mut unsupported =
			serde_json::to_value(standalone(std::process::id(), "future", 9090)).unwrap();
		unsupported["schemaVersion"] = serde_json::json!(999);
		fs::write(
			entries_dir.join("unsupported.json"),
			serde_json::to_vec(&unsupported).unwrap(),
		)
		.unwrap();
		fs::write(entries_dir.join("staging.tmp"), b"partial").unwrap();
		fs::write(entries_dir.join("notes.txt"), b"unrelated").unwrap();

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![live]);
	}

	/// An entry file that cannot be opened must be skipped rather than
	/// aborting the whole read. This is a real race on Windows, where a file
	/// removed by a concurrent prune stays listed in the directory until its
	/// last handle closes and opening it meanwhile fails with
	/// `PermissionDenied` instead of `NotFound`.
	#[test]
	fn read_skips_unreadable_entry_files_without_hiding_readable_ones() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let live = standalone(std::process::id(), "live", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &live).unwrap();

		let blocked = standalone(std::process::id(), "blocked", 9090);
		publish_agent_host_endpoint(&log, dir.path(), &blocked).unwrap();
		let blocked_path = entries_directory(dir.path()).join(entry_file_name(&blocked.identity()));

		let _guard = make_unreadable(&blocked_path);
		if fs::read(&blocked_path).is_ok() {
			// Some environments (notably running as root) can read the file
			// anyway, which would make this assert the opposite of its intent.
			return;
		}

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![live]);
	}

	/// Makes `path` fail to open for the lifetime of the returned guard, using
	/// whatever mechanism the platform offers.
	#[cfg(windows)]
	fn make_unreadable(path: &Path) -> impl std::any::Any {
		use std::os::windows::fs::OpenOptionsExt;
		// Zero share mode: any other open of this path fails with
		// `PermissionDenied`, exactly as a delete-pending file does.
		fs::OpenOptions::new()
			.read(true)
			.share_mode(0)
			.open(path)
			.unwrap()
	}

	#[cfg(unix)]
	fn make_unreadable(path: &Path) -> impl std::any::Any {
		use std::os::unix::fs::PermissionsExt;
		fs::set_permissions(path, fs::Permissions::from_mode(0o000)).unwrap();
	}

	#[test]
	fn read_ignores_entry_files_whose_name_mismatches_identity() {		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let legit = standalone(std::process::id(), "legit", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &legit).unwrap();

		// A valid object for legit's identity, but stored under names that are
		// not its canonical `<lowercase sha256>.json`, must never override or
		// delete the legitimate entry.
		let mut impostor = legit.clone();
		impostor.connection_token = "impostor-token".to_string();
		let entries_dir = entries_directory(dir.path());
		let other = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Standalone,
			pid: std::process::id(),
			instance_id: "other".to_string(),
		};
		let upper = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Standalone,
			pid: std::process::id(),
			instance_id: "upper".to_string(),
		};
		let upper_name = format!(
			"{}.json",
			entry_file_name(&upper)
				.trim_end_matches(".json")
				.to_uppercase()
		);
		let misnamed = [
			entries_dir.join("wrong.json"),
			entries_dir.join(entry_file_name(&other)),
			entries_dir.join(upper_name),
		];
		for path in &misnamed {
			fs::write(path, serde_json::to_vec(&impostor).unwrap()).unwrap();
		}

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![legit]);
		for path in &misnamed {
			assert!(path.exists());
		}
	}

	#[test]
	fn read_merges_legacy_metadata_read_only_and_new_entry_wins_collisions() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		prepare_metadata_directory(dir.path()).unwrap();

		let shared_identity = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Standalone,
			pid: std::process::id(),
			instance_id: "shared".to_string(),
		};
		let mut legacy_shared = standalone(std::process::id(), "shared", 1111);
		legacy_shared.connection_token = "legacy-token".to_string();
		let legacy_only = standalone(std::process::id(), "legacy-only", 2222);
		let legacy_payload = vec![legacy_shared, legacy_only.clone()];
		let legacy_path = legacy_metadata_path(dir.path());
		fs::write(&legacy_path, serde_json::to_vec(&legacy_payload).unwrap()).unwrap();

		let mut winning = standalone(std::process::id(), "shared", 3333);
		winning.connection_token = "new-token".to_string();
		publish_agent_host_endpoint(&log, dir.path(), &winning).unwrap();

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		// Deterministic order: both standalone, sorted by instanceId.
		assert_eq!(entries, vec![legacy_only, winning]);
		// The new entry file, not the legacy copy, won the identity collision.
		let shared = read_registry(&log::Logger::test(), dir.path())
			.unwrap()
			.into_iter()
			.find(|e| e.identity() == shared_identity)
			.unwrap();
		assert_eq!(shared.connection_token, "new-token");
		// The legacy file was never mutated.
		let legacy_after: Vec<AgentHostEndpointMetadata> =
			serde_json::from_slice(&fs::read(&legacy_path).unwrap()).unwrap();
		assert_eq!(legacy_after, legacy_payload);
	}

	#[cfg(unix)]
	#[test]
	fn publish_writes_owner_only_directory_and_entry_permissions() {
		use std::os::unix::fs::PermissionsExt;

		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let metadata = standalone(std::process::id(), "instance-a", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &metadata).unwrap();

		let metadata_mode = fs::metadata(metadata_directory(dir.path()))
			.unwrap()
			.permissions()
			.mode() & 0o777;
		let entries_mode = fs::metadata(entries_directory(dir.path()))
			.unwrap()
			.permissions()
			.mode() & 0o777;
		let entry_mode = fs::metadata(entry_path(dir.path(), &metadata.identity()))
			.unwrap()
			.permissions()
			.mode() & 0o777;
		assert_eq!(
			(metadata_mode, entries_mode, entry_mode),
			(0o700, 0o700, 0o600)
		);
	}

	fn editor(pid: u32, instance_id: &str, socket_path: &str) -> AgentHostEndpointMetadata {
		AgentHostEndpointMetadata {
			schema_version: AGENT_HOST_ENDPOINT_REGISTRY_SCHEMA_VERSION,
			server_type: AgentHostServerType::Editor,
			pid,
			instance_id: instance_id.to_string(),
			protocol_version: "0.1.0".to_string(),
			connection_token: "editor-tok".to_string(),
			endpoint: AgentHostEndpointAddress::Socket {
				path: socket_path.to_string(),
			},
			quality: None,
			tunnel_name: None,
		}
	}

	#[tokio::test]
	async fn list_live_endpoints_includes_reachable_editor_and_standalone() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let pid = std::process::id();
		let (_socket_listener, socket_path) = socket_listener().await;
		let tcp_listener = tcp_listener().await;
		let ed = editor(pid, "editor-b", &socket_path);
		let sa = standalone_for_listener(&tcp_listener, "standalone-a");
		publish_agent_host_endpoint(&log, dir.path(), &ed).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &sa).unwrap();

		let live = list_live_endpoints(&log, dir.path()).await;

		assert_eq!(live.len(), 2);
		assert!(live.iter().any(|entry| entry.instance_id == "standalone-a"));
		assert!(live.iter().any(|entry| entry.instance_id == "editor-b"));
	}

	#[tokio::test]
	async fn list_live_endpoints_excludes_dead_and_dedupes() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let dead_pid = u32::MAX - 1;
		let dead = standalone(dead_pid, "dead", 100);
		let listener = tcp_listener().await;
		let live_entry = standalone_for_listener(&listener, "live");
		publish_agent_host_endpoint(&log, dir.path(), &dead).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &live_entry).unwrap();

		let live = list_live_endpoints(&log, dir.path()).await;

		assert_eq!(live, vec![live_entry]);
	}

	#[tokio::test]
	async fn list_live_endpoints_returns_empty_when_registry_missing() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();

		assert_eq!(list_live_endpoints(&log, dir.path()).await, Vec::new());
	}

	#[tokio::test]
	async fn list_live_standalone_endpoints_excludes_editor_but_includes_socket_standalones() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let pid = std::process::id();
		let (_editor_socket_listener, editor_socket_path) = socket_listener().await;
		let (_standalone_socket_listener, standalone_socket_path) = socket_listener().await;
		let tcp_listener = tcp_listener().await;
		let ed = editor(pid, "editor-a", &editor_socket_path);
		let sa_tcp = standalone_for_listener(&tcp_listener, "standalone-tcp");
		let mut sa_socket = standalone(pid, "standalone-socket", 0);
		sa_socket.endpoint = AgentHostEndpointAddress::Socket {
			path: standalone_socket_path,
		};
		publish_agent_host_endpoint(&log, dir.path(), &ed).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &sa_tcp).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &sa_socket).unwrap();

		let standalones = list_live_standalone_endpoints(&log, dir.path()).await;

		assert_eq!(standalones.len(), 2);
		assert!(standalones
			.iter()
			.all(|e| e.server_type == AgentHostServerType::Standalone));
		assert!(standalones
			.iter()
			.any(|e| e.instance_id == "standalone-tcp"));
		assert!(standalones
			.iter()
			.any(|e| e.instance_id == "standalone-socket"));
	}

	#[test]
	fn address_label_formats_tcp_and_socket_endpoints() {
		let tcp = standalone(1, "a", 8080);
		assert_eq!(tcp.address_label(), "127.0.0.1:8080");

		let socket = editor(1, "b", "/tmp/editor.sock");
		assert_eq!(socket.address_label(), "/tmp/editor.sock");
	}

	#[test]
	fn label_includes_kind_pid_address_quality_and_tunnel() {
		let mut entry = standalone(42, "a", 8080);
		assert_eq!(entry.label(), "standalone (pid 42, 127.0.0.1:8080)");

		entry.quality = Some("insider".to_string());
		entry.tunnel_name = Some("my-tunnel".to_string());
		assert_eq!(
			entry.label(),
			"standalone (pid 42, 127.0.0.1:8080) [insider] (tunnel my-tunnel)"
		);

		let ed = editor(7, "editor-a", "/tmp/editor.sock");
		assert_eq!(ed.label(), "editor (pid 7, /tmp/editor.sock)");
	}
}
