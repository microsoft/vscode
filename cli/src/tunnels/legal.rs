/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::constants::{IS_INTERACTIVE_CLI, PRODUCT_NAME_LONG};
use crate::state::{LauncherPaths, PersistedState};
use crate::util::errors::{AnyError, MissingLegalConsent};
use crate::util::input::prompt_yn;
use serde::{Deserialize, Serialize};

const LICENSE_TEXT: Option<&'static str> = option_env!("VSCODE_CLI_REMOTE_LICENSE_TEXT");
const LICENSE_PROMPT: Option<&'static str> = option_env!("VSCODE_CLI_REMOTE_LICENSE_PROMPT");

#[derive(Clone, Default, Serialize, Deserialize)]
struct PersistedConsent {
	pub consented: Option<bool>,
}

pub fn require_consent(
	paths: &LauncherPaths,
	accept_server_license_terms: bool,
) -> Result<(), AnyError> {
	match LICENSE_TEXT {
		Some(t) => println!("{}", t.replace("\\n", "\r\n")),
		None => return Ok(()),
	}

	let prompt = match LICENSE_PROMPT {
		Some(p) => p,
		None => return Ok(()),
	};

	let license: PersistedState<PersistedConsent> =
		PersistedState::new(paths.root().join("license_consent.json"));

	let mut load = license.load();
	if let Some(true) = load.consented {
		return Ok(());
	}

	if accept_server_license_terms {
		load.consented = Some(true);
	} else if !*IS_INTERACTIVE_CLI {
		return Err(MissingLegalConsent(
			"Run this command again with --accept-server-license-terms to indicate your agreement."
				.to_string(),
		)
		.into());
	} else {
		match prompt_yn(prompt) {
			Ok(true) => {
				load.consented = Some(true);
			}
			Ok(false) => {
				return Err(AnyError::from(MissingLegalConsent(format!(
					"Sorry you cannot use {} CLI without accepting the terms.",
					PRODUCT_NAME_LONG
				))))
			}
			Err(e) => return Err(AnyError::from(MissingLegalConsent(e.to_string()))),
		}
	}

	license.save(load)?;
	Ok(())
}
