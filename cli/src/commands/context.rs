/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{log, state::LauncherPaths};

use super::args::CliCore;

pub struct CommandContext {
	pub log: log::Logger,
	pub paths: LauncherPaths,
	pub args: CliCore,
	pub http: reqwest::Client,
}
