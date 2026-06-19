/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

use std::fs;
use std::path::{Component, Path, PathBuf};

use super::errors::{wrap, WrappedError};

/// Lexically normalizes a path, resolving `.` and `..` components without
/// touching the filesystem. Returns `None` if normalization would walk above
/// the path's root via a leading `..`.
fn lexically_normalize(path: &Path) -> Option<PathBuf> {
	let mut out = PathBuf::new();
	for component in path.components() {
		match component {
			Component::Prefix(_) | Component::RootDir | Component::Normal(_) => {
				out.push(component);
			}
			Component::CurDir => {}
			Component::ParentDir => {
				if !out.pop() {
					return None;
				}
			}
		}
	}
	Some(out)
}

/// Ensures the extraction root exists and returns its canonicalized form to
/// use as the reference for containment checks.
pub fn prepare_extraction_root(root: &Path) -> Result<PathBuf, WrappedError> {
	fs::create_dir_all(root)
		.map_err(|e| wrap(e, format!("could not create extraction root {}", root.display())))?;
	fs::canonicalize(root).map_err(|e| {
		wrap(
			e,
			format!("could not canonicalize extraction root {}", root.display()),
		)
	})
}

/// Joins an archive entry's relative path under `root_canonical` after
/// rejecting any entry that would land outside the root. Rejects empty
/// entries, absolute paths, drive prefixes, and `..` traversal that escapes
/// the root.
pub fn safe_extract_join(root_canonical: &Path, entry: &Path) -> Result<PathBuf, WrappedError> {
	if entry.as_os_str().is_empty() {
		return Err(wrap(
			"empty extraction entry",
			"refusing to extract empty archive entry".to_string(),
		));
	}

	for component in entry.components() {
		if matches!(component, Component::Prefix(_) | Component::RootDir) {
			return Err(wrap(
				"entry has an absolute or drive-prefixed path",
				format!("refusing extraction entry {}", entry.display()),
			));
		}
	}

	let joined = root_canonical.join(entry);
	let normalized = lexically_normalize(&joined).ok_or_else(|| {
		wrap(
			"entry escapes extraction root",
			format!("refusing extraction entry {}", entry.display()),
		)
	})?;
	if !normalized.starts_with(root_canonical) {
		return Err(wrap(
			"entry escapes extraction root",
			format!("refusing extraction entry {}", entry.display()),
		));
	}
	Ok(normalized)
}

/// Validates that an existing path resolves (via filesystem canonicalization)
/// to a location inside `root_canonical`. This catches symlinks created
/// earlier in the archive that would redirect writes outside the root.
pub fn ensure_canonical_within_root(
	root_canonical: &Path,
	path: &Path,
) -> Result<(), WrappedError> {
	let canon = fs::canonicalize(path).map_err(|e| {
		wrap(
			e,
			format!("could not canonicalize extraction path {}", path.display()),
		)
	})?;
	if !canon.starts_with(root_canonical) {
		return Err(wrap(
			"extraction path resolves outside root",
			format!(
				"refusing to write {} which resolves to {}",
				path.display(),
				canon.display()
			),
		));
	}
	Ok(())
}

/// For Unix symlink entries: validates that the symlink target, interpreted
/// relative to the symlink's parent directory, would not point outside the
/// extraction root. Absolute targets are rejected outright.
#[cfg(unix)]
pub fn validate_symlink_target(
	root_canonical: &Path,
	link_path: &Path,
	target: &Path,
) -> Result<(), WrappedError> {
	if target.is_absolute() {
		return Err(wrap(
			"symlink target is absolute",
			format!(
				"refusing symlink {} -> {}",
				link_path.display(),
				target.display()
			),
		));
	}

	let link_parent = link_path.parent().unwrap_or_else(|| Path::new(""));
	let joined = link_parent.join(target);
	let normalized = lexically_normalize(&joined).ok_or_else(|| {
		wrap(
			"symlink target escapes extraction root",
			format!(
				"refusing symlink {} -> {}",
				link_path.display(),
				target.display()
			),
		)
	})?;
	if !normalized.starts_with(root_canonical) {
		return Err(wrap(
			"symlink target escapes extraction root",
			format!(
				"refusing symlink {} -> {}",
				link_path.display(),
				target.display()
			),
		));
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn lexically_normalize_basic() {
		assert_eq!(
			lexically_normalize(Path::new("a/b/../c")).unwrap(),
			PathBuf::from("a/c")
		);
		assert_eq!(
			lexically_normalize(Path::new("./a/./b")).unwrap(),
			PathBuf::from("a/b")
		);
		assert!(lexically_normalize(Path::new("../a")).is_none());
	}

	#[test]
	fn safe_extract_join_rejects_traversal() {
		let root = std::env::temp_dir();
		let root = fs::canonicalize(&root).unwrap();
		assert!(safe_extract_join(&root, Path::new("../etc/passwd")).is_err());
		assert!(safe_extract_join(&root, Path::new("a/../../etc/passwd")).is_err());
		assert!(safe_extract_join(&root, Path::new("/etc/passwd")).is_err());
		let ok = safe_extract_join(&root, Path::new("a/b/c")).unwrap();
		assert_eq!(ok, root.join("a/b/c"));
	}

	#[test]
	fn safe_extract_join_rejects_empty_relative() {
		let root = fs::canonicalize(std::env::temp_dir()).unwrap();
		assert!(safe_extract_join(&root, Path::new("")).is_err());
	}

	#[cfg(unix)]
	#[test]
	fn validate_symlink_rejects_escapes() {
		let root = fs::canonicalize(std::env::temp_dir()).unwrap();
		let link = root.join("sub/dir/link");
		assert!(validate_symlink_target(&root, &link, Path::new("/etc/passwd")).is_err());
		assert!(validate_symlink_target(&root, &link, Path::new("../../../etc/passwd")).is_err());
		assert!(validate_symlink_target(&root, &link, Path::new("../sibling")).is_ok());
		assert!(validate_symlink_target(&root, &link, Path::new("inside/file")).is_ok());
	}
}
