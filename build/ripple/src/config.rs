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
	platforms: Option<PlatformsFile>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct PlatformsFile {
	#[serde(default)]
	win32: GroupFile,
	#[serde(default)]
	darwin: GroupFile,
	#[serde(default)]
	non_linux: GroupFile,
	#[serde(default)]
	e2e: E2eFile,
	#[serde(default)]
	test_layers: Vec<String>,
	#[serde(default = "default_depth")]
	depth: u32,
	#[serde(default)]
	modules: Vec<String>,
	#[serde(default)]
	module_tests: Vec<String>,
}

fn default_depth() -> u32 {
	1
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct GroupFile {
	#[serde(default)]
	signals: Vec<String>,
	#[serde(default)]
	paths: Vec<String>,
	#[serde(default)]
	test_signals: Vec<String>,
	#[serde(default)]
	selected_test_signals: Option<Vec<String>>,
}

#[derive(Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct E2eFile {
	#[serde(default)]
	signals: Vec<String>,
	#[serde(default)]
	paths: Vec<String>,
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

fn glob(pattern: &str) -> Result<globset::Glob> {
	GlobBuilder::new(pattern)
		.literal_separator(true)
		.build()
		.with_context(|| format!("invalid glob pattern '{pattern}'"))
}

/// Glob patterns, where patterns starting with `!` exclude the paths they match.
struct Patterns {
	include: GlobSet,
	exclude: GlobSet,
	/// The patterns of `include`, in order.
	included: Vec<String>,
}

impl Patterns {
	fn new(patterns: &[String]) -> Result<Self> {
		let (mut include, mut exclude) = (GlobSetBuilder::new(), GlobSetBuilder::new());
		let mut included = Vec::new();
		for pattern in patterns {
			match pattern.strip_prefix('!') {
				Some(g) => exclude.add(glob(g)?),
				None => {
					included.push(pattern.clone());
					include.add(glob(pattern)?)
				}
			};
		}
		Ok(Self {
			include: include.build()?,
			exclude: exclude.build()?,
			included,
		})
	}

	fn matches(&self, path: &str) -> bool {
		self.include.is_match(path) && !self.exclude.is_match(path)
	}

	/// The first pattern that includes `path`, unless a `!` pattern excludes it.
	fn matching(&self, path: &str) -> Option<&str> {
		if self.exclude.is_match(path) {
			return None;
		}
		let i = *self.include.matches(path).first()?;
		Some(&self.included[i])
	}
}

/// Names of what code can use that behaves differently on some operating systems, as glob
/// patterns (see `platforms` in `vscode.jsonc`): a declaration (`src/a.ts#isWindows`) or a whole
/// module (`src/path.ts`), a Node.js module or its export (`node:fs`, `node:fs#realpath`), an npm
/// package or its export (`npm:electron`, `npm:electron#systemPreferences`), a property of a global
/// object (`global:process.platform`) or a string literal (`literal:win32`). A pattern without a
/// `#` member also matches the members of what it names.
pub struct Signals {
	patterns: Vec<String>,
	full: GlobSet,
	/// The patterns without a member, by their index in `patterns`.
	whole: GlobSet,
	whole_index: Vec<usize>,
	/// What each pattern names without its member (`node:fs` for `node:fs#realpath`).
	owners: GlobSet,
}

impl Signals {
	fn new(patterns: &[String]) -> Result<Self> {
		let (mut full, mut whole, mut owners) = (
			GlobSetBuilder::new(),
			GlobSetBuilder::new(),
			GlobSetBuilder::new(),
		);
		let mut whole_index = Vec::new();
		for (i, pattern) in patterns.iter().enumerate() {
			let kind = pattern.split_once(':').map(|(k, _)| k);
			if pattern.starts_with('!') {
				anyhow::bail!("signal patterns cannot exclude: '{pattern}'");
			}
			if let Some("global") = kind {
				global_object(pattern)?;
			}
			full.add(glob(pattern)?);
			match pattern.split_once('#') {
				Some((owner, _)) => {
					owners.add(glob(owner)?);
				}
				None => {
					owners.add(glob(pattern)?);
					whole.add(glob(pattern)?);
					whole_index.push(i);
				}
			}
		}
		Ok(Self {
			patterns: patterns.to_vec(),
			full: full.build()?,
			whole: whole.build()?,
			whole_index,
			owners: owners.build()?,
		})
	}

	pub fn is_empty(&self) -> bool {
		self.patterns.is_empty()
	}

	/// The first pattern that matches a name such as `node:fs#realpath`: the name itself, what
	/// it is a member of (`npm:vscode#Uri` for `npm:vscode#Uri.file`, `global:process` for
	/// `global:process.platform`), or its owner (`node:fs`).
	pub fn matching(&self, name: &str) -> Option<&str> {
		let members = match name.split_once('#') {
			Some((owner, _)) => owner.len() + 1,
			None => name
				.strip_prefix("global:")
				.map_or(name.len(), |_| "global:".len()),
		};
		let prefixes = std::iter::once(name).chain(
			name[members..]
				.rmatch_indices('.')
				.map(|(i, _)| &name[..members + i]),
		);
		for prefix in prefixes {
			if let Some(&i) = self.full.matches(prefix).first() {
				return Some(&self.patterns[i]);
			}
		}
		let (owner, _) = name.split_once('#')?;
		let i = *self.whole.matches(owner).first()?;
		Some(&self.patterns[self.whole_index[i]])
	}

	/// The first pattern that names `owner` or one of its members: a module path, `node:fs` or
	/// `npm:electron`.
	pub fn naming(&self, owner: &str) -> Option<&str> {
		let i = *self.owners.matches(owner).first()?;
		Some(&self.patterns[i])
	}
}

/// The object of a `global:<object>.<property>` signal, which must be an identifier.
fn global_object(pattern: &str) -> Result<&str> {
	let rest = pattern.strip_prefix("global:").unwrap_or(pattern);
	let object = rest.split_once('.').map_or(rest, |(o, _)| o);
	let identifier = object
		.chars()
		.next()
		.is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
		&& object
			.chars()
			.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$');
	if !identifier {
		anyhow::bail!("'{pattern}' must name a global object: global:<object>.<property>");
	}
	Ok(object)
}

/// A group of `platforms`: the paths and signals that make a change platform-sensitive.
pub struct Group {
	pub name: &'static str,
	paths: Patterns,
	pub signals: Signals,
	/// Signals that only count in changed test code (see `Platforms::in_test_layers`).
	pub test_signals: Signals,
	/// Signals that make a selected test run (`signals` unless configured).
	selected_test_signals: Option<Signals>,
}

impl Group {
	fn new(name: &'static str, file: GroupFile) -> Result<Self> {
		Ok(Self {
			name,
			paths: Patterns::new(&file.paths)?,
			signals: Signals::new(&file.signals)?,
			test_signals: Signals::new(&file.test_signals)?,
			selected_test_signals: file
				.selected_test_signals
				.as_deref()
				.map(Signals::new)
				.transpose()?,
		})
	}

	/// The signals that make a selected test that uses one run: `selectedTestSignals`, or else
	/// `signals`.
	pub fn selected_test_signals(&self) -> &Signals {
		self.selected_test_signals.as_ref().unwrap_or(&self.signals)
	}

	/// The first path pattern that matches `path`.
	pub fn matching_path(&self, path: &str) -> Option<&str> {
		self.paths.matching(path)
	}
}

/// The operating systems that `platforms` plans for, besides Linux, which runs every test.
pub const OSES: [&str; 2] = ["win32", "darwin"];

/// The platform analysis of the configuration (see `platforms` in `vscode.jsonc`).
pub struct Platforms {
	win32: Group,
	darwin: Group,
	/// What behaves differently on every operating system but Linux.
	non_linux: Group,
	/// What the end-to-end suites (smoke, remote, browser integration) depend on.
	pub e2e: Group,
	test_layers: Patterns,
	/// How many edges a changed declaration can be from a signal.
	pub depth: u32,
	/// Files analyzed only for platform signals, which are not part of the module graph.
	modules: Patterns,
	/// The files of `modules` that are test code, where `testSignals` count too.
	module_tests: Patterns,
	/// Every signal pattern: the graph has a node for each name one of them matches.
	all: Signals,
	/// The objects that `global:` signals name.
	global_objects: HashSet<String>,
	/// The values that `literal:` signals match.
	literals: GlobSet,
}

impl Platforms {
	fn new(file: PlatformsFile) -> Result<Self> {
		let mut all: Vec<String> = Vec::new();
		for group in [&file.win32, &file.darwin, &file.non_linux] {
			all.extend(group.signals.iter().cloned());
			all.extend(group.test_signals.iter().cloned());
			all.extend(group.selected_test_signals.iter().flatten().cloned());
		}
		all.extend(file.e2e.signals.iter().cloned());
		let mut global_objects = HashSet::new();
		let mut literals = GlobSetBuilder::new();
		for pattern in &all {
			if pattern.starts_with("global:") {
				global_objects.insert(global_object(pattern)?.to_owned());
			} else if let Some(value) = pattern.strip_prefix("literal:") {
				literals.add(glob(value)?);
			}
		}
		Ok(Self {
			win32: Group::new("win32", file.win32)?,
			darwin: Group::new("darwin", file.darwin)?,
			non_linux: Group::new("nonLinux", file.non_linux)?,
			e2e: Group::new(
				"e2e",
				GroupFile {
					signals: file.e2e.signals,
					paths: file.e2e.paths,
					test_signals: Vec::new(),
					selected_test_signals: Some(Vec::new()),
				},
			)?,
			test_layers: Patterns::new(&file.test_layers)?,
			depth: file.depth,
			modules: Patterns::new(&file.modules)?,
			module_tests: Patterns::new(&file.module_tests)?,
			all: Signals::new(&all)?,
			global_objects,
			literals: literals.build()?,
		})
	}

	/// The groups that apply to an operating system of `OSES`: its own, then `nonLinux`.
	pub fn groups(&self, os: &str) -> [&Group; 2] {
		match os {
			"win32" => [&self.win32, &self.non_linux],
			"darwin" => [&self.darwin, &self.non_linux],
			_ => unreachable!("unknown operating system {os}"),
		}
	}

	/// Every group, each once.
	pub fn all_groups(&self) -> [&Group; 4] {
		[&self.win32, &self.darwin, &self.non_linux, &self.e2e]
	}

	/// Whether the graph has a node for a signal name: whether any pattern matches it.
	pub fn is_signal(&self, name: &str) -> bool {
		self.all.matching(name).is_some()
	}

	/// Whether changed test code in `path` counts for `testSignals`. With only `!` patterns,
	/// every test file that they do not exclude counts.
	pub fn in_test_layers(&self, path: &str) -> bool {
		(self.test_layers.included.is_empty() || self.test_layers.include.is_match(path))
			&& !self.test_layers.exclude.is_match(path)
	}

	/// Whether a file is only analyzed for platform signals.
	pub fn is_platform_module(&self, path: &str) -> bool {
		let declarations = [".d.ts", ".d.mts", ".d.cts"];
		self.modules.matches(path) && !declarations.iter().any(|d| path.ends_with(d))
	}

	/// Whether `testSignals` count in the changed code of a file only analyzed for platform
	/// signals: whether it is test code (`moduleTests`) outside the excluded `testLayers`.
	pub fn is_platform_module_test(&self, path: &str) -> bool {
		self.module_tests.matches(path) && self.in_test_layers(path)
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
	/// The platform analysis, if configured.
	pub platforms: Option<Platforms>,
}

impl Config {
	pub fn load(path: &Path) -> Result<Self> {
		let text = std::fs::read_to_string(path)
			.with_context(|| format!("cannot read the configuration {}", path.display()))?;
		Self::parse(&text).with_context(|| format!("invalid configuration {}", path.display()))
	}

	pub fn parse(text: &str) -> Result<Self> {
		let file: File = serde_json::from_str(&strip_jsonc(text))?;
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
			platforms: file.platforms.map(Platforms::new).transpose()?,
		})
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

	/// Whether the platform analysis records the properties of a global object, such as
	/// `process` for `global:process.platform`.
	pub fn is_signal_global(&self, object: &str) -> bool {
		self.platforms
			.as_ref()
			.is_some_and(|p| p.global_objects.contains(object))
	}

	/// Whether the platform analysis records a string literal, such as `win32` for
	/// `literal:win32`.
	pub fn is_signal_literal(&self, value: &str) -> bool {
		value.len() <= 100
			&& self
				.platforms
				.as_ref()
				.is_some_and(|p| !p.literals.is_empty() && p.literals.is_match(value))
	}

	/// Whether the graph has a node for a platform signal name (see `Signals`).
	pub fn is_platform_signal(&self, name: &str) -> bool {
		self.platforms.as_ref().is_some_and(|p| p.is_signal(name))
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
				"platforms": {
					"win32": {
						"signals": ["src/lib/platform.ts#isWindows", "node:path#win32", "literal:win32", "npm:windows-*"],
						"paths": ["**/win32/**"],
						"testSignals": ["node:fs", "src/lib/uri.ts#URI.file", "npm:vscode#Uri"],
						"selectedTestSignals": [],
					},
					"darwin": {
						"signals": ["src/lib/platform.ts#isMacintosh", "npm:electron#systemPreferences"],
						"paths": ["**/darwin/**"],
						"testSignals": ["node:os#tmpdir"],
					},
					"nonLinux": {
						"signals": ["global:process.platform", "node:child_process", "npm:native-*"],
						"paths": ["src/main.ts"],
					},
					"e2e": {
						"paths": ["test/smoke/**"],
						"signals": ["npm:native-*"],
					},
					"testLayers": ["!**/common/**"],
					"depth": 1,
					"modules": ["extensions/*/src/**/*.ts"],
					"moduleTests": ["extensions/*/src/test/**"],
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
	fn signals_match_what_they_name_and_its_members() {
		let signals = Signals::new(&[
			"node:fs".to_owned(),
			"npm:vscode#Uri".to_owned(),
			"global:process".to_owned(),
			"src/a.ts#{isWindows,OS}".to_owned(),
		])
		.unwrap();
		let names = [
			"node:fs#realpath",
			"npm:vscode#Uri.file",
			"npm:vscode#Uris",
			"global:process.platform",
			"src/a.ts#OS",
			"src/a.ts#OSes",
			"src/a.ts",
		];
		assert_eq!(
			names.map(|n| signals.matching(n)),
			[
				Some("node:fs"),
				Some("npm:vscode#Uri"),
				None,
				Some("global:process"),
				Some("src/a.ts#{isWindows,OS}"),
				None,
				None,
			]
		);
		assert_eq!(
			(signals.naming("src/a.ts"), signals.naming("npm:vscode")),
			(Some("src/a.ts#{isWindows,OS}"), Some("npm:vscode#Uri"))
		);
	}

	#[test]
	fn repository_configuration_is_valid() {
		Config::parse(include_str!("../vscode.jsonc")).unwrap();
	}
}
