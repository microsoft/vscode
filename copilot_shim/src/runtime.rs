/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::cell::Cell;
use std::ffi::OsString;
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

#[path = "platform/mod.rs"]
pub(crate) mod platform;
#[path = "prompt.rs"]
pub(crate) mod prompt;
#[path = "supervisor.rs"]
pub(crate) mod supervisor;

use crate::model::{
	CommandSpec, FileIdentity, FileIdentityState, ProcessError, ProcessOperation, ProcessOutcome,
	SupervisionMode,
};
pub(crate) use prompt::PromptResponse;
use supervisor::{CancellationToken, ProcessSupervisor};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InspectedFileType {
	RegularFile,
	Directory,
	Other,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PathInspection {
	pub(crate) canonical_path: PathBuf,
	pub(crate) file_identity: FileIdentityState,
	pub(crate) file_type: InspectedFileType,
	pub(crate) executable: bool,
	pub(crate) file_size: u64,
}

pub(crate) trait EnvironmentEffects {
	fn path(&self) -> Option<OsString>;
	fn current_executable(&self) -> io::Result<PathBuf>;
	fn current_directory(&self) -> io::Result<PathBuf>;

	fn environment_variable(&self, _name: &str) -> Option<OsString> {
		None
	}
}

pub(crate) trait FileSystemEffects {
	/// Inspects `path`, following links. Returns `None` when it doesn't exist.
	fn inspect_path(&self, path: &Path) -> io::Result<Option<PathInspection>>;
	fn open_file(&self, path: &Path) -> io::Result<Box<dyn Read>>;
}

pub(crate) trait UserInteractionEffects {
	fn set_diagnostics_enabled(&self, _enabled: bool) {}
	fn diagnostics_enabled(&self) -> bool {
		false
	}

	fn clear_terminal(&self) -> io::Result<()>;
	/// Whether a user can answer a prompt: stdin and stderr, which shows the prompt, are both terminals.
	fn can_prompt(&self) -> bool;
	/// Offers to install GitHub Copilot CLI.
	fn prompt(&self) -> io::Result<PromptResponse>;

	fn write_diagnostic(&self, _message: &str) {}
}

pub(crate) trait ProcessEffects {
	fn supervise(
		&self,
		command: &CommandSpec,
		mode: SupervisionMode,
	) -> Result<ProcessOutcome, ProcessError>;
}

pub(crate) trait PolicyEffects {
	/// Whether the VS Code `CopilotCliCommand` policy turns off the `copilot` command. The shim then still launches an
	/// installed Copilot CLI, but never installs or updates one.
	fn copilot_cli_command_disabled(&self) -> bool;
}

pub(crate) trait Runtime:
	EnvironmentEffects + FileSystemEffects + UserInteractionEffects + ProcessEffects + PolicyEffects
{
}

impl<T> Runtime for T where
	T: EnvironmentEffects
		+ FileSystemEffects
		+ UserInteractionEffects
		+ ProcessEffects
		+ PolicyEffects
{
}

#[derive(Default)]
pub(crate) struct NativeRuntime {
	diagnostics_enabled: Cell<bool>,
}

impl PolicyEffects for NativeRuntime {
	fn copilot_cli_command_disabled(&self) -> bool {
		// Only Windows setup puts the shim on the system PATH. Elsewhere it is reachable from integrated terminals, and
		// the Copilot extension applies the policy there.
		#[cfg(windows)]
		{
			crate::setup::windows::copilot_cli_command_disabled()
		}
		#[cfg(not(windows))]
		{
			false
		}
	}
}

impl EnvironmentEffects for NativeRuntime {
	fn path(&self) -> Option<OsString> {
		#[cfg(windows)]
		{
			crate::setup::windows::discovery_path(std::env::var_os("PATH"))
		}
		#[cfg(not(windows))]
		{
			std::env::var_os("PATH")
		}
	}

	fn current_executable(&self) -> io::Result<PathBuf> {
		std::env::current_exe()
	}

	fn current_directory(&self) -> io::Result<PathBuf> {
		std::env::current_dir()
	}

	fn environment_variable(&self, name: &str) -> Option<OsString> {
		std::env::var_os(name)
	}
}

impl FileSystemEffects for NativeRuntime {
	fn inspect_path(&self, path: &Path) -> io::Result<Option<PathInspection>> {
		match std::fs::symlink_metadata(path) {
			Ok(_) => {}
			// A PATH entry that is a file makes its candidates `NotADirectory`.
			Err(error)
				if matches!(
					error.kind(),
					io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
				) =>
			{
				return Ok(None)
			}
			Err(error) => return Err(error),
		}

		let canonical_path = std::fs::canonicalize(path)?;
		let metadata = std::fs::metadata(path)?;
		let file_type = if metadata.is_file() {
			InspectedFileType::RegularFile
		} else if metadata.is_dir() {
			InspectedFileType::Directory
		} else {
			InspectedFileType::Other
		};

		#[cfg(unix)]
		let executable = {
			use std::os::unix::fs::PermissionsExt;

			metadata.permissions().mode() & 0o111 != 0
		};
		#[cfg(not(unix))]
		let executable = metadata.is_file();

		Ok(Some(PathInspection {
			canonical_path,
			file_identity: file_identity(path, &metadata)?,
			file_type,
			executable,
			file_size: metadata.len(),
		}))
	}

	fn open_file(&self, path: &Path) -> io::Result<Box<dyn Read>> {
		Ok(Box::new(File::open(path)?))
	}
}

#[cfg(unix)]
fn file_identity(_path: &Path, metadata: &std::fs::Metadata) -> io::Result<FileIdentityState> {
	use std::os::unix::fs::MetadataExt;

	Ok(FileIdentityState::Supported(FileIdentity::Unix {
		device: metadata.dev(),
		inode: metadata.ino(),
	}))
}

#[cfg(windows)]
fn file_identity(path: &Path, _metadata: &std::fs::Metadata) -> io::Result<FileIdentityState> {
	use std::os::windows::fs::OpenOptionsExt;
	use std::os::windows::io::AsRawHandle;

	use windows_sys::Win32::Storage::FileSystem::{
		GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_FLAG_BACKUP_SEMANTICS,
		FILE_READ_ATTRIBUTES,
	};

	// Attribute-only access avoids sharing conflicts with running executables; FILE_FLAG_BACKUP_SEMANTICS also opens
	// directories.
	let file = std::fs::OpenOptions::new()
		.access_mode(FILE_READ_ATTRIBUTES)
		.custom_flags(FILE_FLAG_BACKUP_SEMANTICS)
		.open(path)?;
	let mut information = BY_HANDLE_FILE_INFORMATION::default();
	if unsafe { GetFileInformationByHandle(file.as_raw_handle(), &mut information) } == 0 {
		let error = io::Error::last_os_error();
		return if is_unsupported_file_identity_error(&error) {
			Ok(FileIdentityState::Unsupported)
		} else {
			Err(error)
		};
	}
	Ok(FileIdentityState::Supported(FileIdentity::Windows {
		volume: u64::from(information.dwVolumeSerialNumber),
		file_id: (u128::from(information.nFileIndexHigh) << 32)
			| u128::from(information.nFileIndexLow),
	}))
}

#[cfg(windows)]
fn is_unsupported_file_identity_error(error: &io::Error) -> bool {
	use windows_sys::Win32::Foundation::{ERROR_INVALID_FUNCTION, ERROR_NOT_SUPPORTED};

	matches!(
		error.raw_os_error().map(|code| code as u32),
		Some(ERROR_INVALID_FUNCTION) | Some(ERROR_NOT_SUPPORTED)
	)
}

impl UserInteractionEffects for NativeRuntime {
	fn set_diagnostics_enabled(&self, enabled: bool) {
		self.diagnostics_enabled.set(enabled);
	}

	fn diagnostics_enabled(&self) -> bool {
		self.diagnostics_enabled.get()
	}

	fn clear_terminal(&self) -> io::Result<()> {
		prompt::native_clear_terminal()
	}

	fn can_prompt(&self) -> bool {
		prompt::native_can_prompt()
	}

	fn prompt(&self) -> io::Result<PromptResponse> {
		prompt::native_prompt()
	}

	fn write_diagnostic(&self, message: &str) {
		if self.diagnostics_enabled.get() {
			eprintln!("{message}");
		}
	}
}

impl ProcessEffects for NativeRuntime {
	fn supervise(
		&self,
		command: &CommandSpec,
		mode: SupervisionMode,
	) -> Result<ProcessOutcome, ProcessError> {
		#[cfg(unix)]
		if mode == SupervisionMode::FinalInteractiveCli {
			return Err(platform::exec(command));
		}
		let cancellation = CancellationToken::process_wide().map_err(|error| {
			ProcessError::supervision(
				ProcessOperation::InstallCancellationHandler,
				command.program(),
				&error,
			)
		})?;
		ProcessSupervisor::new(cancellation).supervise(command, mode)
	}
}

#[cfg(all(test, windows))]
mod tests {
	use super::*;

	#[test]
	fn windows_file_identity_reports_supported_native_file() -> io::Result<()> {
		let path = std::env::current_exe()?;
		let metadata = std::fs::metadata(&path)?;

		let identity = file_identity(&path, &metadata)?;

		assert!(matches!(
			identity,
			FileIdentityState::Supported(FileIdentity::Windows { .. })
		));
		Ok(())
	}

	#[test]
	fn windows_file_identity_only_treats_explicit_unsupported_errors_as_unsupported() {
		use windows_sys::Win32::Foundation::{
			ERROR_ACCESS_DENIED, ERROR_INVALID_FUNCTION, ERROR_NOT_SUPPORTED,
		};

		assert_eq!(
			[
				is_unsupported_file_identity_error(&io::Error::from_raw_os_error(
					ERROR_INVALID_FUNCTION as i32,
				)),
				is_unsupported_file_identity_error(&io::Error::from_raw_os_error(
					ERROR_NOT_SUPPORTED as i32,
				)),
				is_unsupported_file_identity_error(&io::Error::from_raw_os_error(
					ERROR_ACCESS_DENIED as i32,
				)),
			],
			[true, true, false]
		);
	}
}
