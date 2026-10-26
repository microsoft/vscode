/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! The unit tests that a change adds. Pull request CI runs them repeatedly, so that a flaky test
//! is found before it merges rather than after.

use std::collections::{HashMap, HashSet};

use serde::Serialize;

use crate::analyze::TestCase;
use crate::config::Role;
use crate::graph::{Entry, Snapshot};

/// What a test runner runs for a target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
	/// The test with the title path.
	Test,
	/// The tests of the suite with the title path.
	Suite,
	/// The tests of the file.
	File,
}

/// New tests as a test runner selects them: by their title path, or when only a part of it is
/// known, by that of a suite around them or by their file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Target {
	pub file: String,
	pub kind: Kind,
	pub title_path: Vec<String>,
}

impl Target {
	/// Whether the tests of `other` are tests of this target.
	fn covers(&self, other: &Target) -> bool {
		match self.kind {
			Kind::File => true,
			Kind::Test => other.kind == Kind::Test && other.title_path == self.title_path,
			Kind::Suite => {
				other.kind != Kind::File
					&& other.title_path.starts_with(&self.title_path)
					&& (other.kind == Kind::Suite || other.title_path.len() > self.title_path.len())
			}
		}
	}
}

/// The unit test files of a snapshot, by path.
fn unit_tests(snap: &Snapshot) -> HashMap<&str, &Entry> {
	snap.entries
		.iter()
		.filter(|e| e.role == Role::UnitTest)
		.map(|e| (&*e.path, e))
		.collect()
}

fn cases(e: &Entry) -> &[TestCase] {
	e.facts.as_ref().map_or(&[][..], |f| &f.test_cases[..])
}

/// The unit tests that `head` adds to `base`: the tests of new test files, and the tests that a
/// file did not have before, by their titles (so a renamed test is new). A test that replaces an
/// identical one, by its titles and its code, that another file lost was moved, not added: the
/// tests of a renamed file or of a file split in two are not new. A new file without tests that
/// the analysis finds, such as tests that helpers of other modules define, is new as a whole.
pub fn new_tests(base: &Snapshot, head: &Snapshot) -> Vec<Target> {
	let (before, after) = (unit_tests(base), unit_tests(head));
	let changed = |path: &str| match (before.get(path), after.get(path)) {
		(Some(b), Some(h)) => b.oid != h.oid,
		_ => true,
	};
	// The tests that the changed files lost, by (key, hash), and the files that disappeared.
	let mut lost: HashMap<(u64, u64), usize> = HashMap::new();
	let mut deleted: HashSet<&str> = HashSet::new();
	for (path, b) in before.iter().filter(|(p, _)| changed(p)) {
		let mut remaining: HashMap<(u64, u64), usize> = HashMap::new();
		if let Some(h) = after.get(path) {
			for t in cases(h) {
				*remaining.entry((t.key, t.hash)).or_default() += 1;
			}
		} else {
			deleted.insert(&*b.oid);
		}
		for t in cases(b) {
			match remaining.get_mut(&(t.key, t.hash)) {
				Some(n) if *n > 0 => *n -= 1,
				_ => *lost.entry((t.key, t.hash)).or_default() += 1,
			}
		}
	}

	let mut paths: Vec<&str> = after.keys().copied().filter(|p| changed(p)).collect();
	paths.sort_unstable();
	let mut targets = Vec::new();
	for path in paths {
		let h = after[path];
		let known: HashSet<u64> = before
			.get(path)
			.map(|b| cases(b).iter().map(|t| t.key).collect())
			.unwrap_or_default();
		let mut added = Vec::new();
		for t in cases(h) {
			if known.contains(&t.key) {
				continue;
			}
			match lost.get_mut(&(t.key, t.hash)) {
				Some(n) if *n > 0 => *n -= 1,
				_ => added.push(t),
			}
		}
		let file = || Target {
			file: h.path.to_string(),
			kind: Kind::File,
			title_path: Vec::new(),
		};
		if !before.contains_key(path) {
			if cases(h).is_empty() {
				if !deleted.contains(&*h.oid) {
					targets.push(file());
				}
				continue;
			}
			if added.len() == cases(h).len() {
				targets.push(file());
				continue;
			}
		}
		let mut file_targets: Vec<Target> = Vec::new();
		for t in added {
			let target = match (t.exact, t.title_path.is_empty()) {
				(true, _) => Target {
					file: h.path.to_string(),
					kind: Kind::Test,
					title_path: t.title_path.clone(),
				},
				(false, false) => Target {
					file: h.path.to_string(),
					kind: Kind::Suite,
					title_path: t.title_path.clone(),
				},
				(false, true) => file(),
			};
			if file_targets.iter().any(|o| o.covers(&target)) {
				continue;
			}
			file_targets.retain(|o| !target.covers(o));
			file_targets.push(target);
		}
		file_targets.sort_by(|a, b| a.title_path.cmp(&b.title_path));
		targets.extend(file_targets);
	}
	targets
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::analyze::analyze;
	use crate::config::for_tests;
	use std::sync::Arc;
	use xxhash_rust::xxh3::xxh3_64;

	fn snapshot(files: &[(&str, &str)]) -> Snapshot {
		let config = for_tests();
		let mut entries: Vec<Entry> = files
			.iter()
			.map(|(path, content)| {
				let role = config.role(path);
				Entry {
					path: (*path).into(),
					oid: format!("{:016x}", xxh3_64(content.as_bytes())).into(),
					role,
					facts: role
						.is_module()
						.then(|| Arc::new(analyze(path, content, config))),
				}
			})
			.collect();
		entries.sort_by(|a, b| a.path.cmp(&b.path));
		Snapshot { entries }
	}

	/// The new tests of the change from `base` to `head`, as `file: kind titles`.
	fn added(base: &[(&str, &str)], head: &[(&str, &str)]) -> Vec<String> {
		new_tests(&snapshot(base), &snapshot(head))
			.iter()
			.map(|t| format!("{}: {:?} {}", t.file, t.kind, t.title_path.join(" > ")))
			.collect()
	}

	const A: &str = "src/a/test/a.test.ts";
	const B: &str = "src/a/test/b.test.ts";

	#[test]
	fn new_tests_are_selected_by_what_is_known_of_their_title_path() {
		let base = "suite('S', () => {\n\ttest('one', () => { f(1); });\n});\n";
		let head = "suite('S', () => {\n\ttest('one', () => { f(2); });\n\ttest('two', () => {});\n\tsuite('T', () => {\n\t\ttest('three', () => {});\n\t\tfor (const i of [1, 2]) { test(`case ${i}`, () => {}); }\n\t});\n});\nfunction helper() { test('four', () => {}); }\n";
		assert_eq!(
			added(&[(A, base)], &[(A, head)]),
			// A changed test is not new, and a whole file covers the rest of it.
			vec!["src/a/test/a.test.ts: File "]
		);
		let head = "suite('S', () => {\n\ttest('one', () => { f(2); });\n\ttest('two', () => {});\n\tsuite('T', () => {\n\t\ttest('three', () => {});\n\t\tfor (const i of [1, 2]) { test(`case ${i}`, () => {}); }\n\t});\n\tsuite('U', () => { test('five', () => {}); });\n});\n";
		assert_eq!(
			added(&[(A, base)], &[(A, head)]),
			vec![
				"src/a/test/a.test.ts: Suite S > T",
				"src/a/test/a.test.ts: Test S > U > five",
				"src/a/test/a.test.ts: Test S > two",
			]
		);
	}

	#[test]
	fn new_test_files_are_new_as_a_whole() {
		let head = [
			(A, "suite('S', () => { test('t', () => {}); });\n"),
			// Tests that a helper of another module defines.
			(
				B,
				"import { defineTests } from '../suites.js';\ndefineTests();\n",
			),
			("src/a/test/c.integrationTest.ts", "test('t', () => {});\n"),
			(
				"src/a/test/utils.ts",
				"export function f() { test('t', () => {}); }\n",
			),
		];
		assert_eq!(
			added(&[], &head),
			vec!["src/a/test/a.test.ts: File ", "src/a/test/b.test.ts: File "]
		);
	}

	#[test]
	fn moved_tests_are_not_new() {
		let a = "suite('S', () => {\n\ttest('one', () => { f(1); });\n\ttest('two', () => { f(2); });\n});\n";
		let helpers = "import { defineTests } from '../suites.js';\ndefineTests();\n";
		// A renamed file, also one whose tests helpers define, and a test that moved to another file.
		assert_eq!(
			added(
				&[(A, a), ("src/a/test/c.test.ts", helpers)],
				&[(B, a), ("src/a/test/d.test.ts", helpers)]
			),
			Vec::<String>::new()
		);
		assert_eq!(
			added(
				&[(A, a)],
				&[
					(
						A,
						"suite('S', () => {\n\ttest('one', () => { f(1); });\n});\n"
					),
					(
						B,
						"suite('S', () => {\n\ttest('two', () => { f(2); });\n\ttest('three', () => {});\n});\n"
					)
				]
			),
			vec!["src/a/test/b.test.ts: Test S > three"]
		);
		// A copy is new, and so is a test that moved and changed, or that moved to another suite.
		assert_eq!(
			added(
				&[(A, a)],
				&[
					(A, a),
					(
						B,
						"suite('S', () => {\n\ttest('one', () => { f(1); });\n\ttest('two', () => { f(3); });\n});\nsuite('T', () => { test('one', () => { f(1); }); });\n"
					)
				]
			),
			vec!["src/a/test/b.test.ts: File "]
		);
	}

	#[test]
	fn renamed_and_unskipped_tests_are_new() {
		let base = "suite('S', () => {\n\ttest('one', () => {});\n\ttest.skip('two', () => {});\n});\nsuite.skip('T', () => { test('three', () => {}); });\n";
		let head = "suite('S', () => {\n\ttest('uno', () => {});\n\ttest('two', () => {});\n});\nsuite('T', () => { test('three', () => {}); });\n";
		assert_eq!(
			added(&[(A, base)], &[(A, head)]),
			vec![
				"src/a/test/a.test.ts: Test S > two",
				"src/a/test/a.test.ts: Test S > uno",
				"src/a/test/a.test.ts: Test T > three",
			]
		);
	}
}
