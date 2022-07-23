/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{log, state::LauncherPaths};

use super::args::Cli;

pub struct CommandContext {
	pub log: log::Logger,
	pub paths: LauncherPaths,
	pub args: Cli,
	pub http: reqwest::Client,
}
