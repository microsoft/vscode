/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::collections::HashMap;

use async_trait::async_trait;
use lazy_static::lazy_static;
use serde::{self, Deserialize};
use url::Url;

use crate::{
	log,
	state::LauncherPaths,
	update_service::Platform,
	util::{
		errors::{AnyError, CodeError},
		http::BoxedHttp,
	},
};

use super::{
	capability_local,
	code_server::{ResolvedServerParams, SocketCodeServer},
};

#[derive(Default, Debug, Deserialize)]
#[serde(tag = "type")]
pub enum CapabilityParams {
	#[cfg(windows)]
	Wsl(super::capability_wsl::WslParams),
	#[default]
	Local,
}

pub type BoxedCapability = Box<dyn Capability + Send + Sync + 'static>;

impl CapabilityParams {
	pub fn into_capability(
		self,
		log: log::Logger,
		paths: LauncherPaths,
		http: BoxedHttp,
	) -> BoxedCapability {
		match self {
			#[cfg(windows)]
			CapabilityParams::Wsl(params) => {
				Box::new(super::capability_wsl::WslCapability::new(params, log, http))
			}
			CapabilityParams::Local => {
				Box::new(capability_local::LocalCapability::new(log, paths, http))
			}
		}
	}
}

#[async_trait]
pub trait Capability {
	async fn platform(&self) -> Result<Platform, CodeError>;
	async fn start_server(
		&self,
		params: ResolvedServerParams,
	) -> Result<SocketCodeServer, AnyError>;
	async fn try_get_running(
		&self,
		params: &ResolvedServerParams,
	) -> Result<Option<SocketCodeServer>, AnyError>;
}

pub type BoxedFileWriter = Box<dyn std::io::Write + Send + Sync + 'static>;

pub trait SystemInteractor {
	fn scheme(&self) -> &'static str;

	fn process_at_path_exists(&self, pid: u32, url: &Url) -> bool;
	fn process_find_running_at_path(&self, path: &Url) -> Option<u32>;
	fn format_command(&self, command: &Url, args: &mut Vec<String>) -> String;

	fn fs_remove_dir_all(&self, url: &Url) -> Result<(), AnyError>;
	fn fs_exists(&self, url: &Url) -> bool;
	fn fs_read_all(&self, url: &Url) -> Result<String, AnyError>;
	fn fs_write_all(&self, url: &Url, content: &str) -> Result<(), AnyError>;
	fn fs_open_write(&self, url: &Url) -> Result<BoxedFileWriter, AnyError>;
}

static LOCAL_INTERACTOR: capability_local::LocalInteractor = capability_local::LocalInteractor();

#[cfg(windows)]
static WSL_INTERACTOR: super::capability_local::LocalInteractor =
	super::capability_local::LocalInteractor();

lazy_static! {
	pub static ref SYSTEM_INTERACTORS: HashMap<&'static str, &'static (dyn SystemInteractor + Send + Sync)> = {
		let mut h: HashMap<&'static str, &'static (dyn SystemInteractor + Send + Sync)> =
			HashMap::new();
		for i in [
			&LOCAL_INTERACTOR,
			#[cfg(windows)]
			&WSL_INTERACTOR,
		] {
			h.insert(i.scheme(), i);
		}
		h
	};
}

pub fn get_scheme_interactor(scheme: &str) -> &'static (dyn SystemInteractor + Send + Sync) {
	match SYSTEM_INTERACTORS.get(scheme) {
		Some(i) => *i,
		None => panic!("could not get system interactor for scheme {}", scheme),
	}
}
