/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Maps `package.json` and `package-lock.json` changes to the npm packages they affect, so a
//! dependency bump only selects the tests that load the bumped package.

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::{Map, Value};

use crate::config::Config;

/// `package.json` fields that only describe the package. Code that reads the manifest at runtime
/// (see `injectedGlobals` in the configuration) can see the other fields, except `scripts`.
const METADATA_FIELDS: &[&str] = &[
	"description",
	"repository",
	"bugs",
	"homepage",
	"author",
	"license",
	"private",
	"funding",
	"keywords",
];

const DEP_FIELDS: &[&str] = &[
	"dependencies",
	"devDependencies",
	"optionalDependencies",
	"peerDependencies",
	"overrides",
];

#[derive(Debug, Default)]
pub struct DepImpact {
	pub run_all: Option<String>,
	pub packages: HashSet<String>,
	/// A `package.json` field that code can read at runtime changed.
	pub package_json: bool,
}

fn changed_keys(a: Option<&Map<String, Value>>, b: Option<&Map<String, Value>>) -> Vec<String> {
	let empty = Map::new();
	let (a, b) = (a.unwrap_or(&empty), b.unwrap_or(&empty));
	let mut keys: Vec<String> = a
		.keys()
		.chain(b.keys())
		.filter(|k| a.get(*k) != b.get(*k))
		.cloned()
		.collect();
	keys.sort_unstable();
	keys.dedup();
	keys
}

fn parse(text: Option<&str>) -> Value {
	text.and_then(|t| serde_json::from_str(t).ok())
		.unwrap_or(Value::Null)
}

impl DepImpact {
	pub fn add_package_json(&mut self, config: &Config, before: Option<&str>, after: Option<&str>) {
		let (a, b) = (parse(before), parse(after));
		for key in changed_keys(a.as_object(), b.as_object()) {
			if key == "allowScripts" {
				// Allowing an install script changes how that package is installed.
				for dep in changed_keys(a[&key].as_object(), b[&key].as_object()) {
					let name = dep
						.char_indices()
						.skip(1)
						.find(|(_, c)| *c == '@')
						.map_or(dep.as_str(), |(i, _)| &dep[..i]);
					self.packages.insert(name.to_owned());
				}
			} else if key == "scripts" {
				for script in changed_keys(a[&key].as_object(), b[&key].as_object()) {
					let bare = script
						.strip_prefix("pre")
						.or_else(|| script.strip_prefix("post"));
					if config.test_scripts.contains(&script)
						|| bare.is_some_and(|s| config.test_scripts.contains(s))
					{
						self.run_all
							.get_or_insert_with(|| format!("package.json script '{script}'"));
					}
				}
			} else if DEP_FIELDS.contains(&key.as_str()) {
				self.package_json = true;
				for dep in changed_keys(a[&key].as_object(), b[&key].as_object()) {
					self.packages.insert(dep);
				}
			} else if !METADATA_FIELDS.contains(&key.as_str())
				&& !config.ignored_fields.contains(&key)
			{
				self.package_json = true;
			}
		}
	}

	/// Adds every package whose resolved version changed, and everything that depends on it.
	pub fn add_lockfile(&mut self, before: Option<&str>, after: Option<&str>) {
		let (a, b) = (parse(before), parse(after));
		let empty = Map::new();
		let (pa, pb) = (
			a["packages"].as_object().unwrap_or(&empty),
			b["packages"].as_object().unwrap_or(&empty),
		);
		let name_of = |path: &str| path.rsplit_once("node_modules/").map(|(_, n)| n.to_owned());
		let mut queue: VecDeque<String> = VecDeque::new();
		for path in pa.keys().chain(pb.keys()) {
			if path.is_empty() {
				continue;
			}
			let fields = |p: &Map<String, Value>| {
				p.get(path).map(|e| {
					(
						e["version"].clone(),
						e["resolved"].clone(),
						e["integrity"].clone(),
					)
				})
			};
			if fields(pa) != fields(pb) {
				if let Some(name) = name_of(path) {
					queue.push_back(name);
				}
			}
		}
		// Reverse dependencies by name, from both versions of the lockfile.
		let mut dependents: HashMap<String, HashSet<String>> = HashMap::new();
		for packages in [pa, pb] {
			for (path, entry) in packages {
				let Some(name) = name_of(path) else { continue };
				for field in ["dependencies", "optionalDependencies", "peerDependencies"] {
					if let Some(deps) = entry[field].as_object() {
						for dep in deps.keys() {
							dependents
								.entry(dep.clone())
								.or_default()
								.insert(name.clone());
						}
					}
				}
			}
		}
		let mut seen: HashSet<String> = HashSet::new();
		while let Some(name) = queue.pop_front() {
			if !seen.insert(name.clone()) {
				continue;
			}
			if let Some(ds) = dependents.get(&name) {
				queue.extend(ds.iter().cloned());
			}
		}
		self.packages.extend(seen);
	}

	pub fn finish(&mut self, config: &Config) {
		if self.run_all.is_none() {
			if let Some(p) = self
				.packages
				.iter()
				.find(|p| config.toolchain.contains(p.as_str()))
			{
				self.run_all = Some(format!("toolchain package '{p}'"));
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::config::for_tests;

	#[test]
	fn scripts_changes_are_benign_and_dependency_bumps_are_precise() {
		let mut i = DepImpact::default();
		i.add_package_json(
			for_tests(),
			Some(r#"{"scripts":{"a":"1"},"dependencies":{"x":"1","y":"1"}}"#),
			Some(r#"{"scripts":{"a":"2"},"dependencies":{"x":"2","y":"1"}}"#),
		);
		i.finish(for_tests());
		assert_eq!(
			(i.run_all, i.packages.into_iter().collect::<Vec<_>>()),
			(None, vec!["x".to_owned()])
		);
	}

	#[test]
	fn test_scripts_run_everything() {
		for script in ["test", "pretest", "postinstall", "install"] {
			let mut i = DepImpact::default();
			i.add_package_json(
				for_tests(),
				Some(r#"{"scripts":{}}"#),
				Some(&format!(r#"{{"scripts":{{"{script}":"x"}}}}"#)),
			);
			i.finish(for_tests());
			assert_eq!(i.run_all, Some(format!("package.json script '{script}'")));
		}
	}

	#[test]
	fn metadata_and_ignored_fields_are_not_read_by_code() {
		let changed = |before: &str, after: &str| {
			let mut i = DepImpact::default();
			i.add_package_json(for_tests(), Some(before), Some(after));
			i.package_json
		};
		assert!(!changed(
			r#"{"description":"a","build":"1","version":"1"}"#,
			r#"{"description":"b","build":"2","version":"1"}"#
		));
		assert!(changed(r#"{"version":"1"}"#, r#"{"version":"2"}"#));
	}

	#[test]
	fn lockfile_changes_propagate_to_dependents() {
		let before = r#"{"packages":{"":{},"node_modules/pty":{"version":"1","dependencies":{"addon":"^1"}},"node_modules/addon":{"version":"1"},"node_modules/other":{"version":"1"}}}"#;
		let after = r#"{"packages":{"":{},"node_modules/pty":{"version":"1","dependencies":{"addon":"^1"}},"node_modules/addon":{"version":"2"},"node_modules/other":{"version":"1"}}}"#;
		let mut i = DepImpact::default();
		i.add_lockfile(Some(before), Some(after));
		let mut p: Vec<String> = i.packages.into_iter().collect();
		p.sort();
		assert_eq!(p, vec!["addon".to_owned(), "pty".to_owned()]);
	}

	#[test]
	fn toolchain_bumps_run_everything() {
		let mut i = DepImpact::default();
		i.add_package_json(
			for_tests(),
			Some(r#"{"devDependencies":{"mocha":"1"}}"#),
			Some(r#"{"devDependencies":{"mocha":"2"}}"#),
		);
		i.finish(for_tests());
		assert!(i.run_all.is_some());
	}
}
