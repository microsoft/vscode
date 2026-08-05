/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Owner-only permissions for files holding secrets.
//!
//! The agent host writes two files that carry its connection token: the
//! per-quality lockfile and the token file itself. On Unix these are created
//! `0600` inside a `0700` directory. This module provides the Windows
//! equivalent, which the platform does not give us for free - a newly created
//! file simply inherits whatever its parent grants, and the parent is created
//! by whichever tool got there first.

use std::io;
use std::path::Path;

/// Restrict `path` so that only its owner may access it.
///
/// A directory keeps its owner execute bit so it stays traversable, and a file
/// keeps one only if it already had it, so an installed binary stays runnable.
#[cfg(not(windows))]
pub fn restrict_to_owner(path: &Path) -> io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	let metadata = std::fs::metadata(path)?;
	let mode = if metadata.is_dir() {
		0o700
	} else {
		0o600 | (metadata.permissions().mode() & 0o100)
	};
	std::fs::set_permissions(path, std::fs::Permissions::from_mode(mode))
}

/// Whether `path` is readable only by its owner.
///
/// Reports the state rather than changing it, so a caller deciding whether to
/// trust an existing secret can refuse instead of tightening a file whose
/// contents may already have leaked. A missing file is not owner-only.
#[cfg(not(windows))]
pub fn is_restricted_to_owner(path: &Path) -> io::Result<bool> {
	use std::os::unix::fs::PermissionsExt;
	let mode = std::fs::metadata(path)?.permissions().mode();
	Ok(mode & 0o077 == 0)
}

/// Whether `path` is readable only by its owner.
///
/// Reports the state rather than changing it, so a caller deciding whether to
/// trust an existing secret can refuse instead of tightening a file whose
/// contents may already have leaked. `SYSTEM` and `Administrators` are
/// permitted, matching [`restrict_to_owner`].
#[cfg(windows)]
pub fn is_restricted_to_owner(path: &Path) -> io::Result<bool> {
	let security = FileSecurity::read(path)?;
	security.is_owner_only()
}

/// Restrict `path` so that only its owner may reach it.
///
/// Replaces the object's DACL with an explicit one and marks it protected, so
/// nothing is inherited from a parent directory that may grant more. The
/// resulting DACL is exactly the owner, `SYSTEM` and `Administrators`.
///
/// `SYSTEM` and `Administrators` are permitted deliberately. That is the
/// intended parity with Unix, where `root` can read a `0600` file; the threat
/// model is another unprivileged account on the same machine, not a privileged
/// one.
///
/// The owner is granted by its own SID, read back from the object, rather than
/// by account name: these machines are commonly joined such that the name is
/// of the form `AzureAD\user@example.com`.
#[cfg(windows)]
pub fn restrict_to_owner(path: &Path) -> io::Result<()> {
	let security = FileSecurity::read(path)?;
	security.apply_owner_only_dacl(path)
}

#[cfg(windows)]
mod windows_acl {
	use super::*;
	use std::os::windows::ffi::OsStrExt;
	use windows_sys::Win32::Foundation::{LocalFree, ERROR_SUCCESS};
	use windows_sys::Win32::Security::Authorization::{
		GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W,
		NO_MULTIPLE_TRUSTEE, SET_ACCESS, SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN,
		TRUSTEE_W,
	};
	use windows_sys::Win32::Security::{
		CreateWellKnownSid, GetAce, GetLengthSid, IsValidSid, ACCESS_ALLOWED_ACE, ACE_HEADER,
		ACL as WinAcl, DACL_SECURITY_INFORMATION, NO_INHERITANCE, OWNER_SECURITY_INFORMATION,
		PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID, SECURITY_MAX_SID_SIZE,
		WELL_KNOWN_SID_TYPE, WinBuiltinAdministratorsSid, WinLocalSystemSid,
	};
	use windows_sys::Win32::System::SystemServices::ACCESS_ALLOWED_ACE_TYPE;

	const FILE_ALL_ACCESS: u32 = 0x001F01FF;

	/// A fixed-size buffer holding one SID.
	pub struct OwnedSid {
		buffer: Vec<u8>,
	}

	impl OwnedSid {
		fn well_known(kind: WELL_KNOWN_SID_TYPE) -> io::Result<Self> {
			let mut buffer = vec![0u8; SECURITY_MAX_SID_SIZE as usize];
			let mut size = buffer.len() as u32;
			// SAFETY: `buffer` is at least SECURITY_MAX_SID_SIZE bytes and
			// `size` describes it, which is what the call requires.
			let ok = unsafe {
				CreateWellKnownSid(
					kind,
					std::ptr::null_mut(),
					buffer.as_mut_ptr() as PSID,
					&mut size,
				)
			};
			if ok == 0 {
				return Err(io::Error::last_os_error());
			}
			buffer.truncate(size as usize);
			Ok(Self { buffer })
		}

		/// Copy a SID out of a borrowed pointer so it outlives its container.
		fn copy_from(sid: PSID) -> io::Result<Self> {
			// SAFETY: the caller passes a pointer obtained from the security
			// descriptor, which stays alive for the duration of this call.
			if sid.is_null() || unsafe { IsValidSid(sid) } == 0 {
				return Err(io::Error::other("encountered an invalid SID"));
			}
			// SAFETY: `sid` was just validated.
			let len = unsafe { GetLengthSid(sid) } as usize;
			// SAFETY: `len` is the SID's own reported length.
			let bytes = unsafe { std::slice::from_raw_parts(sid as *const u8, len) };
			Ok(Self {
				buffer: bytes.to_vec(),
			})
		}

		fn as_psid(&self) -> PSID {
			self.buffer.as_ptr() as PSID
		}
	}

	impl PartialEq for OwnedSid {
		fn eq(&self, other: &Self) -> bool {
			self.buffer == other.buffer
		}
	}

	/// A file's owner and DACL, released when dropped.
	pub struct FileSecurity {
		descriptor: PSECURITY_DESCRIPTOR,
		dacl: *mut WinAcl,
		owner: OwnedSid,
	}

	impl Drop for FileSecurity {
		fn drop(&mut self) {
			if !self.descriptor.is_null() {
				// SAFETY: the descriptor came from GetNamedSecurityInfoW,
				// which documents LocalFree as the matching release.
				unsafe { LocalFree(self.descriptor as _) };
			}
		}
	}

	fn wide(path: &Path) -> Vec<u16> {
		path.as_os_str().encode_wide().chain(Some(0)).collect()
	}

	impl FileSecurity {
		pub fn read(path: &Path) -> io::Result<Self> {
			if !path.exists() {
				return Err(io::Error::new(
					io::ErrorKind::NotFound,
					format!("{} does not exist", path.display()),
				));
			}

			let wide_path = wide(path);
			let mut owner: PSID = std::ptr::null_mut();
			let mut dacl: *mut WinAcl = std::ptr::null_mut();
			let mut descriptor: PSECURITY_DESCRIPTOR = std::ptr::null_mut();

			// SAFETY: all out-parameters are owned locals, and the descriptor
			// is released by this type's Drop.
			let status = unsafe {
				GetNamedSecurityInfoW(
					wide_path.as_ptr(),
					SE_FILE_OBJECT,
					OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
					&mut owner,
					std::ptr::null_mut(),
					&mut dacl,
					std::ptr::null_mut(),
					&mut descriptor,
				)
			};
			if status != ERROR_SUCCESS {
				return Err(io::Error::from_raw_os_error(status as i32));
			}

			let owner = OwnedSid::copy_from(owner).inspect_err(|_| {
				// SAFETY: the descriptor is valid and not yet owned by Self.
				unsafe { LocalFree(descriptor as _) };
			})?;

			Ok(Self {
				descriptor,
				dacl,
				owner,
			})
		}

		/// The principals a secret-bearing file may grant.
		fn permitted(&self) -> io::Result<Vec<OwnedSid>> {
			Ok(vec![
				OwnedSid {
					buffer: self.owner.buffer.clone(),
				},
				OwnedSid::well_known(WinLocalSystemSid)?,
				OwnedSid::well_known(WinBuiltinAdministratorsSid)?,
			])
		}

		/// Whether every principal the DACL grants access to is permitted.
		///
		/// A `NULL` DACL is not owner-only: it grants everyone full access.
		pub fn is_owner_only(&self) -> io::Result<bool> {
			if self.dacl.is_null() {
				return Ok(false);
			}

			let permitted = self.permitted()?;
			// SAFETY: `dacl` is non-null and owned by the live descriptor.
			let count = unsafe { (*self.dacl).AceCount } as u32;

			for index in 0..count {
				let mut ace: *mut std::ffi::c_void = std::ptr::null_mut();
				// SAFETY: `index` is below the ACE count just read.
				if unsafe { GetAce(self.dacl, index, &mut ace) } == 0 {
					return Err(io::Error::last_os_error());
				}

				// SAFETY: GetAce yields a pointer to an ACE_HEADER.
				let header = unsafe { *(ace as *const ACE_HEADER) };
				// Deny entries only remove access, so they cannot widen it.
				if header.AceType != ACCESS_ALLOWED_ACE_TYPE as u8 {
					continue;
				}

				// SAFETY: the type was just confirmed as an allow ACE, whose
				// SID begins at the `SidStart` field.
				let sid = unsafe { std::ptr::addr_of!((*(ace as *const ACCESS_ALLOWED_ACE)).SidStart) };
				let granted = OwnedSid::copy_from(sid as PSID)?;
				if !permitted.contains(&granted) {
					return Ok(false);
				}
			}

			Ok(true)
		}

		/// Replace the object's DACL with a protected, owner-only one.
		pub fn apply_owner_only_dacl(&self, path: &Path) -> io::Result<()> {
			let permitted = self.permitted()?;
			let mut entries: Vec<EXPLICIT_ACCESS_W> = permitted
				.iter()
				.map(|sid| EXPLICIT_ACCESS_W {
					grfAccessPermissions: FILE_ALL_ACCESS,
					grfAccessMode: SET_ACCESS,
					grfInheritance: NO_INHERITANCE,
					Trustee: TRUSTEE_W {
						pMultipleTrustee: std::ptr::null_mut(),
						MultipleTrusteeOperation: NO_MULTIPLE_TRUSTEE,
						TrusteeForm: TRUSTEE_IS_SID,
						TrusteeType: TRUSTEE_IS_UNKNOWN,
						ptstrName: sid.as_psid() as *mut u16,
					},
				})
				.collect();

			let mut acl: *mut WinAcl = std::ptr::null_mut();
			// SAFETY: `entries` is a valid slice for its stated length and
			// `acl` receives a buffer released below.
			let status = unsafe {
				SetEntriesInAclW(
					entries.len() as u32,
					entries.as_mut_ptr(),
					std::ptr::null_mut(),
					&mut acl,
				)
			};
			if status != ERROR_SUCCESS {
				return Err(io::Error::from_raw_os_error(status as i32));
			}

			let wide_path = wide(path);
			// SAFETY: `acl` was produced by SetEntriesInAclW above.
			let status = unsafe {
				SetNamedSecurityInfoW(
					wide_path.as_ptr() as *mut u16,
					SE_FILE_OBJECT,
					DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
					std::ptr::null_mut(),
					std::ptr::null_mut(),
					acl,
					std::ptr::null_mut(),
				)
			};
			// SAFETY: SetEntriesInAclW documents LocalFree as the release.
			unsafe { LocalFree(acl as _) };

			if status != ERROR_SUCCESS {
				return Err(io::Error::from_raw_os_error(status as i32));
			}
			Ok(())
		}
	}
}

#[cfg(windows)]
use windows_acl::FileSecurity;

#[cfg(all(test, windows))]
mod tests {
	use super::*;
	use std::fs;

	#[test]
	fn restricts_a_file_created_under_a_permissive_parent() {
		let dir = tempfile::tempdir().unwrap();
		let parent = dir.path().join("permissive");
		fs::create_dir_all(&parent).unwrap();

		// Deliberately widen the parent so the file inherits broad access,
		// which is the situation this function exists to correct.
		let _ = std::process::Command::new("icacls")
			.arg(parent.as_os_str())
			.args(["/grant", "*S-1-1-0:(OI)(CI)(F)"])
			.output();

		let path = parent.join("token");
		fs::write(&path, "super-secret").unwrap();

		restrict_to_owner(&path).unwrap();

		// The owner must still be able to read it back.
		assert_eq!(fs::read_to_string(&path).unwrap(), "super-secret");
		assert!(is_restricted_to_owner(&path).unwrap());
	}

	/// Grant a principal that a broad-SID scan would not look for. Such an
	/// entry survives `icacls /inheritance:r /grant:r`, so a verifier that
	/// only scans for "everyone-ish" SIDs would call this file owner-only.
	#[test]
	fn detects_an_explicit_grant_to_an_unrelated_principal() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");
		fs::write(&path, "secret").unwrap();

		restrict_to_owner(&path).unwrap();
		assert!(is_restricted_to_owner(&path).unwrap());

		// `S-1-5-4` is INTERACTIVE: every interactively logged-on user, so
		// granting it defeats the point of the file, yet it is not one of the
		// well-known "everyone-ish" SIDs a scan would enumerate.
		let granted = std::process::Command::new("icacls")
			.arg(path.as_os_str())
			.args(["/grant", "*S-1-5-4:(R)"])
			.output()
			.unwrap();
		assert!(granted.status.success(), "could not widen the test file");

		assert!(
			!is_restricted_to_owner(&path).unwrap(),
			"a file readable by another principal must not be reported owner-only"
		);
	}

	/// The check must report a problem rather than quietly succeeding when it
	/// cannot inspect the object at all.
	#[test]
	fn reports_an_error_for_a_missing_file() {
		let dir = tempfile::tempdir().unwrap();
		let missing = dir.path().join("absent");

		let err = is_restricted_to_owner(&missing).unwrap_err();
		assert_eq!(err.kind(), io::ErrorKind::NotFound);
	}

	/// Inheritance from a permissive parent must not survive, regardless of
	/// whether the platform removes inherited entries or converts them.
	#[test]
	fn drops_inherited_access_from_a_permissive_parent() {
		let dir = tempfile::tempdir().unwrap();
		let parent = dir.path().join("permissive");
		fs::create_dir_all(&parent).unwrap();
		let _ = std::process::Command::new("icacls")
			.arg(parent.as_os_str())
			.args(["/grant", "*S-1-1-0:(OI)(CI)(F)"])
			.output();

		let path = parent.join("token");
		fs::write(&path, "secret").unwrap();
		assert!(
			!is_restricted_to_owner(&path).unwrap(),
			"the inherited grant should be visible before restricting"
		);

		restrict_to_owner(&path).unwrap();
		assert!(is_restricted_to_owner(&path).unwrap());
	}
}

#[cfg(all(test, not(windows)))]
mod posix_tests {
	use super::*;
	use std::fs;
	use std::os::unix::fs::PermissionsExt;

	#[test]
	fn tightens_a_group_and_world_readable_file() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("token");
		fs::write(&path, "super-secret").unwrap();
		fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
		assert!(!is_restricted_to_owner(&path).unwrap());

		restrict_to_owner(&path).unwrap();

		assert!(is_restricted_to_owner(&path).unwrap());
		assert_eq!(fs::read_to_string(&path).unwrap(), "super-secret");
	}

	#[test]
	fn keeps_a_directory_traversable_by_its_owner() {
		let dir = tempfile::tempdir().unwrap();
		let nested = dir.path().join("root");
		fs::create_dir_all(&nested).unwrap();
		fs::set_permissions(&nested, fs::Permissions::from_mode(0o755)).unwrap();

		restrict_to_owner(&nested).unwrap();

		assert!(is_restricted_to_owner(&nested).unwrap());
		// Without the owner execute bit the directory could not be entered.
		fs::write(nested.join("child"), "ok").unwrap();
		assert_eq!(fs::read_to_string(nested.join("child")).unwrap(), "ok");
	}

	#[test]
	fn preserves_an_executable_bit_it_found() {
		let dir = tempfile::tempdir().unwrap();
		let path = dir.path().join("code");
		fs::write(&path, "#!/bin/sh\n").unwrap();
		fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();

		restrict_to_owner(&path).unwrap();

		assert!(is_restricted_to_owner(&path).unwrap());
		assert_eq!(
			fs::metadata(&path).unwrap().permissions().mode() & 0o777,
			0o700
		);
	}
}