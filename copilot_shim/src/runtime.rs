/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	CommandSpec, FileIdentity, FileIdentityState, ProcessDiagnostic, ProcessError,
	ProcessOperation, ProcessOutcome, SupervisionMode, SystemError,
};
pub(crate) use prompt::{PromptKind, PromptResponse};
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
	fn inspect_path(&self, path: &Path) -> io::Result<Option<PathInspection>>;
	#[cfg(any(windows, test))]
	fn read_directory(&self, path: &Path) -> io::Result<Vec<OsString>>;
	fn open_file(&self, path: &Path) -> io::Result<Box<dyn Read>>;
}

pub(crate) trait UserInteractionEffects {
	fn clear_terminal(&self) -> io::Result<()>;
	fn prompt(&self, kind: PromptKind<'_>) -> io::Result<PromptResponse>;

	fn write_diagnostic(&self, _message: &str) {}
}

pub(crate) trait ProcessEffects {
	fn supervise(
		&self,
		command: &CommandSpec,
		mode: SupervisionMode,
	) -> Result<ProcessOutcome, ProcessError>;
}

pub(crate) trait Runtime:
	EnvironmentEffects + FileSystemEffects + UserInteractionEffects + ProcessEffects
{
}

impl<T> Runtime for T where
	T: EnvironmentEffects + FileSystemEffects + UserInteractionEffects + ProcessEffects
{
}

pub(crate) struct NativeRuntime;

impl EnvironmentEffects for NativeRuntime {
	fn path(&self) -> Option<OsString> {
		std::env::var_os("PATH")
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
			Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
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
		}))
	}

	#[cfg(any(windows, test))]
	fn read_directory(&self, path: &Path) -> io::Result<Vec<OsString>> {
		std::fs::read_dir(path)?
			.map(|entry| entry.map(|entry| entry.file_name()))
			.collect()
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

	// Directories (PATH entries) can only be opened with FILE_FLAG_BACKUP_SEMANTICS, and attribute-only access
	// avoids sharing conflicts with running executables.
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

#[cfg(not(any(unix, windows)))]
fn file_identity(_path: &Path, _metadata: &std::fs::Metadata) -> io::Result<FileIdentityState> {
	Ok(FileIdentityState::Unsupported)
}

impl UserInteractionEffects for NativeRuntime {
	fn clear_terminal(&self) -> io::Result<()> {
		prompt::native_clear_terminal()
	}

	fn prompt(&self, kind: PromptKind<'_>) -> io::Result<PromptResponse> {
		prompt::native_prompt(kind)
	}

	fn write_diagnostic(&self, message: &str) {
		eprintln!("{message}");
	}
}

impl ProcessEffects for NativeRuntime {
	fn supervise(
		&self,
		command: &CommandSpec,
		mode: SupervisionMode,
	) -> Result<ProcessOutcome, ProcessError> {
		let cancellation = CancellationToken::process_wide()
			.map_err(|error| cancellation_handler_error(command, &error))?;
		ProcessSupervisor::new(cancellation).supervise(command, mode)
	}
}

fn cancellation_handler_error(command: &CommandSpec, error: &io::Error) -> ProcessError {
	ProcessError::SupervisionFailed(ProcessDiagnostic {
		operation: ProcessOperation::InstallCancellationHandler,
		subject: Some(PathBuf::from(command.program())),
		error: SystemError::from(error),
	})
}

#[cfg(test)]
fn unsupported() -> io::Error {
	io::Error::new(
		io::ErrorKind::Unsupported,
		"runtime effect is implemented in a later task",
	)
}

#[cfg(test)]
pub(crate) struct TestRuntime {
	path: Option<OsString>,
	current_executable: io::Result<PathBuf>,
	current_directory: io::Result<PathBuf>,
}

#[cfg(test)]
impl Default for TestRuntime {
	fn default() -> Self {
		Self {
			path: None,
			current_executable: Err(unsupported()),
			current_directory: Err(unsupported()),
		}
	}
}

#[cfg(test)]
impl EnvironmentEffects for TestRuntime {
	fn path(&self) -> Option<OsString> {
		self.path.clone()
	}

	fn current_executable(&self) -> io::Result<PathBuf> {
		copy_io_result(&self.current_executable)
	}

	fn current_directory(&self) -> io::Result<PathBuf> {
		copy_io_result(&self.current_directory)
	}
}

#[cfg(test)]
impl FileSystemEffects for TestRuntime {
	fn inspect_path(&self, _path: &Path) -> io::Result<Option<PathInspection>> {
		Err(unsupported())
	}

	#[cfg(any(windows, test))]
	fn read_directory(&self, _path: &Path) -> io::Result<Vec<OsString>> {
		Err(unsupported())
	}

	fn open_file(&self, _path: &Path) -> io::Result<Box<dyn Read>> {
		Err(unsupported())
	}
}

#[cfg(test)]
impl UserInteractionEffects for TestRuntime {
	fn clear_terminal(&self) -> io::Result<()> {
		Ok(())
	}

	fn prompt(&self, _kind: PromptKind<'_>) -> io::Result<PromptResponse> {
		Ok(PromptResponse::Declined)
	}
}

#[cfg(test)]
impl ProcessEffects for TestRuntime {
	fn supervise(
		&self,
		_command: &CommandSpec,
		_mode: SupervisionMode,
	) -> Result<ProcessOutcome, ProcessError> {
		Ok(ProcessOutcome {
			termination: crate::model::ProcessTermination::NumericExit(0),
			captured_output: None,
		})
	}
}

#[cfg(test)]
fn copy_io_result(result: &io::Result<PathBuf>) -> io::Result<PathBuf> {
	match result {
		Ok(path) => Ok(path.clone()),
		Err(error) => Err(io::Error::new(error.kind(), error.to_string())),
	}
}

#[cfg(test)]
mod tests {
	use std::ffi::OsString;

	use super::*;
	use crate::model::{CommandArguments, LaunchAdapter};

	fn accepts_runtime<R: Runtime>(_runtime: &R) {}

	#[test]
	fn native_and_test_adapters_share_the_composed_interface() {
		accepts_runtime(&NativeRuntime);
		let test_runtime = TestRuntime::default();
		accepts_runtime(&test_runtime);
		assert_eq!(
			test_runtime
				.read_directory(Path::new("."))
				.expect_err("test read directory is unsupported")
				.kind(),
			io::ErrorKind::Unsupported
		);
	}

	#[test]
	fn cancellation_handler_failure_retains_candidate_path() {
		let command = CommandSpec::new(
			OsString::from("candidate-path"),
			CommandArguments::Native(Vec::new()),
			LaunchAdapter::Direct,
		);
		let error = io::Error::from_raw_os_error(13);
		let system_error = SystemError::from(&error);

		assert_eq!(
			cancellation_handler_error(&command, &error),
			ProcessError::SupervisionFailed(ProcessDiagnostic {
				operation: ProcessOperation::InstallCancellationHandler,
				subject: Some(PathBuf::from("candidate-path")),
				error: system_error,
			})
		);
	}

	#[cfg(windows)]
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

	#[cfg(windows)]
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
