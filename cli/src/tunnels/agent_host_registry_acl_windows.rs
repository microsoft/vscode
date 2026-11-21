/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Windows-only owner-only ACL for the shared agent host endpoint registry
//! directory, via native Win32 security APIs (no `whoami.exe`/`icacls.exe`
//! subprocesses). The current user is identified by SID rather than by a
//! locale-sensitive account name.

use std::ffi::OsStr;
use std::io;
use std::iter::once;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::ptr;

use windows_sys::core::PWSTR;
use windows_sys::Win32::Foundation::{CloseHandle, LocalFree, HANDLE, HLOCAL};
use windows_sys::Win32::Security::Authorization::{
	ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
	SetNamedSecurityInfoW, SDDL_REVISION_1, SE_FILE_OBJECT,
};
use windows_sys::Win32::Security::{
	GetSecurityDescriptorDacl, GetTokenInformation, TokenUser, ACL, DACL_SECURITY_INFORMATION,
	PROTECTED_DACL_SECURITY_INFORMATION, PSECURITY_DESCRIPTOR, PSID, TOKEN_QUERY, TOKEN_USER,
};
use windows_sys::Win32::System::Threading::{GetCurrentProcess, OpenProcessToken};

/// Applies a protected DACL to `path` granting full control, with
/// object/container inheritance (so children inherit the same grants), to
/// only the current user, `LOCAL SYSTEM`, and `BUILTIN\Administrators`.
/// Mirrors `prepareLocalAgentHostEndpointMetadataDirectory`'s Windows branch
/// in `node/localAgentHostMetadata.ts`.
pub(super) fn apply_owner_only_acl(path: &Path) -> io::Result<()> {
	let sid = current_user_sid_string()?;
	// "D:P" = protected DACL, i.e. no inherited ACEs from the parent
	// (matches `icacls /inheritance:r`). Each `(A;OICI;FA;;;<sid>)` grants
	// Full-Access to <sid>, with Object-Inherit + Container-Inherit so
	// files/subdirectories created underneath inherit the same grant. `SY`
	// and `BA` are the SDDL well-known aliases for LOCAL SYSTEM and
	// BUILTIN\Administrators.
	let sddl = format!("D:P(A;OICI;FA;;;{sid})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)");

	let descriptor = SecurityDescriptor::from_sddl(&sddl)?;
	let dacl = descriptor.dacl()?;
	let path_wide = to_wide_null(path.as_os_str());

	// SAFETY: `path_wide` is a valid null-terminated wide string live for
	// the call; `dacl` points into `descriptor`, which outlives this call.
	// Null owner/group/sacl leave those unchanged.
	let result = unsafe {
		SetNamedSecurityInfoW(
			path_wide.as_ptr(),
			SE_FILE_OBJECT,
			DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
			ptr::null_mut(),
			ptr::null_mut(),
			dacl,
			ptr::null(),
		)
	};
	if result != 0 {
		return Err(io::Error::from_raw_os_error(result as i32));
	}
	Ok(())
}

/// Returns the exact SID (never a locale-sensitive account name) of the
/// current process's user, in `S-1-5-...` string form.
fn current_user_sid_string() -> io::Result<String> {
	// SAFETY: `GetCurrentProcess` returns a pseudo-handle that must not be
	// closed. `OpenProcessToken` with `TOKEN_QUERY` only opens a read
	// handle to the process's own token.
	let mut token: HANDLE = ptr::null_mut();
	if unsafe { OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) } == 0 {
		return Err(io::Error::last_os_error());
	}
	let token = OwnedHandle(token);

	let mut needed: u32 = 0;
	// SAFETY: passing a null/zero-length buffer is the documented way to
	// query the required size; it is written to `needed` regardless of
	// the (expected) failure return.
	unsafe { GetTokenInformation(token.0, TokenUser, ptr::null_mut(), 0, &mut needed) };
	if needed == 0 {
		return Err(io::Error::last_os_error());
	}

	let mut buffer = vec![0u8; needed as usize];
	// SAFETY: `buffer` is exactly `needed` bytes, the size this same call
	// reported above, and is only read as a `TOKEN_USER` once this
	// succeeds.
	let ok = unsafe {
		GetTokenInformation(
			token.0,
			TokenUser,
			buffer.as_mut_ptr() as *mut _,
			needed,
			&mut needed,
		)
	};
	if ok == 0 {
		return Err(io::Error::last_os_error());
	}

	// SAFETY: `buffer` was just filled with a valid `TOKEN_USER` above;
	// `User.Sid` points inside `buffer` and stays valid for `buffer`'s
	// lifetime, which outlives this call to `sid_to_string`.
	let sid = unsafe { (*(buffer.as_ptr() as *const TOKEN_USER)).User.Sid };
	sid_to_string(sid)
}

/// Converts a SID to its `S-1-5-...` string form.
fn sid_to_string(sid: PSID) -> io::Result<String> {
	let mut string_sid: PWSTR = ptr::null_mut();
	// SAFETY: `sid` is a valid SID for the duration of this call (see
	// callers). `ConvertSidToStringSidW` allocates `string_sid` via
	// `LocalAlloc`; ownership is transferred to `LocalWideString`, which
	// frees it via `LocalFree` on drop.
	if unsafe { ConvertSidToStringSidW(sid, &mut string_sid) } == 0 {
		return Err(io::Error::last_os_error());
	}
	Ok(LocalWideString(string_sid).to_string_lossy())
}

fn to_wide_null(value: &OsStr) -> Vec<u16> {
	value.encode_wide().chain(once(0)).collect()
}

/// An owned process token handle, closed on drop.
struct OwnedHandle(HANDLE);

impl Drop for OwnedHandle {
	fn drop(&mut self) {
		// SAFETY: `self.0` is a valid handle opened by `OpenProcessToken`
		// and not otherwise closed.
		unsafe {
			CloseHandle(self.0);
		}
	}
}

/// An owned `LocalAlloc`-backed wide string, e.g. as returned by
/// `ConvertSidToStringSidW`, freed via `LocalFree` on drop.
struct LocalWideString(PWSTR);

impl LocalWideString {
	fn to_string_lossy(&self) -> String {
		// SAFETY: `self.0` is a valid null-terminated wide string for the
		// lifetime of `self`.
		let len = unsafe { (0..).take_while(|&i| *self.0.add(i) != 0).count() };
		// SAFETY: `[self.0, self.0 + len)` was just measured as the
		// null-terminated extent of a valid wide string above.
		let slice = unsafe { std::slice::from_raw_parts(self.0, len) };
		String::from_utf16_lossy(slice)
	}
}

impl Drop for LocalWideString {
	fn drop(&mut self) {
		if !self.0.is_null() {
			// SAFETY: `self.0` was allocated by `ConvertSidToStringSidW`,
			// which documents `LocalFree` as the correct release for it.
			unsafe {
				LocalFree(self.0 as HLOCAL);
			}
		}
	}
}

/// An owned `LocalAlloc`-backed security descriptor, e.g. as returned by
/// `ConvertStringSecurityDescriptorToSecurityDescriptorW` or
/// `GetNamedSecurityInfoW`, freed via `LocalFree` on drop.
pub(super) struct SecurityDescriptor(PSECURITY_DESCRIPTOR);

impl SecurityDescriptor {
	fn from_sddl(sddl: &str) -> io::Result<Self> {
		let wide = to_wide_null(OsStr::new(sddl));
		let mut descriptor: PSECURITY_DESCRIPTOR = ptr::null_mut();
		// SAFETY: `wide` is a valid null-terminated wide string live for
		// the call. The resulting descriptor is allocated via
		// `LocalAlloc` and is owned by the returned `Self`.
		let ok = unsafe {
			ConvertStringSecurityDescriptorToSecurityDescriptorW(
				wide.as_ptr(),
				SDDL_REVISION_1,
				&mut descriptor,
				ptr::null_mut(),
			)
		};
		if ok == 0 {
			return Err(io::Error::last_os_error());
		}
		Ok(Self(descriptor))
	}

	/// Takes ownership of a security descriptor already allocated by a
	/// Win32 API that documents `LocalFree` as its release (e.g.
	/// `GetNamedSecurityInfoW`), used by tests to inspect an applied ACL.
	#[cfg(test)]
	pub(super) fn from_raw(descriptor: PSECURITY_DESCRIPTOR) -> Self {
		Self(descriptor)
	}

	/// Used by tests to independently verify security-descriptor control
	/// flags (e.g. `SE_DACL_PROTECTED`) on the applied ACL.
	#[cfg(test)]
	pub(super) fn raw(&self) -> PSECURITY_DESCRIPTOR {
		self.0
	}

	/// Returns the DACL embedded in this security descriptor. The
	/// returned pointer's lifetime is tied to `self`.
	pub(super) fn dacl(&self) -> io::Result<*const ACL> {
		let mut present = 0;
		let mut dacl: *mut ACL = ptr::null_mut();
		let mut defaulted = 0;
		// SAFETY: `self.0` is a valid security descriptor kept alive for
		// at least as long as the returned pointer is used.
		let ok =
			unsafe { GetSecurityDescriptorDacl(self.0, &mut present, &mut dacl, &mut defaulted) };
		if ok == 0 {
			return Err(io::Error::last_os_error());
		}
		if present == 0 {
			return Err(io::Error::other(
				"security descriptor unexpectedly has no DACL",
			));
		}
		Ok(dacl)
	}
}

impl Drop for SecurityDescriptor {
	fn drop(&mut self) {
		if !self.0.is_null() {
			// SAFETY: `self.0` was allocated by either
			// `ConvertStringSecurityDescriptorToSecurityDescriptorW` or
			// `GetNamedSecurityInfoW`, both of which document `LocalFree`
			// as the correct release for it.
			unsafe {
				LocalFree(self.0 as HLOCAL);
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use windows_sys::Win32::Security::Authorization::GetNamedSecurityInfoW;
	use windows_sys::Win32::Security::{
		GetAce, GetSecurityDescriptorControl, ACCESS_ALLOWED_ACE, CONTAINER_INHERIT_ACE,
		OBJECT_INHERIT_ACE, SE_DACL_PROTECTED,
	};

	// winnt.h `ACCESS_ALLOWED_ACE_TYPE`; not worth an extra windows-sys
	// feature for a single test-only constant.
	const ACCESS_ALLOWED_ACE_TYPE: u8 = 0;
	// winnt.h `FILE_ALL_ACCESS`; likewise kept local to this test.
	const FILE_ALL_ACCESS: u32 = 0x001F_01FF;

	/// Reads back the DACL Win32 actually stored for `path` (as opposed to
	/// the DACL passed to `SetNamedSecurityInfoW`), so the assertions below
	/// exercise the real, applied ACL rather than our own construction of
	/// it.
	fn read_dacl(path: &Path) -> (SecurityDescriptor, *const ACL) {
		let path_wide = to_wide_null(path.as_os_str());
		let mut dacl: *mut ACL = ptr::null_mut();
		let mut descriptor: PSECURITY_DESCRIPTOR = ptr::null_mut();
		// SAFETY: `path_wide` is a valid null-terminated wide string live
		// for the call. The returned descriptor is `LocalAlloc`-backed and
		// is wrapped below so it is freed on drop; `dacl` points inside it.
		let result = unsafe {
			GetNamedSecurityInfoW(
				path_wide.as_ptr(),
				SE_FILE_OBJECT,
				DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION,
				ptr::null_mut(),
				ptr::null_mut(),
				&mut dacl,
				ptr::null_mut(),
				&mut descriptor,
			)
		};
		assert_eq!(result, 0, "GetNamedSecurityInfoW failed: {result}");
		(SecurityDescriptor::from_raw(descriptor), dacl)
	}

	#[test]
	fn apply_owner_only_acl_grants_exactly_user_system_and_admins() {
		let dir = tempfile::tempdir().unwrap();
		apply_owner_only_acl(dir.path()).unwrap();

		let (descriptor, dacl) = read_dacl(dir.path());

		let mut control: u16 = 0;
		let mut revision: u32 = 0;
		// SAFETY: `descriptor.raw()` is a valid security descriptor from
		// `read_dacl` above, kept alive by `descriptor`.
		let ok =
			unsafe { GetSecurityDescriptorControl(descriptor.raw(), &mut control, &mut revision) };
		assert_ne!(ok, 0, "GetSecurityDescriptorControl failed");
		assert_ne!(
			control & SE_DACL_PROTECTED,
			0,
			"DACL must be protected (no inheritance from the parent directory)"
		);

		// SAFETY: `dacl` points into `descriptor`, which is still alive.
		let ace_count = unsafe { (*dacl).AceCount };
		assert_eq!(ace_count, 3, "expected exactly one ACE per granted SID");

		let mut granted_sids = Vec::new();
		for index in 0..ace_count as u32 {
			let mut ace_ptr: *mut core::ffi::c_void = ptr::null_mut();
			// SAFETY: `index` is within `[0, ace_count)`; `dacl` is valid.
			let ok = unsafe { GetAce(dacl, index, &mut ace_ptr) };
			assert_ne!(ok, 0, "GetAce failed for index {index}");

			// SAFETY: every ACE in an SDDL-built `(A;...)` DACL is an
			// `ACCESS_ALLOWED_ACE`, and `ace_ptr` was just validated above.
			let ace = unsafe { &*(ace_ptr as *const ACCESS_ALLOWED_ACE) };
			assert_eq!(ace.Header.AceType, ACCESS_ALLOWED_ACE_TYPE);
			let inherit_flags = OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE;
			assert_eq!(
				ace.Header.AceFlags as u32 & inherit_flags,
				inherit_flags,
				"ACE must carry object + container inherit flags for index {index}"
			);
			assert_eq!(ace.Mask, FILE_ALL_ACCESS, "ACE must grant full control");

			// SAFETY: `SidStart` is the address of the variable-length SID
			// data that immediately follows the fixed `ACCESS_ALLOWED_ACE`
			// fields, per its documented layout.
			let sid = &ace.SidStart as *const u32 as PSID;
			granted_sids.push(sid_to_string(sid).unwrap());
		}
		granted_sids.sort();

		let mut expected = vec![
			current_user_sid_string().unwrap(),
			"S-1-5-18".to_string(),     // LOCAL SYSTEM
			"S-1-5-32-544".to_string(), // BUILTIN\Administrators
		];
		expected.sort();
		assert_eq!(granted_sids, expected);
	}
}
