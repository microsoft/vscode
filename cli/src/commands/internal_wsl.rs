/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{
	tunnels::{serve_wsl, shutdown_signal::ShutdownRequest},
	util::{errors::AnyError, prereqs::PreReqChecker},
};

use super::CommandContext;

pub async fn serve(ctx: CommandContext) -> Result<i32, AnyError> {
	let signal = ShutdownRequest::create_rx([ShutdownRequest::CtrlC]);
	let platform = spanf!(
		ctx.log,
		ctx.log.span("prereq"),
		PreReqChecker::new().verify()
	)?;

	serve_wsl(
		ctx.log,
		ctx.paths,
		(&ctx.args).into(),
		platform,
		ctx.http,
		signal,
	)
	.await?;

	Ok(0)
}
