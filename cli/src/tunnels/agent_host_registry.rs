/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Rust CLI writer/reader for the shared local agent-host endpoint registry
//! at `<userDataPath>/agent-host/local-endpoint/metadata.json`.
//!
//! This schema and the multi-writer locking/upsert/removal protocol are
//! shared with, and MUST stay in lock-step with, the TypeScript
//! implementation in:
//!  - `src/vs/platform/agentHost/common/agentHostEndpointRegistry.ts` (schema
//!    + pure array helpers)
//!  - `src/vs/platform/agentHost/node/localAgentHostMetadata.ts` (lock,
//!    atomic write, directory security)
//!  - `src/vs/platform/agentHost/LOCAL_ENDPOINT.md` (protocol document)
//!
//! The standalone `code agent host` CLI only ever publishes a `standalone`
//! entry with a `tcp` endpoint; it never publishes (and must never select
//! for reuse/`--replace`) an `editor` entry, since those are owned by
//! running VS Code windows.

use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

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
const METADATA_FILE_NAME: &str = "metadata.json";

/// How long [`publish_agent_host_endpoint`] waits to acquire the write lock
/// before giving up. Mirrors the TS `asyncLockAcquireTimeoutMs`, used on the
/// (infrequent, startup-time) publish path.
const PUBLISH_LOCK_ACQUIRE_TIMEOUT: Duration = Duration::from_millis(3000);
const PUBLISH_LOCK_RETRY_DELAY: Duration = Duration::from_millis(40);

/// How long [`remove_agent_host_endpoint`] waits to acquire the write lock.
/// Mirrors the TS `syncLockAcquireTimeoutMs`, kept short since this runs on
/// the shutdown path and must not noticeably delay process exit.
const CLEANUP_LOCK_ACQUIRE_TIMEOUT: Duration = Duration::from_millis(500);
const CLEANUP_LOCK_RETRY_DELAY: Duration = Duration::from_millis(10);

/// Grace period for a lock directory whose owner file has not appeared yet,
/// to avoid racing a concurrent acquirer that is mid-write.
const LOCK_OWNER_GRACE: Duration = Duration::from_millis(2000);

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

/// One entry of the shared local agent-host endpoint registry. The registry
/// file itself is a JSON array of these entries.
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

/// Deterministic ordering key for [`AgentHostServerType`] used when sorting
/// discovered endpoints, so iteration/print order is stable across runs
/// regardless of registry file write order. Standalone sorts first since it
/// is the more likely single-instance case users expect to see first.
fn server_type_sort_rank(server_type: AgentHostServerType) -> u8 {
	match server_type {
		AgentHostServerType::Standalone => 0,
		AgentHostServerType::Editor => 1,
	}
}

fn is_same_identity(a: &AgentHostEndpointMetadata, identity: &AgentHostEndpointIdentity) -> bool {
	a.server_type == identity.server_type
		&& a.pid == identity.pid
		&& a.instance_id == identity.instance_id
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

/// Parses the raw contents of the registry file (expected to be
/// `AgentHostEndpointMetadata[]`). Every entry is validated independently.
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

/// Deduplicates `entries` by `(server_type, pid, instance_id)`. If a
/// duplicate identity appears more than once (for example a crashed writer
/// left a stale copy behind before another writer's cleanup ran), the entry
/// encountered later in `entries` wins, since it is presumed to be the more
/// recently written copy. Mirrors `dedupeAgentHostEndpointMetadata` in the TS
/// reference (a `Map` keyed by identity: inserting an already-seen key
/// updates its value but keeps its original iteration position), so the
/// surviving entry's *position* is that of its first occurrence, but its
/// *value* is that of its last occurrence.
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

/// Returns `entries` with any existing entry sharing `metadata`'s identity
/// replaced by `metadata`.
fn upsert_entry(
	entries: Vec<AgentHostEndpointMetadata>,
	metadata: AgentHostEndpointMetadata,
) -> Vec<AgentHostEndpointMetadata> {
	let identity = metadata.identity();
	let mut remaining: Vec<_> = entries
		.into_iter()
		.filter(|e| !is_same_identity(e, &identity))
		.collect();
	remaining.push(metadata);
	remaining
}

/// Returns `entries` with the exact-identity-matching entry removed, if any.
/// Used on shutdown so a writer only ever removes its own entry, never a
/// newer process's entry that happens to share its PID.
fn remove_entry(
	entries: &[AgentHostEndpointMetadata],
	identity: &AgentHostEndpointIdentity,
) -> Vec<AgentHostEndpointMetadata> {
	entries
		.iter()
		.filter(|e| !is_same_identity(e, identity))
		.cloned()
		.collect()
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

/// Path to the shared registry file for `user_data_path`.
fn metadata_path(user_data_path: &Path) -> PathBuf {
	metadata_directory(user_data_path).join(METADATA_FILE_NAME)
}

fn lock_directory_path(metadata_path: &Path) -> PathBuf {
	let mut os_string = metadata_path.as_os_str().to_owned();
	os_string.push(".lock");
	PathBuf::from(os_string)
}

fn lock_owner_file_path(lock_dir: &Path) -> PathBuf {
	lock_dir.join("owner.json")
}

fn temp_write_path(metadata_path: &Path, unique_suffix: &str) -> PathBuf {
	let mut os_string = metadata_path.as_os_str().to_owned();
	os_string.push(".");
	os_string.push(unique_suffix);
	os_string.push(".tmp");
	PathBuf::from(os_string)
}

// ---- Directory security -------------------------------------------------------

/// Creates the metadata directory (if needed) and restricts it to the
/// current user (Unix: `0700`; Windows: an ACL granting only the current
/// user, `SYSTEM`, and `Administrators`), mirroring
/// `prepareLocalAgentHostEndpointMetadataDirectory` in
/// `node/localAgentHostMetadata.ts`.
fn prepare_metadata_directory(user_data_path: &Path) -> io::Result<()> {
	let dir = metadata_directory(user_data_path);
	fs::create_dir_all(&dir)?;

	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))?;
	}

	#[cfg(windows)]
	super::agent_host_registry_acl_windows::apply_owner_only_acl(&dir)?;

	Ok(())
}

// ---- Read ---------------------------------------------------------------------

/// Reads and validates every entry in the shared registry, without taking
/// the write lock. Safe to call frequently: the registry file is only ever
/// observed in a fully-written state (via atomic rename).
pub fn read_registry(
	log: &log::Logger,
	user_data_path: &Path,
) -> io::Result<Vec<AgentHostEndpointMetadata>> {
	read_registry_at(log, &metadata_path(user_data_path))
}

fn read_registry_at(log: &log::Logger, path: &Path) -> io::Result<Vec<AgentHostEndpointMetadata>> {
	let metadata = match fs::symlink_metadata(path) {
		Ok(m) => m,
		Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
		Err(e) => return Err(e),
	};
	if !metadata.is_file() {
		// Missing, a directory, or a symlink (defends against a symlink
		// swap attack; genuine entries are only ever written via rename).
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
				"Ignoring malformed agent host endpoint registry at {}: {}",
				path.display(),
				error
			);
			return Ok(Vec::new());
		}
	};

	Ok(parse_registry(log, &values))
}

// ---- Atomic write ---------------------------------------------------------------

fn write_registry_atomic(
	path: &Path,
	unique_suffix: &str,
	entries: &[AgentHostEndpointMetadata],
) -> io::Result<()> {
	let temp_path = temp_write_path(path, unique_suffix);
	let json = serde_json::to_vec(entries)?;

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

	let rename_result = fs::rename(&temp_path, path);
	// Best-effort cleanup, mirroring the TS `finally { rm force }`: a no-op
	// once the rename above succeeded.
	let _ = fs::remove_file(&temp_path);
	rename_result?;

	#[cfg(unix)]
	{
		use std::os::unix::fs::PermissionsExt;
		fs::set_permissions(path, fs::Permissions::from_mode(0o600))?;
	}

	Ok(())
}

// ---- Multi-writer lock ----------------------------------------------------------
//
// The lock is a sibling directory to metadata.json (metadata.json.lock).
// Directory creation without `recursive` is used as the exclusive-acquire
// primitive because it is atomic on every platform we support and needs no
// native/optional dependency. The lock holder's `(pid, instanceId)` is
// written into an owner file inside the directory so a contending process
// can recognize and reclaim an abandoned lock: if the recorded PID is
// confirmed dead, the lock is stale and is reclaimed immediately; otherwise
// acquisition is retried until a bounded timeout elapses, after which the
// caller must log and continue running undiscoverable rather than silently
// bypassing the lock. Mirrors `node/localAgentHostMetadata.ts`.

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LockOwner {
	pid: u32,
	instance_id: String,
}

/// Holds the sibling lock directory for the duration of a registry
/// read-modify-write. Releasing (removing the lock directory) happens on
/// drop, but only if the owner recorded on disk still matches this guard
/// (i.e. nobody else has reclaimed it as stale in the meantime).
struct RegistryLock {
	lock_dir: PathBuf,
	owner: LockOwner,
}

impl Drop for RegistryLock {
	fn drop(&mut self) {
		if let Some(current) = read_lock_owner(&self.lock_dir) {
			if current != self.owner {
				// Another process already reclaimed this lock as stale; it
				// now owns this lock's lifecycle, so leave it alone.
				return;
			}
		}
		let _ = fs::remove_dir_all(&self.lock_dir);
	}
}

fn read_lock_owner(lock_dir: &Path) -> Option<LockOwner> {
	let raw = fs::read_to_string(lock_owner_file_path(lock_dir)).ok()?;
	serde_json::from_str(&raw).ok()
}

fn is_lock_directory_stale_without_owner(lock_dir: &Path) -> bool {
	match fs::metadata(lock_dir) {
		Ok(metadata) => match metadata.modified() {
			Ok(modified) => match modified.elapsed() {
				Ok(elapsed) => elapsed > LOCK_OWNER_GRACE,
				Err(_) => false,
			},
			Err(_) => false,
		},
		// The directory disappeared already (another process reclaimed
		// it); let the caller retry acquisition.
		Err(_) => true,
	}
}

fn try_reclaim_stale_lock(lock_dir: &Path, log: &log::Logger) -> bool {
	let owner = read_lock_owner(lock_dir);
	match &owner {
		Some(owner) if process_exists(owner.pid) => return false,
		Some(_) => {}
		None => {
			if !is_lock_directory_stale_without_owner(lock_dir) {
				return false;
			}
		}
	}

	if fs::remove_dir_all(lock_dir).is_err() {
		return false;
	}

	warning!(
		log,
		"Reclaimed a stale local agent host endpoint registry lock{}",
		match owner {
			Some(o) => format!(" from PID {}", o.pid),
			None => String::new(),
		}
	);
	true
}

fn acquire_registry_lock(
	lock_dir: &Path,
	owner: &LockOwner,
	timeout: Duration,
	retry_delay: Duration,
	log: &log::Logger,
) -> io::Result<Option<RegistryLock>> {
	let deadline = Instant::now() + timeout;
	loop {
		match fs::create_dir(lock_dir) {
			Ok(()) => {
				write_lock_owner(lock_dir, owner)?;
				return Ok(Some(RegistryLock {
					lock_dir: lock_dir.to_path_buf(),
					owner: owner.clone(),
				}));
			}
			Err(e) if e.kind() == io::ErrorKind::AlreadyExists => {
				if try_reclaim_stale_lock(lock_dir, log) {
					continue;
				}
				if Instant::now() >= deadline {
					return Ok(None);
				}
				std::thread::sleep(retry_delay);
			}
			Err(e) => return Err(e),
		}
	}
}

fn write_lock_owner(lock_dir: &Path, owner: &LockOwner) -> io::Result<()> {
	let mut open_options = OpenOptions::new();
	open_options.write(true).create(true).truncate(true);
	#[cfg(unix)]
	{
		use std::os::unix::fs::OpenOptionsExt;
		open_options.mode(0o600);
	}
	let mut file: File = open_options.open(lock_owner_file_path(lock_dir))?;
	file.write_all(serde_json::to_string(owner)?.as_bytes())
}

// ---- Publish / remove -----------------------------------------------------------

/// Upserts `metadata` into the shared local agent host endpoint registry.
///
/// Multiple processes (editor windows and the standalone `code agent host`
/// CLI) can publish to the same registry file concurrently, so this
/// acquires the sibling lock first, serializing the read-prune-upsert-write
/// sequence across all writers. Readers remain lock-free because the final
/// write is an atomic rename.
///
/// Returns an error if the lock cannot be acquired within a bounded timeout,
/// or if any filesystem operation fails; callers MUST treat that as
/// "continue running, but undiscoverable" and must not fall back to a
/// non-atomic write.
pub fn publish_agent_host_endpoint(
	log: &log::Logger,
	user_data_path: &Path,
	metadata: &AgentHostEndpointMetadata,
) -> io::Result<()> {
	prepare_metadata_directory(user_data_path)?;
	let path = metadata_path(user_data_path);
	let lock_dir = lock_directory_path(&path);
	let owner = LockOwner {
		pid: metadata.pid,
		instance_id: metadata.instance_id.clone(),
	};

	let _lock = acquire_registry_lock(
		&lock_dir,
		&owner,
		PUBLISH_LOCK_ACQUIRE_TIMEOUT,
		PUBLISH_LOCK_RETRY_DELAY,
		log,
	)?
	.ok_or_else(|| {
		io::Error::new(
			io::ErrorKind::TimedOut,
			format!(
				"Timed out acquiring the local agent host endpoint registry lock at {}",
				lock_dir.display()
			),
		)
	})?;

	let current = read_registry_at(log, &path)?;
	let live = prune_dead_entries(log, current);
	let deduped = dedupe_entries(live);
	let next = upsert_entry(deduped, metadata.clone());
	write_registry_atomic(&path, &metadata.instance_id, &next)
}

/// Removes exactly `identity`'s `(type, pid, instanceId)` entry from the
/// registry, reacquiring the write lock first. Deletes the file entirely
/// only when the resulting registry is empty. Best-effort: failures are
/// logged, never returned as fatal, so process shutdown is never blocked by
/// cleanup.
pub fn remove_agent_host_endpoint(
	log: &log::Logger,
	user_data_path: &Path,
	identity: &AgentHostEndpointIdentity,
) {
	let path = metadata_path(user_data_path);
	let lock_dir = lock_directory_path(&path);
	let owner = LockOwner {
		pid: identity.pid,
		instance_id: identity.instance_id.clone(),
	};

	let lock = match acquire_registry_lock(
		&lock_dir,
		&owner,
		CLEANUP_LOCK_ACQUIRE_TIMEOUT,
		CLEANUP_LOCK_RETRY_DELAY,
		log,
	) {
		Ok(Some(lock)) => lock,
		Ok(None) => {
			warning!(
				log,
				"Timed out acquiring the local agent host endpoint registry lock while removing our entry from {}",
				path.display()
			);
			return;
		}
		Err(e) => {
			warning!(
				log,
				"Failed to acquire the local agent host endpoint registry lock: {}",
				e
			);
			return;
		}
	};

	let result = (|| -> io::Result<()> {
		let current = read_registry_at(log, &path)?;
		let remaining = remove_entry(&current, identity);
		if remaining.len() == current.len() {
			return Ok(());
		}
		if remaining.is_empty() {
			match fs::remove_file(&path) {
				Ok(()) => Ok(()),
				Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
				Err(e) => Err(e),
			}
		} else {
			write_registry_atomic(&path, &identity.instance_id, &remaining)
		}
	})();

	if let Err(e) = result {
		warning!(
			log,
			"Failed to remove our entry from the local agent host endpoint registry: {}",
			e
		);
	}

	drop(lock);
}

// ---- Endpoint enumeration ---------------------------------------------------------

/// Reads the registry and returns every live endpoint (both `editor` and
/// `standalone`, both `socket`/pipe and `tcp` addresses), deduped by
/// identity and pruned of dead-process entries, in a stable deterministic
/// order (standalone before editor, then by `instanceId`).
///
/// This is the general-purpose discovery primitive backing `code agent
/// ps|logs|stop`'s auto-discovery: every live entry here is a candidate
/// host to query, not just the one this process would reuse for `code
/// agent host`.
pub fn list_live_endpoints(
	log: &log::Logger,
	user_data_path: &Path,
) -> Vec<AgentHostEndpointMetadata> {
	let entries = match read_registry(log, user_data_path) {
		Ok(entries) => entries,
		Err(e) => {
			debug!(
				log,
				"Could not read the local agent host endpoint registry at {}: {}",
				metadata_path(user_data_path).display(),
				e
			);
			return Vec::new();
		}
	};

	let live = prune_dead_entries(log, entries);
	let mut deduped = dedupe_entries(live);
	deduped.sort_by(|a, b| {
		server_type_sort_rank(a.server_type)
			.cmp(&server_type_sort_rank(b.server_type))
			.then_with(|| a.instance_id.cmp(&b.instance_id))
	});
	deduped
}

/// Like [`list_live_endpoints`], but restricted to `standalone` entries.
/// `editor` entries are never included here: they are owned by running VS
/// Code windows and must never be selected, replaced, or killed by the
/// standalone CLI. Used by `code agent kill`'s multi-instance
/// disambiguation as well as by [`select_live_standalone_endpoint`].
pub fn list_live_standalone_endpoints(
	log: &log::Logger,
	user_data_path: &Path,
) -> Vec<AgentHostEndpointMetadata> {
	list_live_endpoints(log, user_data_path)
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

/// Reads the registry and returns a live `standalone` entry to reuse, if
/// any. `editor` entries are never considered: they are owned by running VS
/// Code windows and must never be selected or replaced by the standalone
/// CLI. Only `tcp` entries are considered, since this helper backs `code
/// agent host`'s single-target TCP reuse path. If more than one live
/// standalone entry exists, selection is deterministic (lowest
/// `instanceId`) and a warning is logged recommending `--address` to
/// disambiguate, since there is currently no dedicated "target this
/// instance" flag.
///
/// Callers that want *every* live standalone entry (e.g. `code agent
/// kill`'s multi-instance disambiguation, which must offer socket/pipe
/// entries too) should use [`list_live_standalone_endpoints`] instead.
pub fn select_live_standalone_endpoint(
	log: &log::Logger,
	user_data_path: &Path,
) -> Option<LiveStandaloneEndpoint> {
	let mut live: Vec<LiveStandaloneEndpoint> = list_live_standalone_endpoints(log, user_data_path)
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
		live.sort_by(|a, b| a.instance_id.cmp(&b.instance_id));
		warning!(
			log,
			"Multiple live standalone agent hosts are registered; selecting instance {} deterministically. Pass --address to target a specific one.",
			live[0].instance_id
		);
	}

	live.into_iter().next()
}

#[cfg(test)]
mod tests {
	use super::*;

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
	fn upsert_replaces_only_matching_identity() {
		let entries = vec![standalone(1, "a", 100), standalone(2, "b", 200)];
		let next = upsert_entry(entries, standalone(1, "a", 999));

		assert_eq!(next.len(), 2);
		let a = next.iter().find(|e| e.instance_id == "a").unwrap();
		assert_eq!(
			a.endpoint,
			AgentHostEndpointAddress::Tcp {
				host: "127.0.0.1".to_string(),
				port: 999
			}
		);
	}

	#[test]
	fn upsert_preserves_other_writers_entries() {
		let entries = vec![standalone(1, "a", 100)];
		let next = upsert_entry(entries, standalone(2, "b", 200));

		assert_eq!(next.len(), 2);
		assert!(next.iter().any(|e| e.instance_id == "a"));
		assert!(next.iter().any(|e| e.instance_id == "b"));
	}

	#[test]
	fn remove_entry_only_removes_exact_identity() {
		let entries = vec![standalone(1, "a", 100), standalone(1, "a-newer", 200)];
		let identity = AgentHostEndpointIdentity {
			server_type: AgentHostServerType::Standalone,
			pid: 1,
			instance_id: "a".to_string(),
		};
		let remaining = remove_entry(&entries, &identity);

		assert_eq!(remaining.len(), 1);
		assert_eq!(remaining[0].instance_id, "a-newer");
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
	fn publish_prunes_dead_entries_from_other_writers() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let dead = standalone(u32::MAX - 1, "dead", 100);
		publish_agent_host_endpoint(&log, dir.path(), &dead).unwrap();

		let live = standalone(std::process::id(), "live", 200);
		publish_agent_host_endpoint(&log, dir.path(), &live).unwrap();

		let entries = read_registry(&log::Logger::test(), dir.path()).unwrap();
		assert_eq!(entries, vec![live]);
	}

	#[test]
	fn remove_deletes_file_when_registry_becomes_empty() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let metadata = standalone(std::process::id(), "instance-a", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &metadata).unwrap();

		remove_agent_host_endpoint(&log, dir.path(), &metadata.identity());

		assert!(!metadata_path(dir.path()).exists());
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
		// Simulates PID reuse: our entry was already overwritten by a
		// different instanceId sharing our old PID. Removal must target
		// the exact (type, pid, instanceId) tuple, never the PID alone.
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
	fn select_live_standalone_ignores_editor_entries() {
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

		assert_eq!(select_live_standalone_endpoint(&log, dir.path()), None);
	}

	#[test]
	fn select_live_standalone_returns_live_entry() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let entry = standalone(std::process::id(), "instance-a", 8080);
		publish_agent_host_endpoint(&log, dir.path(), &entry).unwrap();

		let selected = select_live_standalone_endpoint(&log, dir.path()).unwrap();
		assert_eq!(selected.pid, std::process::id());
		assert_eq!(selected.instance_id, "instance-a");
		assert_eq!(selected.host, "127.0.0.1");
		assert_eq!(selected.port, 8080);
	}

	#[test]
	fn select_live_standalone_is_deterministic_with_multiple_live_entries() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let first = standalone(std::process::id(), "b-instance", 8080);
		let second = standalone(std::process::id(), "a-instance", 9090);
		publish_agent_host_endpoint(&log, dir.path(), &first).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &second).unwrap();

		let selected = select_live_standalone_endpoint(&log, dir.path()).unwrap();
		assert_eq!(selected.instance_id, "a-instance");
	}

	#[test]
	fn acquire_registry_lock_reclaims_stale_lock_from_dead_pid() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let path = metadata_path(dir.path());
		let lock_dir = lock_directory_path(&path);
		fs::create_dir_all(lock_dir.parent().unwrap()).unwrap();
		fs::create_dir(&lock_dir).unwrap();
		write_lock_owner(
			&lock_dir,
			&LockOwner {
				pid: u32::MAX - 1,
				instance_id: "dead-owner".to_string(),
			},
		)
		.unwrap();

		let owner = LockOwner {
			pid: std::process::id(),
			instance_id: "new-owner".to_string(),
		};
		let lock = acquire_registry_lock(
			&lock_dir,
			&owner,
			Duration::from_millis(500),
			Duration::from_millis(10),
			&log,
		)
		.unwrap();

		assert!(lock.is_some());
	}

	#[test]
	fn acquire_registry_lock_times_out_when_holder_is_alive() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let path = metadata_path(dir.path());
		let lock_dir = lock_directory_path(&path);
		fs::create_dir_all(lock_dir.parent().unwrap()).unwrap();
		fs::create_dir(&lock_dir).unwrap();
		write_lock_owner(
			&lock_dir,
			&LockOwner {
				pid: std::process::id(),
				instance_id: "alive-owner".to_string(),
			},
		)
		.unwrap();

		let owner = LockOwner {
			pid: std::process::id(),
			instance_id: "contender".to_string(),
		};
		let lock = acquire_registry_lock(
			&lock_dir,
			&owner,
			Duration::from_millis(60),
			Duration::from_millis(20),
			&log,
		)
		.unwrap();

		assert!(lock.is_none());
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

	#[test]
	fn list_live_endpoints_includes_editor_and_standalone_sorted_stably() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let pid = std::process::id();
		let ed = editor(pid, "editor-b", "/tmp/editor-b.sock");
		let sa = standalone(pid, "standalone-a", 8080);
		// Publish editor first so we can assert sort order isn't just
		// insertion order.
		publish_agent_host_endpoint(&log, dir.path(), &ed).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &sa).unwrap();

		let live = list_live_endpoints(&log, dir.path());

		assert_eq!(live.len(), 2);
		// Standalone sorts before editor per `server_type_sort_rank`.
		assert_eq!(live[0].instance_id, "standalone-a");
		assert_eq!(live[1].instance_id, "editor-b");
	}

	#[test]
	fn list_live_endpoints_excludes_dead_and_dedupes() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let dead_pid = u32::MAX - 1;
		let dead = standalone(dead_pid, "dead", 100);
		let live_entry = standalone(std::process::id(), "live", 200);
		publish_agent_host_endpoint(&log, dir.path(), &dead).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &live_entry).unwrap();

		let live = list_live_endpoints(&log, dir.path());

		assert_eq!(live, vec![live_entry]);
	}

	#[test]
	fn list_live_endpoints_returns_empty_when_registry_missing() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();

		assert_eq!(list_live_endpoints(&log, dir.path()), Vec::new());
	}

	#[test]
	fn list_live_standalone_endpoints_excludes_editor_but_includes_socket_standalones() {
		let dir = tempfile::tempdir().unwrap();
		let log = log::Logger::test();
		let pid = std::process::id();
		let ed = editor(pid, "editor-a", "/tmp/editor-a.sock");
		let sa_tcp = standalone(pid, "standalone-tcp", 8080);
		let mut sa_socket = standalone(pid, "standalone-socket", 0);
		sa_socket.endpoint = AgentHostEndpointAddress::Socket {
			path: "/tmp/standalone.sock".to_string(),
		};
		publish_agent_host_endpoint(&log, dir.path(), &ed).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &sa_tcp).unwrap();
		publish_agent_host_endpoint(&log, dir.path(), &sa_socket).unwrap();

		let standalones = list_live_standalone_endpoints(&log, dir.path());

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
