/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use crate::{
	constants::{get_default_user_agent, PRODUCT_NAME_LONG},
	debug, info, log,
	state::{LauncherPaths, PersistedState},
	trace,
	util::{
		errors::{
			wrap, AnyError, CodeError, OAuthError, RefreshTokenNotAvailableError, StatusError,
			WrappedError,
		},
		input::prompt_options,
	},
	warning,
};
use async_trait::async_trait;
use chrono::{DateTime, Duration, Utc};
use gethostname::gethostname;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{cell::Cell, fmt::Display, path::PathBuf, sync::Arc, thread};
use tokio::time::sleep;
use tunnels::{
	contracts::PROD_FIRST_PARTY_APP_ID,
	management::{Authorization, AuthorizationProvider, HttpError},
};

#[derive(Deserialize)]
struct DeviceCodeResponse {
	device_code: String,
	user_code: String,
	message: Option<String>,
	verification_uri: String,
	expires_in: i64,
}

#[derive(Deserialize)]
struct AuthenticationResponse {
	access_token: String,
	refresh_token: Option<String>,
	expires_in: Option<i64>,
}

#[derive(Deserialize)]
struct AuthenticationError {
	error: String,
	error_description: Option<String>,
}

#[derive(clap::ValueEnum, Serialize, Deserialize, Debug, Clone, Copy)]
pub enum AuthProvider {
	Microsoft,
	Github,
}

impl Display for AuthProvider {
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		match self {
			AuthProvider::Microsoft => write!(f, "Microsoft Account"),
			AuthProvider::Github => write!(f, "Github Account"),
		}
	}
}

impl AuthProvider {
	pub fn client_id(&self) -> &'static str {
		match self {
			AuthProvider::Microsoft => "aebc6443-996d-45c2-90f0-388ff96faa56",
			AuthProvider::Github => "01ab8ac9400c4e429b23",
		}
	}

	pub fn code_uri(&self) -> &'static str {
		match self {
			AuthProvider::Microsoft => {
				"https://login.microsoftonline.com/common/oauth2/v2.0/devicecode"
			}
			AuthProvider::Github => "https://github.com/login/device/code",
		}
	}

	pub fn grant_uri(&self) -> &'static str {
		match self {
			AuthProvider::Microsoft => "https://login.microsoftonline.com/common/oauth2/v2.0/token",
			AuthProvider::Github => "https://github.com/login/oauth/access_token",
		}
	}

	pub fn get_default_scopes(&self) -> String {
		match self {
			AuthProvider::Microsoft => format!(
				"{}/.default+offline_access+profile+openid",
				PROD_FIRST_PARTY_APP_ID
			),
			AuthProvider::Github => "read:user+read:org".to_string(),
		}
	}
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct StoredCredential {
	#[serde(rename = "p")]
	provider: AuthProvider,
	#[serde(rename = "a")]
	access_token: String,
	#[serde(rename = "r")]
	refresh_token: Option<String>,
	#[serde(rename = "e")]
	expires_at: Option<DateTime<Utc>>,
}

impl StoredCredential {
	pub async fn is_expired(&self, log: &log::Logger, client: &reqwest::Client) -> bool {
		match self.provider {
			AuthProvider::Microsoft => self
				.expires_at
				.map(|e| Utc::now() + chrono::Duration::minutes(5) > e)
				.unwrap_or(false),

			// Make an auth request to Github. Mark the credential as expired
			// only on a verifiable 4xx code. We don't error on any failed
			// request since then a drop in connection could "require" a refresh
			AuthProvider::Github => {
				let res = client
					.get("https://api.github.com/user")
					.header("Authorization", format!("token {}", self.access_token))
					.header("User-Agent", get_default_user_agent())
					.send()
					.await;
				let res = match res {
					Ok(r) => r,
					Err(e) => {
						warning!(log, "failed to check Github token: {}", e);
						return false;
					}
				};

				if res.status().is_success() {
					return false;
				}

				let err = StatusError::from_res(res).await;
				debug!(log, "github token looks expired: {:?}", err);
				true
			}
		}
	}

	fn from_response(auth: AuthenticationResponse, provider: AuthProvider) -> Self {
		StoredCredential {
			provider,
			access_token: auth.access_token,
			refresh_token: auth.refresh_token,
			expires_at: auth.expires_in.map(|e| Utc::now() + Duration::seconds(e)),
		}
	}
}

struct StorageWithLastRead {
	storage: Box<dyn StorageImplementation>,
	last_read: Cell<Result<Option<StoredCredential>, WrappedError>>,
}

#[derive(Clone)]
pub struct Auth {
	client: reqwest::Client,
	log: log::Logger,
	file_storage_path: PathBuf,
	storage: Arc<std::sync::Mutex<Option<StorageWithLastRead>>>,
}

trait StorageImplementation: Send + Sync {
	fn read(&mut self) -> Result<Option<StoredCredential>, AnyError>;
	fn store(&mut self, value: StoredCredential) -> Result<(), AnyError>;
	fn clear(&mut self) -> Result<(), AnyError>;
}

// unseal decrypts and deserializes the value
fn seal<T>(value: &T) -> String
where
	T: Serialize + ?Sized,
{
	let dec = serde_json::to_string(value).expect("expected to serialize");
	if std::env::var("VSCODE_CLI_DISABLE_KEYCHAIN_ENCRYPT").is_ok() {
		return dec;
	}
	encrypt(&dec)
}

// unseal decrypts and deserializes the value
fn unseal<T>(value: &str) -> Option<T>
where
	T: DeserializeOwned,
{
	// small back-compat for old unencrypted values, or if VSCODE_CLI_DISABLE_KEYCHAIN_ENCRYPT set
	if let Ok(v) = serde_json::from_str::<T>(value) {
		return Some(v);
	}

	let dec = decrypt(value)?;
	serde_json::from_str::<T>(&dec).ok()
}

#[cfg(target_os = "windows")]
const KEYCHAIN_ENTRY_LIMIT: usize = 1024;
#[cfg(not(target_os = "windows"))]
const KEYCHAIN_ENTRY_LIMIT: usize = 128 * 1024;

const CONTINUE_MARKER: &str = "<MORE>";

/// Implementation that wraps the KeyringStorage on Linux to avoid
/// https://github.com/hwchen/keyring-rs/issues/132
struct ThreadKeyringStorage {
	s: Option<KeyringStorage>,
}

impl ThreadKeyringStorage {
	fn thread_op<R, Fn>(&mut self, f: Fn) -> Result<R, AnyError>
	where
		Fn: 'static + Send + FnOnce(&mut KeyringStorage) -> Result<R, AnyError>,
		R: 'static + Send,
	{
		let mut s = match self.s.take() {
			Some(s) => s,
			None => return Err(CodeError::KeyringTimeout.into()),
		};

		// It seems like on Linux communication to the keyring can block indefinitely.
		// Fall back after a 5 second timeout.
		let (sender, receiver) = std::sync::mpsc::channel();
		let tsender = sender.clone();

		thread::spawn(move || sender.send(Some((f(&mut s), s))));
		thread::spawn(move || {
			thread::sleep(std::time::Duration::from_secs(5));
			let _ = tsender.send(None);
		});

		match receiver.recv().unwrap() {
			Some((r, s)) => {
				self.s = Some(s);
				r
			}
			None => Err(CodeError::KeyringTimeout.into()),
		}
	}
}

impl Default for ThreadKeyringStorage {
	fn default() -> Self {
		Self {
			s: Some(KeyringStorage::default()),
		}
	}
}

impl StorageImplementation for ThreadKeyringStorage {
	fn read(&mut self) -> Result<Option<StoredCredential>, AnyError> {
		self.thread_op(|s| s.read())
	}

	fn store(&mut self, value: StoredCredential) -> Result<(), AnyError> {
		self.thread_op(move |s| s.store(value))
	}

	fn clear(&mut self) -> Result<(), AnyError> {
		self.thread_op(|s| s.clear())
	}
}

#[derive(Default)]
struct KeyringStorage {
	// keywring storage can be split into multiple entries due to entry length limits
	// on Windows https://github.com/microsoft/vscode-cli/issues/358
	entries: Vec<keyring::Entry>,
}

macro_rules! get_next_entry {
	($self: expr, $i: expr) => {
		match $self.entries.get($i) {
			Some(e) => e,
			None => {
				let e = keyring::Entry::new("vscode-cli", &format!("vscode-cli-{}", $i)).unwrap();
				$self.entries.push(e);
				$self.entries.last().unwrap()
			}
		}
	};
}

impl StorageImplementation for KeyringStorage {
	fn read(&mut self) -> Result<Option<StoredCredential>, AnyError> {
		let mut str = String::new();

		for i in 0.. {
			let entry = get_next_entry!(self, i);
			let next_chunk = match entry.get_password() {
				Ok(value) => value,
				Err(keyring::Error::NoEntry) => return Ok(None), // missing entries?
				Err(e) => return Err(wrap(e, "error reading keyring").into()),
			};

			if next_chunk.ends_with(CONTINUE_MARKER) {
				str.push_str(&next_chunk[..next_chunk.len() - CONTINUE_MARKER.len()]);
			} else {
				str.push_str(&next_chunk);
				break;
			}
		}

		Ok(unseal(&str))
	}

	fn store(&mut self, value: StoredCredential) -> Result<(), AnyError> {
		let sealed = seal(&value);
		let step_size = KEYCHAIN_ENTRY_LIMIT - CONTINUE_MARKER.len();

		for i in (0..sealed.len()).step_by(step_size) {
			let entry = get_next_entry!(self, i / step_size);

			let cutoff = i + step_size;
			let stored = if cutoff <= sealed.len() {
				let mut part = sealed[i..cutoff].to_string();
				part.push_str(CONTINUE_MARKER);
				entry.set_password(&part)
			} else {
				entry.set_password(&sealed[i..])
			};

			if let Err(e) = stored {
				return Err(wrap(e, "error updating keyring").into());
			}
		}

		Ok(())
	}

	fn clear(&mut self) -> Result<(), AnyError> {
		self.read().ok(); // make sure component parts are available
		for entry in self.entries.iter() {
			entry
				.delete_password()
				.map_err(|e| wrap(e, "error updating keyring"))?;
		}
		self.entries.clear();

		Ok(())
	}
}

struct FileStorage(PersistedState<Option<String>>);

impl StorageImplementation for FileStorage {
	fn read(&mut self) -> Result<Option<StoredCredential>, AnyError> {
		Ok(self.0.load().and_then(|s| unseal(&s)))
	}

	fn store(&mut self, value: StoredCredential) -> Result<(), AnyError> {
		self.0.save(Some(seal(&value))).map_err(|e| e.into())
	}

	fn clear(&mut self) -> Result<(), AnyError> {
		self.0.save(None).map_err(|e| e.into())
	}
}

impl Auth {
	pub fn new(paths: &LauncherPaths, log: log::Logger) -> Auth {
		Auth {
			log,
			client: reqwest::Client::new(),
			file_storage_path: paths.root().join("token.json"),
			storage: Arc::new(std::sync::Mutex::new(None)),
		}
	}

	fn with_storage<T, F>(&self, op: F) -> T
	where
		F: FnOnce(&mut StorageWithLastRead) -> T,
	{
		let mut opt = self.storage.lock().unwrap();
		if let Some(s) = opt.as_mut() {
			return op(s);
		}

		#[cfg(not(target_os = "linux"))]
		let mut keyring_storage = KeyringStorage::default();
		#[cfg(target_os = "linux")]
		let mut keyring_storage = ThreadKeyringStorage::default();
		let mut file_storage = FileStorage(PersistedState::new(self.file_storage_path.clone()));

		let keyring_storage_result = match std::env::var("VSCODE_CLI_USE_FILE_KEYCHAIN") {
			Ok(_) => Err(wrap("", "user prefers file storage").into()),
			_ => keyring_storage.read(),
		};

		let mut storage = match keyring_storage_result {
			Ok(v) => StorageWithLastRead {
				last_read: Cell::new(Ok(v)),
				storage: Box::new(keyring_storage),
			},
			Err(e) => {
				debug!(self.log, "Using file keychain storage due to: {}", e);
				StorageWithLastRead {
					last_read: Cell::new(
						file_storage
							.read()
							.map_err(|e| wrap(e, "could not read from file storage")),
					),
					storage: Box::new(file_storage),
				}
			}
		};

		let out = op(&mut storage);
		*opt = Some(storage);
		out
	}

	/// Gets a tunnel Authentication for use in the tunnel management API.
	pub async fn get_tunnel_authentication(&self) -> Result<Authorization, AnyError> {
		let cred = self.get_credential().await?;
		let auth = match cred.provider {
			AuthProvider::Microsoft => Authorization::Bearer(cred.access_token),
			AuthProvider::Github => Authorization::Github(format!(
				"client_id={} {}",
				cred.provider.client_id(),
				cred.access_token
			)),
		};

		Ok(auth)
	}

	/// Reads the current details from the keyring.
	pub fn get_current_credential(&self) -> Result<Option<StoredCredential>, WrappedError> {
		self.with_storage(|storage| {
			let value = storage.last_read.replace(Ok(None));
			storage.last_read.set(value.clone());
			value
		})
	}

	/// Clears login info from the keyring.
	pub fn clear_credentials(&self) -> Result<(), AnyError> {
		self.with_storage(|storage| {
			storage.storage.clear()?;
			storage.last_read.set(Ok(None));
			Ok(())
		})
	}

	/// Runs the login flow, optionally pre-filling a provider and/or access token.
	pub async fn login(
		&self,
		provider: Option<AuthProvider>,
		access_token: Option<String>,
	) -> Result<StoredCredential, AnyError> {
		let provider = match provider {
			Some(p) => p,
			None => self.prompt_for_provider().await?,
		};

		let credentials = match access_token {
			Some(t) => StoredCredential {
				provider,
				access_token: t,
				refresh_token: None,
				expires_at: None,
			},
			None => self.do_device_code_flow_with_provider(provider).await?,
		};

		self.store_credentials(credentials.clone());
		Ok(credentials)
	}

	/// Gets the currently stored credentials, or asks the user to log in.
	pub async fn get_credential(&self) -> Result<StoredCredential, AnyError> {
		let entry = match self.get_current_credential() {
			Ok(Some(old_creds)) => {
				trace!(self.log, "Found token in keyring");
				match self.get_refreshed_token(&old_creds).await {
					Ok(Some(new_creds)) => {
						self.store_credentials(new_creds.clone());
						new_creds
					}
					Ok(None) => old_creds,
					Err(e) => {
						info!(self.log, "error refreshing token: {}", e);
						let new_creds = self
							.do_device_code_flow_with_provider(old_creds.provider)
							.await?;
						self.store_credentials(new_creds.clone());
						new_creds
					}
				}
			}

			Ok(None) => {
				trace!(self.log, "No token in keyring, getting a new one");
				let creds = self.do_device_code_flow().await?;
				self.store_credentials(creds.clone());
				creds
			}

			Err(e) => {
				warning!(
					self.log,
					"Error reading token from keyring, getting a new one: {}",
					e
				);
				let creds = self.do_device_code_flow().await?;
				self.store_credentials(creds.clone());
				creds
			}
		};

		Ok(entry)
	}

	/// Stores credentials, logging a warning if it fails.
	fn store_credentials(&self, creds: StoredCredential) {
		self.with_storage(|storage| {
			if let Err(e) = storage.storage.store(creds.clone()) {
				warning!(
					self.log,
					"Failed to update keyring with new credentials: {}",
					e
				);
			}
			storage.last_read.set(Ok(Some(creds)));
		})
	}

	/// Refreshes the token in the credentials if necessary. Returns None if
	/// the token is up to date, or Some new token otherwise.
	async fn get_refreshed_token(
		&self,
		creds: &StoredCredential,
	) -> Result<Option<StoredCredential>, AnyError> {
		if !creds.is_expired(&self.log, &self.client).await {
			return Ok(None);
		}

		let refresh_token = match &creds.refresh_token {
			Some(t) => t,
			None => return Err(AnyError::from(RefreshTokenNotAvailableError())),
		};

		self.do_grant(
			creds.provider,
			format!(
				"client_id={}&grant_type=refresh_token&refresh_token={}",
				creds.provider.client_id(),
				refresh_token
			),
		)
		.await
		.map(Some)
	}

	/// Does a "grant token" request.
	async fn do_grant(
		&self,
		provider: AuthProvider,
		body: String,
	) -> Result<StoredCredential, AnyError> {
		let response = self
			.client
			.post(provider.grant_uri())
			.body(body)
			.header("Accept", "application/json")
			.send()
			.await?;

		let status_code = response.status().as_u16();
		let body = response.bytes().await?;
		if let Ok(body) = serde_json::from_slice::<AuthenticationResponse>(&body) {
			return Ok(StoredCredential::from_response(body, provider));
		}

		if let Ok(res) = serde_json::from_slice::<AuthenticationError>(&body) {
			return Err(OAuthError {
				error: res.error,
				error_description: res.error_description,
			}
			.into());
		}

		return Err(StatusError {
			body: String::from_utf8_lossy(&body).to_string(),
			status_code,
			url: provider.grant_uri().to_string(),
		}
		.into());
	}

	/// Implements the device code flow, returning the credentials upon success.
	async fn do_device_code_flow(&self) -> Result<StoredCredential, AnyError> {
		let provider = self.prompt_for_provider().await?;
		self.do_device_code_flow_with_provider(provider).await
	}

	async fn prompt_for_provider(&self) -> Result<AuthProvider, AnyError> {
		if std::env::var("VSCODE_CLI_ALLOW_MS_AUTH").is_err() {
			return Ok(AuthProvider::Github);
		}

		let provider = prompt_options(
			format!("How would you like to log in to {}?", PRODUCT_NAME_LONG),
			&[AuthProvider::Microsoft, AuthProvider::Github],
		)?;

		Ok(provider)
	}

	async fn do_device_code_flow_with_provider(
		&self,
		provider: AuthProvider,
	) -> Result<StoredCredential, AnyError> {
		loop {
			let init_code = self
				.client
				.post(provider.code_uri())
				.header("Accept", "application/json")
				.body(format!(
					"client_id={}&scope={}",
					provider.client_id(),
					provider.get_default_scopes(),
				))
				.send()
				.await?;

			if !init_code.status().is_success() {
				return Err(StatusError::from_res(init_code).await?.into());
			}

			let init_code_json = init_code.json::<DeviceCodeResponse>().await?;
			let expires_at = Utc::now() + chrono::Duration::seconds(init_code_json.expires_in);

			match &init_code_json.message {
				Some(m) => self.log.result(m),
				None => self.log.result(&format!(
					"To grant access to the server, please log into {} and use code {}",
					init_code_json.verification_uri, init_code_json.user_code
				)),
			};

			let body = format!(
					"client_id={}&grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code={}",
					provider.client_id(),
					init_code_json.device_code
			);

			let mut interval_s = 5;
			while Utc::now() < expires_at {
				sleep(std::time::Duration::from_secs(interval_s)).await;

				match self.do_grant(provider, body.clone()).await {
					Ok(creds) => return Ok(creds),
					Err(AnyError::OAuthError(e)) if e.error == "slow_down" => {
						interval_s += 5; // https://www.rfc-editor.org/rfc/rfc8628#section-3.5
						trace!(self.log, "refresh poll failed, slowing down");
					}
					Err(e) => {
						trace!(self.log, "refresh poll failed, retrying: {}", e);
					}
				}
			}
		}
	}
}

#[async_trait]
impl AuthorizationProvider for Auth {
	async fn get_authorization(&self) -> Result<Authorization, HttpError> {
		self.get_tunnel_authentication()
			.await
			.map_err(|e| HttpError::AuthorizationError(e.to_string()))
	}
}

lazy_static::lazy_static! {
	static ref HOSTNAME: Vec<u8> = gethostname().to_string_lossy().bytes().collect();
}

#[cfg(feature = "vscode-encrypt")]
fn encrypt(value: &str) -> String {
	vscode_encrypt::encrypt(&HOSTNAME, value.as_bytes()).expect("expected to encrypt")
}

#[cfg(feature = "vscode-encrypt")]
fn decrypt(value: &str) -> Option<String> {
	let b = vscode_encrypt::decrypt(&HOSTNAME, value).ok()?;
	String::from_utf8(b).ok()
}

#[cfg(not(feature = "vscode-encrypt"))]
fn encrypt(value: &str) -> String {
	value.to_owned()
}

#[cfg(not(feature = "vscode-encrypt"))]
fn decrypt(value: &str) -> Option<String> {
	Some(value.to_owned())
}
