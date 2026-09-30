/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Windows services for the setup commands and for finding an installed Copilot CLI: the PATH stored in the registry,
//! the VS Code `CopilotCliCommand` policy, HTTP through WinHTTP (which honors the system proxy configuration), SHA-256
//! through CNG, Authenticode verification, and a named mutex that tells VS Code setup the install is still running.

use std::ffi::{OsStr, OsString};
use std::io::{self, Read};
use std::os::windows::ffi::{OsStrExt, OsStringExt};
use std::path::{Path, PathBuf};
use std::ptr::{null, null_mut};
use std::time::Duration;

use windows_sys::Win32::Foundation::{
	CloseHandle, FreeLibrary, ERROR_NO_MORE_ITEMS, ERROR_SUCCESS, HANDLE,
};
use windows_sys::Win32::Networking::WinHttp::{
	WinHttpCloseHandle, WinHttpConnect, WinHttpCrackUrl, WinHttpOpen, WinHttpOpenRequest,
	WinHttpQueryDataAvailable, WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse,
	WinHttpSendRequest, WinHttpSetOption, WinHttpSetTimeouts, URL_COMPONENTS,
	WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_DISABLE_REDIRECTS, WINHTTP_FLAG_SECURE,
	WINHTTP_INTERNET_SCHEME_HTTPS, WINHTTP_OPTION_DISABLE_FEATURE, WINHTTP_QUERY_CONTENT_LENGTH,
	WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_LOCATION, WINHTTP_QUERY_STATUS_CODE,
};
use windows_sys::Win32::Security::Cryptography::{
	BCryptCloseAlgorithmProvider, BCryptCreateHash, BCryptDestroyHash, BCryptFinishHash,
	BCryptHashData, BCryptOpenAlgorithmProvider, CertGetNameStringW, BCRYPT_ALG_HANDLE,
	BCRYPT_HASH_HANDLE, BCRYPT_SHA256_ALGORITHM, CERT_NAME_SIMPLE_DISPLAY_TYPE,
};
use windows_sys::Win32::Security::WinTrust::{
	WTHelperGetProvSignerFromChain, WTHelperProvDataFromStateData, WinVerifyTrust,
	WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_DATA_0, WINTRUST_FILE_INFO,
	WTD_CHOICE_FILE, WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT, WTD_REVOKE_WHOLECHAIN,
	WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE,
};
use windows_sys::Win32::System::Diagnostics::Debug::{
	FormatMessageW, FORMAT_MESSAGE_FROM_HMODULE, FORMAT_MESSAGE_IGNORE_INSERTS,
};
use windows_sys::Win32::System::Environment::ExpandEnvironmentStringsW;
use windows_sys::Win32::System::LibraryLoader::{
	GetModuleHandleW, GetProcAddress, LoadLibraryExW, LOAD_LIBRARY_SEARCH_SYSTEM32,
};
use windows_sys::Win32::System::Registry::{
	RegGetValueW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, RRF_NOEXPAND, RRF_RT_REG_DWORD,
	RRF_RT_REG_EXPAND_SZ, RRF_RT_REG_SZ,
};
use windows_sys::Win32::System::Threading::{CreateMutexW, ReleaseMutex};

const MACHINE_ENVIRONMENT_KEY: &str =
	r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment";
const USER_ENVIRONMENT_KEY: &str = "Environment";

use super::CLI_INSTALL_FOLDER;

/// The policy registry key names (`win32RegValueName`) of the VS Code qualities.
const PRODUCT_POLICY_KEYS: [&str; 4] = ["VSCode", "VSCodeInsiders", "VSCodeExploration", "CodeOSS"];

fn wide(value: &OsStr) -> Vec<u16> {
	value.encode_wide().chain(std::iter::once(0)).collect()
}

fn wide_str(value: &str) -> Vec<u16> {
	wide(OsStr::new(value))
}

fn from_wide_until_nul(value: &[u16]) -> OsString {
	let end = value
		.iter()
		.position(|unit| *unit == 0)
		.unwrap_or(value.len());
	OsString::from_wide(&value[..end])
}

// Environment and PATH

pub(crate) fn expand_environment(value: &OsStr) -> OsString {
	let source = wide(value);
	let required = unsafe { ExpandEnvironmentStringsW(source.as_ptr(), null_mut(), 0) };
	if required == 0 {
		return value.to_os_string();
	}
	let mut buffer = vec![0_u16; required as usize];
	let written =
		unsafe { ExpandEnvironmentStringsW(source.as_ptr(), buffer.as_mut_ptr(), required) };
	if written == 0 || written > required {
		return value.to_os_string();
	}
	from_wide_until_nul(&buffer)
}

fn registry_path(root: HKEY, subkey: &str) -> Option<OsString> {
	let subkey = wide_str(subkey);
	let name = wide_str("Path");
	// Read the raw value and expand it ourselves; REG_EXPAND_SZ is the usual type for Path.
	let flags = RRF_RT_REG_SZ | RRF_RT_REG_EXPAND_SZ | RRF_NOEXPAND;
	let mut size = 0_u32;
	let status = unsafe {
		RegGetValueW(
			root,
			subkey.as_ptr(),
			name.as_ptr(),
			flags,
			null_mut(),
			null_mut(),
			&mut size,
		)
	};
	if status != 0 || size == 0 {
		return None;
	}
	let mut buffer = vec![0_u16; (size as usize).div_ceil(2)];
	let status = unsafe {
		RegGetValueW(
			root,
			subkey.as_ptr(),
			name.as_ptr(),
			flags,
			null_mut(),
			buffer.as_mut_ptr().cast(),
			&mut size,
		)
	};
	if status != 0 {
		return None;
	}
	Some(expand_environment(&from_wide_until_nul(&buffer)))
}

/// The machine PATH stored in the registry, with environment variables expanded.
pub(crate) fn machine_path() -> Option<OsString> {
	registry_path(HKEY_LOCAL_MACHINE, MACHINE_ENVIRONMENT_KEY)
}

fn registry_dword(root: HKEY, subkey: &str, name: &str) -> Option<u32> {
	let subkey = wide_str(subkey);
	let name = wide_str(name);
	let mut value = 0_u32;
	let mut size = std::mem::size_of::<u32>() as u32;
	let status = unsafe {
		RegGetValueW(
			root,
			subkey.as_ptr(),
			name.as_ptr(),
			RRF_RT_REG_DWORD,
			null_mut(),
			(&mut value as *mut u32).cast(),
			&mut size,
		)
	};
	(status == 0).then_some(value)
}

/// Whether the `CopilotCliCommand` policy of any VS Code quality turns the command off. For each quality the machine
/// policy takes precedence over the user policy, as in VS Code. A disabled policy in any quality wins, because the
/// shim of any installed quality can be the one on PATH.
pub(crate) fn copilot_cli_command_disabled() -> bool {
	PRODUCT_POLICY_KEYS.iter().any(|product| {
		let key = format!(r"SOFTWARE\Policies\Microsoft\{product}");
		registry_dword(HKEY_LOCAL_MACHINE, &key, super::COPILOT_CLI_COMMAND_POLICY)
			.or_else(|| registry_dword(HKEY_CURRENT_USER, &key, super::COPILOT_CLI_COMMAND_POLICY))
			== Some(0)
	})
}

fn user_path() -> Option<OsString> {
	registry_path(HKEY_CURRENT_USER, USER_ENVIRONMENT_KEY)
}

/// `%LOCALAPPDATA%\GitHubCopilotCLI`, where the per-user MSI installs `copilot.exe`.
pub(crate) fn cli_install_directory() -> Option<PathBuf> {
	std::env::var_os("LOCALAPPDATA")
		.filter(|value| !value.is_empty())
		.map(|local_app_data| PathBuf::from(local_app_data).join(CLI_INSTALL_FOLDER))
}

/// The UpgradeCode of GitHub's Copilot CLI MSI (`assets/Package.wxs` in github/copilot-agent-runtime).
const CLI_MSI_UPGRADE_CODE: &str = "{E2C3A7F6-1D3A-4E8F-9E5F-8E9D4F9C1234}";

type MsiEnumRelatedProducts = unsafe extern "system" fn(*const u16, u32, u32, *mut u16) -> u32;

/// Whether Windows Installer has a Copilot CLI MSI registered for this user or the machine. `msi.dll` is loaded only
/// here, so launching the CLI doesn't pay for it.
pub(crate) fn cli_msi_registered() -> io::Result<bool> {
	let library = unsafe {
		LoadLibraryExW(
			wide_str("msi.dll").as_ptr(),
			null_mut(),
			LOAD_LIBRARY_SEARCH_SYSTEM32,
		)
	};
	if library.is_null() {
		return Err(io::Error::last_os_error());
	}
	let result = (|| {
		let procedure =
			unsafe { GetProcAddress(library, c"MsiEnumRelatedProductsW".as_ptr().cast()) }
				.ok_or_else(io::Error::last_os_error)?;
		let enumerate: MsiEnumRelatedProducts = unsafe { std::mem::transmute(procedure) };
		let upgrade_code = wide_str(CLI_MSI_UPGRADE_CODE);
		let mut product_code = [0_u16; 39];
		match unsafe { enumerate(upgrade_code.as_ptr(), 0, 0, product_code.as_mut_ptr()) } {
			ERROR_SUCCESS => Ok(true),
			ERROR_NO_MORE_ITEMS => Ok(false),
			status => Err(io::Error::from_raw_os_error(status as i32)),
		}
	})();
	unsafe { FreeLibrary(library) };
	result
}

/// The directories to search for the Copilot CLI at run time: the process PATH, then the MSI install folder. A
/// terminal started before Copilot CLI was installed has a stale PATH; the install folder lets the shim find the CLI
/// it just installed without restarting that terminal.
pub(crate) fn discovery_path(process_path: Option<OsString>) -> Option<OsString> {
	join_search_path([process_path], cli_install_directory())
}

/// The directories VS Code setup should search: the process PATH, the machine and user PATH stored in the registry
/// (setup may have inherited a stale PATH), and the MSI install folder.
pub(crate) fn setup_discovery_path(process_path: Option<OsString>) -> Option<OsString> {
	join_search_path(
		[process_path, machine_path(), user_path()],
		cli_install_directory(),
	)
}

fn join_search_path<const N: usize>(
	paths: [Option<OsString>; N],
	extra: Option<PathBuf>,
) -> Option<OsString> {
	let mut entries: Vec<PathBuf> = Vec::new();
	for value in paths.into_iter().flatten() {
		entries.extend(std::env::split_paths(&value));
	}
	entries.extend(extra);
	if entries.is_empty() {
		return None;
	}
	std::env::join_paths(entries).ok()
}

// HTTP

/// The last WinHTTP error. WinHTTP's messages are in `winhttp.dll`, not in the system message table that
/// `io::Error` uses, so they are formatted from that module, in the user's display language.
fn last_http_error() -> io::Error {
	let error = io::Error::last_os_error();
	let Some(code) = error
		.raw_os_error()
		.filter(|code| (12000..13000).contains(code))
	else {
		return error;
	};
	let mut buffer = [0_u16; 512];
	let length = unsafe {
		FormatMessageW(
			FORMAT_MESSAGE_FROM_HMODULE | FORMAT_MESSAGE_IGNORE_INSERTS,
			GetModuleHandleW(wide_str("winhttp.dll").as_ptr()).cast_const(),
			code as u32,
			0,
			buffer.as_mut_ptr(),
			buffer.len() as u32,
			null(),
		)
	};
	match String::from_utf16_lossy(&buffer[..length as usize]).trim() {
		"" => error,
		message => io::Error::other(format!("{message} (WinHTTP error {code})")),
	}
}

struct InternetHandle(*mut core::ffi::c_void);

impl InternetHandle {
	fn new(handle: *mut core::ffi::c_void) -> io::Result<Self> {
		if handle.is_null() {
			Err(last_http_error())
		} else {
			Ok(Self(handle))
		}
	}
}

impl Drop for InternetHandle {
	fn drop(&mut self) {
		unsafe {
			WinHttpCloseHandle(self.0);
		}
	}
}

pub(crate) struct HttpClient {
	session: InternetHandle,
}

pub(crate) struct HttpResponse {
	// Declared before the connection so the request handle closes first.
	request: InternetHandle,
	_connection: InternetHandle,
	pub(crate) status: u32,
}

struct CrackedUrl {
	secure: bool,
	host: Vec<u16>,
	port: u16,
	path: Vec<u16>,
}

fn crack_url(url: &str) -> io::Result<CrackedUrl> {
	let url_wide = wide_str(url);
	let mut components = URL_COMPONENTS {
		dwStructSize: std::mem::size_of::<URL_COMPONENTS>() as u32,
		dwSchemeLength: u32::MAX,
		dwHostNameLength: u32::MAX,
		dwUrlPathLength: u32::MAX,
		dwExtraInfoLength: u32::MAX,
		..Default::default()
	};
	if unsafe { WinHttpCrackUrl(url_wide.as_ptr(), 0, 0, &mut components) } == 0 {
		return Err(last_http_error());
	}
	let slice = |pointer: *mut u16, length: u32| -> Vec<u16> {
		if pointer.is_null() || length == 0 {
			Vec::new()
		} else {
			unsafe { std::slice::from_raw_parts(pointer, length as usize) }.to_vec()
		}
	};
	let mut path = slice(components.lpszUrlPath, components.dwUrlPathLength);
	path.extend(slice(
		components.lpszExtraInfo,
		components.dwExtraInfoLength,
	));
	if path.is_empty() {
		path.push(u16::from(b'/'));
	}
	let mut host = slice(components.lpszHostName, components.dwHostNameLength);
	host.push(0);
	path.push(0);
	Ok(CrackedUrl {
		secure: components.nScheme == WINHTTP_INTERNET_SCHEME_HTTPS,
		host,
		port: components.nPort,
		path,
	})
}

impl HttpClient {
	pub(crate) fn new(timeout: Duration) -> io::Result<Self> {
		let agent = wide_str(concat!("VSCodeCopilotShim/", env!("CARGO_PKG_VERSION")));
		// Automatic proxy follows the system proxy settings, including PAC files.
		let session = InternetHandle::new(unsafe {
			WinHttpOpen(
				agent.as_ptr(),
				WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
				null(),
				null(),
				0,
			)
		})?;
		let milliseconds = i32::try_from(timeout.as_millis())
			.unwrap_or(i32::MAX)
			.max(1);
		if unsafe {
			WinHttpSetTimeouts(
				session.0,
				milliseconds,
				milliseconds,
				milliseconds,
				milliseconds,
			)
		} == 0
		{
			return Err(last_http_error());
		}
		Ok(Self { session })
	}

	/// Sends a request with `verb`. When `follow_redirects` is false, a redirect is returned as-is so its `Location` can
	/// be read.
	pub(crate) fn request(
		&self,
		verb: &str,
		url: &str,
		follow_redirects: bool,
	) -> io::Result<HttpResponse> {
		let url = crack_url(url)?;
		let connection = InternetHandle::new(unsafe {
			WinHttpConnect(self.session.0, url.host.as_ptr(), url.port, 0)
		})?;
		let verb = wide_str(verb);
		let request = InternetHandle::new(unsafe {
			WinHttpOpenRequest(
				connection.0,
				verb.as_ptr(),
				url.path.as_ptr(),
				null(),
				null(),
				null(),
				if url.secure { WINHTTP_FLAG_SECURE } else { 0 },
			)
		})?;
		if !follow_redirects {
			let disable = WINHTTP_DISABLE_REDIRECTS;
			if unsafe {
				WinHttpSetOption(
					request.0,
					WINHTTP_OPTION_DISABLE_FEATURE,
					(&disable as *const u32).cast(),
					std::mem::size_of::<u32>() as u32,
				)
			} == 0
			{
				return Err(last_http_error());
			}
		}
		if unsafe { WinHttpSendRequest(request.0, null(), 0, null(), 0, 0, 0) } == 0
			|| unsafe { WinHttpReceiveResponse(request.0, null_mut()) } == 0
		{
			return Err(last_http_error());
		}
		let mut status = 0_u32;
		let mut size = std::mem::size_of::<u32>() as u32;
		if unsafe {
			WinHttpQueryHeaders(
				request.0,
				WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
				null(),
				(&mut status as *mut u32).cast(),
				&mut size,
				null_mut(),
			)
		} == 0
		{
			return Err(last_http_error());
		}
		Ok(HttpResponse {
			request,
			_connection: connection,
			status,
		})
	}
}

impl HttpResponse {
	fn header(&self, info_level: u32) -> Option<String> {
		let mut size = 0_u32;
		unsafe {
			WinHttpQueryHeaders(
				self.request.0,
				info_level,
				null(),
				null_mut(),
				&mut size,
				null_mut(),
			)
		};
		if size == 0 {
			return None;
		}
		let mut buffer = vec![0_u16; (size as usize).div_ceil(2) + 1];
		if unsafe {
			WinHttpQueryHeaders(
				self.request.0,
				info_level,
				null(),
				buffer.as_mut_ptr().cast(),
				&mut size,
				null_mut(),
			)
		} == 0
		{
			return None;
		}
		from_wide_until_nul(&buffer).into_string().ok()
	}

	pub(crate) fn location(&self) -> Option<String> {
		self.header(WINHTTP_QUERY_LOCATION)
	}

	pub(crate) fn content_length(&self) -> Option<u64> {
		self.header(WINHTTP_QUERY_CONTENT_LENGTH)
			.and_then(|value| value.trim().parse().ok())
	}
}

impl Read for HttpResponse {
	fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
		if buffer.is_empty() {
			return Ok(0);
		}
		let mut available = 0_u32;
		if unsafe { WinHttpQueryDataAvailable(self.request.0, &mut available) } == 0 {
			return Err(last_http_error());
		}
		if available == 0 {
			return Ok(0);
		}
		let length = u32::try_from(buffer.len())
			.unwrap_or(u32::MAX)
			.min(available);
		let mut read = 0_u32;
		if unsafe {
			WinHttpReadData(
				self.request.0,
				buffer.as_mut_ptr().cast(),
				length,
				&mut read,
			)
		} == 0
		{
			return Err(last_http_error());
		}
		Ok(read as usize)
	}
}

// SHA-256

pub(crate) struct Sha256 {
	algorithm: BCRYPT_ALG_HANDLE,
	hash: BCRYPT_HASH_HANDLE,
}

fn check_status(status: i32) -> io::Result<()> {
	if status >= 0 {
		Ok(())
	} else {
		Err(io::Error::other(format!("CNG error {status:#x}")))
	}
}

impl Sha256 {
	pub(crate) fn new() -> io::Result<Self> {
		let mut algorithm = null_mut();
		check_status(unsafe {
			BCryptOpenAlgorithmProvider(&mut algorithm, BCRYPT_SHA256_ALGORITHM, null(), 0)
		})?;
		let mut hash = null_mut();
		if let Err(error) = check_status(unsafe {
			BCryptCreateHash(algorithm, &mut hash, null_mut(), 0, null(), 0, 0)
		}) {
			unsafe { BCryptCloseAlgorithmProvider(algorithm, 0) };
			return Err(error);
		}
		Ok(Self { algorithm, hash })
	}

	pub(crate) fn update(&mut self, data: &[u8]) -> io::Result<()> {
		for chunk in data.chunks(u32::MAX as usize) {
			check_status(unsafe {
				BCryptHashData(self.hash, chunk.as_ptr(), chunk.len() as u32, 0)
			})?;
		}
		Ok(())
	}

	pub(crate) fn finish(self) -> io::Result<[u8; 32]> {
		let mut digest = [0_u8; 32];
		check_status(unsafe {
			BCryptFinishHash(self.hash, digest.as_mut_ptr(), digest.len() as u32, 0)
		})?;
		Ok(digest)
	}
}

impl Drop for Sha256 {
	fn drop(&mut self) {
		unsafe {
			BCryptDestroyHash(self.hash);
			BCryptCloseAlgorithmProvider(self.algorithm, 0);
		}
	}
}

// Authenticode

/// Verifies the Authenticode signature of `path` and returns the signer's display name.
///
/// A revoked certificate anywhere in the chain below the root fails verification. When the revocation server can't be
/// reached, the Windows Authenticode policy decides; by default it accepts the signature.
pub(crate) fn authenticode_signer(path: &Path) -> io::Result<String> {
	let path_wide = wide(path.as_os_str());
	let mut file_info = WINTRUST_FILE_INFO {
		cbStruct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
		pcwszFilePath: path_wide.as_ptr(),
		hFile: null_mut(),
		pgKnownSubject: null_mut(),
	};
	let mut data = WINTRUST_DATA {
		cbStruct: std::mem::size_of::<WINTRUST_DATA>() as u32,
		dwUIChoice: WTD_UI_NONE,
		fdwRevocationChecks: WTD_REVOKE_WHOLECHAIN,
		dwUnionChoice: WTD_CHOICE_FILE,
		Anonymous: WINTRUST_DATA_0 {
			pFile: &mut file_info,
		},
		dwStateAction: WTD_STATEACTION_VERIFY,
		dwProvFlags: WTD_REVOCATION_CHECK_CHAIN_EXCLUDE_ROOT,
		..Default::default()
	};
	let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
	let status = unsafe {
		WinVerifyTrust(
			null_mut(),
			&mut action,
			(&mut data as *mut WINTRUST_DATA).cast(),
		)
	};
	let signer = if status == 0 {
		signer_name(data.hWVTStateData)
	} else {
		Err(io::Error::other(format!(
			"Authenticode verification failed ({:#x})",
			status as u32
		)))
	};
	data.dwStateAction = WTD_STATEACTION_CLOSE;
	unsafe {
		WinVerifyTrust(
			null_mut(),
			&mut action,
			(&mut data as *mut WINTRUST_DATA).cast(),
		)
	};
	signer
}

fn signer_name(state: HANDLE) -> io::Result<String> {
	let missing = || io::Error::other("the signature has no signer certificate");
	let provider = unsafe { WTHelperProvDataFromStateData(state) };
	if provider.is_null() {
		return Err(missing());
	}
	let signer = unsafe { WTHelperGetProvSignerFromChain(provider, 0, 0, 0) };
	if signer.is_null() {
		return Err(missing());
	}
	let signer = unsafe { &*signer };
	if signer.csCertChain == 0 || signer.pasCertChain.is_null() {
		return Err(missing());
	}
	// The first certificate in the chain is the leaf that signed the file.
	let certificate = unsafe { (*signer.pasCertChain).pCert };
	if certificate.is_null() {
		return Err(missing());
	}
	let length = unsafe {
		CertGetNameStringW(
			certificate,
			CERT_NAME_SIMPLE_DISPLAY_TYPE,
			0,
			null(),
			null_mut(),
			0,
		)
	};
	let mut buffer = vec![0_u16; length.max(1) as usize];
	unsafe {
		CertGetNameStringW(
			certificate,
			CERT_NAME_SIMPLE_DISPLAY_TYPE,
			0,
			null(),
			buffer.as_mut_ptr(),
			length,
		)
	};
	Ok(from_wide_until_nul(&buffer).to_string_lossy().into_owned())
}

// Mutex

/// A named mutex held while the install runs, so VS Code setup can tell the process is still alive.
pub(crate) struct RunningMutex(HANDLE);

impl RunningMutex {
	pub(crate) fn acquire(name: &OsStr) -> io::Result<Self> {
		let name = wide(name);
		let handle = unsafe { CreateMutexW(null(), 1, name.as_ptr()) };
		if handle.is_null() {
			Err(io::Error::last_os_error())
		} else {
			Ok(Self(handle))
		}
	}
}

impl Drop for RunningMutex {
	fn drop(&mut self) {
		unsafe {
			ReleaseMutex(self.0);
			CloseHandle(self.0);
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn sha256_matches_known_digest() {
		let mut hash = Sha256::new().expect("create SHA-256");
		hash.update(b"abc").expect("hash data");
		let digest = hash.finish().expect("finish SHA-256");
		assert_eq!(
			super::super::hex(&digest),
			"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
		);
	}

	#[test]
	fn crack_url_splits_host_port_and_path() {
		let cracked = crack_url("https://github.com/github/copilot-cli/releases/latest?x=1")
			.expect("crack URL");
		let local = crack_url("http://127.0.0.1:8080").expect("crack local URL");
		assert_eq!(
			(
				cracked.secure,
				String::from_utf16_lossy(&cracked.host),
				cracked.port,
				String::from_utf16_lossy(&cracked.path),
				local.secure,
				local.port,
				String::from_utf16_lossy(&local.path),
			),
			(
				true,
				String::from("github.com\0"),
				443,
				String::from("/github/copilot-cli/releases/latest?x=1\0"),
				false,
				8080,
				String::from("/\0"),
			)
		);
	}

	#[test]
	fn expand_environment_expands_variables() {
		let windows = std::env::var_os("SystemRoot").expect("SystemRoot");
		assert_eq!(
			expand_environment(OsStr::new(r"%SystemRoot%\System32")),
			PathBuf::from(windows).join("System32").into_os_string()
		);
	}

	#[test]
	fn discovery_searches_the_msi_install_folder_after_path() {
		let path =
			discovery_path(Some(OsString::from(r"C:\first;C:\second"))).expect("search path");
		assert_eq!(
			std::env::split_paths(&path).collect::<Vec<_>>(),
			vec![
				PathBuf::from(r"C:\first"),
				PathBuf::from(r"C:\second"),
				cli_install_directory().expect("LOCALAPPDATA"),
			]
		);
	}

	#[test]
	fn winhttp_errors_have_readable_messages() {
		// ERROR_WINHTTP_NAME_NOT_RESOLVED; the standard library alone reports no text for it.
		let code = 12007;
		unsafe { windows_sys::Win32::Foundation::SetLastError(code) };
		let message = last_http_error().to_string();
		assert!(
			message.ends_with("(WinHTTP error 12007)") && !message.contains("FormatMessageW"),
			"{message}"
		);
	}

	#[test]
	fn unsigned_files_have_no_authenticode_signer() {
		let directory = tempfile::tempdir().expect("create temporary directory");
		let file = directory.path().join("unsigned.msi");
		std::fs::write(&file, b"not a signed package").expect("write unsigned file");
		assert!(authenticode_signer(&file).is_err());
	}

	#[test]
	fn registry_dwords_are_read_only_from_dword_values() {
		let key = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion";
		assert_eq!(
			[
				registry_dword(HKEY_LOCAL_MACHINE, key, "CurrentMajorVersionNumber"),
				registry_dword(HKEY_LOCAL_MACHINE, key, "ProductName"),
				registry_dword(HKEY_LOCAL_MACHINE, key, "NoSuchValue"),
			],
			[Some(10), None, None]
		);
	}

	#[test]
	fn the_msi_registration_can_be_queried() {
		assert!(cli_msi_registered().is_ok());
	}
}
