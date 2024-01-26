/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
use crate::constants::IS_INTERACTIVE_CLI;
use crate::state::{LauncherPaths, PersistedState};
use crate::util::errors::{AnyError, CodeError};
use crate::util::input::prompt_yn;
use lazy_static::lazy_static;
use serde::{Deserialize, Serialize};

lazy_static! {
	static ref LICENSE_TEXT: Option<Vec<String>> =
		option_env!("VSCODE_CLI_SERVER_LICENSE").and_then(|s| serde_json::from_str(s).unwrap());
}

const LICENSE_PROMPT: Option<&'static str> = option_env!("VSCODE_CLI_REMOTE_LICENSE_PROMPT");

#[derive(Clone, Default, Serialize, Deserialize)]
struct PersistedConsent {
	pub consented: Option<bool>,
}

pub fn require_consent(
	paths: &LauncherPaths,
	accept_server_license_terms: bool,
) -> Result<(), AnyError> {
	match &*LICENSE_TEXT {
		Some(t) => println!("{}", t.join("\r\n")),
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
		return Err(CodeError::NeedsInteractiveLegalConsent.into());
	} else {
		match prompt_yn(prompt) {
			Ok(true) => {
				load.consented = Some(true);
			}
			Ok(false) => return Err(CodeError::DeniedLegalConset.into()),
			Err(_) => return Err(CodeError::NeedsInteractiveLegalConsent.into()),
		}
	}

	license.save(load)?;
	Ok(())
}
