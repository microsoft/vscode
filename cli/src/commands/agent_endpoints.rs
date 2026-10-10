/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! `code agent endpoints`: a machine-readable dump of every live
//! schema-v2 agent-host registry endpoint, intended to be consumed by
//! other tooling (e.g. an SSH-based remote bridge) rather than read by a
//! human. Exactly one JSON document is written to stdout; anything else
//! this command has to say (there normally is nothing) goes to
//! stderr/logging, never interleaved with the JSON.

use serde::Serialize;

use crate::tunnels::agent_host_registry::AgentHostEndpointMetadata;
use crate::tunnels::user_data_path::resolve_user_data_path;
use crate::util::errors::{wrap, AnyError};

use super::agent_discovery;
use super::args::AgentEndpointsArgs;
use super::CommandContext;

/// The single JSON document `code agent endpoints` writes to stdout.
///
/// `endpoints` intentionally reuses [`AgentHostEndpointMetadata`]
/// verbatim (rather than a slimmed-down projection like `agent ps`'s
/// `HostJson`): this command's whole purpose is to hand every field —
/// including `connectionToken` — to a trusted, already-authenticated
/// caller (e.g. something bridging in over SSH) that needs the full
/// credentials to dial the endpoint itself.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct EndpointsDocument {
	/// The resolved user data path this registry was read from, so
	/// callers that also need to act on that directory (e.g. spawn
	/// `code agent host --user-data-dir <this>`) don't need to
	/// re-implement the resolution rules themselves.
	user_data_path: String,
	endpoints: Vec<AgentHostEndpointMetadata>,
}

/// Prints every live agent-host endpoint (both `editor` and
/// `standalone`, both socket/pipe and TCP) as a single JSON document.
/// Never errors just because no endpoint is live: an empty `endpoints`
/// array is a valid, meaningful answer ("nothing is running right now"),
/// distinct from failing to resolve/read the registry itself.
pub async fn agent_endpoints(
	mut ctx: CommandContext,
	args: AgentEndpointsArgs,
) -> Result<i32, AnyError> {
	ctx.log = crate::log::Logger::new(crate::log::Level::Off);
	let user_data_path = resolve_user_data_path(args.user_data_dir.as_deref());
	let endpoints =
		agent_discovery::discover_live_endpoints(&ctx, args.user_data_dir.as_deref()).await;

	let doc = EndpointsDocument {
		user_data_path: user_data_path.display().to_string(),
		endpoints,
	};

	let json =
		serde_json::to_string(&doc).map_err(|e| wrap(e, "failed to serialize agent endpoints"))?;

	// Deliberately not `output::print_paged`: this output is
	// machine-readable and must always be exactly one JSON document
	// written verbatim to stdout, regardless of terminal height or
	// `$PAGER`.
	println!("{json}");

	Ok(0)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::log;
	use crate::tunnels::agent_host_registry::{self, AgentHostEndpointMetadata};
	use tokio::net::TcpListener;

	#[test]
	fn endpoints_document_serializes_with_camel_case_and_full_metadata() {
		let entry = AgentHostEndpointMetadata::new_standalone(
			42,
			"instance-a".to_string(),
			"127.0.0.1".to_string(),
			8080,
			"super-secret-token".to_string(),
			"0.1.0".to_string(),
			None,
			None,
		);
		let doc = EndpointsDocument {
			user_data_path: "/tmp/user-data".to_string(),
			endpoints: vec![entry],
		};

		let json = serde_json::to_string(&doc).unwrap();
		assert!(
			json.contains(r#""userDataPath":"/tmp/user-data""#),
			"{json}"
		);
		assert!(json.contains(r#""instanceId":"instance-a""#), "{json}");
		// The whole point of this command is to include the connection
		// token, unlike `agent ps`'s deliberately slimmer JSON shape.
		assert!(
			json.contains(r#""connectionToken":"super-secret-token""#),
			"{json}"
		);
	}

	#[tokio::test]
	async fn agent_endpoints_uses_user_data_dir_override_to_find_registry() {
		let dir = tempfile::tempdir().unwrap();
		let user_data_path = dir.path().join("custom-user-data");
		let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
		let port = listener.local_addr().unwrap().port();

		let entry = AgentHostEndpointMetadata::new_standalone(
			std::process::id(),
			"instance-b".to_string(),
			"127.0.0.1".to_string(),
			port,
			"tok".to_string(),
			"0.1.0".to_string(),
			None,
			None,
		);
		agent_host_registry::publish_agent_host_endpoint(
			&log::Logger::test(),
			&user_data_path,
			&entry,
		)
		.unwrap();

		let args = AgentEndpointsArgs {
			user_data_dir: Some(user_data_path.to_string_lossy().to_string()),
		};
		let resolved = resolve_user_data_path(args.user_data_dir.as_deref());
		assert_eq!(resolved, user_data_path);

		let endpoints =
			agent_host_registry::list_live_endpoints(&log::Logger::test(), &resolved).await;
		assert_eq!(endpoints.len(), 1);
		assert_eq!(endpoints[0].instance_id, "instance-b");
	}
}
