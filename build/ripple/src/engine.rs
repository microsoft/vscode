/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Snapshots at arbitrary commits, change detection between two snapshots, and test selection.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Result;
use rayon::prelude::*;

use crate::analyze::{FileFacts, analyze};
use crate::deps::DepImpact;
use crate::git::{BlobReader, Change, ls_tree};
use crate::graph::{Entry, Graph, Scratch, Snapshot, is_code, is_integration_test, is_unit_test};

/// Product entry points. A suite that exercises an entry point (smoke tests, extension host API
/// tests, the Monaco editor checks) only needs to run when the entry point reaches a change.
pub const ENTRIES: &[(&str, &str)] = &[
	("editor", "src/vs/editor/editor.main.ts"),
	("workbench", "src/vs/workbench/workbench.desktop.main.ts"),
	("web", "src/vs/workbench/workbench.web.main.ts"),
	(
		"extensionHost",
		"src/vs/workbench/api/node/extensionHostProcess.ts",
	),
	("main", "src/vs/code/electron-main/main.ts"),
	("server", "src/vs/server/node/server.main.ts"),
	("sessions", "src/vs/sessions/sessions.desktop.main.ts"),
	(
		"agentHost",
		"src/vs/platform/agentHost/node/agentHostMain.ts",
	),
];

/// Changes outside the module graph that can affect the outcome of every unit test.
pub fn global_trigger(path: &str) -> Option<&'static str> {
	match path {
		".npmrc" | ".nvmrc" | "build/checksums/electron.txt" | "build/lib/electron.ts" => {
			Some("runtime version")
		}
		// The test launchers read the application name from product.json.
		"scripts/test.sh" | "scripts/test.bat" | "product.json" => Some("test launcher"),
		// `npm run gulp transpile-client-esbuild` runs build/next through these files.
		"build/gulpfile.ts" | "build/lib/esbuild.ts" | "build/lib/compilation.ts" => {
			Some("transpiler")
		}
		// The macOS and Windows unit test jobs and the actions they use.
		".github/workflows/pr.yml"
		| ".github/workflows/pr-darwin-test.yml"
		| ".github/workflows/pr-win32-test.yml" => Some("test job definition"),
		_ if path.starts_with(".github/actions/setup-electron/")
			|| path.starts_with(".github/actions/restore-node-modules/")
			|| path.starts_with(".github/workflows/node_modules_cache/") =>
		{
			Some("test job definition")
		}
		_ if path.starts_with("test/unit/") && !path.ends_with(".md") => Some("test runner"),
		_ if path.starts_with("build/next/") || path.starts_with("build/lib/gulp/") => {
			Some("transpiler")
		}
		_ if path.starts_with("build/npm/") => Some("dependency installation"),
		_ if path.starts_with("src/tsconfig") => Some("compiler options"),
		_ => None,
	}
}

/// Changes to the CI definition itself. They need a run of the changed jobs, not of every test.
pub fn is_ci_definition(path: &str) -> bool {
	path.starts_with(".github/workflows/") || path.starts_with(".github/actions/")
}

/// The impact of `package.json` and `package-lock.json` changes, if any.
pub fn dependency_impact(repo: &Path, changes: &[Change]) -> Result<Option<DepImpact>> {
	let manifests: Vec<&Change> = changes
		.iter()
		.filter(|c| c.path == "package.json" || c.path == "package-lock.json")
		.collect();
	if manifests.is_empty() {
		return Ok(None);
	}
	let mut reader = BlobReader::new(repo)?;
	let mut read = |oid: &Option<String>| -> Result<Option<String>> {
		Ok(match oid {
			Some(oid) => Some(String::from_utf8(reader.read(oid)?)?),
			None => None,
		})
	};
	let mut impact = DepImpact::default();
	for c in manifests {
		let (before, after) = (read(&c.old)?, read(&c.new)?);
		if c.path == "package.json" {
			impact.add_package_json(before.as_deref(), after.as_deref());
		} else {
			impact.add_lockfile(before.as_deref(), after.as_deref());
		}
	}
	impact.finish();
	Ok(Some(impact))
}

pub struct Engine {
	pub repo: PathBuf,
	cache: HashMap<Arc<str>, Arc<FileFacts>>,
	pub analyzed: usize,
}

impl Engine {
	pub fn new(repo: PathBuf) -> Self {
		Self {
			repo,
			cache: HashMap::new(),
			analyzed: 0,
		}
	}

	pub fn snapshot(&mut self, rev: &str) -> Result<Snapshot> {
		let mut entries: Vec<Entry> = ls_tree(&self.repo, rev, &[])?
			.into_iter()
			.map(|(p, o)| Entry {
				path: p.into(),
				oid: o.into(),
				facts: None,
			})
			.collect();
		entries.sort_by(|a, b| a.path.cmp(&b.path));
		let mut snap = Snapshot { entries };
		self.fill(&mut snap)?;
		Ok(snap)
	}

	/// The snapshot after applying a commit's changes.
	pub fn apply(&mut self, snap: &Snapshot, changes: &[Change]) -> Result<Snapshot> {
		let mut entries = snap.entries.clone();
		let mut removed = HashSet::new();
		let mut added = Vec::new();
		for c in changes {
			match (snap.find(&c.path), &c.new) {
				(Some(i), Some(new)) => {
					entries[i as usize] = Entry {
						path: c.path.as_str().into(),
						oid: new.as_str().into(),
						facts: None,
					}
				}
				(Some(i), None) => {
					removed.insert(i as usize);
				}
				(None, Some(new)) => added.push(Entry {
					path: c.path.as_str().into(),
					oid: new.as_str().into(),
					facts: None,
				}),
				(None, None) => {}
			}
		}
		let mut entries: Vec<Entry> = entries
			.into_iter()
			.enumerate()
			.filter(|(i, _)| !removed.contains(i))
			.map(|(_, e)| e)
			.collect();
		entries.extend(added);
		entries.sort_by(|a, b| a.path.cmp(&b.path));
		let mut snap = Snapshot { entries };
		self.fill(&mut snap)?;
		Ok(snap)
	}

	/// Analyzes every code file that is not cached yet, in parallel, one `git cat-file` per worker.
	fn fill(&mut self, snap: &mut Snapshot) -> Result<()> {
		let mut seen = HashSet::new();
		let missing: Vec<(Arc<str>, Arc<str>)> = snap
			.entries
			.iter()
			.filter(|e| {
				is_code(&e.path) && !self.cache.contains_key(&e.oid) && seen.insert(e.oid.clone())
			})
			.map(|e| (e.path.clone(), e.oid.clone()))
			.collect();
		if !missing.is_empty() {
			let chunk = (missing.len() / (rayon::current_num_threads() * 4)).max(1);
			let repo = &self.repo;
			let results: Vec<Vec<(Arc<str>, Arc<FileFacts>)>> = missing
				.par_chunks(chunk)
				.map(|files| -> Result<Vec<(Arc<str>, Arc<FileFacts>)>> {
					let mut reader = BlobReader::new(repo)?;
					files
						.iter()
						.map(|(path, oid)| {
							let data = reader.read(oid)?;
							Ok((
								oid.clone(),
								Arc::new(analyze(path, &String::from_utf8_lossy(&data))),
							))
						})
						.collect()
				})
				.collect::<Result<_>>()?;
			for (oid, facts) in results.into_iter().flatten() {
				self.analyzed += 1;
				self.cache.insert(oid, facts);
			}
		}
		for e in &mut snap.entries {
			if is_code(&e.path) {
				e.facts = self.cache.get(&e.oid).cloned();
			}
		}
		Ok(())
	}
}

/// Seeds for the impact query: nodes whose content changed, in the head graph (changed and added
/// declarations) and in the base graph (changed and removed declarations).
pub fn changed_nodes(
	base: &Snapshot,
	bg: &Graph,
	head: &Snapshot,
	hg: &Graph,
	paths: &[&str],
) -> (Vec<u32>, Vec<u32>) {
	let mut head_seeds = Vec::new();
	let mut base_seeds = Vec::new();
	for path in paths {
		head_seeds.extend(hg.dir_dependents(path).0);
		base_seeds.extend(bg.dir_dependents(path).0);
		let bi = base.find(path);
		let hi = head.find(path);
		let bf = bi.and_then(|i| base.entries[i as usize].facts.clone());
		let hf = hi.and_then(|i| head.entries[i as usize].facts.clone());
		match (bf, hf) {
			(Some(bf), Some(hf)) => {
				let (bi, hi) = (bi.unwrap() as usize, hi.unwrap() as usize);
				let bmap: HashMap<&str, u64> =
					bf.decls.iter().map(|d| (d.key.as_str(), d.hash)).collect();
				let hmap: HashMap<&str, u64> =
					hf.decls.iter().map(|d| (d.key.as_str(), d.hash)).collect();
				for (i, d) in hf.decls.iter().enumerate() {
					if bmap.get(d.key.as_str()) != Some(&d.hash) {
						head_seeds.push(hg.base[hi] + i as u32);
					}
				}
				for (i, d) in bf.decls.iter().enumerate() {
					if hmap.get(d.key.as_str()) != Some(&d.hash) {
						base_seeds.push(bg.base[bi] + i as u32);
					}
				}
				// A newly loaded (or no longer loaded) module only matters if loading it has effects.
				let base_loads: HashSet<&str> = bg.loads[bi]
					.iter()
					.map(|&t| &*base.entries[t as usize].path)
					.collect();
				let head_loads: HashSet<&str> = hg.loads[hi]
					.iter()
					.map(|&t| &*head.entries[t as usize].path)
					.collect();
				let added: Vec<&str> = hg.loads[hi]
					.iter()
					.filter(|&&t| hg.effectful[t as usize])
					.map(|&t| &*head.entries[t as usize].path)
					.filter(|p| !base_loads.contains(p))
					.collect();
				if !added.is_empty() {
					let before = bg.load_closure(bi as u32);
					let new: Vec<&&str> = added
						.iter()
						.filter(|p| base.find(p).is_none_or(|t| !before[t as usize]))
						.collect();
					if !new.is_empty() {
						if std::env::var_os("RIPPLE_DEBUG").is_some() {
							eprintln!(
								"{path}: now loads effectful {}",
								new.iter()
									.map(|p| p.to_string())
									.collect::<Vec<_>>()
									.join(", ")
							);
						}
						head_seeds.push(hg.base[hi]);
					}
				}
				let removed: Vec<&str> = bg.loads[bi]
					.iter()
					.filter(|&&t| bg.effectful[t as usize])
					.map(|&t| &*base.entries[t as usize].path)
					.filter(|p| !head_loads.contains(p))
					.collect();
				if !removed.is_empty() {
					let after = hg.load_closure(hi as u32);
					if removed
						.iter()
						.any(|p| head.find(p).is_none_or(|t| !after[t as usize]))
					{
						base_seeds.push(bg.base[bi]);
					}
				}
				// Module evaluation order: statements that kept their content but moved relative to
				// each other, and effectful modules that are now loaded in a different order.
				let (moved_base, moved_head) = reordered(&bf.order, &hf.order);
				base_seeds.extend(moved_base.into_iter().map(|d| bg.base[bi] + d));
				head_seeds.extend(moved_head.into_iter().map(|d| hg.base[hi] + d));
				let effectful_loads =
					|snap: &Snapshot, graph: &Graph, f: usize| -> Vec<(u64, u32)> {
						graph.loads[f]
							.iter()
							.filter(|&&t| graph.effectful[t as usize])
							.map(|&t| {
								(
									xxhash_rust::xxh3::xxh3_64(
										snap.entries[t as usize].path.as_bytes(),
									),
									0,
								)
							})
							.collect()
					};
				let (loads_base, loads_head) = reordered(
					&effectful_loads(base, bg, bi),
					&effectful_loads(head, hg, hi),
				);
				if !loads_base.is_empty() || !loads_head.is_empty() {
					base_seeds.push(bg.base[bi]);
					head_seeds.push(hg.base[hi]);
				}
			}
			_ => {
				if let Some(hi) = hi {
					head_seeds.extend(hg.file_nodes(hi as usize));
				}
				if let Some(bi) = bi {
					base_seeds.extend(bg.file_nodes(bi as usize));
				}
			}
		}
	}
	(head_seeds, base_seeds)
}

/// The elements present in both sequences (by identity) whose relative order changed, as the
/// second item of each element, for the base and the head sequence.
fn reordered(base: &[(u64, u32)], head: &[(u64, u32)]) -> (Vec<u32>, Vec<u32>) {
	let count = |s: &[(u64, u32)]| {
		let mut c: HashMap<u64, usize> = HashMap::new();
		for (id, _) in s {
			*c.entry(*id).or_default() += 1;
		}
		c
	};
	let (in_base, in_head) = (count(base), count(head));
	let common = |s: &[(u64, u32)]| -> Vec<(u64, u32)> {
		s.iter()
			.copied()
			.filter(|(id, _)| {
				in_base.get(id).copied().unwrap_or(0) > 0
					&& in_head.get(id).copied().unwrap_or(0) > 0
			})
			.collect()
	};
	let (b, h) = (common(base), common(head));
	let mut moved = (Vec::new(), Vec::new());
	for (x, y) in b.iter().zip(&h) {
		if x.0 != y.0 {
			moved.0.push(x.1);
			moved.1.push(y.1);
		}
	}
	moved
}

/// Test files selected for a change, at three levels of precision.
pub struct Selection {
	/// Every file importing a changed file, including type-only imports.
	pub file_all: HashSet<Arc<str>>,
	/// Every file loading a changed file at runtime.
	pub file_runtime: HashSet<Arc<str>>,
	/// Every file with a declaration that depends on a changed declaration.
	pub decl: HashSet<Arc<str>>,
	pub changed_decls: usize,
	/// Why every test must run, if a change reaches outside the module graph.
	pub run_all: Option<String>,
	pub ci_definition: bool,
	/// npm packages whose resolved version changed.
	pub packages: usize,
	/// Runtime code outside of tests changed (not only tests, types, comments or documentation).
	pub product_changed: bool,
	/// Product entry points that reach a change.
	pub entries: Vec<(&'static str, bool)>,
	/// The change needs macOS and Windows: changed code with OS-dependent behavior, shell
	/// scripts, built-in extensions, native packages, or a run-everything trigger.
	pub os_sensitive: bool,
	/// The change touches browser-layer code or style sheets, so browser tests should also run in WebKit.
	pub webkit: bool,
	/// The first reason the change is OS-sensitive.
	pub os_reason: String,
}

const OS_SCRIPTS: &[&str] = &[
	".ps1", ".psm1", ".sh", ".bash", ".zsh", ".fish", ".bat", ".cmd",
];

fn seed_is_os(snap: &Snapshot, graph: &Graph, v: u32) -> bool {
	let f = graph.node_file[v as usize];
	if f == u32::MAX {
		return false;
	}
	let e = &snap.entries[f as usize];
	match &e.facts {
		Some(facts) => facts
			.decls
			.get((v - graph.base[f as usize]) as usize)
			.is_some_and(|d| d.os),
		None => OS_SCRIPTS.iter().any(|x| e.path.ends_with(x)),
	}
}

fn seed_is_browser(snap: &Snapshot, graph: &Graph, v: u32) -> bool {
	let f = graph.node_file[v as usize];
	f != u32::MAX && {
		let p = &*snap.entries[f as usize].path;
		p.contains("/browser/") && (p.ends_with(".ts") || p.ends_with(".css"))
	}
}

fn collect(snap: &Snapshot, marks: &[bool], out: &mut HashSet<Arc<str>>) {
	for (i, m) in marks.iter().enumerate() {
		let p = &snap.entries[i].path;
		if *m && (is_unit_test(p) || is_integration_test(p)) {
			out.insert(p.clone());
		}
	}
}

/// Tests that depend on a seed: candidates from the reverse closure, confirmed by a forward
/// closure that only reaches instance methods whose names the test's code uses.
fn dependent_tests(snap: &Snapshot, graph: &Graph, seeds: &[u32], out: &mut HashSet<Arc<str>>) {
	if seeds.is_empty() {
		return;
	}
	let (candidates, gated) = graph.dependent_files(seeds.iter().copied());
	if !gated {
		collect(snap, &candidates, out);
		return;
	}
	let mut targets = vec![false; graph.node_count()];
	for &s in seeds {
		targets[s as usize] = true;
	}
	let mut scratch = Scratch::default();
	for (i, c) in candidates.iter().enumerate() {
		let p = &snap.entries[i].path;
		if *c
			&& (is_unit_test(p) || is_integration_test(p))
			&& graph.reaches(i as u32, &targets, &mut scratch)
		{
			out.insert(p.clone());
		}
	}
}

pub fn select(
	repo: &Path,
	base: &Snapshot,
	bg: &Graph,
	head: &Snapshot,
	hg: &Graph,
	changes: &[Change],
) -> Result<Selection> {
	let paths: Vec<&str> = changes.iter().map(|c| c.path.as_str()).collect();
	let (mut head_seeds, mut base_seeds) = changed_nodes(base, bg, head, hg, &paths);
	let mut run_all = paths
		.iter()
		.find_map(|p| global_trigger(p).map(|reason| format!("{reason} ({p})")));
	let mut packages = 0;
	let mut native = false;
	if let Some(deps) = dependency_impact(repo, changes)? {
		run_all = run_all.or(deps.run_all);
		packages = deps.packages.len();
		native = deps.native;
		for name in &deps.packages {
			head_seeds.extend(hg.packages.get(name));
			base_seeds.extend(bg.packages.get(name));
		}
		if deps.package_json {
			head_seeds.extend(hg.globals.get("_VSCODE_PACKAGE_JSON"));
			base_seeds.extend(bg.globals.get("_VSCODE_PACKAGE_JSON"));
		}
	}
	let is_product = |snap: &Snapshot, graph: &Graph, v: u32| -> bool {
		let f = graph.node_file[v as usize];
		if f == u32::MAX {
			return true;
		}
		let p = &*snap.entries[f as usize].path;
		!p.contains("/test/")
			&& (p.starts_with("src/")
				|| (p.starts_with("extensions/") && !p.ends_with(".md"))
				|| p.starts_with("resources/")
				|| p == "product.json")
	};
	let product_changed = run_all.is_some()
		|| head_seeds.iter().any(|&v| is_product(head, hg, v))
		|| base_seeds.iter().any(|&v| is_product(base, bg, v));
	let extension_code = paths.iter().any(|p| {
		p.starts_with("extensions/") && !p.starts_with("extensions/copilot/") && !p.ends_with(".md")
	});
	let seed_reason = |snap: &Snapshot, graph: &Graph, seeds: &[u32]| -> Option<String> {
		seeds
			.iter()
			.find(|&&v| seed_is_os(snap, graph, v))
			.map(|&v| {
				let f = graph.node_file[v as usize] as usize;
				let key = snap.entries[f]
					.facts
					.as_ref()
					.map_or("<asset>".to_owned(), |facts| {
						facts.decls[(v - graph.base[f]) as usize].key.clone()
					});
				format!("{}#{key}", snap.entries[f].path)
			})
	};
	let os_reason = if run_all.is_some() {
		Some("run everything".to_owned())
	} else if native {
		Some("native package".to_owned())
	} else if extension_code {
		Some("extension code".to_owned())
	} else if let Some(p) = paths
		.iter()
		.find(|p| OS_SCRIPTS.iter().any(|x| p.ends_with(x)))
	{
		Some(format!("script {p}"))
	} else {
		seed_reason(head, hg, &head_seeds).or_else(|| seed_reason(base, bg, &base_seeds))
	};
	let os_sensitive = os_reason.is_some();
	let os_reason = os_reason.unwrap_or_default();
	if std::env::var_os("RIPPLE_DEBUG").is_some() {
		for (snap, graph, seeds) in [(head, hg, &head_seeds), (base, bg, &base_seeds)] {
			for &v in seeds.iter().filter(|&&v| seed_is_os(snap, graph, v)) {
				let f = graph.node_file[v as usize] as usize;
				let key = snap.entries[f]
					.facts
					.as_ref()
					.map_or("<asset>".to_owned(), |facts| {
						facts.decls[(v - graph.base[f]) as usize].key.clone()
					});
				eprintln!("os seed: {}#{key}", snap.entries[f].path);
			}
		}
	}
	let webkit = run_all.is_some()
		|| head_seeds.iter().any(|&v| seed_is_browser(head, hg, v))
		|| base_seeds.iter().any(|&v| seed_is_browser(base, bg, v));
	let mut sel = Selection {
		os_sensitive,
		os_reason,
		webkit,
		product_changed,
		entries: Vec::new(),
		file_all: HashSet::new(),
		file_runtime: HashSet::new(),
		decl: HashSet::new(),
		changed_decls: head_seeds.len() + base_seeds.len(),
		run_all,
		ci_definition: paths.iter().any(|p| is_ci_definition(p)),
		packages,
	};
	dependent_tests(head, hg, &head_seeds, &mut sel.decl);
	dependent_tests(base, bg, &base_seeds, &mut sel.decl);
	let targets = |graph: &Graph, seeds: &[u32]| -> Vec<bool> {
		let mut t = vec![false; graph.node_count()];
		for &s in seeds {
			t[s as usize] = true;
		}
		t
	};
	let (head_targets, base_targets) = (targets(hg, &head_seeds), targets(bg, &base_seeds));
	let mut scratch = Scratch::default();
	for &(name, path) in ENTRIES {
		let affected = sel.run_all.is_some()
			|| head.find(path).is_some_and(|f| {
				!head_seeds.is_empty() && hg.reaches(f, &head_targets, &mut scratch)
			}) || base
			.find(path)
			.is_some_and(|f| !base_seeds.is_empty() && bg.reaches(f, &base_targets, &mut scratch));
		sel.entries.push((name, affected));
	}
	let head_files: Vec<u32> = paths
		.iter()
		.filter_map(|p| head.find(p))
		.chain(paths.iter().flat_map(|p| hg.dir_dependents(p).1))
		.collect();
	let base_files: Vec<u32> = paths
		.iter()
		.filter_map(|p| base.find(p))
		.chain(paths.iter().flat_map(|p| bg.dir_dependents(p).1))
		.collect();
	for runtime in [false, true] {
		let out = if runtime {
			&mut sel.file_runtime
		} else {
			&mut sel.file_all
		};
		collect(
			head,
			&hg.importing_files(head_files.iter().copied(), runtime),
			out,
		);
		collect(
			base,
			&bg.importing_files(base_files.iter().copied(), runtime),
			out,
		);
	}
	// The base graph finds the tests that depended on removed code; deleted and renamed tests
	// themselves cannot run.
	for set in [&mut sel.decl, &mut sel.file_all, &mut sel.file_runtime] {
		set.retain(|p| head.find(p).is_some());
	}
	Ok(sel)
}

#[cfg(test)]
mod tests {
	use super::*;
	use xxhash_rust::xxh3::xxh3_64;

	fn snapshot(files: &[(&str, &str)]) -> Snapshot {
		let mut entries: Vec<Entry> = files
			.iter()
			.map(|(path, content)| Entry {
				path: (*path).into(),
				oid: format!("{:016x}", xxh3_64(content.as_bytes())).into(),
				facts: is_code(path).then(|| Arc::new(analyze(path, content))),
			})
			.collect();
		entries.sort_by(|a, b| a.path.cmp(&b.path));
		Snapshot { entries }
	}

	/// The test files selected for the change from `base` to `head`.
	fn selected(base: &[(&str, &str)], head: &[(&str, &str)]) -> Vec<String> {
		let (bs, hs) = (snapshot(base), snapshot(head));
		let (bg, hg) = (Graph::build(&bs), Graph::build(&hs));
		let mut paths: Vec<&str> = bs
			.entries
			.iter()
			.chain(&hs.entries)
			.map(|e| &*e.path)
			.collect();
		paths.sort_unstable();
		paths.dedup();
		let oid = |s: &Snapshot, p: &str| s.find(p).map(|i| s.entries[i as usize].oid.to_string());
		let changes: Vec<Change> = paths
			.into_iter()
			.filter_map(|p| {
				let (old, new) = (oid(&bs, p), oid(&hs, p));
				(old != new).then(|| Change {
					path: p.to_owned(),
					old,
					new,
				})
			})
			.collect();
		let sel = select(Path::new("."), &bs, &bg, &hs, &hg, &changes).unwrap();
		let mut tests: Vec<String> = sel.decl.iter().map(|p| p.to_string()).collect();
		tests.sort();
		tests
	}

	const TEST_A: (&str, &str) = (
		"src/vs/test/a.test.ts",
		"import { a } from '../lib.js';\ntest('a', () => a);\n",
	);

	#[test]
	fn reordering_load_time_declarations_selects_their_users() {
		let base = [
			(
				"src/vs/lib.ts",
				"let n = 0;\nexport const a = ++n;\nexport const b = ++n;\n",
			),
			TEST_A,
		];
		let head = [
			(
				"src/vs/lib.ts",
				"let n = 0;\nexport const b = ++n;\nexport const a = ++n;\n",
			),
			TEST_A,
		];
		assert_eq!(selected(&base, &head), vec!["src/vs/test/a.test.ts"]);
	}

	#[test]
	fn reordering_effectful_imports_selects_their_importers() {
		let x = (
			"src/vs/x.ts",
			"globalThis.order = (globalThis.order ?? '') + 'x';\n",
		);
		let y = (
			"src/vs/y.ts",
			"globalThis.order = (globalThis.order ?? '') + 'y';\n",
		);
		let base = [
			(
				"src/vs/lib.ts",
				"import './x.js';\nimport './y.js';\nexport const a = 1;\n",
			),
			x,
			y,
			TEST_A,
		];
		let head = [
			(
				"src/vs/lib.ts",
				"import './y.js';\nimport './x.js';\nexport const a = 1;\n",
			),
			x,
			y,
			TEST_A,
		];
		assert_eq!(selected(&base, &head), vec!["src/vs/test/a.test.ts"]);
	}

	#[test]
	fn adding_and_moving_pure_declarations_selects_nothing() {
		let base = [
			(
				"src/vs/lib.ts",
				"export const a = 1;\nexport const b = 2;\nexport function f() { return 3; }\n",
			),
			TEST_A,
		];
		let head = [
			(
				"src/vs/lib.ts",
				"export function f() { return 3; }\nexport const a = 1;\nexport const c = 4;\nexport const b = 2;\n",
			),
			TEST_A,
		];
		assert_eq!(selected(&base, &head), Vec::<String>::new());
	}

	#[test]
	fn retargeting_an_export_selects_its_users() {
		let test = (
			"src/vs/test/a.test.ts",
			"import { value } from '../lib.js';\ntest('a', () => value);\n",
		);
		let base = [
			(
				"src/vs/lib.ts",
				"const a = 1;\nconst b = 2;\nexport { a as value, b };\n",
			),
			test,
		];
		let head = [
			(
				"src/vs/lib.ts",
				"const a = 1;\nconst b = 2;\nexport { b as value, b };\n",
			),
			test,
		];
		assert_eq!(selected(&base, &head), vec!["src/vs/test/a.test.ts"]);
	}

	#[test]
	fn retargeting_a_re_export_selects_its_users() {
		let modules = [
			("src/vs/x.ts", "export const a = 1;\n"),
			("src/vs/y.ts", "export const a = 2;\n"),
		];
		let base = [
			("src/vs/lib.ts", "export { a } from './x.js';\n"),
			modules[0],
			modules[1],
			TEST_A,
		];
		let head = [
			("src/vs/lib.ts", "export { a } from './y.js';\n"),
			modules[0],
			modules[1],
			TEST_A,
		];
		assert_eq!(selected(&base, &head), vec!["src/vs/test/a.test.ts"]);
	}

	#[test]
	fn deleted_and_renamed_tests_are_not_selected() {
		let helper = |v: &str| {
			(
				"src/vs/lib.ts",
				format!("export function a() {{ return {v}; }}\n"),
			)
		};
		let (old, new) = (helper("1"), helper("2"));
		let t = |p: &'static str| (p, "import { a } from '../lib.js';\ntest('a', () => a());\n");
		let base = [
			(old.0, old.1.as_str()),
			t("src/vs/test/a.test.ts"),
			t("src/vs/test/b.test.ts"),
			t("src/vs/test/c.test.ts"),
		];
		let head = [
			(new.0, new.1.as_str()),
			t("src/vs/test/a.test.ts"),
			t("src/vs/test/renamed.test.ts"),
		];
		assert_eq!(
			selected(&base, &head),
			vec!["src/vs/test/a.test.ts", "src/vs/test/renamed.test.ts"]
		);
	}
}
