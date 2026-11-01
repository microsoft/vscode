/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::sync::Arc;

use super::args::{AgentCertificateSubcommand, AgentSandboxArgs, AgentSandboxSubcommand};
use super::CommandContext;
use crate::constants::{IS_INTERACTIVE_CLI, VSCODE_CLI_COMMIT, VSCODE_CLI_QUALITY};
use crate::options::Quality;
use crate::tunnels::code_server::{CodeServerArgs, ServerBuilder, ServerParamsRaw};
use crate::tunnels::legal;
use crate::util::errors::{wrap, AnyError};
use crate::util::http::ReqwestSimpleHttp;
use crate::util::input::prompt_yn;
use crate::util::prereqs::PreReqChecker;

pub async fn run(ctx: CommandContext, args: AgentSandboxArgs) -> Result<i32, AnyError> {
	let dev_override = option_env!("VSCODE_CLI_OVERRIDE_SERVER_PATH").is_some();
	let commit = VSCODE_CLI_COMMIT
		.or(if dev_override { Some("dev") } else { None })
		.ok_or_else(|| {
			wrap(
				"Missing matching server",
				"Development certificate commands require VSCODE_CLI_OVERRIDE_SERVER_PATH to point to a matching server when building the CLI.",
			)
		})?;
	let AgentSandboxSubcommand::Ca(args) = args.subcommand;
	let (operation, confirmation) = match args.subcommand {
		AgentCertificateSubcommand::Create => ("create", None),
		AgentCertificateSubcommand::Status => ("status", None),
		AgentCertificateSubcommand::Trust { yes } => (
			"trust",
			(!yes).then_some("Trust the sandbox CA in this OS user's COPILOT_HOME on this computer? On Windows this changes machine-wide trust. OS authorization may be required."),
		),
		AgentCertificateSubcommand::Remove { yes } => (
			"remove",
			(!yes).then_some("Remove OS trust for the sandbox CA in this OS user's COPILOT_HOME on this computer? The stored CA and private key will remain. Proxy connections may fail. On Windows this changes machine-wide trust. OS authorization may be required."),
		),
	};
	if let Some(confirmation) = confirmation {
		if !*IS_INTERACTIVE_CLI {
			return Err(wrap(
				"Confirmation required",
				format!("Use '{operation} --yes' to confirm changing OS trust. OS authorization may still be required."),
			).into());
		}
		if !prompt_yn(confirmation)? {
			ctx.log
				.result(format!("Certificate {operation} cancelled."));
			return Ok(1);
		}
	}

	legal::require_consent(&ctx.paths, args.accept_server_license_terms)?;
	let platform = PreReqChecker::new().verify().await?;
	let http = Arc::new(ReqwestSimpleHttp::with_client(ctx.http.clone()));
	let params = ServerParamsRaw {
		commit_id: Some(commit.to_owned()),
		quality: Quality::try_from(VSCODE_CLI_QUALITY.unwrap_or("insiders"))
			.map_err(|e| wrap(e, "Invalid CLI quality"))?,
		code_server_args: CodeServerArgs::default(),
		headless: true,
		platform,
	}
	.resolve(&ctx.log, http.clone())
	.await?;
	let builder = ServerBuilder::new(&ctx.log, &params, &ctx.paths, http);
	if !dev_override {
		builder.setup().await?;
	}
	builder.run_agent_certificate(operation).await
}
