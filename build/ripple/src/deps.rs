/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Maps `package.json` and `package-lock.json` changes to the npm packages they affect, so a
//! dependency bump only selects the tests that load the bumped package.

use std::collections::{HashMap, HashSet, VecDeque};

use serde_json::{Map, Value};

use crate::config::{Config, Scope};

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
	/// Why every integration test must run: a package that only the scripts of
	/// `runEveryIntegrationTest` load changed.
	pub run_all_integration: Option<String>,
	pub packages: HashSet<String>,
	/// A `package.json` field that code can read at runtime changed.
	pub package_json: bool,
	/// Packages installed differently: a new resolved version or install script permission. The
	/// packages that depend on them are affected too.
	installed: HashSet<String>,
	/// The packages that depend on a package, by name, from the lockfiles read.
	dependents: HashMap<String, HashSet<String>>,
}

/// The name of the package at a lockfile path such as `node_modules/a/node_modules/@scope/b`.
fn name_of(path: &str) -> Option<String> {
	path.rsplit_once("node_modules/").map(|(_, n)| n.to_owned())
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
					self.installed.insert(name.to_owned());
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

	/// Adds every package whose resolved version changed. `finish` adds the packages that depend on
	/// them.
	pub fn add_lockfile(&mut self, before: Option<&str>, after: Option<&str>) {
		let (a, b) = (parse(before), parse(after));
		let empty = Map::new();
		let (pa, pb) = (
			a["packages"].as_object().unwrap_or(&empty),
			b["packages"].as_object().unwrap_or(&empty),
		);
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
				self.installed.extend(name_of(path));
			}
		}
		self.add_dependents(pa);
		self.add_dependents(pb);
	}

	/// Whether packages are installed differently, so that `finish` needs to know which packages
	/// depend on them.
	pub fn changes_installation(&self) -> bool {
		!self.installed.is_empty()
	}

	/// Whether the change affects any package.
	pub fn affects_packages(&self) -> bool {
		!self.installed.is_empty() || !self.packages.is_empty()
	}

	/// Reads which packages depend on which from a lockfile that did not change: `package.json`
	/// can change how a package is installed (`allowScripts`) without changing the lockfile.
	pub fn add_unchanged_lockfile(&mut self, lockfile: &str) {
		if let Some(packages) = parse(Some(lockfile))["packages"].as_object() {
			self.add_dependents(packages);
		}
	}

	fn add_dependents(&mut self, packages: &Map<String, Value>) {
		for (path, entry) in packages {
			let Some(name) = name_of(path) else { continue };
			for field in ["dependencies", "optionalDependencies", "peerDependencies"] {
				if let Some(deps) = entry[field].as_object() {
					for dep in deps.keys() {
						self.dependents
							.entry(dep.clone())
							.or_default()
							.insert(name.clone());
					}
				}
			}
		}
	}

	/// Adds the packages that depend on the ones installed differently, and runs every test for a
	/// toolchain package or for a package in `runners`: the packages loaded by files that every
	/// unit test, or every integration test (`Scope::Integration`), depends on, with the reason to
	/// report.
	pub fn finish(&mut self, config: &Config, runners: &HashMap<String, (Scope, String)>) {
		let mut queue: VecDeque<String> = self.installed.drain().collect();
		let mut seen: HashSet<String> = HashSet::new();
		while let Some(name) = queue.pop_front() {
			if !seen.insert(name.clone()) {
				continue;
			}
			if let Some(ds) = self.dependents.get(&name) {
				queue.extend(ds.iter().cloned());
			}
		}
		self.packages.extend(seen);
		let mut packages: Vec<&String> = self.packages.iter().collect();
		packages.sort();
		if self.run_all.is_none() {
			self.run_all = packages.iter().find_map(|p| {
				if config.toolchain.contains(p.as_str()) {
					Some(format!("toolchain package '{p}'"))
				} else {
					match runners.get(p.as_str()) {
						Some((Scope::All, reason)) => Some(reason.clone()),
						_ => None,
					}
				}
			});
		}
		self.run_all_integration = packages.iter().find_map(|p| match runners.get(p.as_str()) {
			Some((Scope::Integration, reason)) => Some(reason.clone()),
			_ => None,
		});
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
		i.finish(for_tests(), &HashMap::new());
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
			i.finish(for_tests(), &HashMap::new());
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
		let affected = |package_json: bool| {
			let mut i = DepImpact::default();
			i.add_lockfile(Some(before), Some(after));
			// A bump usually changes package.json too.
			if package_json {
				i.add_package_json(
					for_tests(),
					Some(r#"{"dependencies":{"addon":"^1"}}"#),
					Some(r#"{"dependencies":{"addon":"^2"}}"#),
				);
			}
			i.finish(for_tests(), &HashMap::new());
			let mut p: Vec<String> = i.packages.into_iter().collect();
			p.sort();
			p
		};
		let expected = vec!["addon".to_owned(), "pty".to_owned()];
		assert_eq!(
			(affected(false), affected(true)),
			(expected.clone(), expected)
		);
	}

	#[test]
	fn install_script_changes_propagate_to_dependents_of_the_unchanged_lockfile() {
		let lockfile = r#"{"packages":{"":{},"node_modules/ws":{"version":"8","peerDependencies":{"bufferutil":"^4"}},"node_modules/bufferutil":{"version":"4"},"node_modules/other":{"version":"1"}}}"#;
		let mut i = DepImpact::default();
		i.add_package_json(
			for_tests(),
			Some(r#"{"allowScripts":{"bufferutil@4.1.0":true}}"#),
			Some(r#"{"allowScripts":{"bufferutil@4.1.0":false}}"#),
		);
		i.add_unchanged_lockfile(lockfile);
		i.finish(for_tests(), &HashMap::new());
		let mut p: Vec<String> = i.packages.into_iter().collect();
		p.sort();
		assert_eq!(p, vec!["bufferutil".to_owned(), "ws".to_owned()]);
	}

	#[test]
	fn declaring_an_installed_dependency_does_not_affect_its_dependents() {
		// mocha already installs js-yaml: declaring it changes neither package.
		let lockfile = r#"{"packages":{"":{},"node_modules/mocha":{"version":"1","dependencies":{"js-yaml":"^4"}},"node_modules/js-yaml":{"version":"4"}}}"#;
		let mut i = DepImpact::default();
		i.add_package_json(
			for_tests(),
			Some(r#"{"devDependencies":{}}"#),
			Some(r#"{"devDependencies":{"js-yaml":"^4"}}"#),
		);
		i.add_lockfile(Some(lockfile), Some(lockfile));
		i.finish(for_tests(), &HashMap::new());
		assert_eq!(
			(i.run_all, i.packages.into_iter().collect::<Vec<_>>()),
			(None, vec!["js-yaml".to_owned()])
		);
	}

	#[test]
	fn packages_of_files_every_test_depends_on_run_everything() {
		let before = r#"{"packages":{"":{},"node_modules/server":{"version":"1","dependencies":{"mime":"^1"}},"node_modules/mime":{"version":"1"}}}"#;
		let after = r#"{"packages":{"":{},"node_modules/server":{"version":"1","dependencies":{"mime":"^1"}},"node_modules/mime":{"version":"2"}}}"#;
		let runners = HashMap::from([(
			"server".to_owned(),
			(
				Scope::All,
				"test runner package 'server' (test/runner.js)".to_owned(),
			),
		)]);
		let mut i = DepImpact::default();
		i.add_lockfile(Some(before), Some(after));
		i.finish(for_tests(), &runners);
		assert_eq!(
			(i.run_all.as_deref(), i.run_all_integration),
			(Some("test runner package 'server' (test/runner.js)"), None)
		);
	}

	#[test]
	fn packages_of_files_every_integration_test_depends_on_run_every_integration_test() {
		let before = r#"{"packages":{"":{},"node_modules/launcher":{"version":"1"}}}"#;
		let after = r#"{"packages":{"":{},"node_modules/launcher":{"version":"2"}}}"#;
		let runners = HashMap::from([(
			"launcher".to_owned(),
			(
				Scope::Integration,
				"integration test runner package 'launcher' (scripts/integration.ts)".to_owned(),
			),
		)]);
		let mut i = DepImpact::default();
		i.add_lockfile(Some(before), Some(after));
		i.finish(for_tests(), &runners);
		assert_eq!(
			(i.run_all, i.run_all_integration.as_deref()),
			(
				None,
				Some("integration test runner package 'launcher' (scripts/integration.ts)")
			)
		);
	}

	#[test]
	fn toolchain_bumps_run_everything() {
		let mut i = DepImpact::default();
		i.add_package_json(
			for_tests(),
			Some(r#"{"devDependencies":{"mocha":"1"}}"#),
			Some(r#"{"devDependencies":{"mocha":"2"}}"#),
		);
		i.finish(for_tests(), &HashMap::new());
		assert!(i.run_all.is_some());
	}
}
