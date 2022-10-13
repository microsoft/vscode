/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{
	desktop::{CodeVersionManager, RequestedVersion},
	log,
	update_service::UpdateService,
	util::{errors::AnyError, prereqs::PreReqChecker},
};

use super::{
	args::{OutputFormatOptions, UninstallVersionArgs, UseVersionArgs},
	output::{Column, OutputTable},
	CommandContext,
};

pub async fn switch_to(ctx: CommandContext, args: UseVersionArgs) -> Result<i32, AnyError> {
	let platform = PreReqChecker::new().verify().await?;
	let vm = CodeVersionManager::new(&ctx.paths, platform);
	let version = RequestedVersion::try_from(args.name.as_str())?;

	if !args.reinstall && vm.try_get_entrypoint(&version).await.is_some() {
		vm.set_preferred_version(&version)?;
		print_now_using(&ctx.log, &version);
		return Ok(0);
	}

	let update_service = UpdateService::new(ctx.log.clone(), ctx.http.clone());
	vm.install(&update_service, &version).await?;
	vm.set_preferred_version(&version)?;
	print_now_using(&ctx.log, &version);
	Ok(0)
}

pub async fn list(ctx: CommandContext, args: OutputFormatOptions) -> Result<i32, AnyError> {
	let platform = PreReqChecker::new().verify().await?;
	let vm = CodeVersionManager::new(&ctx.paths, platform);

	let mut name = Column::new("Installation");
	let mut command = Column::new("Command");
	for version in vm.list() {
		name.add_row(version.to_string());
		command.add_row(version.get_command());
	}
	args.format
		.print_table(OutputTable::new(vec![name, command]))
		.ok();

	Ok(0)
}

pub async fn uninstall(ctx: CommandContext, args: UninstallVersionArgs) -> Result<i32, AnyError> {
	let platform = PreReqChecker::new().verify().await?;
	let vm = CodeVersionManager::new(&ctx.paths, platform);
	let version = RequestedVersion::try_from(args.name.as_str())?;
	vm.uninstall(&version).await?;
	ctx.log
		.result(&format!("VS Code {} uninstalled successfully", version));
	Ok(0)
}

fn print_now_using(log: &log::Logger, version: &RequestedVersion) {
	log.result(&format!("Now using VS Code {}", version));
}
