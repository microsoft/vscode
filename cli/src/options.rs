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
		match s.to_ascii_lowercase().as_str() {
			"stable" => Ok(Quality::Stable),
			"insiders" | "insider" => Ok(Quality::Insiders),
			"exploration" => Ok(Quality::Exploration),
			_ => Err(format!(
				"Unknown quality: {s}. Must be one of stable, insiders, or exploration."
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

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn test_quality_try_from() {
		assert_eq!(Quality::try_from("stable").unwrap(), Quality::Stable);
		assert_eq!(Quality::try_from("Stable").unwrap(), Quality::Stable);
		assert_eq!(Quality::try_from("STABLE").unwrap(), Quality::Stable);

		assert_eq!(Quality::try_from("insiders").unwrap(), Quality::Insiders);
		assert_eq!(Quality::try_from("Insiders").unwrap(), Quality::Insiders);
		assert_eq!(Quality::try_from("insider").unwrap(), Quality::Insiders);
		assert_eq!(Quality::try_from("INSIDER").unwrap(), Quality::Insiders);

		assert_eq!(
			Quality::try_from("exploration").unwrap(),
			Quality::Exploration
		);
		assert_eq!(
			Quality::try_from("Exploration").unwrap(),
			Quality::Exploration
		);

		assert!(Quality::try_from("unknown").is_err());
	}

	#[test]
	fn test_quality_display_and_names() {
		assert_eq!(Quality::Stable.get_machine_name(), "stable");
		assert_eq!(Quality::Stable.get_capitalized_name(), "Stable");
		assert_eq!(format!("{}", Quality::Stable), "Stable");

		assert_eq!(Quality::Insiders.get_machine_name(), "insiders");
		assert_eq!(Quality::Insiders.get_capitalized_name(), "Insiders");
		assert_eq!(format!("{}", Quality::Insiders), "Insiders");

		assert_eq!(Quality::Exploration.get_machine_name(), "exploration");
		assert_eq!(Quality::Exploration.get_capitalized_name(), "Exploration");
		assert_eq!(format!("{}", Quality::Exploration), "Exploration");
	}

	#[test]
	fn test_telemetry_level_display() {
		assert_eq!(format!("{}", TelemetryLevel::Off), "off");
		assert_eq!(format!("{}", TelemetryLevel::Crash), "crash");
		assert_eq!(format!("{}", TelemetryLevel::Error), "error");
		assert_eq!(format!("{}", TelemetryLevel::All), "all");
	}
}
