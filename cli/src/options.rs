/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fmt;

use serde::{Deserialize, Serialize};

#[derive(clap::ArgEnum, Copy, Clone, Debug, Hash, PartialEq, Eq, Serialize, Deserialize)]
pub enum Quality {
	#[serde(rename = "stable")]
	Stable,
	#[serde(rename = "exploration")]
	Exploration,
	#[serde(other)]
	Insiders,
}

impl Quality {
	/// Lowercased name in paths and protocol
	pub fn get_machine_name(&self) -> &'static str {
		match self {
			Quality::Insiders => "insiders",
			Quality::Exploration => "exploration",
			Quality::Stable => "stable",
		}
	}

	/// Uppercased display name for humans
	pub fn get_capitalized_name(&self) -> &'static str {
		match self {
			Quality::Insiders => "Insiders",
			Quality::Exploration => "Exploration",
			Quality::Stable => "Stable",
		}
	}

	pub fn get_macos_app_name(&self) -> &'static str {
		match self {
			Quality::Insiders => "Visual Studio Code - Insiders",
			Quality::Exploration => "Visual Studio Code - Exploration",
			Quality::Stable => "Visual Studio Code",
		}
	}

	pub fn get_commandline_name(&self) -> &'static str {
		match self {
			Quality::Insiders => "code-insiders",
			Quality::Exploration => "code-exploration",
			Quality::Stable => "code",
		}
	}

	#[cfg(target_os = "windows")]
	pub fn server_entrypoint(&self) -> &'static str {
		match self {
			Quality::Insiders => "code-server-insiders.cmd",
			Quality::Exploration => "code-server-exploration.cmd",
			Quality::Stable => "code-server.cmd",
		}
	}
	#[cfg(not(target_os = "windows"))]
	pub fn server_entrypoint(&self) -> &'static str {
		match self {
			Quality::Insiders => "code-server-insiders",
			Quality::Exploration => "code-server-exploration",
			Quality::Stable => "code-server",
		}
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

#[derive(clap::ArgEnum, Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
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
