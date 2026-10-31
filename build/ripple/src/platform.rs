/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Platform analysis: what a change needs to run on the operating systems besides Linux, which
//! runs every test. A change runs tests on another operating system only when it can behave
//! differently there: when it changes a platform-specific path, a package that behaves
//! differently, or code that uses something that does (see `platforms` in the configuration).

use std::collections::{BTreeSet, HashMap};
use std::fmt::Write;
use std::sync::Arc;

use anyhow::Result;
use serde::Serialize;

use crate::analyze::{FileFacts, Ref, analyze};
use crate::config::{Config, Group, OSES, Platforms, Role};
use crate::engine::{ReadBlob, Selection, dependents};
use crate::git::Change;
use crate::graph::{
	Graph, Snapshot, builtin_module, import_path_signal, import_signal, join, package_name,
};

/// The test tiers of an operating system: the unit tier (unit tests, node.js integration tests,
/// Agent Host E2E, extension tests) and the end-to-end tier (smoke, remote and browser
/// integration tests).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Tier {
	Unit,
	E2e,
}

/// Why a change runs a tier on an operating system.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Rule {
	/// The change runs every test: it reaches outside what ripple can plan (`runEverything`).
	RunEverything,
	/// A changed file has a platform-specific path: every selected test runs.
	Path,
	/// A signal package's version changed: every selected test runs.
	Package,
	/// A changed declaration uses a signal: the tests that depend on it run.
	Declaration,
	/// A selected test uses a signal, so it behaves differently there: it runs.
	SelectedTest,
	/// Changed test code outside the browser layers uses a test signal: its test file runs.
	ChangedTest,
	/// Changed code of a platform module (an extension) uses a signal: its tests run.
	Extension,
}

impl Rule {
	pub const ALL: [Rule; 7] = [
		Rule::RunEverything,
		Rule::Path,
		Rule::Package,
		Rule::Declaration,
		Rule::SelectedTest,
		Rule::ChangedTest,
		Rule::Extension,
	];

	pub fn name(self) -> &'static str {
		match self {
			Rule::RunEverything => "runEverything",
			Rule::Path => "path",
			Rule::Package => "package",
			Rule::Declaration => "declaration",
			Rule::SelectedTest => "selectedTest",
			Rule::ChangedTest => "changedTest",
			Rule::Extension => "extension",
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize)]
pub struct Reason {
	pub tier: Tier,
	pub rule: Rule,
	/// The group of `platforms` that matched, such as `win32`, `nonLinux` or `e2e`.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub group: Option<&'static str>,
	/// What changed or was selected: the reason every test runs, a path, a package, a declaration
	/// (`path#key`) or a test file.
	pub change: String,
	/// The path pattern or the signal that matched.
	#[serde(skip_serializing_if = "Option::is_none")]
	pub signal: Option<String>,
}

impl Reason {
	pub fn text(&self) -> String {
		let signal = self.signal.as_deref().unwrap_or_default();
		let change = &self.change;
		match self.rule {
			Rule::RunEverything => format!("every test runs: {change}"),
			Rule::Path => format!("`{change}` matches `{signal}`"),
			Rule::Package => format!("package `{change}` changed (`{signal}`)"),
			Rule::Declaration => format!("`{change}` uses `{signal}`"),
			Rule::SelectedTest => format!("selected test `{change}` uses `{signal}`"),
			Rule::ChangedTest => format!("changed test code `{change}` uses `{signal}`"),
			Rule::Extension if self.signal.is_none() => {
				format!("`{change}` does not parse")
			}
			Rule::Extension => format!("`{change}` uses `{signal}`"),
		}
	}
}

/// What a change runs on one operating system of `OSES`.
pub struct OsPlan {
	pub os: &'static str,
	/// The unit tier runs: there are test files to run (`tests`, or every test with `all`), or
	/// changed extension code that uses a signal (`extensions`).
	pub unit: bool,
	/// The end-to-end tier runs.
	pub e2e: bool,
	/// Every test runs: the change reaches outside what ripple can plan.
	pub all: bool,
	/// The test files to run, unless `all`.
	pub tests: Vec<Arc<str>>,
	/// The folders (with a `package.json`) of the platform modules whose changed code uses a
	/// signal, such as `extensions/git`.
	pub extensions: Vec<String>,
	pub reasons: Vec<Reason>,
	/// Every test that ripple selects runs (rules `Path` and `Package`).
	pub every_selected: bool,
	/// The changed nodes that use a signal, in the head and in the base graph, with the path from
	/// each to its signal (see `Graph::signal_path`).
	pub head_seeds: HashMap<u32, Vec<u32>>,
	pub base_seeds: HashMap<u32, Vec<u32>>,
}

impl OsPlan {
	/// The rules that apply, each once, in order.
	pub fn rules(&self, tier: Tier) -> Vec<Rule> {
		let mut rules: Vec<Rule> = self
			.reasons
			.iter()
			.filter(|r| r.tier == tier)
			.map(|r| r.rule)
			.collect();
		rules.sort();
		rules.dedup();
		rules
	}

	/// A readable name of the operating system.
	pub fn label(&self) -> &'static str {
		match self.os {
			"win32" => "Windows",
			"darwin" => "macOS",
			os => os,
		}
	}
}

/// The marks of the nodes that the signals of a group name (see `Graph::signal_marks`), in the
/// head and in the base graph.
struct Marks {
	head: Vec<bool>,
	base: Vec<bool>,
}

struct Context<'a> {
	platforms: &'a Platforms,
	base: &'a Snapshot,
	bg: &'a Graph,
	head: &'a Snapshot,
	hg: &'a Graph,
	sel: &'a Selection,
}

impl Context<'_> {
	fn marks(&self, group: &Group) -> Marks {
		Marks {
			head: self.hg.signal_marks(self.head, &group.signals),
			base: self.bg.signal_marks(self.base, &group.signals),
		}
	}

	/// For the initializer of a test file whose code outside its test cases did not change (see
	/// `FileFacts::cases`): the file and its test cases that changed, which stand for it.
	fn changed_cases(&self, s: u32) -> Option<(u32, Vec<usize>)> {
		let f = self.hg.node_file[s as usize];
		let entry = self.head.entries.get(f as usize)?;
		if !entry.role.is_test() || self.hg.base[f as usize] != s {
			return None;
		}
		let facts = entry.facts.as_ref()?;
		let before = self
			.base
			.find(&entry.path)
			.and_then(|i| self.base.entries[i as usize].facts.as_ref())?;
		if facts.cases.is_empty() || before.cases.is_empty() || before.init_rest != facts.init_rest
		{
			return None;
		}
		let hashes: HashMap<&str, u64> = before
			.cases
			.iter()
			.map(|c| (c.key.as_str(), c.hash))
			.collect();
		let changed: Vec<usize> = facts
			.cases
			.iter()
			.enumerate()
			.filter(|(_, c)| hashes.get(c.key.as_str()) != Some(&c.hash))
			.map(|(i, _)| i)
			.collect();
		// The initializer changed for another reason, such as a file that it reads by path or the
		// modules that it loads: it counts as a whole.
		(!changed.is_empty()).then_some((f, changed))
	}

	/// How a changed node uses a marked node at most `depth` edges away, if it does: what changed
	/// (a declaration, or a changed test case of a test file) and the path from the node to the
	/// marked node. Removed test code does not run, so the initializers of test files in the base
	/// graph use nothing.
	fn uses(&self, head: bool, s: u32, marks: &[bool], depth: u32) -> Option<(String, Vec<u32>)> {
		let (graph, snap) = if head {
			(self.hg, self.head)
		} else {
			(self.bg, self.base)
		};
		let f = graph.node_file[s as usize];
		if !head && graph.base[f as usize] == s && snap.entries[f as usize].role.is_test() {
			return None;
		}
		if let Some((f, cases)) = head.then(|| self.changed_cases(s)).flatten() {
			let entry = &snap.entries[f as usize];
			let facts = entry.facts.as_ref().unwrap();
			return cases.iter().find_map(|&c| {
				graph.case_signal_path(f, c, marks, depth).map(|path| {
					let change = format!("{}#test '{}'", entry.path, facts.cases[c].key);
					(change, std::iter::once(s).chain(path).collect())
				})
			});
		}
		graph
			.signal_path(s, marks, depth)
			.map(|path| (graph.signal_name(snap, s), path))
	}

	/// The changed nodes that use a signal of one of the groups (see `uses`), in one graph.
	fn seeds_using(&self, head: bool, groups: &[(&Group, &Marks)]) -> Vec<Hit> {
		let (graph, seeds) = if head {
			(self.hg, &self.sel.head_seeds)
		} else {
			(self.bg, &self.sel.base_seeds)
		};
		let mut out = Vec::new();
		// Changed packages and injected globals are not declarations: the rule `Package` covers
		// the packages.
		for &s in seeds
			.iter()
			.filter(|&&s| graph.node_file[s as usize] != u32::MAX)
		{
			for (group, marks) in groups {
				let marks = if head { &marks.head } else { &marks.base };
				if let Some((change, path)) = self.uses(head, s, marks, self.platforms.depth) {
					out.push(Hit {
						seed: s,
						change,
						path,
						group: group.name,
					});
					break;
				}
			}
		}
		out
	}

	fn declaration_reasons(&self, tier: Tier, hits: &[Hit], head: bool, reasons: &mut Vec<Reason>) {
		let (graph, snap) = if head {
			(self.hg, self.head)
		} else {
			(self.bg, self.base)
		};
		for hit in hits {
			reasons.push(Reason {
				tier,
				rule: Rule::Declaration,
				group: Some(hit.group),
				change: hit.change.clone(),
				signal: Some(graph.signal_name(snap, hit.path[hit.path.len() - 1])),
			});
		}
	}
}

/// A changed node that uses a signal (see `Context::uses`).
struct Hit {
	seed: u32,
	/// What changed: a declaration (`path#key`) or a test case (`path#test 'title'`).
	change: String,
	/// The path from the changed node to the signal.
	path: Vec<u32>,
	group: &'static str,
}

/// Plans what a change runs on each operating system of `OSES`, if the configuration has
/// `platforms`.
pub fn plan(
	config: &Config,
	read: &mut ReadBlob,
	base: &Snapshot,
	bg: &Graph,
	head: &Snapshot,
	hg: &Graph,
	changes: &[Change],
	sel: &Selection,
) -> Result<Option<Vec<OsPlan>>> {
	let Some(platforms) = &config.platforms else {
		return Ok(None);
	};
	let cx = Context {
		platforms,
		base,
		bg,
		head,
		hg,
		sel,
	};
	let paths: Vec<&str> = changes.iter().map(|c| c.path.as_str()).collect();
	// The tests that ripple selects: with `run_all_integration`, every integration test too.
	let mut selected: BTreeSet<Arc<str>> = sel.decl.iter().cloned().collect();
	if sel.run_all_integration.is_some() {
		selected.extend(
			head.entries
				.iter()
				.filter(|e| e.role == Role::IntegrationTest)
				.map(|e| e.path.clone()),
		);
	}
	let mut marks: HashMap<&'static str, Marks> = HashMap::new();
	for group in platforms.all_groups() {
		marks.insert(group.name, cx.marks(group));
	}

	let e2e = e2e_reasons(&cx, &paths, &marks[platforms.e2e.name]);
	let extensions = extension_uses(config, platforms, read, head, changes)?;

	let mut plans = Vec::new();
	for os in OSES {
		let groups = platforms.groups(os);
		let mut reasons: Vec<Reason> = Vec::new();
		let all = sel.run_all.is_some();
		if let Some(reason) = &sel.run_all {
			reasons.push(Reason {
				tier: Tier::Unit,
				rule: Rule::RunEverything,
				group: None,
				change: reason.clone(),
				signal: None,
			});
		}
		let mut every_selected = false;
		let mut extension_roots: BTreeSet<String> = BTreeSet::new();
		for path in &paths {
			if let Some((group, pattern)) = groups
				.iter()
				.find_map(|g| g.matching_path(path).map(|p| (g.name, p)))
			{
				every_selected = true;
				if is_platform_module(config, platforms, path) {
					extension_roots.insert(package_root(head, base, path));
				}
				reasons.push(Reason {
					tier: Tier::Unit,
					rule: Rule::Path,
					group: Some(group),
					change: (*path).to_owned(),
					signal: Some(pattern.to_owned()),
				});
			}
		}
		for name in &sel.changed_packages {
			let owner = format!("npm:{name}");
			if let Some((group, pattern)) = groups
				.iter()
				.find_map(|g| g.signals.naming(&owner).map(|p| (g.name, p)))
			{
				every_selected = true;
				reasons.push(Reason {
					tier: Tier::Unit,
					rule: Rule::Package,
					group: Some(group),
					change: name.clone(),
					signal: Some(pattern.to_owned()),
				});
			}
		}

		let signal_marks: Vec<(&Group, &Marks)> =
			groups.iter().map(|g| (*g, &marks[g.name])).collect();
		let head_hits = cx.seeds_using(true, &signal_marks);
		let base_hits = cx.seeds_using(false, &signal_marks);
		cx.declaration_reasons(Tier::Unit, &head_hits, true, &mut reasons);
		cx.declaration_reasons(Tier::Unit, &base_hits, false, &mut reasons);
		let mut tests: BTreeSet<Arc<str>> = BTreeSet::new();
		let head_seeds: Vec<u32> = head_hits.iter().map(|h| h.seed).collect();
		let base_seeds: Vec<u32> = base_hits.iter().map(|h| h.seed).collect();
		for i in dependents(hg, &head_seeds, |i| head.entries[i].role.is_test()) {
			tests.insert(head.entries[i].path.clone());
		}
		for i in dependents(bg, &base_seeds, |i| base.entries[i].role.is_test()) {
			let path = &base.entries[i].path;
			if head.find(path).is_some() {
				tests.insert(path.clone());
			}
		}

		// Selected tests that use a signal themselves behave differently on the operating system.
		let selected_marks: Vec<(&Group, Vec<bool>)> = groups
			.iter()
			.filter(|g| !g.selected_test_signals().is_empty())
			.map(|g| (*g, hg.signal_marks(head, g.selected_test_signals())))
			.collect();
		for test in sel.decl.iter().filter(|_| !selected_marks.is_empty()) {
			let Some(f) = head.find(test) else { continue };
			let hit = hg.file_nodes(f as usize).find_map(|v| {
				selected_marks.iter().find_map(|(g, m)| {
					hg.signal_path(v, m, 1)
						.map(|path| (g.name, path[path.len() - 1]))
				})
			});
			if let Some((group, signal)) = hit {
				tests.insert(test.clone());
				reasons.push(Reason {
					tier: Tier::Unit,
					rule: Rule::SelectedTest,
					group: Some(group),
					change: test.to_string(),
					signal: Some(hg.signal_name(head, signal)),
				});
			}
		}

		// Changed test code outside the browser layers that uses test signals, such as paths, the
		// file system or processes.
		let test_marks: Vec<(&Group, Vec<bool>)> = groups
			.iter()
			.filter(|g| !g.test_signals.is_empty())
			.map(|g| (*g, hg.signal_marks(head, &g.test_signals)))
			.collect();
		if !test_marks.is_empty() {
			let mut done: BTreeSet<Arc<str>> = BTreeSet::new();
			for &s in &sel.head_seeds {
				let f = hg.node_file[s as usize];
				let Some(entry) = head.entries.get(f as usize) else {
					continue;
				};
				if !entry.role.is_test()
					|| !platforms.in_test_layers(&entry.path)
					|| done.contains(&entry.path)
				{
					continue;
				}
				let hit = test_marks.iter().find_map(|(g, m)| {
					cx.uses(true, s, m, platforms.depth)
						.map(|(change, path)| (g.name, change, path[path.len() - 1]))
				});
				if let Some((group, change, signal)) = hit {
					done.insert(entry.path.clone());
					tests.insert(entry.path.clone());
					reasons.push(Reason {
						tier: Tier::Unit,
						rule: Rule::ChangedTest,
						group: Some(group),
						change,
						signal: Some(hg.signal_name(head, signal)),
					});
				}
			}
		}

		for u in extensions
			.iter()
			.filter(|u| u.group.is_none_or(|g| groups.iter().any(|x| x.name == g)))
		{
			extension_roots.insert(u.root.clone());
			reasons.push(Reason {
				tier: Tier::Unit,
				rule: Rule::Extension,
				group: u.group,
				change: u.change.clone(),
				signal: u.signal.clone(),
			});
		}

		if every_selected {
			tests.extend(selected.iter().cloned());
		}
		let tests: Vec<Arc<str>> = if all {
			Vec::new()
		} else {
			tests.into_iter().collect()
		};
		let e2e_on = !e2e.is_empty();
		reasons.extend(e2e.iter().cloned());
		let mut seen = std::collections::HashSet::new();
		reasons.retain(|r| seen.insert(r.clone()));
		let extensions: Vec<String> = extension_roots.into_iter().collect();
		plans.push(OsPlan {
			os,
			unit: all || !tests.is_empty() || !extensions.is_empty(),
			e2e: e2e_on,
			all,
			tests,
			extensions,
			reasons,
			every_selected,
			head_seeds: head_hits.into_iter().map(|h| (h.seed, h.path)).collect(),
			base_seeds: base_hits.into_iter().map(|h| (h.seed, h.path)).collect(),
		});
	}
	Ok(Some(plans))
}

/// Why a change runs the end-to-end tier, which is the same on every operating system: it
/// changes a path or a package that those suites depend on, or code that uses a signal of
/// `e2e`, such as a native package. Every test runs too when the change runs everything.
fn e2e_reasons(cx: &Context, paths: &[&str], marks: &Marks) -> Vec<Reason> {
	let group = &cx.platforms.e2e;
	let mut reasons = Vec::new();
	if let Some(reason) = &cx.sel.run_all {
		reasons.push(Reason {
			tier: Tier::E2e,
			rule: Rule::RunEverything,
			group: None,
			change: reason.clone(),
			signal: None,
		});
	}
	for path in paths {
		if let Some(pattern) = group.matching_path(path) {
			reasons.push(Reason {
				tier: Tier::E2e,
				rule: Rule::Path,
				group: Some(group.name),
				change: (*path).to_owned(),
				signal: Some(pattern.to_owned()),
			});
		}
	}
	for name in &cx.sel.changed_packages {
		if let Some(pattern) = group.signals.naming(&format!("npm:{name}")) {
			reasons.push(Reason {
				tier: Tier::E2e,
				rule: Rule::Package,
				group: Some(group.name),
				change: name.clone(),
				signal: Some(pattern.to_owned()),
			});
		}
	}
	let groups = [(group, marks)];
	for head in [true, false] {
		let hits = cx.seeds_using(head, &groups);
		cx.declaration_reasons(Tier::E2e, &hits, head, &mut reasons);
	}
	reasons
}

/// Whether a path is a platform module that the module graph does not have (see
/// `Platforms::is_platform_module`).
fn is_platform_module(config: &Config, platforms: &Platforms, path: &str) -> bool {
	platforms.is_platform_module(path) && config.role(path) == Role::Asset
}

/// The folder of the package that a file belongs to: the closest folder with a `package.json`.
fn package_root(head: &Snapshot, base: &Snapshot, path: &str) -> String {
	let mut dir = path;
	while let Some((parent, _)) = dir.rsplit_once('/') {
		let manifest = format!("{parent}/package.json");
		if head.find(&manifest).is_some() || base.find(&manifest).is_some() {
			return parent.to_owned();
		}
		dir = parent;
	}
	path.rsplit_once('/').map_or("", |(d, _)| d).to_owned()
}

/// Changed code of a platform module that uses a signal of a group of an operating system, or
/// that does not parse (`group` and `signal` are `None`), which counts for every one.
struct ExtensionUse {
	root: String,
	group: Option<&'static str>,
	change: String,
	signal: Option<String>,
}

/// The changed declarations of the platform modules that use signals of the groups of the
/// operating systems. Each module is analyzed on its own, so only signals that it uses itself,
/// directly or through its own declarations, count: Node.js modules, npm packages, globals,
/// literals and the declarations of the modules it imports, by name.
fn extension_uses(
	config: &Config,
	platforms: &Platforms,
	read: &mut ReadBlob,
	head: &Snapshot,
	changes: &[Change],
) -> Result<Vec<ExtensionUse>> {
	let groups: Vec<&Group> =
		OSES.iter()
			.flat_map(|os| platforms.groups(os))
			.fold(Vec::new(), |mut list, g| {
				if !list.iter().any(|x: &&Group| x.name == g.name) {
					list.push(g);
				}
				list
			});
	let mut out = Vec::new();
	for c in changes {
		if !is_platform_module(config, platforms, &c.path) {
			continue;
		}
		let root = package_root(head, head, &c.path);
		let mut facts = |oid: &Option<String>| -> Result<Option<FileFacts>> {
			Ok(match oid {
				Some(oid) => Some(analyze(&c.path, &read(oid)?, config)),
				None => None,
			})
		};
		let (before, after) = (facts(&c.old)?, facts(&c.new)?);
		if after.as_ref().is_some_and(|f| f.error) {
			out.push(ExtensionUse {
				root,
				group: None,
				change: c.path.clone(),
				signal: None,
			});
			continue;
		}
		let tests = platforms.is_platform_module_test(&c.path);
		for (this, other, head_side) in [(&after, &before, true), (&before, &after, false)] {
			let Some(this) = this else { continue };
			// Removed test code does not run.
			if tests && !head_side {
				continue;
			}
			let hashes: HashMap<&str, u64> = other
				.iter()
				.flat_map(|f| f.decls.iter().map(|d| (d.key.as_str(), d.hash)))
				.collect();
			// The changed test cases of a test file stand for its initializer when the code outside
			// them did not change (see `FileFacts::cases`).
			let case_hashes: Option<HashMap<&str, u64>> = other
				.as_ref()
				.filter(|o| {
					tests
						&& !this.cases.is_empty()
						&& !o.cases.is_empty()
						&& o.init_rest == this.init_rest
				})
				.map(|o| o.cases.iter().map(|c| (c.key.as_str(), c.hash)).collect());
			for (d, decl) in this.decls.iter().enumerate() {
				if hashes.get(decl.key.as_str()) == Some(&decl.hash) {
					continue;
				}
				let mut starts: Vec<(String, &[Ref], &[u32])> = match (&case_hashes, d) {
					(Some(cases), 0) => this
						.cases
						.iter()
						.filter(|case| cases.get(case.key.as_str()) != Some(&case.hash))
						.map(|case| {
							(
								format!("{}#test '{}'", c.path, case.key),
								&case.refs[..],
								&[][..],
							)
						})
						.collect(),
					_ => Vec::new(),
				};
				// No test case changed: the initializer counts as a whole.
				if starts.is_empty() {
					starts.push((
						format!("{}#{}", c.path, decl.key),
						&decl.refs[..],
						&decl.children[..],
					));
				}
				for (change, refs, children) in starts {
					let names = signal_names(this, refs, children, platforms.depth, &c.path, head);
					for group in &groups {
						let signal = names.iter().find(|n| {
							group.signals.matching(n).is_some()
								|| (tests && group.test_signals.matching(n).is_some())
						});
						if let Some(signal) = signal {
							out.push(ExtensionUse {
								root: root.clone(),
								group: Some(group.name),
								change: change.clone(),
								signal: Some(signal.clone()),
							});
						}
					}
				}
			}
		}
	}
	Ok(out)
}

/// The platform signal name of what an import of a module analyzed on its own names: a Node.js
/// module (`node:fs`), a file of the snapshot by its path, or an npm package (`npm:vscode`).
fn import_owner(facts: &FileFacts, spec: u32, dir: &str, snap: &Snapshot) -> Option<String> {
	let specifier = &facts.specs[spec as usize].specifier;
	if let Some(m) = builtin_module(specifier) {
		Some(format!("node:{m}"))
	} else if specifier.starts_with("./") || specifier.starts_with("../") {
		join(dir, specifier)
			.and_then(|p| snap.resolve_file(&p))
			.map(|i| snap.entries[i as usize].path.to_string())
	} else {
		package_name(specifier).map(|p| format!("npm:{p}"))
	}
}

/// The signal names that code of a module analyzed on its own uses, from its references and
/// members, at most `depth` edges away through the declarations of the module (see
/// `Graph::signal_path`).
fn signal_names(
	facts: &FileFacts,
	refs: &[Ref],
	children: &[u32],
	depth: u32,
	path: &str,
	snap: &Snapshot,
) -> Vec<String> {
	/// Adds the signal names that references use, and the declarations they and the members lead
	/// to that were not seen yet.
	fn visit(
		facts: &FileFacts,
		refs: &[Ref],
		children: &[u32],
		dir: &str,
		snap: &Snapshot,
		names: &mut Vec<String>,
		seen: &mut [bool],
		next: &mut Vec<u32>,
	) {
		let mut local: Vec<u32> = children.to_vec();
		for r in refs {
			match r {
				Ref::Local(t) => local.push(*t),
				Ref::Import { binding, member } => {
					let binding = &facts.bindings[*binding as usize];
					if let Some(owner) = import_owner(facts, binding.spec, dir, snap) {
						names.push(import_signal(&owner, &binding.imported, member.as_deref()));
					}
				}
				Ref::ImportPath { binding, path } => {
					let spec = facts.bindings[*binding as usize].spec;
					if let Some(owner) = import_owner(facts, spec, dir, snap) {
						names.push(import_path_signal(&owner, path));
					}
				}
				Ref::All(spec) => {
					let specifier = &facts.specs[*spec as usize].specifier;
					if let Some(m) = builtin_module(specifier) {
						names.push(format!("node:{m}"));
					} else if let Some(p) = package_name(specifier) {
						names.push(format!("npm:{p}"));
					}
				}
				Ref::Signal(name) => names.push(name.to_string()),
				Ref::Global(_) => {}
			}
		}
		for t in local {
			if !seen[t as usize] {
				seen[t as usize] = true;
				next.push(t);
			}
		}
	}
	let dir = path.rsplit_once('/').map_or("", |(d, _)| d);
	let mut names = Vec::new();
	let mut seen = vec![false; facts.decls.len()];
	let mut next = Vec::new();
	if depth > 0 {
		visit(
			facts, refs, children, dir, snap, &mut names, &mut seen, &mut next,
		);
	}
	for _ in 1..depth {
		for n in std::mem::take(&mut next) {
			let decl = &facts.decls[n as usize];
			visit(
				facts,
				&decl.refs,
				&decl.children,
				dir,
				snap,
				&mut names,
				&mut seen,
				&mut next,
			);
		}
	}
	names
}

/// The plan of each operating system as JSON, with the share of the unit test work that its
/// tests are.
pub fn to_json(plans: &[OsPlan], share: impl Fn(&OsPlan) -> f64) -> serde_json::Value {
	let mut map = serde_json::Map::new();
	for p in plans {
		let tests: Vec<&str> = p.tests.iter().map(|t| &**t).collect();
		map.insert(
			p.os.to_owned(),
			serde_json::json!({
				"unit": p.unit,
				"e2e": p.e2e,
				"all": p.all,
				"share": (share(p) * 10000.0).round() / 10000.0,
				"tests": tests,
				"extensions": p.extensions,
				"reasons": p.reasons,
			}),
		);
	}
	serde_json::Value::Object(map)
}

/// A job summary section that explains the plan of each operating system.
pub fn summary(plans: &[OsPlan], share: impl Fn(&OsPlan) -> f64) -> String {
	const SHOWN: usize = 25;
	let mut out =
		String::from("### macOS and Windows plan\n\n| | Unit tier | E2E tier |\n|---|---|---|\n");
	for p in plans {
		let unit = if p.all {
			"runs every test".to_owned()
		} else if p.unit {
			let mut parts = Vec::new();
			if !p.tests.is_empty() {
				parts.push(format!(
					"{} test files ({:.1}% of the unit test work)",
					p.tests.len(),
					share(p) * 100.0
				));
			}
			if !p.extensions.is_empty() {
				parts.push(format!("the tests of {}", p.extensions.join(", ")));
			}
			format!("runs {}", parts.join(" and "))
		} else {
			"skipped".to_owned()
		};
		let e2e = if p.e2e { "runs" } else { "skipped" };
		let _ = writeln!(out, "| {} | {unit} | {e2e} |", p.label());
	}
	out.push('\n');
	for p in plans.iter().filter(|p| !p.reasons.is_empty()) {
		let _ = writeln!(
			out,
			"<details><summary>Why {} runs what it runs</summary>\n",
			p.label()
		);
		for tier in [Tier::Unit, Tier::E2e] {
			let reasons: Vec<&Reason> = p.reasons.iter().filter(|r| r.tier == tier).collect();
			if reasons.is_empty() {
				continue;
			}
			let _ = writeln!(
				out,
				"{}:\n",
				if tier == Tier::Unit {
					"Unit tier"
				} else {
					"E2E tier"
				}
			);
			for r in reasons.iter().take(SHOWN) {
				let group = r.group.map(|g| format!(" ({g})")).unwrap_or_default();
				let _ = writeln!(out, "- {}{group}", r.text());
			}
			if reasons.len() > SHOWN {
				let _ = writeln!(out, "- and {} more (see plan.json)", reasons.len() - SHOWN);
			}
			out.push('\n');
		}
		if !p.all && !p.tests.is_empty() {
			let _ = writeln!(out, "Test files:\n");
			for t in &p.tests {
				let _ = writeln!(out, "- `{t}`");
			}
			out.push('\n');
		}
		out.push_str("</details>\n\n");
	}
	out
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::config::for_tests;
	use crate::engine::tests::Fixture;

	/// For each operating system: whether the unit and e2e tiers run, the test files and the
	/// extensions that run there, and the rules of the unit tier.
	type Summary = (
		&'static str,
		bool,
		bool,
		Vec<String>,
		Vec<String>,
		Vec<&'static str>,
	);

	fn summarize(base: &[(&str, &str)], head: &[(&str, &str)]) -> Vec<Summary> {
		let fx = Fixture::new(base, head);
		let sel = fx.select();
		let mut read = fx.read();
		let plans = plan(
			for_tests(),
			&mut read,
			&fx.bs,
			&fx.bg,
			&fx.hs,
			&fx.hg,
			&fx.changes,
			&sel,
		)
		.unwrap()
		.unwrap();
		plans
			.iter()
			.map(|p| {
				(
					p.os,
					p.unit,
					p.e2e,
					p.tests.iter().map(|t| t.to_string()).collect(),
					p.extensions.clone(),
					p.rules(Tier::Unit).iter().map(|r| r.name()).collect(),
				)
			})
			.collect()
	}

	fn off(os: &'static str) -> Summary {
		(os, false, false, vec![], vec![], vec![])
	}

	fn unit(os: &'static str, tests: &[&str], rules: &[&'static str]) -> Summary {
		(
			os,
			true,
			false,
			tests.iter().map(|t| t.to_string()).collect(),
			vec![],
			rules.to_vec(),
		)
	}

	const PLATFORM: (&str, &str) = (
		"src/lib/platform.ts",
		"export const isWindows = typeof process === 'object' && process.platform === 'win32';\nexport const isMacintosh = typeof process === 'object' && process.platform === 'darwin';\n",
	);
	const SEP_TEST: (&str, &str) = (
		"src/app/test/sep.test.ts",
		"import { sep } from '../../lib/paths.js';\ntest('sep', () => sep());\n",
	);
	const NAME_TEST: (&str, &str) = (
		"src/app/test/name.test.ts",
		"import { name } from '../../lib/paths.js';\ntest('name', () => name('a'));\n",
	);

	fn paths(sep: &str, name: &str, outer: &str) -> String {
		format!(
			"import {{ isWindows }} from './platform.js';\nexport function sep() {{ return isWindows ? {sep}; }}\nexport function name(p) {{ return {name}; }}\nexport function outer() {{ return sep() + {outer}; }}\n"
		)
	}

	#[test]
	fn changed_declarations_that_use_a_signal_run_their_tests_there() {
		let base = paths("'\\\\' : '/'", "p", "1");
		let case = |sep: &str, name: &str, outer: &str| {
			let head = paths(sep, name, outer);
			summarize(
				&[PLATFORM, ("src/lib/paths.ts", &base), SEP_TEST, NAME_TEST],
				&[PLATFORM, ("src/lib/paths.ts", &head), SEP_TEST, NAME_TEST],
			)
		};
		assert_eq!(
			(
				case("'\\\\\\\\' : '/'", "p", "1"),
				// No signal, and one only reached through `sep`, more than `depth` edges away.
				case("'\\\\' : '/'", "p + 1", "2"),
			),
			(
				vec![
					unit("win32", &["src/app/test/sep.test.ts"], &["declaration"]),
					off("darwin"),
				],
				vec![off("win32"), off("darwin")],
			)
		);
	}

	#[test]
	fn signals_of_every_os_but_linux_run_the_tests_on_both() {
		let lib = |body: &str| {
			format!(
				"export function shell() {{ return process.platform === 'aix' ? {body} : 'sh'; }}\n"
			)
		};
		let test = (
			"src/app/test/shell.test.ts",
			"import { shell } from '../../lib/shell.js';\ntest('shell', () => shell());\n",
		);
		let (before, after) = (lib("'a'"), lib("'b'"));
		let tests = ["src/app/test/shell.test.ts"];
		assert_eq!(
			summarize(
				&[("src/lib/shell.ts", &before), test],
				&[("src/lib/shell.ts", &after), test]
			),
			vec![
				unit("win32", &tests, &["declaration"]),
				unit("darwin", &tests, &["declaration"]),
			]
		);
	}

	#[test]
	fn selected_tests_that_use_a_signal_run_there() {
		let base = paths("'\\\\' : '/'", "p", "1");
		let head = paths("'\\\\' : '/'", "p + 1", "1");
		let test = (
			"src/app/test/name.test.ts",
			"import { name } from '../../lib/paths.js';\nimport { isMacintosh } from '../../lib/platform.js';\n(isMacintosh ? test.skip : test)('name', () => name('a'));\n",
		);
		assert_eq!(
			summarize(
				&[PLATFORM, ("src/lib/paths.ts", &base), SEP_TEST, test],
				&[PLATFORM, ("src/lib/paths.ts", &head), SEP_TEST, test],
			),
			vec![
				off("win32"),
				unit("darwin", &["src/app/test/name.test.ts"], &["selectedTest"]),
			]
		);
	}

	#[test]
	fn changed_tests_outside_the_browser_layers_that_use_test_signals_run_there() {
		let test = |body: &str| {
			format!("import * as fs from 'fs';\ntest('read', () => fs.readFileSync('{body}'));\n")
		};
		let (before, after) = (test("a"), test("b"));
		let case = |path: &str| summarize(&[(path, before.as_str())], &[(path, after.as_str())]);
		assert_eq!(
			(
				case("src/app/test/node/read.test.ts"),
				case("src/app/test/common/read.test.ts"),
			),
			(
				vec![
					unit(
						"win32",
						&["src/app/test/node/read.test.ts"],
						&["changedTest"]
					),
					off("darwin"),
				],
				vec![off("win32"), off("darwin")],
			)
		);
	}

	#[test]
	fn changed_test_cases_stand_for_their_test_file() {
		let test = |a: &str, b: &str, setup: &str| {
			format!(
				"import {{ isWindows }} from '../../../lib/platform.js';\nsuite('s', () => {{\n\tsetup(() => {setup});\n\ttest('a', () => isWindows ? {a} : 0);\n\ttest('b', () => {b});\n}});\n"
			)
		};
		let path = "src/app/test/browser/a.test.ts";
		let base = test("1", "1", "1");
		let case = |head: String| summarize(&[PLATFORM, (path, &base)], &[PLATFORM, (path, &head)]);
		let win32 = |rule: &'static str| vec![unit("win32", &[path], &[rule]), off("darwin")];
		assert_eq!(
			(
				case(test("2", "1", "1")),
				case(test("1", "2", "1")),
				// Code outside the test cases changed: the whole initializer counts.
				case(test("1", "1", "2")),
			),
			(
				win32("declaration"),
				vec![off("win32"), off("darwin")],
				win32("declaration")
			)
		);
	}

	#[test]
	fn the_conditions_around_a_changed_test_case_count_for_it() {
		let helper = (
			"src/lib/helper.ts",
			"export function helper(n) { return n; }\n",
		);
		let test = |guard: &str, close: &str, n: &str| {
			format!(
				"import {{ isWindows }} from '../../../lib/platform.js';\nimport {{ helper }} from '../../../lib/helper.js';\n{guard}\n\ttest('a', () => helper({n}));\n{close}\n"
			)
		};
		let path = "src/app/test/browser/g.test.ts";
		let case = |guard: &str, close: &str| {
			let (before, after) = (test(guard, close, "1"), test(guard, close, "2"));
			summarize(
				&[PLATFORM, helper, (path, &before)],
				&[PLATFORM, helper, (path, &after)],
			)
		};
		let win32 = vec![unit("win32", &[path], &["declaration"]), off("darwin")];
		assert_eq!(
			(
				case("if (isWindows) { suite('s', () => {", "}); }"),
				case("(isWindows ? suite : suite.skip)('s', () => {", "});"),
				case("suite('s', () => {", "});"),
			),
			(win32.clone(), win32, vec![off("win32"), off("darwin")])
		);
	}

	#[test]
	fn retargeting_an_import_of_a_test_case_counts_for_it() {
		let other = ("src/lib/other.ts", "export const isWindows = false;\n");
		let test = |from: &str| {
			format!(
				"import {{ isWindows }} from '../../../lib/{from}.js';\nsuite('s', () => {{\n\ttest('a', () => isWindows ? 1 : 0);\n\ttest('b', () => 2);\n}});\n"
			)
		};
		let path = "src/app/test/browser/r.test.ts";
		let (before, after) = (test("other"), test("platform"));
		assert_eq!(
			summarize(
				&[PLATFORM, other, (path, &before)],
				&[PLATFORM, other, (path, &after)],
			),
			vec![unit("win32", &[path], &["declaration"]), off("darwin")]
		);
	}

	#[test]
	fn platform_paths_run_every_selected_test_there() {
		let lib = |n: &str| format!("export const key = {n};\n");
		let test = (
			"src/app/test/reg.test.ts",
			"import { key } from '../../lib/win32/reg.js';\ntest('key', () => key);\n",
		);
		let (before, after) = (lib("1"), lib("2"));
		assert_eq!(
			summarize(
				&[("src/lib/win32/reg.ts", &before), test, NAME_TEST],
				&[("src/lib/win32/reg.ts", &after), test, NAME_TEST],
			),
			vec![
				unit("win32", &["src/app/test/reg.test.ts"], &["path"]),
				off("darwin"),
			]
		);
	}

	#[test]
	fn signal_package_versions_run_every_selected_test_there() {
		let lock = |registry: &str, pty: &str| {
			format!(
				r#"{{"packages":{{"":{{}},"node_modules/windows-registry":{{"version":"{registry}"}},"node_modules/native-pty":{{"version":"{pty}"}}}}}}"#
			)
		};
		let test = (
			"src/app/test/reg.test.ts",
			"import { read } from 'windows-registry';\ntest('read', () => read());\n",
		);
		let case = |before: String, after: String| {
			summarize(
				&[("package-lock.json", &before), test],
				&[("package-lock.json", &after), test],
			)
		};
		let tests = ["src/app/test/reg.test.ts"];
		assert_eq!(
			(
				case(lock("1", "1"), lock("2", "1")),
				// A native package: every selected test on both, and the end-to-end tier.
				case(lock("1", "1"), lock("1", "2")),
			),
			(
				// The selected test uses the package too, which does not count on win32 (see
				// `selectedTestSignals`).
				vec![unit("win32", &tests, &["package"]), off("darwin")],
				// No selected test: the unit tier has nothing to run.
				vec![
					("win32", false, true, vec![], vec![], vec!["package"]),
					("darwin", false, true, vec![], vec![], vec!["package"]),
				],
			)
		);
	}

	#[test]
	fn native_package_users_run_the_end_to_end_tier() {
		let lib = |n: &str| {
			format!(
				"import {{ spawn }} from 'native-pty';\nexport function start() {{ return spawn({n}); }}\n"
			)
		};
		let test = (
			"src/app/test/pty.test.ts",
			"import { start } from '../../lib/pty.js';\ntest('start', () => start());\n",
		);
		let (before, after) = (lib("1"), lib("2"));
		let tests = vec!["src/app/test/pty.test.ts".to_owned()];
		let on = |os| (os, true, true, tests.clone(), vec![], vec!["declaration"]);
		assert_eq!(
			summarize(
				&[("src/lib/pty.ts", &before), test],
				&[("src/lib/pty.ts", &after), test]
			),
			vec![on("win32"), on("darwin")]
		);
	}

	#[test]
	fn changes_that_run_everything_run_every_tier() {
		let summary = summarize(
			&[("test/unit/runner.js", "run(1);\n"), NAME_TEST],
			&[("test/unit/runner.js", "run(2);\n"), NAME_TEST],
		);
		let all = |os| (os, true, true, vec![], vec![], vec!["runEverything"]);
		assert_eq!(summary, vec![all("win32"), all("darwin")]);
	}

	#[test]
	fn changed_extension_code_that_uses_a_signal_runs_its_tests_there() {
		let manifest = ("extensions/git/package.json", "{}");
		let git = |body: &str| {
			format!(
				"import * as cp from 'child_process';\nimport {{ isWindows }} from './util';\nexport function exec() {{ return cp.spawn('git'); }}\nexport function root() {{ return isWindows ? {body} : '/'; }}\nexport function other() {{ return {body}; }}\n"
			)
		};
		let util = (
			"extensions/git/src/util.ts",
			"export const isWindows = process.platform === 'win32';\n",
		);
		let case = |before: &str, after: &str| {
			summarize(
				&[manifest, util, ("extensions/git/src/git.ts", before)],
				&[manifest, util, ("extensions/git/src/git.ts", after)],
			)
		};
		let ext = |os| {
			(
				os,
				true,
				false,
				vec![],
				vec!["extensions/git".to_owned()],
				vec!["extension"],
			)
		};
		let (before, after) = (git("'a'"), git("'b'"));
		let parsing = git("'a'");
		assert_eq!(
			(
				case(&before, &after),
				case(&before, &before.replace("spawn('git')", "spawn('git2')")),
				case(&parsing, "export function (\n"),
			),
			(
				// `root` and `other` changed: only `root` uses a signal, through a declaration of
				// the module it imports, which names no signal of the configuration.
				vec![off("win32"), off("darwin")],
				vec![ext("win32"), ext("darwin")],
				vec![ext("win32"), ext("darwin")],
			)
		);
	}

	#[test]
	fn changed_extension_tests_that_use_test_signals_run_there() {
		let manifest = ("extensions/git/package.json", "{}");
		let code = |a: &str, b: &str| {
			format!(
				"import {{ Uri }} from 'vscode';\nsuite('s', () => {{\n\ttest('a', () => Uri.file('{a}'));\n\ttest('b', () => '{b}');\n}});\n"
			)
		};
		let case = |path: &str, a: &str, b: &str| {
			let (before, after) = (code("x", "x"), code(a, b));
			summarize(&[manifest, (path, &before)], &[manifest, (path, &after)])
		};
		let test = "extensions/git/src/test/a.test.ts";
		assert_eq!(
			(
				case(test, "y", "x"),
				case(test, "x", "y"),
				// Not test code: test signals do not count.
				case("extensions/git/src/a.ts", "y", "x"),
			),
			(
				vec![
					(
						"win32",
						true,
						false,
						vec![],
						vec!["extensions/git".to_owned()],
						vec!["extension"]
					),
					off("darwin"),
				],
				vec![off("win32"), off("darwin")],
				vec![off("win32"), off("darwin")],
			)
		);
	}

	#[test]
	fn imports_of_node_modules_and_packages_name_their_signals() {
		let files = [(
			"src/lib/a.ts",
			"import { promises } from 'fs';\nimport * as fs from 'fs';\nimport * as fsp from 'node:fs/promises';\nimport * as cp from 'child_process';\nimport { systemPreferences, app } from 'electron';\nimport { Uri } from 'vscode';\nimport * as vscode from 'vscode';\nexport function f() { return [promises.realpath('a'), fs.promises.chmod('e'), fsp.stat('b'), cp, systemPreferences, app, process.platform, 'win32', Uri.file('c'), Uri.parse('d'), vscode.Uri.file('f')]; }\n",
		)];
		let fx = Fixture::new(&files, &files);
		let mut names: Vec<&String> = fx.hg.signals.keys().collect();
		names.sort();
		assert_eq!(
			names,
			vec![
				"global:process.platform",
				"literal:win32",
				"node:child_process",
				// `fs.promises.chmod` through a namespace import, which also uses `promises`.
				"node:fs#chmod",
				"node:fs#promises",
				"node:fs#realpath",
				"node:fs#stat",
				"npm:electron#systemPreferences",
				"npm:vscode#Uri",
				"npm:vscode#Uri.file",
				"npm:vscode#Uri.parse",
			]
		);
	}
}
