/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::path::{Path, PathBuf};

use crate::{
	desktop::{prompt_to_install, CodeVersionManager, RequestedVersion},
	log,
	util::{
		errors::{AnyError, NoInstallInUserProvidedPath},
		prereqs::PreReqChecker,
	},
};

use super::{args::UseVersionArgs, CommandContext};

pub async fn switch_to(ctx: CommandContext, args: UseVersionArgs) -> Result<i32, AnyError> {
	let platform = PreReqChecker::new().verify().await?;
	let vm = CodeVersionManager::new(ctx.log.clone(), &ctx.paths, platform);
	let version = RequestedVersion::try_from(args.name.as_str())?;

	let maybe_path = match args.install_dir {
		Some(d) => Some(
			CodeVersionManager::get_entrypoint_for_install_dir(&PathBuf::from(&d))
				.await
				.ok_or(NoInstallInUserProvidedPath(d))?,
		),
		None => vm.try_get_entrypoint(&version).await,
	};

	match maybe_path {
		Some(p) => {
			vm.set_preferred_version(version.clone(), p.clone()).await?;
			print_now_using(&ctx.log, &version, &p);
			Ok(0)
		}
		None => {
			prompt_to_install(&version);
			Ok(1)
		}
	}
}

pub async fn show(ctx: CommandContext) -> Result<i32, AnyError> {
	let platform = PreReqChecker::new().verify().await?;
	let vm = CodeVersionManager::new(ctx.log.clone(), &ctx.paths, platform);

	let version = vm.get_preferred_version();
	println!("Current quality: {}", version);
	match vm.try_get_entrypoint(&version).await {
		Some(p) => println!("Installation path: {}", p.display()),
		None => println!("No existing installation found"),
	}

	Ok(0)
}

fn print_now_using(log: &log::Logger, version: &RequestedVersion, path: &Path) {
	log.result(format!("Now using {} from {}", version, path.display()));
}
