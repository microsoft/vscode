/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use std::collections::HashMap;

use crate::{
	constants::{PROTOCOL_VERSION, VSCODE_CLI_VERSION},
	options::Quality,
	update_service::Platform,
};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Debug)]
#[serde(tag = "method", content = "params", rename_all = "camelCase")]
#[allow(non_camel_case_types)]
pub enum ClientRequestMethod<'a> {
	servermsg(RefServerMessageParams<'a>),
	serverclose(ServerClosedParams),
	serverlog(ServerLog<'a>),
	makehttpreq(HttpRequestParams<'a>),
	version(VersionResponse),
}

#[derive(Deserialize, Debug)]
pub struct HttpBodyParams {
	#[serde(with = "serde_bytes")]
	pub segment: Vec<u8>,
	pub complete: bool,
	pub req_id: u32,
}

#[derive(Serialize, Debug)]
pub struct HttpRequestParams<'a> {
	pub url: &'a str,
	pub method: &'static str,
	pub req_id: u32,
}

#[derive(Deserialize, Debug)]
pub struct HttpHeadersParams {
	pub status_code: u16,
	pub headers: Vec<(String, String)>,
	pub req_id: u32,
}

#[derive(Deserialize, Debug)]
pub struct ForwardParams {
	pub port: u16,
	#[serde(default)]
	pub public: bool,
}

#[derive(Deserialize, Debug)]
pub struct UnforwardParams {
	pub port: u16,
}

#[derive(Serialize)]
pub struct ForwardResult {
	pub uri: String,
}

#[derive(Deserialize, Debug)]
pub struct ServeParams {
	pub socket_id: u16,
	pub commit_id: Option<String>,
	pub quality: Quality,
	pub extensions: Vec<String>,
	/// Optional preferred connection token.
	#[serde(default)]
	pub connection_token: Option<String>,
	#[serde(default)]
	pub use_local_download: bool,
	/// If true, the client and server should gzip servermsg's sent in either direction.
	#[serde(default)]
	pub compress: bool,
}

#[derive(Deserialize, Serialize, Debug)]
pub struct EmptyObject {}

#[derive(Serialize, Deserialize, Debug)]
pub struct UpdateParams {
	pub do_update: bool,
}

#[derive(Deserialize, Debug)]
pub struct ServerMessageParams {
	pub i: u16,
	#[serde(with = "serde_bytes")]
	pub body: Vec<u8>,
}

#[derive(Serialize, Debug)]
pub struct ServerClosedParams {
	pub i: u16,
}

#[derive(Serialize, Debug)]
pub struct RefServerMessageParams<'a> {
	pub i: u16,
	#[serde(with = "serde_bytes")]
	pub body: &'a [u8],
}

#[derive(Serialize)]
pub struct UpdateResult {
	pub up_to_date: bool,
	pub did_update: bool,
}

#[derive(Serialize, Debug)]
pub struct ToClientRequest<'a> {
	pub id: Option<u32>,
	#[serde(flatten)]
	pub params: ClientRequestMethod<'a>,
}

#[derive(Debug, Default, Serialize)]
pub struct ServerLog<'a> {
	pub line: &'a str,
	pub level: u8,
}

#[derive(Serialize)]
pub struct GetHostnameResponse {
	pub value: String,
}

#[derive(Serialize)]
pub struct GetEnvResponse {
	pub env: HashMap<String, String>,
	pub os_platform: &'static str,
	pub os_release: String,
}

/// Method: `kill`. Sends a generic, platform-specific kill command to the process.
#[derive(Deserialize)]
pub struct SysKillRequest {
	pub pid: u32,
}

#[derive(Serialize)]
pub struct SysKillResponse {
	pub success: bool,
}

/// Methods: `fs_read`/`fs_write`/`fs_rm`/`fs_mkdirp`/`fs_stat`
///  - fs_read: reads into a stream returned from the method,
///  - fs_write: writes from a stream passed to the method.
///  - fs_rm: recursively removes the file
///  - fs_mkdirp: recursively creates the directory
///  - fs_readdir: reads directory contents
///  - fs_stat: stats the given path
///  - fs_connect: connect to the given unix or named pipe socket, streaming
///    data in and out from the method's stream.
#[derive(Deserialize)]
pub struct FsSinglePathRequest {
	pub path: String,
}

#[derive(Serialize)]
pub enum FsFileKind {
	#[serde(rename = "dir")]
	Directory,
	#[serde(rename = "file")]
	File,
	#[serde(rename = "link")]
	Link,
}

impl From<std::fs::FileType> for FsFileKind {
	fn from(kind: std::fs::FileType) -> Self {
		if kind.is_dir() {
			Self::Directory
		} else if kind.is_file() {
			Self::File
		} else if kind.is_symlink() {
			Self::Link
		} else {
			unreachable!()
		}
	}
}

#[derive(Serialize, Default)]
pub struct FsStatResponse {
	pub exists: bool,
	pub size: Option<u64>,
	#[serde(rename = "type")]
	pub kind: Option<FsFileKind>,
}

#[derive(Serialize)]
pub struct FsReadDirResponse {
	pub contents: Vec<FsReadDirEntry>,
}

#[derive(Serialize)]
pub struct FsReadDirEntry {
	pub name: String,
	#[serde(rename = "type")]
	pub kind: Option<FsFileKind>,
}

/// Method: `fs_reaname`. Renames a file.
#[derive(Deserialize)]
pub struct FsRenameRequest {
	pub from_path: String,
	pub to_path: String,
}

/// Method: `net_connect`. Connects to a port.
#[derive(Deserialize)]
pub struct NetConnectRequest {
	pub port: u16,
	pub host: String,
}

#[derive(Deserialize, Debug)]
pub struct CallServerHttpParams {
	pub path: String,
	pub method: String,
	pub headers: HashMap<String, String>,
	pub body: Option<Vec<u8>>,
}

#[derive(Serialize)]
pub struct CallServerHttpResult {
	pub status: u16,
	#[serde(with = "serde_bytes")]
	pub body: Vec<u8>,
	pub headers: HashMap<String, String>,
}

#[derive(Serialize, Debug)]
pub struct VersionResponse {
	pub version: &'static str,
	pub protocol_version: u32,
}

impl Default for VersionResponse {
	fn default() -> Self {
		Self {
			version: VSCODE_CLI_VERSION.unwrap_or("dev"),
			protocol_version: PROTOCOL_VERSION,
		}
	}
}

#[derive(Deserialize)]
pub struct SpawnParams {
	pub command: String,
	pub args: Vec<String>,
	#[serde(default)]
	pub cwd: Option<String>,
	#[serde(default)]
	pub env: HashMap<String, String>,
}

#[derive(Deserialize)]
pub struct AcquireCliParams {
	pub platform: Platform,
	pub quality: Quality,
	pub commit_id: Option<String>,
	#[serde(flatten)]
	pub spawn: SpawnParams,
}

#[derive(Serialize)]
pub struct SpawnResult {
	pub message: String,
	pub exit_code: i32,
}

pub const METHOD_CHALLENGE_ISSUE: &str = "challenge_issue";
pub const METHOD_CHALLENGE_VERIFY: &str = "challenge_verify";

#[derive(Serialize, Deserialize)]
pub struct ChallengeIssueParams {
	pub token: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct ChallengeIssueResponse {
	pub challenge: String,
}

#[derive(Deserialize, Serialize)]
pub struct ChallengeVerifyParams {
	pub response: String,
}

#[derive(Serialize, Deserialize, PartialEq, Eq, Copy, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum PortPrivacy {
	Public,
	Private,
}

#[derive(Serialize, Deserialize, PartialEq, Copy, Eq, Clone, Debug)]
#[serde(rename_all = "lowercase")]
pub enum PortProtocol {
	Auto,
	Http,
	Https,
}

impl std::fmt::Display for PortProtocol {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		write!(f, "{}", self.to_contract_str())
	}
}

impl Default for PortProtocol {
	fn default() -> Self {
		Self::Auto
	}
}

impl PortProtocol {
	pub fn to_contract_str(&self) -> &'static str {
		match *self {
			Self::Auto => tunnels::contracts::TUNNEL_PROTOCOL_AUTO,
			Self::Http => tunnels::contracts::TUNNEL_PROTOCOL_HTTP,
			Self::Https => tunnels::contracts::TUNNEL_PROTOCOL_HTTPS,
		}
	}
}

pub mod forward_singleton {
	use serde::{Deserialize, Serialize};

	use super::{PortPrivacy, PortProtocol};

	pub const METHOD_SET_PORTS: &str = "set_ports";

	#[derive(Serialize, Deserialize, PartialEq, Eq, Clone, Debug)]
	pub struct PortRec {
		pub number: u16,
		pub privacy: PortPrivacy,
		pub protocol: PortProtocol,
	}

	pub type PortList = Vec<PortRec>;

	#[derive(Serialize, Deserialize)]
	pub struct SetPortsParams {
		pub ports: PortList,
	}

	#[derive(Serialize, Deserialize)]
	pub struct SetPortsResponse {
		pub port_format: Option<String>,
	}
}

pub mod singleton {
	use crate::log;
	use chrono::{DateTime, Utc};
	use serde::{Deserialize, Serialize};

	pub const METHOD_RESTART: &str = "restart";
	pub const METHOD_SHUTDOWN: &str = "shutdown";
	pub const METHOD_STATUS: &str = "status";
	pub const METHOD_LOG: &str = "log";
	pub const METHOD_LOG_REPLY_DONE: &str = "log_done";

	#[derive(Serialize)]
	pub struct LogMessage<'a> {
		pub level: Option<log::Level>,
		pub prefix: &'a str,
		pub message: &'a str,
	}

	#[derive(Deserialize)]
	pub struct LogMessageOwned {
		pub level: Option<log::Level>,
		pub prefix: String,
		pub message: String,
	}

	#[derive(Serialize, Deserialize, Clone, Default)]
	pub struct StatusWithTunnelName {
		pub name: Option<String>,
		#[serde(flatten)]
		pub status: Status,
	}

	#[derive(Serialize, Deserialize, Clone)]
	pub struct Status {
		pub started_at: DateTime<Utc>,
		pub tunnel: TunnelState,
		pub last_connected_at: Option<DateTime<Utc>>,
		pub last_disconnected_at: Option<DateTime<Utc>>,
		pub last_fail_reason: Option<String>,
	}

	impl Default for Status {
		fn default() -> Self {
			Self {
				started_at: Utc::now(),
				tunnel: TunnelState::Disconnected,
				last_connected_at: None,
				last_disconnected_at: None,
				last_fail_reason: None,
			}
		}
	}

	#[derive(Deserialize, Serialize, Debug)]
	pub struct LogReplayFinished {}

	#[derive(Deserialize, Serialize, Debug, Default, Clone)]
	pub enum TunnelState {
		#[default]
		Disconnected,
		Connected,
	}
}
