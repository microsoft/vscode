/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Repository configuration. The engine only knows TypeScript, JavaScript and npm; everything it
//! knows about a particular repository (where the modules and tests are, which files every test
//! depends on, which of the repository's own functions are pure) comes from a JSONC file such as
//! `vscode.jsonc`.

use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use anyhow::{Context, Result};
use globset::{GlobBuilder, GlobSet, GlobSetBuilder};
use serde::Deserialize;

/// What a repository file is to the engine.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Role {
	/// Not analyzed: a single opaque node.
	#[default]
	Asset,
	Module,
	UnitTest,
	IntegrationTest,
}

impl Role {
	pub fn is_module(self) -> bool {
		self != Role::Asset
	}

	pub fn is_test(self) -> bool {
		matches!(self, Role::UnitTest | Role::IntegrationTest)
	}
}

/// The tests that a change to a file outside the module graph runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope {
	/// Every unit and integration test (`runEverything`).
	All,
	/// Every integration test (`runEveryIntegrationTest`).
	Integration,
}

/// The configuration file, see `vscode.jsonc` for the meaning of each field.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct File {
	modules: Vec<String>,
	#[serde(default)]
	path_aliases: BTreeMap<String, String>,
	#[serde(default)]
	tests: Tests,
	#[serde(default)]
	run_everything: BTreeMap<String, Vec<String>>,
	#[serde(default)]
	run_every_integration_test: BTreeMap<String, Vec<String>>,
	#[serde(default)]
	packages: Packages,
	#[serde(default)]
	injected_globals: BTreeMap<String, String>,
	#[serde(default)]
	pure: Pure,
	#[serde(default)]
	implicit_methods: Vec<String>,
	#[serde(default)]
	module_loaders: Vec<String>,
	#[serde(default)]
	registries: Option<Registries>,
}

/// Registries that tests read by key (see `ripple registrations`).
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Registries {
	/// The function that returns a registry by its id, such as `Registry.as`.
	#[serde(default)]
	pub accessor: Option<String>,
	/// The registries to check, by the name that findings report.
	pub keyed: BTreeMap<String, KeyedRegistry>,
}

/// A registry whose entries are registered and read by a key.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct KeyedRegistry {
	/// The registry, as `<module>#<name>` or `<module>#<name>.<member>`: the object whose methods
	/// read and register entries, or the id that code passes to the accessor to get it.
	pub registry: String,
	/// The methods of the registry that read an entry by the key in their first argument.
	pub read: Vec<String>,
	/// The property of the entries that tests filter a read's result by, such as `command.id` in
	/// `MenuRegistry.getMenuItems(menu).filter(item => item.command.id === ID)`: the test depends
	/// on the entry for that refinement of the key (see `Registration::refine`).
	#[serde(default)]
	pub read_filter: Option<String>,
	/// The calls that register entries.
	pub register: Vec<Registration>,
	/// Whether every key is registered once, like a command id: a read of a key that a
	/// registration names must reach that registration, not just one whose key the analysis cannot
	/// resolve. Reads that `readFilter` refines are treated the same.
	#[serde(default)]
	pub unique: bool,
}

/// Calls that register entries of a registry, and where their first argument holds the keys.
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Registration {
	/// A method of the registry.
	#[serde(default)]
	pub method: Option<String>,
	/// Or a function, `<module>#<name>`, or a method of another object, `<module>#<name>.<method>`.
	#[serde(default)]
	pub call: Option<String>,
	/// Where the first argument holds the keys: `""` for the argument itself, `id` for a property of
	/// it, `menu.id` for a property of a property, and `[]` for the elements of an array, such as
	/// `menu[].id`.
	pub keys: Vec<String>,
	/// The first argument is a class (or a `new` expression), whose constructor passes the
	/// descriptor that holds the keys to `super` (or the argument of the `new` expression).
	#[serde(default)]
	pub class: bool,
	/// Whether every call registers an entry, so that a call without any of the keys registers an
	/// entry that the analysis cannot tell, rather than none.
	#[serde(default = "default_true")]
	pub required: bool,
	/// Where the arguments hold the refinement of the key that `readFilter` filters by, such as
	/// `@1.command.id` for the command of a menu item in the second argument.
	#[serde(default)]
	pub refine: Option<String>,
	/// A fixed key, `<module>#<name>.<member>`, that the call registers when one of `keys` is
	/// `true`, such as the Command Palette for an action with `f1: true`.
	#[serde(default)]
	pub registers: Option<String>,
}

fn default_true() -> bool {
	true
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Tests {
	#[serde(default)]
	unit: Vec<String>,
	#[serde(default)]
	integration: Vec<String>,
	#[serde(default)]
	runners: Vec<String>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Packages {
	#[serde(default)]
	toolchain: Vec<String>,
	#[serde(default)]
	test_scripts: Vec<String>,
	#[serde(default)]
	ignored_fields: Vec<String>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct Pure {
	#[serde(default)]
	functions: Vec<String>,
	#[serde(default)]
	objects: Vec<String>,
}

/// Glob patterns, where patterns starting with `!` exclude the paths they match.
struct Patterns {
	include: GlobSet,
	exclude: GlobSet,
}

impl Patterns {
	fn new(patterns: &[String]) -> Result<Self> {
		let (mut include, mut exclude) = (GlobSetBuilder::new(), GlobSetBuilder::new());
		for pattern in patterns {
			let (set, glob) = match pattern.strip_prefix('!') {
				Some(glob) => (&mut exclude, glob),
				None => (&mut include, pattern.as_str()),
			};
			set.add(
				GlobBuilder::new(glob)
					.literal_separator(true)
					.build()
					.with_context(|| format!("invalid glob pattern '{pattern}'"))?,
			);
		}
		Ok(Self {
			include: include.build()?,
			exclude: exclude.build()?,
		})
	}

	fn matches(&self, path: &str) -> bool {
		self.include.is_match(path) && !self.exclude.is_match(path)
	}
}

/// The reason of the first group whose patterns match `path`.
fn group_of<'a>(groups: &'a [(String, Patterns)], path: &str) -> Option<&'a str> {
	groups
		.iter()
		.find(|(_, patterns)| patterns.matches(path))
		.map(|(reason, _)| reason.as_str())
}

pub struct Config {
	modules: Patterns,
	unit_tests: Patterns,
	integration_tests: Patterns,
	/// The scripts that run the tests.
	test_runners: Patterns,
	/// Path aliases as (prefix, replacement), longest prefix first.
	aliases: Vec<(String, String)>,
	run_everything: Vec<(String, Patterns)>,
	run_every_integration_test: Vec<(String, Patterns)>,
	/// npm packages that build or run every test.
	pub toolchain: HashSet<String>,
	/// npm scripts that install, build or run the tests.
	pub test_scripts: HashSet<String>,
	/// `package.json` fields that no test reads.
	pub ignored_fields: HashSet<String>,
	/// Globals injected by the test runners, as (name, file).
	pub injected_globals: Vec<(String, String)>,
	pure_functions: HashSet<String>,
	pure_objects: HashSet<String>,
	/// Methods called without their name at the call site.
	pub implicit_methods: Vec<String>,
	module_loaders: HashSet<String>,
	/// Registries that tests read by key.
	pub registries: Option<Registries>,
	/// The names of the methods and the functions whose calls the analysis records for them.
	registry_methods: HashSet<String>,
	registry_functions: HashSet<String>,
}

impl Config {
	pub fn load(path: &Path) -> Result<Self> {
		let text = std::fs::read_to_string(path)
			.with_context(|| format!("cannot read the configuration {}", path.display()))?;
		Self::parse(&text).with_context(|| format!("invalid configuration {}", path.display()))
	}

	pub fn parse(text: &str) -> Result<Self> {
		let file: File = serde_json::from_str(&strip_jsonc(text))?;
		let mut registry_methods = HashSet::new();
		let mut registry_functions = HashSet::new();
		for (name, registry) in file.registries.iter().flat_map(|r| &r.keyed) {
			registry.registry.split_once('#').with_context(|| {
				format!(
					"registry '{name}': '{}' is not <module>#<name>",
					registry.registry
				)
			})?;
			registry_methods.extend(registry.read.iter().cloned());
			for registration in &registry.register {
				match (&registration.method, &registration.call) {
					(Some(method), None) => {
						registry_methods.insert(method.clone());
					}
					(None, Some(call)) => {
						let (_, path) = call.split_once('#').with_context(|| {
							format!("registry '{name}': call '{call}' is not <module>#<name>")
						})?;
						match path.rsplit_once('.') {
							Some((_, method)) => registry_methods.insert(method.to_owned()),
							None => registry_functions.insert(path.to_owned()),
						};
					}
					_ => anyhow::bail!(
						"registry '{name}': a registration needs either a method or a call"
					),
				}
			}
		}
		let mut aliases: Vec<(String, String)> = file.path_aliases.into_iter().collect();
		aliases.sort_by_key(|(prefix, _)| std::cmp::Reverse(prefix.len()));
		let groups = |groups: BTreeMap<String, Vec<String>>| -> Result<Vec<(String, Patterns)>> {
			groups
				.into_iter()
				.map(|(reason, patterns)| Ok((reason, Patterns::new(&patterns)?)))
				.collect()
		};
		Ok(Self {
			modules: Patterns::new(&file.modules)?,
			unit_tests: Patterns::new(&file.tests.unit)?,
			integration_tests: Patterns::new(&file.tests.integration)?,
			test_runners: Patterns::new(&file.tests.runners)?,
			aliases,
			run_everything: groups(file.run_everything)?,
			run_every_integration_test: groups(file.run_every_integration_test)?,
			toolchain: file.packages.toolchain.into_iter().collect(),
			test_scripts: file.packages.test_scripts.into_iter().collect(),
			ignored_fields: file.packages.ignored_fields.into_iter().collect(),
			injected_globals: file.injected_globals.into_iter().collect(),
			pure_functions: file.pure.functions.into_iter().collect(),
			pure_objects: file.pure.objects.into_iter().collect(),
			implicit_methods: file.implicit_methods,
			module_loaders: file.module_loaders.into_iter().collect(),
			registry_methods,
			registry_functions,
			registries: file.registries,
		})
	}

	/// The object and the function of the registry accessor, such as `("Registry", "as")`.
	pub fn registry_accessor(&self) -> Option<(&str, &str)> {
		self.registries
			.as_ref()?
			.accessor
			.as_deref()?
			.split_once('.')
	}

	/// Whether the analysis records the calls of a method of that name (see `registries`).
	pub fn is_registry_method(&self, name: &str) -> bool {
		self.registry_methods.contains(name)
	}

	/// Whether the analysis records the calls of a function of that name (see `registries`).
	pub fn is_registry_function(&self, name: &str) -> bool {
		self.registry_functions.contains(name)
	}

	pub fn role(&self, path: &str) -> Role {
		let declarations = [".d.ts", ".d.mts", ".d.cts"];
		if declarations.iter().any(|d| path.ends_with(d)) || !self.modules.matches(path) {
			Role::Asset
		} else if self.unit_tests.matches(path) {
			Role::UnitTest
		} else if self.integration_tests.matches(path) {
			Role::IntegrationTest
		} else {
			Role::Module
		}
	}

	/// Why changing `path` affects every unit and integration test, if it does.
	pub fn run_everything(&self, path: &str) -> Option<&str> {
		group_of(&self.run_everything, path)
	}

	/// Why changing `path` affects every integration test, if it does.
	pub fn run_every_integration_test(&self, path: &str) -> Option<&str> {
		group_of(&self.run_every_integration_test, path)
	}

	/// The group of `runEverything` or else of `runEveryIntegrationTest` that `path` belongs to,
	/// with the tests that changing it runs.
	pub fn trigger(&self, path: &str) -> Option<(&str, Scope)> {
		self.run_everything(path)
			.map(|reason| (reason, Scope::All))
			.or_else(|| {
				self.run_every_integration_test(path)
					.map(|reason| (reason, Scope::Integration))
			})
	}

	/// Whether a `!` pattern of `runEverything` or `runEveryIntegrationTest` excludes the path
	/// from its group.
	pub fn excluded_from_run_everything(&self, path: &str) -> bool {
		self.run_everything
			.iter()
			.chain(&self.run_every_integration_test)
			.any(|(_, patterns)| patterns.exclude.is_match(path))
	}

	/// Whether a file is a script that runs the tests.
	pub fn is_test_runner(&self, path: &str) -> bool {
		self.test_runners.matches(path)
	}

	/// The prefixes of the path aliases, such as `vs/`.
	pub fn alias_prefixes(&self) -> impl Iterator<Item = &str> {
		self.aliases.iter().map(|(prefix, _)| prefix.as_str())
	}

	/// The repository path a non-relative module specifier names through a path alias.
	pub fn resolve_alias(&self, specifier: &str) -> Option<String> {
		self.aliases.iter().find_map(|(prefix, replacement)| {
			specifier
				.strip_prefix(prefix.as_str())
				.map(|rest| format!("{replacement}{rest}"))
		})
	}

	pub fn has_alias(&self, s: &str) -> bool {
		self.aliases
			.iter()
			.any(|(prefix, _)| s.starts_with(prefix.as_str()))
	}

	pub fn is_pure_function(&self, name: &str) -> bool {
		self.pure_functions.contains(name)
	}

	pub fn is_pure_object(&self, name: &str) -> bool {
		self.pure_objects.contains(name)
	}

	/// Whether calls of a function load the module or package that their first argument names.
	pub fn is_module_loader(&self, name: &str) -> bool {
		self.module_loaders.contains(name)
	}

	pub fn is_injected_global(&self, name: &str) -> bool {
		self.injected_globals.iter().any(|(n, _)| n == name)
	}
}

/// Turns JSONC into JSON: removes comments and trailing commas, keeping line numbers.
fn strip_jsonc(text: &str) -> String {
	let mut out = String::with_capacity(text.len());
	// A comma that may turn out to be trailing, with the whitespace after it.
	let mut comma: Option<String> = None;
	let mut chars = text.chars().peekable();
	while let Some(c) = chars.next() {
		match c {
			'/' if chars.peek() == Some(&'/') => {
				while chars.next_if(|&n| n != '\n').is_some() {}
				continue;
			}
			'/' if chars.peek() == Some(&'*') => {
				chars.next();
				let mut previous = ' ';
				for n in chars.by_ref() {
					if previous == '*' && n == '/' {
						break;
					}
					if n == '\n' {
						comma.as_mut().unwrap_or(&mut out).push('\n');
					}
					previous = n;
				}
				continue;
			}
			c if c.is_whitespace() => {
				comma.as_mut().unwrap_or(&mut out).push(c);
				continue;
			}
			_ => {}
		}
		if let Some(pending) = comma.take() {
			let trailing = c == '}' || c == ']';
			out.push_str(if trailing { &pending[1..] } else { &pending });
		}
		match c {
			',' => comma = Some(",".to_owned()),
			'"' => {
				out.push(c);
				while let Some(n) = chars.next() {
					out.push(n);
					if n == '\\' {
						out.extend(chars.next());
					} else if n == '"' {
						break;
					}
				}
			}
			_ => out.push(c),
		}
	}
	out.extend(comma);
	out
}

/// A small configuration for the engine's own tests.
#[cfg(test)]
pub fn for_tests() -> &'static Config {
	static CONFIG: std::sync::LazyLock<Config> = std::sync::LazyLock::new(|| {
		Config::parse(
			r#"{
				"modules": ["src/**/*.ts"],
				"pathAliases": { "lib/": "src/lib/" },
				"tests": { "unit": ["src/**/test/**/*.test.ts"], "integration": ["src/**/*.integrationTest.ts"], "runners": ["test/**/*.js"] },
				"runEverything": { "test runner": ["test/**", "!test/**/*.md"] },
				"runEveryIntegrationTest": { "integration test runner": ["scripts/integration.*", "test/**/*.integration.js"] },
				"packages": { "toolchain": ["mocha"], "testScripts": ["install", "test"], "ignoredFields": ["build"] },
				"injectedGlobals": { "_PACKAGE": "package.json", "_PRODUCT": "product.json" },
				"pure": { "functions": ["localize"], "objects": ["URI"] },
				"implicitMethods": ["dispose"],
				"moduleLoaders": ["loadModule"],
				"registries": {
					"accessor": "Registry.as",
					"keyed": {
						"view": { "registry": "src/registry.ts#Extensions.Views", "read": ["get"], "register": [{ "method": "register", "keys": ["id"] }] },
						"command": {
							"registry": "src/commands.ts#Commands",
							"read": ["getCommand"],
							"unique": true,
							"register": [
								{ "method": "registerCommand", "keys": ["", "id"] },
								{ "call": "src/actions.ts#registerAction", "keys": ["id"], "class": true },
							],
						},
						"menu": {
							"registry": "src/actions.ts#Menus",
							"read": ["getMenuItems"],
							"readFilter": "command.id",
							"register": [
								{ "method": "appendMenuItem", "keys": [""], "refine": "@1.command.id" },
								{ "call": "src/actions.ts#registerAction", "keys": ["menu.id", "menu[].id"], "class": true, "required": false, "refine": "id" },
								{ "call": "src/actions.ts#registerAction", "keys": ["f1"], "class": true, "required": false, "refine": "id", "registers": "src/actions.ts#MenuId.CommandPalette" },
							],
						},
					},
				},
			}"#,
		)
		.unwrap()
	});
	&CONFIG
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn jsonc_comments_and_trailing_commas_are_removed() {
		let text = "{\n\t// a comment\n\t\"a\": \"// not a comment\", /* a\nblock */ \"b\": [1, 2,],\n\t\"c\": \"\\\"/*\",\n}\n";
		let json = strip_jsonc(text);
		assert_eq!(json.lines().count(), text.lines().count());
		assert_eq!(
			serde_json::from_str::<serde_json::Value>(&json).unwrap(),
			serde_json::json!({ "a": "// not a comment", "b": [1, 2], "c": "\"/*" })
		);
	}

	#[test]
	fn globs_match_within_segments_and_exclusions_win() {
		let config = for_tests();
		let roles: Vec<Role> = [
			"src/a.ts",
			"src/lib/a.d.ts",
			"src/lib/a.tsx",
			"src/lib/test/a.test.ts",
			"src/lib/test/node/a.test.ts",
			"src/lib/a.test.ts",
			"src/lib/a.integrationTest.ts",
			"other/a.ts",
		]
		.iter()
		.map(|p| config.role(p))
		.collect();
		assert_eq!(
			roles,
			vec![
				Role::Module,
				Role::Asset,
				Role::Asset,
				Role::UnitTest,
				Role::UnitTest,
				Role::Module,
				Role::IntegrationTest,
				Role::Asset
			]
		);
		assert_eq!(
			config.run_everything("test/unit/index.js"),
			Some("test runner")
		);
		assert_eq!(config.run_everything("test/README.md"), None);
		assert_eq!(config.run_everything("src/test/a.ts"), None);
		assert_eq!(
			config.resolve_alias("lib/a.js").as_deref(),
			Some("src/lib/a.js")
		);
	}

	#[test]
	fn run_everything_groups_take_precedence_over_integration_groups() {
		let config = for_tests();
		assert_eq!(
			[
				"scripts/integration.sh",
				"test/unit/index.js",
				"test/a.integration.js",
				"scripts/unit.sh",
			]
			.map(|p| config.trigger(p)),
			[
				Some(("integration test runner", Scope::Integration)),
				Some(("test runner", Scope::All)),
				Some(("test runner", Scope::All)),
				None,
			]
		);
		assert_eq!(
			config.run_every_integration_test("test/a.integration.js"),
			Some("integration test runner")
		);
	}

	#[test]
	fn unknown_fields_are_errors() {
		assert!(Config::parse(r#"{ "modules": [], "module": [] }"#).is_err());
		assert!(Config::parse(r#"{ "modules": [], "pure": { "function": [] } }"#).is_err());
	}

	#[test]
	fn repository_configuration_is_valid() {
		Config::parse(include_str!("../vscode.jsonc")).unwrap();
	}
}
