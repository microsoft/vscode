/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::sync::Arc;

use indicatif::ProgressBar;

use crate::{
	constants::PRODUCT_NAME_LONG,
	self_update::SelfUpdate,
	update_service::UpdateService,
	util::{errors::AnyError, http::ReqwestSimpleHttp, input::ProgressBarReporter},
};

use super::{args::StandaloneUpdateArgs, CommandContext};

pub async fn update(ctx: CommandContext, args: StandaloneUpdateArgs) -> Result<i32, AnyError> {
	let update_service = UpdateService::new(
		ctx.log.clone(),
		Arc::new(ReqwestSimpleHttp::with_client(ctx.http.clone())),
	);
	let update_service = SelfUpdate::new(&update_service)?;

	let _ = update_service.cleanup_old_update();

	let current_version = update_service.get_current_release().await?;
	if update_service.is_up_to_date_with(&current_version) {
		ctx.log.result(format!(
			"{} is already to to date ({})",
			PRODUCT_NAME_LONG, current_version.commit
		));
		return Ok(1);
	}

	if args.check {
		ctx.log
			.result(format!("Update to {} is available", current_version));
		return Ok(0);
	}

	let pb = ProgressBar::new(1);
	pb.set_message("Downloading...");
	update_service
		.do_update(&current_version, ProgressBarReporter::from(pb))
		.await?;
	ctx.log
		.result(format!("Successfully updated to {}", current_version));

	Ok(0)
}
