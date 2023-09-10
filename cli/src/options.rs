/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fmt;

use serde::{Deserialize, Serialize};

use crate::constants::SERVER_NAME_MAP;

#[derive(clap::ValueEnum, Copy, Clone, Debug, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub enum Quality {
	#[serde(rename = "stable")]
	Stable,
	#[serde(rename = "exploration")]
	Exploration,
	#[serde(other)]
	Insiders,
}

impl Quality {
	/// Lowercased quality name in paths and protocol
	pub fn get_machine_name(&self) -> &'static str {
		match self {
			Quality::Insiders => "insiders",
			Quality::Exploration => "exploration",
			Quality::Stable => "stable",
		}
	}

	/// Uppercased quality display name for humans
	pub fn get_capitalized_name(&self) -> &'static str {
		match self {
			Quality::Insiders => "Insiders",
			Quality::Exploration => "Exploration",
			Quality::Stable => "Stable",
		}
	}

	/// Server application name
	pub fn server_entrypoint(&self) -> String {
		let mut server_name = SERVER_NAME_MAP
			.as_ref()
			.and_then(|m| m.get(self))
			.map(|s| s.server_application_name.as_str())
			.unwrap_or("code-server-oss")
			.to_string();

		if cfg!(windows) {
			server_name.push_str(".cmd");
		}

		server_name
	}
}

impl fmt::Display for Quality {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		write!(f, "{}", self.get_capitalized_name())
	}
}

impl TryFrom<&str> for Quality {
	type Error = String;

	fn try_from(s: &str) -> Result<Self, Self::Error> {
		match s {
			"stable" => Ok(Quality::Stable),
			"insiders" | "insider" => Ok(Quality::Insiders),
			"exploration" => Ok(Quality::Exploration),
			_ => Err(format!(
				"Unknown quality: {}. Must be one of stable, insiders, or exploration.",
				s
			)),
		}
	}
}

#[derive(clap::ValueEnum, Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum TelemetryLevel {
	Off,
	Crash,
	Error,
	All,
}

impl fmt::Display for TelemetryLevel {
	fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
		match self {
			TelemetryLevel::Off => write!(f, "off"),
			TelemetryLevel::Crash => write!(f, "crash"),
			TelemetryLevel::Error => write!(f, "error"),
			TelemetryLevel::All => write!(f, "all"),
		}
	}
}
