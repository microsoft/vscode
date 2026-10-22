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
use crate::config::Config;
use crate::deps::DepImpact;
use crate::git::{BlobReader, Change, ls_tree};
use crate::graph::{Entry, Graph, Scratch, Snapshot};

/// The impact of `package.json` and `package-lock.json` changes, if any.
pub fn dependency_impact(
	config: &Config,
	repo: &Path,
	changes: &[Change],
) -> Result<Option<DepImpact>> {
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
			impact.add_package_json(config, before.as_deref(), after.as_deref());
		} else {
			impact.add_lockfile(before.as_deref(), after.as_deref());
		}
	}
	impact.finish(config);
	Ok(Some(impact))
}

pub struct Engine<'c> {
	pub repo: PathBuf,
	pub config: &'c Config,
	cache: HashMap<Arc<str>, Arc<FileFacts>>,
	pub analyzed: usize,
}

impl<'c> Engine<'c> {
	pub fn new(repo: PathBuf, config: &'c Config) -> Self {
		Self {
			repo,
			config,
			cache: HashMap::new(),
			analyzed: 0,
		}
	}

	fn entry(&self, path: &str, oid: &str) -> Entry {
		Entry {
			path: path.into(),
			oid: oid.into(),
			role: self.config.role(path),
			facts: None,
		}
	}

	pub fn snapshot(&mut self, rev: &str) -> Result<Snapshot> {
		let mut entries: Vec<Entry> = ls_tree(&self.repo, rev, &[])?
			.into_iter()
			.map(|(p, o)| self.entry(&p, &o))
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
				(Some(i), Some(new)) => entries[i as usize] = self.entry(&c.path, new),
				(Some(i), None) => {
					removed.insert(i as usize);
				}
				(None, Some(new)) => added.push(self.entry(&c.path, new)),
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

	/// Analyzes every module that is not cached yet, in parallel, one `git cat-file` per worker.
	fn fill(&mut self, snap: &mut Snapshot) -> Result<()> {
		let mut seen = HashSet::new();
		let missing: Vec<(Arc<str>, Arc<str>)> = snap
			.entries
			.iter()
			.filter(|e| {
				e.role.is_module() && !self.cache.contains_key(&e.oid) && seen.insert(e.oid.clone())
			})
			.map(|e| (e.path.clone(), e.oid.clone()))
			.collect();
		if !missing.is_empty() {
			let chunk = (missing.len() / (rayon::current_num_threads() * 4)).max(1);
			let (repo, config) = (&self.repo, self.config);
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
								Arc::new(analyze(path, &String::from_utf8_lossy(&data), config)),
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
			if e.role.is_module() {
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
	/// npm packages whose resolved version changed.
	pub packages: usize,
}

fn collect(snap: &Snapshot, marks: &[bool], out: &mut HashSet<Arc<str>>) {
	for (i, m) in marks.iter().enumerate() {
		let e = &snap.entries[i];
		if *m && e.role.is_test() {
			out.insert(e.path.clone());
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
		let e = &snap.entries[i];
		if *c && e.role.is_test() && graph.reaches(i as u32, &targets, &mut scratch) {
			out.insert(e.path.clone());
		}
	}
}

pub fn select(
	config: &Config,
	repo: &Path,
	base: &Snapshot,
	bg: &Graph,
	head: &Snapshot,
	hg: &Graph,
	changes: &[Change],
) -> Result<Selection> {
	let paths: Vec<&str> = changes.iter().map(|c| c.path.as_str()).collect();
	let (mut head_seeds, mut base_seeds) = changed_nodes(base, bg, head, hg, &paths);
	let mut run_all = paths.iter().find_map(|p| {
		config
			.run_everything(p)
			.map(|reason| format!("{reason} ({p})"))
	});
	let deps = dependency_impact(config, repo, changes)?;
	let mut packages = 0;
	if let Some(deps) = &deps {
		run_all = run_all.or_else(|| deps.run_all.clone());
		packages = deps.packages.len();
		for name in &deps.packages {
			head_seeds.extend(hg.packages.get(name));
			base_seeds.extend(bg.packages.get(name));
		}
	}
	// An injected global changes with its file, and with package.json only when a field that code
	// can read changes.
	for (name, file) in &config.injected_globals {
		let changed = if file == "package.json" {
			deps.as_ref().is_some_and(|d| d.package_json)
		} else {
			paths.contains(&file.as_str())
		};
		if changed {
			head_seeds.extend(hg.globals.get(name));
			base_seeds.extend(bg.globals.get(name));
		}
	}
	let mut sel = Selection {
		file_all: HashSet::new(),
		file_runtime: HashSet::new(),
		decl: HashSet::new(),
		changed_decls: head_seeds.len() + base_seeds.len(),
		run_all,
		packages,
	};
	dependent_tests(head, hg, &head_seeds, &mut sel.decl);
	dependent_tests(base, bg, &base_seeds, &mut sel.decl);
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
	use crate::config::for_tests;
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

	/// The selection for the change from `base` to `head`.
	fn selection(base: &[(&str, &str)], head: &[(&str, &str)]) -> Selection {
		let config = for_tests();
		let (bs, hs) = (snapshot(base), snapshot(head));
		let (bg, hg) = (Graph::build(&bs, config), Graph::build(&hs, config));
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
		select(config, Path::new("."), &bs, &bg, &hs, &hg, &changes).unwrap()
	}

	/// The test files selected for the change from `base` to `head`.
	fn selected(base: &[(&str, &str)], head: &[(&str, &str)]) -> Vec<String> {
		let mut tests: Vec<String> = selection(base, head)
			.decl
			.iter()
			.map(|p| p.to_string())
			.collect();
		tests.sort();
		tests
	}

	const TEST_A: (&str, &str) = (
		"src/app/test/a.test.ts",
		"import { a } from '../lib.js';\ntest('a', () => a);\n",
	);

	#[test]
	fn reordering_load_time_declarations_selects_their_users() {
		let base = [
			(
				"src/app/lib.ts",
				"let n = 0;\nexport const a = ++n;\nexport const b = ++n;\n",
			),
			TEST_A,
		];
		let head = [
			(
				"src/app/lib.ts",
				"let n = 0;\nexport const b = ++n;\nexport const a = ++n;\n",
			),
			TEST_A,
		];
		assert_eq!(selected(&base, &head), vec!["src/app/test/a.test.ts"]);
	}

	#[test]
	fn reordering_effectful_imports_selects_their_importers() {
		let x = (
			"src/app/x.ts",
			"globalThis.order = (globalThis.order ?? '') + 'x';\n",
		);
		let y = (
			"src/app/y.ts",
			"globalThis.order = (globalThis.order ?? '') + 'y';\n",
		);
		let base = [
			(
				"src/app/lib.ts",
				"import './x.js';\nimport './y.js';\nexport const a = 1;\n",
			),
			x,
			y,
			TEST_A,
		];
		let head = [
			(
				"src/app/lib.ts",
				"import './y.js';\nimport './x.js';\nexport const a = 1;\n",
			),
			x,
			y,
			TEST_A,
		];
		assert_eq!(selected(&base, &head), vec!["src/app/test/a.test.ts"]);
	}

	#[test]
	fn adding_and_moving_pure_declarations_selects_nothing() {
		let base = [
			(
				"src/app/lib.ts",
				"export const a = 1;\nexport const b = 2;\nexport function f() { return 3; }\n",
			),
			TEST_A,
		];
		let head = [
			(
				"src/app/lib.ts",
				"export function f() { return 3; }\nexport const a = 1;\nexport const c = 4;\nexport const b = 2;\n",
			),
			TEST_A,
		];
		assert_eq!(selected(&base, &head), Vec::<String>::new());
	}

	#[test]
	fn retargeting_an_export_selects_its_users() {
		let test = (
			"src/app/test/a.test.ts",
			"import { value } from '../lib.js';\ntest('a', () => value);\n",
		);
		let base = [
			(
				"src/app/lib.ts",
				"const a = 1;\nconst b = 2;\nexport { a as value, b };\n",
			),
			test,
		];
		let head = [
			(
				"src/app/lib.ts",
				"const a = 1;\nconst b = 2;\nexport { b as value, b };\n",
			),
			test,
		];
		assert_eq!(selected(&base, &head), vec!["src/app/test/a.test.ts"]);
	}

	#[test]
	fn retargeting_a_re_export_selects_its_users() {
		let modules = [
			("src/app/x.ts", "export const a = 1;\n"),
			("src/app/y.ts", "export const a = 2;\n"),
		];
		let base = [
			("src/app/lib.ts", "export { a } from './x.js';\n"),
			modules[0],
			modules[1],
			TEST_A,
		];
		let head = [
			("src/app/lib.ts", "export { a } from './y.js';\n"),
			modules[0],
			modules[1],
			TEST_A,
		];
		assert_eq!(selected(&base, &head), vec!["src/app/test/a.test.ts"]);
	}

	#[test]
	fn deleted_and_renamed_tests_are_not_selected() {
		let helper = |v: &str| {
			(
				"src/app/lib.ts",
				format!("export function a() {{ return {v}; }}\n"),
			)
		};
		let (old, new) = (helper("1"), helper("2"));
		let t = |p: &'static str| (p, "import { a } from '../lib.js';\ntest('a', () => a());\n");
		let base = [
			(old.0, old.1.as_str()),
			t("src/app/test/a.test.ts"),
			t("src/app/test/b.test.ts"),
			t("src/app/test/c.test.ts"),
		];
		let head = [
			(new.0, new.1.as_str()),
			t("src/app/test/a.test.ts"),
			t("src/app/test/renamed.test.ts"),
		];
		assert_eq!(
			selected(&base, &head),
			vec!["src/app/test/a.test.ts", "src/app/test/renamed.test.ts"]
		);
	}

	#[test]
	fn injected_globals_select_the_code_reading_them() {
		let files = [
			(
				"src/app/lib.ts",
				"export function a() { return globalThis._PRODUCT.name; }\nexport function b() { return 1; }\n",
			),
			(
				"src/app/test/a.test.ts",
				"import { a } from '../lib.js';\ntest('a', () => a());\n",
			),
			(
				"src/app/test/b.test.ts",
				"import { b } from '../lib.js';\ntest('b', () => b());\n",
			),
		];
		let with = |product: &'static str| -> Vec<(&str, &str)> {
			[("product.json", product)]
				.into_iter()
				.chain(files)
				.collect()
		};
		assert_eq!(
			selected(&with(r#"{"name":"a"}"#), &with(r#"{"name":"b"}"#)),
			vec!["src/app/test/a.test.ts"]
		);
	}

	#[test]
	fn path_aliases_resolve_imports() {
		let test = (
			"src/app/test/a.test.ts",
			"import { x } from 'lib/x.js';\ntest('a', () => x);\n",
		);
		let base = [("src/lib/x.ts", "export const x = 1;\n"), test];
		let head = [("src/lib/x.ts", "export const x = 2;\n"), test];
		assert_eq!(selected(&base, &head), vec!["src/app/test/a.test.ts"]);
	}

	#[test]
	fn run_everything_triggers_report_their_reason() {
		let runner = |content: &'static str| [("test/unit/index.js", content), TEST_A];
		assert_eq!(
			selection(&runner("1"), &runner("2")).run_all.as_deref(),
			Some("test runner (test/unit/index.js)")
		);
		let docs = |content: &'static str| [("test/unit/README.md", content), TEST_A];
		assert_eq!(selection(&docs("1"), &docs("2")).run_all, None);
	}

	#[test]
	fn static_methods_reach_their_siblings_through_this() {
		let executor = (
			"src/app/executor.ts",
			"export class Executor {\n\tstatic run(c) { return this._inner(c); }\n\tstatic _inner(c) { return c.apply(); }\n}\n",
		);
		let test = (
			"src/app/test/a.test.ts",
			"import { Executor } from '../executor.js';\nimport { Cmd } from '../cmd.js';\ntest('a', () => Executor.run(new Cmd()));\n",
		);
		let cmd = |v: &str| {
			(
				"src/app/cmd.ts",
				format!("export class Cmd {{ apply() {{ return {v}; }} }}\n"),
			)
		};
		let (old, new) = (cmd("1"), cmd("2"));
		assert_eq!(
			selected(
				&[executor, (old.0, old.1.as_str()), test],
				&[executor, (new.0, new.1.as_str()), test]
			),
			vec!["src/app/test/a.test.ts"]
		);
	}

	#[test]
	fn comments_next_to_members_of_the_same_name_select_nothing() {
		let p = |comment: &str| {
			(
				"src/app/p.ts",
				format!(
					"export class P {{\n\tequals(o) {{ return P.equals(this, o); }}\n\tstatic equals(a, b) {{\n{comment}\t\treturn a === b;\n\t}}\n}}\n"
				),
			)
		};
		let test = (
			"src/app/test/a.test.ts",
			"import { P } from '../p.js';\ntest('a', () => new P().equals(P.equals(1, 1)));\n",
		);
		let (old, new) = (p(""), p("\t\t// a comment\n"));
		assert_eq!(
			selected(
				&[(old.0, old.1.as_str()), test],
				&[(new.0, new.1.as_str()), test]
			),
			Vec::<String>::new()
		);
	}

	/// A test importing `read` from `src/app/lib.ts`.
	const TEST_READ: (&str, &str) = (
		"src/app/test/a.test.ts",
		"import { read } from '../lib.js';\ntest('a', () => read());\n",
	);

	/// The test files selected when `src/app/lib.ts` changes from `before` to `after`.
	fn selected_by_lib(before: &str, after: &str, others: &[(&str, &str)]) -> Vec<String> {
		let lib = |content| std::iter::once(("src/app/lib.ts", content));
		let base: Vec<(&str, &str)> = lib(before).chain(others.iter().copied()).collect();
		let head: Vec<(&str, &str)> = lib(after).chain(others.iter().copied()).collect();
		selected(&base, &head)
	}

	#[test]
	fn repository_paths_in_strings_select_their_readers() {
		let test = (
			"src/app/test/grammars.test.ts",
			"const grammars = ['data/syntaxes/JSON.tmLanguage.json', 'data/syntaxes/Regular Expressions (JS).tmLanguage', 'text/plain'];\ntest('a', () => load(grammars));\n",
		);
		let json = |c: &'static str| ("data/syntaxes/JSON.tmLanguage.json", c);
		let regex = |c: &'static str| ("data/syntaxes/Regular Expressions (JS).tmLanguage", c);
		assert_eq!(
			(
				selected(
					&[json("{}"), regex("a"), test],
					&[json("{ x"), regex("a"), test]
				),
				selected(
					&[json("{}"), regex("a"), test],
					&[json("{}"), regex("b"), test]
				),
			),
			(vec![test.0.to_owned()], vec![test.0.to_owned()])
		);
		// Strings that name no repository file are not packages either.
		let graph = Graph::build(&snapshot(&[json("{}"), test]), for_tests());
		assert!(!graph.packages.contains_key("text"));
	}

	#[test]
	fn reordering_members_with_load_time_effects_selects_their_users() {
		let test = (
			"src/app/test/a.test.ts",
			"import { values } from '../lib.js';\ntest('a', () => values.first);\n",
		);
		assert_eq!(
			selected_by_lib(
				"let n = 0;\nexport const values = { first: ++n, second: ++n };\n",
				"let n = 0;\nexport const values = { second: ++n, first: ++n };\n",
				&[test]
			),
			vec![test.0]
		);
	}

	#[test]
	fn reordering_properties_selects_the_users_of_the_whole_object() {
		let keys = (
			"src/app/test/keys.test.ts",
			"import { values } from '../lib.js';\ntest('a', () => Object.keys(values));\n",
		);
		let member = (
			"src/app/test/member.test.ts",
			"import { values } from '../lib.js';\ntest('a', () => values.a);\n",
		);
		assert_eq!(
			selected_by_lib(
				"export const values = { a: 1, b: 2 };\n",
				"export const values = { b: 2, a: 1 };\n",
				&[keys, member]
			),
			vec![keys.0]
		);
	}

	#[test]
	fn moving_methods_selects_nothing() {
		let test = (
			"src/app/test/a.test.ts",
			"import { C } from '../lib.js';\ntest('a', () => new C().f() + C.g());\n",
		);
		assert_eq!(
			selected_by_lib(
				"export class C {\n\tf() { return 1; }\n\tstatic g() { return 2; }\n\th() { return 3; }\n}\n",
				"export class C {\n\th() { return 3; }\n\tstatic g() { return 2; }\n\tf() { return 1; }\n}\n",
				&[test]
			),
			Vec::<String>::new()
		);
	}

	#[test]
	fn load_time_construction_runs_the_constructor() {
		let writer = (
			"src/app/writer.ts",
			"export class Writer { constructor(value) { globalThis.value = value; } }\n",
		);
		let cases = [
			// A local class whose constructor writes a global.
			"class Writer {\n\tconstructor(value) { globalThis.value = value; }\n}\nconst init = new Writer(1);\nexport function read() { return globalThis.value; }\n",
			// An imported class: its constructor may have effects.
			"import { Writer } from './writer.js';\nconst init = new Writer(1);\nexport function read() { return 1; }\n",
			// A local class inheriting the constructor of an imported class.
			"import { Writer } from './writer.js';\nclass Derived extends Writer { }\nconst init = new Derived(1);\nexport function read() { return 1; }\n",
		];
		for before in cases {
			let after = before.replace("(1)", "(2)");
			assert_eq!(
				selected_by_lib(before, &after, &[TEST_READ, writer]),
				vec![TEST_READ.0],
				"{before}"
			);
		}
		// Constructing built-in values has no effects outside the module.
		assert_eq!(
			selected_by_lib(
				"const cache = new Map([[1, 'a']]);\nexport function read() { return 1; }\n",
				"const cache = new Map([[1, 'b']]);\nexport function read() { return 1; }\n",
				&[TEST_READ]
			),
			Vec::<String>::new()
		);
	}

	#[test]
	fn load_time_mutations_make_state_depend_on_the_writer() {
		let cases = [
			"const state = [];\nconst init = state.push(1);\nexport function read() { return state[0]; }\n",
			"const state = new Map();\nconst init = state.set('a', 1);\nexport function read() { return state.get('a'); }\n",
			"const state = {};\nconst init = (state.value = 1);\nexport function read() { return state.value; }\n",
			"const state = { list: [] };\nconst init = state.list.push(1);\nexport function read() { return state.list[0]; }\n",
			"const state = [];\nfunction add(x) { state.push(x); }\nconst init = add(1);\nexport function read() { return state[0]; }\n",
			"let n = 0;\nfunction assign(x) { n = x; }\nconst init = assign(1);\nexport function read() { return n; }\n",
			"const state = [];\nfunction fill(s, x) { s.push(x); }\nconst init = fill(state, 1);\nexport function read() { return state[0]; }\n",
			"let n = 0;\nclass W { constructor(x) { n = x; } }\nconst init = new W(1);\nexport function read() { return n; }\n",
			"class C {\n\tstatic list = [];\n\tstatic read() { return C.list[0]; }\n}\nconst init = C.list.push(1);\nexport function read() { return C.read(); }\n",
		];
		for before in cases {
			let after = before.replace("1)", "2)").replace("= 1)", "= 2)");
			assert_ne!(before, after);
			assert_eq!(
				selected_by_lib(before, &after, &[TEST_READ]),
				vec![TEST_READ.0],
				"{before}"
			);
		}
	}

	#[test]
	fn static_accessor_pairs_are_one_dependency() {
		let test = (
			"src/app/test/a.test.ts",
			"import { Value } from '../lib.js';\ntest('a', () => { Value.value = 1; return Value.value; });\n",
		);
		let lib = |setter: &str| {
			format!(
				"let n = 0;\nexport class Value {{\n\tstatic get value() {{ return n; }}\n\tstatic set value(v) {{ n = {setter}; }}\n}}\n"
			)
		};
		assert_eq!(
			selected_by_lib(&lib("v"), &lib("v + 1"), &[test]),
			vec![test.0]
		);
	}

	#[test]
	fn constructing_a_class_runs_its_constructor_not_its_methods() {
		let other = (
			"src/app/test/other.test.ts",
			"import { other } from '../lib.js';\ntest('a', () => other());\n",
		);
		let user = (
			"src/app/test/user.test.ts",
			"import { access } from '../lib.js';\ntest('a', () => access.run());\n",
		);
		let register = (
			"src/app/register.ts",
			"export function register(x) { globalThis.x = x; }\n",
		);
		let lib = |class: &str| {
			format!(
				"import {{ register }} from './register.js';\n{class}\nexport const access = new Impl();\nexport function other() {{ return 1; }}\n"
			)
		};
		let cases = [
			// Methods run when called: only the users of the instance depend on them.
			(
				"class Impl { run() { register(1); } }",
				"class Impl { run() { register(2); } }",
				vec![user.0],
			),
			// The constructor runs at load time: every test loading the module depends on it.
			(
				"class Impl { constructor() { register(1); } run() { } }",
				"class Impl { constructor() { register(2); } run() { } }",
				vec![other.0, user.0],
			),
			// So do the methods it calls.
			(
				"class Impl { constructor() { this.init(); } init() { register(1); } run() { } }",
				"class Impl { constructor() { this.init(); } init() { register(2); } run() { } }",
				vec![other.0, user.0],
			),
		];
		for (before, after, expected) in cases {
			assert_eq!(
				selected_by_lib(&lib(before), &lib(after), &[other, user, register]),
				expected,
				"{before}"
			);
		}
	}

	#[test]
	fn load_time_calls_of_static_methods_run_them() {
		let lib = |v: &str| {
			format!(
				"import {{ register }} from './register.js';\nclass Registry {{ static add(x) {{ register(x + {v}); }} }}\nconst init = Registry.add(1);\nexport function read() {{ return 1; }}\n"
			)
		};
		let register = (
			"src/app/register.ts",
			"export function register(x) { globalThis.x = x; }\n",
		);
		assert_eq!(
			selected_by_lib(&lib("1"), &lib("2"), &[TEST_READ, register]),
			vec![TEST_READ.0]
		);
	}
}
