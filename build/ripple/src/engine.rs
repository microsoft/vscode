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

use crate::analyze::{ExportTarget, FileFacts, analyze, name_id};
use crate::config::{Config, Scope};
use crate::deps::DepImpact;
use crate::git::{BlobReader, Change, ls_tree};
use crate::graph::{Entry, Graph, Scratch, Snapshot, join, package_name};

/// Reads text blobs of a repository by object id.
pub type ReadBlob<'r> = dyn FnMut(&str) -> Result<String> + 'r;

/// Reads text blobs of the repository at `repo`.
pub fn blob_texts(repo: &Path) -> Result<impl FnMut(&str) -> Result<String>> {
	let mut reader = BlobReader::new(repo)?;
	Ok(move |oid: &str| Ok(String::from_utf8(reader.read(oid)?)?))
}

/// The impact of `package.json` and `package-lock.json` changes, if any.
pub fn dependency_impact(
	config: &Config,
	read: &mut ReadBlob,
	head: &Snapshot,
	changes: &[Change],
) -> Result<Option<DepImpact>> {
	const LOCKFILE: &str = "package-lock.json";
	let manifests: Vec<&Change> = changes
		.iter()
		.filter(|c| c.path == "package.json" || c.path == LOCKFILE)
		.collect();
	if manifests.is_empty() {
		return Ok(None);
	}
	let mut impact = DepImpact::default();
	for c in &manifests {
		let before = c.old.as_deref().map(&mut *read).transpose()?;
		let after = c.new.as_deref().map(&mut *read).transpose()?;
		if c.path == "package.json" {
			impact.add_package_json(config, before.as_deref(), after.as_deref());
		} else {
			impact.add_lockfile(before.as_deref(), after.as_deref());
		}
	}
	if !impact.affects_packages() {
		impact.finish(config, &HashMap::new());
		return Ok(Some(impact));
	}
	if impact.changes_installation() && !manifests.iter().any(|c| c.path == LOCKFILE) {
		if let Some(i) = head.find(LOCKFILE) {
			impact.add_unchanged_lockfile(&read(&head.entries[i as usize].oid)?);
		}
	}
	let runners = runner_packages(config, head, read)?;
	if std::env::var_os("RIPPLE_DEBUG").is_some() {
		let mut reasons: Vec<&String> = runners.values().map(|(_, reason)| reason).collect();
		reasons.sort();
		for reason in reasons {
			eprintln!("{reason}");
		}
	}
	impact.finish(config, &runners);
	Ok(Some(impact))
}

/// Whether a file is a JavaScript or TypeScript script, as opposed to a declaration file or data.
fn is_script(path: &str) -> bool {
	[".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"]
		.iter()
		.any(|x| path.ends_with(x))
		&& !path.ends_with(".d.ts")
}

/// A script that every unit test, or every integration test, depends on.
struct RunnerScript {
	path: Arc<str>,
	/// The group of `runEverything` or `runEveryIntegrationTest` that it belongs to.
	group: String,
	/// The tests that a change to it runs.
	scope: Scope,
	/// The script that loads it, unless `runEverything` or `runEveryIntegrationTest` lists it.
	loaded_by: Option<Arc<str>>,
	facts: FileFacts,
}

/// The scripts that every unit test or every integration test depends on: those that
/// `runEverything` or `runEveryIntegrationTest` lists, and the scripts they load through relative
/// imports, such as `build/lib/electronVersion.ts` for `build/lib/electron.ts`. Modules are
/// analyzed with the tests, so only scripts outside the modules count. The scripts of
/// `runEverything` come first, and a script that both groups load counts for every test.
fn runner_scripts(
	config: &Config,
	snap: &Snapshot,
	read: &mut ReadBlob,
) -> Result<Vec<RunnerScript>> {
	let mut scripts: Vec<RunnerScript> = Vec::new();
	let mut seen: HashSet<u32> = HashSet::new();
	let mut next = 0;
	for scope in [Scope::All, Scope::Integration] {
		for (i, e) in snap.entries.iter().enumerate() {
			if let Some((group, _)) = config
				.trigger(&e.path)
				.filter(|&(_, s)| s == scope && is_script(&e.path))
				&& seen.insert(i as u32)
			{
				scripts.push(RunnerScript {
					path: e.path.clone(),
					group: group.to_owned(),
					scope,
					loaded_by: None,
					facts: FileFacts::default(),
				});
			}
		}
		while next < scripts.len() {
			let i = snap.find(&scripts[next].path).unwrap();
			let facts = analyze(
				&scripts[next].path,
				&read(&snap.entries[i as usize].oid)?,
				config,
			);
			if facts.error {
				anyhow::bail!("{}: cannot find the files it loads", scripts[next].path);
			}
			let dir = scripts[next]
				.path
				.rsplit_once('/')
				.map_or("", |(d, _)| d)
				.to_owned();
			for spec in &facts.specs {
				if spec.type_only
					|| spec.root || spec.data.is_some()
					|| !spec.specifier.starts_with('.')
				{
					continue;
				}
				let Some(t) = join(&dir, &spec.specifier).and_then(|p| snap.resolve_file(&p))
				else {
					continue;
				};
				let e = &snap.entries[t as usize];
				if is_script(&e.path)
					&& !e.role.is_module()
					&& !config.excluded_from_run_everything(&e.path)
					&& seen.insert(t)
				{
					scripts.push(RunnerScript {
						path: e.path.clone(),
						group: scripts[next].group.clone(),
						scope: scripts[next].scope,
						loaded_by: Some(scripts[next].path.clone()),
						facts: FileFacts::default(),
					});
				}
			}
			scripts[next].facts = facts;
			next += 1;
		}
	}
	Ok(scripts)
}

/// The reasons to run every test, or every integration test, when a change touches scripts that a
/// `runEverything` or `runEveryIntegrationTest` script loads, with the tests they run.
fn runner_script_changed(
	config: &Config,
	snap: &Snapshot,
	read: &mut ReadBlob,
	paths: &[&str],
) -> Result<Vec<(Scope, String)>> {
	// Changing a script that `runEverything` lists runs everything without this. A script that
	// `runEveryIntegrationTest` lists counts when a `runEverything` script loads it: that runs
	// every test, not only the integration tests.
	let loaded =
		|p: &&str| is_script(p) && !snap.role(p).is_module() && config.run_everything(p).is_none();
	if !paths.iter().any(loaded) {
		return Ok(Vec::new());
	}
	Ok(runner_scripts(config, snap, read)?
		.into_iter()
		.filter(|s| s.loaded_by.is_some() && paths.contains(&&*s.path))
		.map(|s| {
			let reason = format!("{} ({} loads {})", s.group, s.loaded_by.unwrap(), s.path);
			(s.scope, reason)
		})
		.collect())
}

/// The npm packages that the scripts every unit test or every integration test depends on load,
/// such as the test runners' web server: a change to one of them runs those tests. Each package
/// has the tests it runs and the reason to report.
fn runner_packages(
	config: &Config,
	snap: &Snapshot,
	read: &mut ReadBlob,
) -> Result<HashMap<String, (Scope, String)>> {
	let mut packages = HashMap::new();
	for script in runner_scripts(config, snap, read)? {
		for spec in &script.facts.specs {
			if spec.type_only
				|| spec.root || spec.data.is_some()
				|| config.resolve_alias(&spec.specifier).is_some()
			{
				continue;
			}
			if let Some(name) = package_name(&spec.specifier) {
				packages.entry(name.clone()).or_insert_with(|| {
					let reason = format!("{} package '{name}' ({})", script.group, script.path);
					(script.scope, reason)
				});
			}
		}
	}
	Ok(packages)
}

/// A module that the test runners load into every test run, or that serves requests of the
/// tests.
struct Harness {
	file: usize,
	/// The reason to report when a change reaches it.
	reason: String,
	/// The names that the code of the runners that load it uses, as name ids.
	names: Vec<u64>,
}

impl Harness {
	/// What the runners use of the module: the exports whose names their code uses, or, when it
	/// uses none, the module's initializer, which runs its load-time effects.
	fn roots(&self, snap: &Snapshot, graph: &Graph) -> Vec<u32> {
		let b = graph.base[self.file];
		let Some(facts) = snap.entries[self.file].facts.as_deref() else {
			return graph.file_nodes(self.file).collect();
		};
		let mut roots = Vec::new();
		for (name, target) in &facts.exports {
			if self.names.contains(&name_id(name)) {
				match target {
					ExportTarget::Local(d) => roots.push(b + d),
					_ => return graph.file_nodes(self.file).collect(),
				}
			}
		}
		if roots.is_empty() {
			roots.push(b);
		}
		roots
	}
}

/// The modules that the test runners load into every test run, or that serve requests of the
/// tests: those that their code names by a path alias, such as `'vs/workbench/test/common/utils'`
/// or `` `${out}/vs/base/common/uri.js` ``. No test imports them.
fn harness_modules(config: &Config, snap: &Snapshot, read: &mut ReadBlob) -> Result<Vec<Harness>> {
	let mut modules: Vec<Harness> = Vec::new();
	for e in snap
		.entries
		.iter()
		.filter(|e| config.is_test_runner(&e.path))
	{
		let source = read(&e.oid)?;
		let facts = analyze(&e.path, &source, config);
		if facts.error {
			anyhow::bail!("{}: cannot find the modules it loads", e.path);
		}
		let names: Vec<u64> = facts
			.decls
			.iter()
			.flat_map(|d| d.uses.iter().copied())
			.collect();
		for path in alias_paths(&source, config) {
			let Some(i) = config
				.resolve_alias(path)
				.and_then(|p| snap.resolve_file(&p))
			else {
				continue;
			};
			let (i, m) = (i as usize, &snap.entries[i as usize]);
			if !m.role.is_module() || m.role.is_test() {
				continue;
			}
			match modules.iter_mut().find(|h| h.file == i) {
				Some(h) => h.names.extend(&names),
				None => modules.push(Harness {
					file: i,
					reason: format!("test harness ({} loads {})", e.path, m.path),
					names: names.clone(),
				}),
			}
		}
	}
	Ok(modules)
}

/// The reason to run every unit test when a seed reaches what the test runners use of the modules
/// they load. Tests do not import these modules, so they cannot depend on the change.
fn harness_reached(
	config: &Config,
	snap: &Snapshot,
	graph: &Graph,
	seeds: &[u32],
	read: &mut ReadBlob,
) -> Result<Option<String>> {
	if seeds.is_empty() {
		return Ok(None);
	}
	let harness = harness_modules(config, snap, read)?;
	let (candidates, _) = graph.dependent_files(seeds.iter().copied());
	let mut targets = vec![false; graph.node_count()];
	for &s in seeds {
		targets[s as usize] = true;
	}
	let mut scratch = Scratch::default();
	Ok(harness
		.into_iter()
		.filter(|h| candidates[h.file])
		.find(|h| graph.reaches_from(&h.roots(snap, graph), &h.names, &targets, &mut scratch))
		.map(|h| h.reason))
}

/// The paths in a text that start with a path alias at the start of a path segment, such as
/// `vs/base/common/uri.js` in `` `${out}/vs/base/common/uri.js` ``.
fn alias_paths<'a>(text: &'a str, config: &Config) -> Vec<&'a str> {
	let is_path = |c: char| c.is_ascii_alphanumeric() || "_-./@".contains(c);
	let mut out = Vec::new();
	for prefix in config.alias_prefixes() {
		for (i, _) in text.match_indices(prefix) {
			if text[..i]
				.chars()
				.next_back()
				.is_some_and(|c| c != '/' && is_path(c))
			{
				continue;
			}
			let end = text[i..]
				.find(|c: char| !is_path(c))
				.map_or(text.len(), |n| i + n);
			out.push(text[i..end].trim_end_matches(['.', '/']));
		}
	}
	out
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
		let data = !base.role(path).is_module() && !head.role(path).is_module();
		head_seeds.extend(hg.readers(path, data).0);
		base_seeds.extend(bg.readers(path, data).0);
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
				// Module evaluation order: statements that kept their content but moved relative to
				// each other.
				let (moved_base, moved_head) = reordered(&bf.order, &hf.order);
				base_seeds.extend(moved_base.into_iter().map(|d| bg.base[bi] + d));
				head_seeds.extend(moved_head.into_iter().map(|d| hg.base[hi] + d));
				// What loading the module runs: other modules or packages with effects outside
				// themselves, or the same ones in another order, change what loading it does.
				let (before, after) = (
					bg.effect_sequence(base, bi as u32),
					hg.effect_sequence(head, hi as u32),
				);
				if before != after {
					if std::env::var_os("RIPPLE_DEBUG").is_some() {
						eprintln!("{path}: loads modules or packages with effects differently");
					}
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
	/// Why every integration test must run, if a change reaches outside the module graph where
	/// only the integration tests depend on it (`runEveryIntegrationTest`). Every test runs anyway
	/// when `run_all` is set.
	pub run_all_integration: Option<String>,
	/// npm packages whose resolved version changed.
	pub packages: usize,
	/// The nodes that the change changed in the head and in the base graph, which the selected
	/// tests depend on: declarations (see `changed_nodes`), packages and injected globals.
	pub head_seeds: Vec<u32>,
	pub base_seeds: Vec<u32>,
}

fn collect(snap: &Snapshot, marks: &[bool], out: &mut HashSet<Arc<str>>) {
	for (i, m) in marks.iter().enumerate() {
		let e = &snap.entries[i];
		if *m && e.role.is_test() {
			out.insert(e.path.clone());
		}
	}
}

/// The files among `roots` whose code depends on a seed: candidates from the reverse closure,
/// confirmed by a forward closure that only reaches instance methods whose names the file's code
/// uses.
fn dependents(graph: &Graph, seeds: &[u32], roots: impl Fn(usize) -> bool) -> Vec<usize> {
	if seeds.is_empty() {
		return Vec::new();
	}
	let (candidates, gated) = graph.dependent_files(seeds.iter().copied());
	let mut targets = vec![false; graph.node_count()];
	for &s in seeds {
		targets[s as usize] = true;
	}
	let mut scratch = Scratch::default();
	(0..candidates.len())
		.filter(|&i| {
			candidates[i] && roots(i) && (!gated || graph.reaches(i as u32, &targets, &mut scratch))
		})
		.collect()
}

/// Tests that depend on a seed.
fn dependent_tests(snap: &Snapshot, graph: &Graph, seeds: &[u32], out: &mut HashSet<Arc<str>>) {
	for i in dependents(graph, seeds, |i| snap.entries[i].role.is_test()) {
		out.insert(snap.entries[i].path.clone());
	}
}

pub fn select(
	config: &Config,
	read: &mut ReadBlob,
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
	let mut run_all_integration = paths.iter().find_map(|p| {
		config
			.run_every_integration_test(p)
			.map(|reason| format!("{reason} ({p})"))
	});
	// A module that does not parse has no dependencies, so its tests would miss changes.
	run_all = run_all.or_else(|| {
		head.entries
			.iter()
			.chain(&base.entries)
			.find(|e| e.facts.as_ref().is_some_and(|facts| facts.error))
			.map(|e| format!("parse error ({})", e.path))
	});
	if run_all.is_none() {
		let scripts = runner_script_changed(config, head, read, &paths)?;
		let first = |scope: Scope| {
			scripts
				.iter()
				.find(|(s, _)| *s == scope)
				.map(|(_, reason)| reason.clone())
		};
		run_all = first(Scope::All);
		run_all_integration = run_all_integration.or_else(|| first(Scope::Integration));
	}
	let deps = dependency_impact(config, read, head, changes)?;
	let mut packages = 0;
	if let Some(deps) = &deps {
		run_all = run_all.or_else(|| deps.run_all.clone());
		run_all_integration = run_all_integration.or_else(|| deps.run_all_integration.clone());
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
	if run_all.is_none() {
		run_all = harness_reached(config, head, hg, &head_seeds, read)?;
	}
	if run_all.is_none() {
		run_all = harness_reached(config, base, bg, &base_seeds, read)?;
	}
	let mut sel = Selection {
		file_all: HashSet::new(),
		file_runtime: HashSet::new(),
		decl: HashSet::new(),
		changed_decls: head_seeds.len() + base_seeds.len(),
		run_all,
		run_all_integration,
		packages,
		head_seeds,
		base_seeds,
	};
	dependent_tests(head, hg, &sel.head_seeds, &mut sel.decl);
	dependent_tests(base, bg, &sel.base_seeds, &mut sel.decl);
	let is_data = |p: &str| !base.role(p).is_module() && !head.role(p).is_module();
	let head_files: Vec<u32> = paths
		.iter()
		.filter_map(|p| head.find(p))
		.chain(paths.iter().flat_map(|p| hg.readers(p, is_data(p)).1))
		.collect();
	let base_files: Vec<u32> = paths
		.iter()
		.filter_map(|p| base.find(p))
		.chain(paths.iter().flat_map(|p| bg.readers(p, is_data(p)).1))
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
		let contents: HashMap<String, String> = base
			.iter()
			.chain(head)
			.map(|(_, c)| (format!("{:016x}", xxh3_64(c.as_bytes())), (*c).to_owned()))
			.collect();
		let mut read = |oid: &str| -> Result<String> { Ok(contents[oid].clone()) };
		select(config, &mut read, &bs, &bg, &hs, &hg, &changes).unwrap()
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

	/// Files with owned contents as (path, content) references.
	fn refs<'a>(files: &'a [(&'a str, String)]) -> Vec<(&'a str, &'a str)> {
		files.iter().map(|(p, c)| (*p, c.as_str())).collect()
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
	fn packages_of_the_files_every_test_depends_on_run_everything() {
		let files = [
			(
				"test/runner.js",
				"const server = require('server');\nconst { x } = require('@scope/tool/sub');\nrequire('./local.js');\nrequire('fs');\nimport('dynamic');\n",
			),
			("test/types.ts", "import type { T } from 'types-only';\n"),
			("test/README.md", "require('docs')\n"),
			("src/lib/a.ts", "import 'not-a-runner';\n"),
		];
		let contents: HashMap<String, &str> = files
			.iter()
			.map(|(_, c)| (format!("{:016x}", xxh3_64(c.as_bytes())), *c))
			.collect();
		let mut read = |oid: &str| -> Result<String> { Ok(contents[oid].to_owned()) };
		let packages = runner_packages(for_tests(), &snapshot(&files), &mut read).unwrap();
		let mut packages: Vec<(String, (Scope, String))> = packages.into_iter().collect();
		packages.sort_by(|a, b| a.0.cmp(&b.0));
		let reason = |p: &str| {
			(
				p.to_owned(),
				(
					Scope::All,
					format!("test runner package '{p}' (test/runner.js)"),
				),
			)
		};
		assert_eq!(
			packages,
			vec![reason("@scope/tool"), reason("dynamic"), reason("server")]
		);
	}

	#[test]
	fn scripts_that_run_everything_scripts_load_run_everything() {
		// `test/**` runs everything; test/runner.js loads tools/version.js, which loads
		// tools/deep.js and the npm package semver.
		let files = [
			(
				"test/runner.js",
				"const { version } = require('../tools/version.js');\nrequire('../src/lib/a.js');\n",
			),
			(
				"tools/version.js",
				"const semver = require('semver');\nexports.version = require('./deep.js').v;\n",
			),
			("tools/deep.js", "exports.v = 1;\n"),
			("tools/other.js", "exports.o = 1;\n"),
			("src/lib/a.ts", "export const a = 1;\n"),
			TEST_A,
		];
		let case = |path: &str| -> Option<String> {
			let head: Vec<(&str, String)> = files
				.iter()
				.map(|&(p, c)| {
					(
						p,
						if p == path {
							format!("{c}// changed\n")
						} else {
							c.to_owned()
						},
					)
				})
				.collect();
			selection(&files, &refs(&head)).run_all
		};
		let contents: HashMap<String, &str> = files
			.iter()
			.map(|(_, c)| (format!("{:016x}", xxh3_64(c.as_bytes())), *c))
			.collect();
		let mut read = |oid: &str| -> Result<String> { Ok(contents[oid].to_owned()) };
		let packages = runner_packages(for_tests(), &snapshot(&files), &mut read).unwrap();
		assert_eq!(
			(
				case("tools/version.js"),
				case("tools/deep.js"),
				case("tools/other.js"),
				packages.get("semver").map(|(_, reason)| reason.as_str()),
			),
			(
				Some("test runner (test/runner.js loads tools/version.js)".to_owned()),
				Some("test runner (tools/version.js loads tools/deep.js)".to_owned()),
				None,
				Some("test runner package 'semver' (tools/version.js)"),
			)
		);
	}

	#[test]
	fn integration_test_launchers_run_every_integration_test() {
		// `scripts/integration.*` runs every integration test: scripts/integration.ts loads
		// tools/launch.js, which loads the npm package launcher, and tools/shared.js, which
		// test/runner.js loads too, so that changing it runs every test. test/runner.js also loads
		// scripts/integration.cjs, which runs every test although the group lists it.
		let files = [
			(
				"scripts/integration.ts",
				"import { launch } from '../tools/launch.js';\nimport '../tools/shared.js';\nlaunch();\n",
			),
			("scripts/integration.cjs", "exports.i = 1;\n"),
			(
				"tools/launch.js",
				"const launcher = require('launcher');\nexports.launch = launcher;\n",
			),
			("tools/shared.js", "exports.s = 1;\n"),
			(
				"test/runner.js",
				"require('../tools/shared.js');\nrequire('../scripts/integration.cjs');\n",
			),
			(
				"src/app/a.integrationTest.ts",
				"import { a } from './lib.js';\ntest('a', () => a);\n",
			),
			("src/app/lib.ts", "export const a = 1;\n"),
			TEST_A,
		];
		let case = |path: &str| -> (Option<String>, Option<String>, Vec<String>) {
			let head: Vec<(&str, String)> = files
				.iter()
				.map(|&(p, c)| {
					(
						p,
						if p == path {
							format!("{c}// changed\n")
						} else {
							c.to_owned()
						},
					)
				})
				.collect();
			let sel = selection(&files, &refs(&head));
			let mut tests: Vec<String> = sel.decl.iter().map(|p| p.to_string()).collect();
			tests.sort();
			(sel.run_all, sel.run_all_integration, tests)
		};
		let contents: HashMap<String, &str> = files
			.iter()
			.map(|(_, c)| (format!("{:016x}", xxh3_64(c.as_bytes())), *c))
			.collect();
		let mut read = |oid: &str| -> Result<String> { Ok(contents[oid].to_owned()) };
		let packages = runner_packages(for_tests(), &snapshot(&files), &mut read).unwrap();
		assert_eq!(
			(
				case("scripts/integration.ts"),
				case("tools/launch.js"),
				case("tools/shared.js").0,
				case("scripts/integration.cjs").0,
				packages.get("launcher").cloned(),
			),
			(
				(
					None,
					Some("integration test runner (scripts/integration.ts)".to_owned()),
					vec![]
				),
				(
					None,
					Some(
						"integration test runner (scripts/integration.ts loads tools/launch.js)"
							.to_owned()
					),
					vec![]
				),
				Some("test runner (test/runner.js loads tools/shared.js)".to_owned()),
				Some("test runner (test/runner.js loads scripts/integration.cjs)".to_owned()),
				Some((
					Scope::Integration,
					"integration test runner package 'launcher' (tools/launch.js)".to_owned()
				)),
			)
		);
	}

	#[test]
	fn loading_npm_packages_counts_as_an_effect() {
		let setup = ("src/app/setup.ts", "import 'polyfill';\n");
		let case = |before: &str, after: &str| -> Vec<String> {
			let lib = |imports: &str| format!("{imports}export const a = 1;\n");
			let (before, after) = (lib(before), lib(after));
			selected(
				&[("src/app/lib.ts", &before), setup, TEST_A],
				&[("src/app/lib.ts", &after), setup, TEST_A],
			)
		};
		let a = || vec!["src/app/test/a.test.ts".to_owned()];
		assert_eq!(
			(
				case("", "import 'polyfill';\n"),
				case("import 'polyfill';\n", ""),
				case("import 'a';\nimport 'b';\n", "import 'b';\nimport 'a';\n"),
				// A module that loads a package.
				case("", "import './setup.js';\n"),
				case("import 'polyfill';\n", "import 'polyfill';\n// comment\n"),
			),
			(a(), a(), a(), a(), vec![])
		);
	}

	#[test]
	fn changes_in_the_evaluation_order_of_effects_select_the_importers() {
		let effect =
			|name: &str| format!("globalThis.order = (globalThis.order ?? '') + '{name}';\n");
		let (first, target) = (effect("first"), effect("target"));
		let case = |before: &str, after: &str| -> Vec<String> {
			let lib = |imports: &str| format!("{imports}export const a = 1;\n");
			let (before, after) = (lib(before), lib(after));
			let files = |lib: &str| -> Vec<(&str, String)> {
				vec![
					("src/app/lib.ts", lib.to_owned()),
					("src/app/first.ts", first.clone()),
					("src/app/target.ts", target.clone()),
					(
						"src/app/parent.ts",
						"import './target.js';\nexport const p = 1;\n".to_owned(),
					),
					("src/app/pure.ts", "export const q = 1;\n".to_owned()),
					(TEST_A.0, TEST_A.1.to_owned()),
				]
			};
			let (b, h) = (files(&before), files(&after));
			selected(&refs(&b), &refs(&h))
		};
		let a = || vec!["src/app/test/a.test.ts".to_owned()];
		let (both, direct) = (
			"import './first.js';\nimport './parent.js';\n",
			"import './target.js';\nimport './first.js';\nimport './parent.js';\n",
		);
		assert_eq!(
			(
				// Loading target.ts directly runs it before first.ts, not after it through parent.ts.
				case(both, direct),
				case(direct, both),
				// Modules and packages run in one order.
				case(
					"import './first.js';\nimport 'polyfill';\n",
					"import 'polyfill';\nimport './first.js';\n"
				),
				// Subpaths of a package are different modules.
				case("import 'pkg/one';\n", "import 'pkg/two';\n"),
				// What runs does not change: a module without effects, or one that already ran.
				case(
					"import './first.js';\n",
					"import './first.js';\nimport './pure.js';\n"
				),
				case(
					"import './parent.js';\n",
					"import './parent.js';\nimport './target.js';\n"
				),
			),
			(a(), a(), a(), a(), vec![], vec![])
		);
	}

	#[test]
	fn loading_a_module_that_writes_to_built_in_globals_selects_the_importers() {
		// lib.ts starts loading patch.ts, which changes what the tests that load lib.ts run with.
		let case = |patch: &str| -> Vec<String> {
			let lib = |imports: &str| format!("{imports}export const a = 1;\n");
			let (before, after) = (lib(""), lib("import './patch.js';\n"));
			let patch = ("src/app/patch.ts", patch);
			selected(
				&[("src/app/lib.ts", &before), patch, TEST_A],
				&[("src/app/lib.ts", &after), patch, TEST_A],
			)
		};
		let a = || vec!["src/app/test/a.test.ts".to_owned()];
		assert_eq!(
			(
				case("Error.stackTraceLimit = 0;\n"),
				case("console.log = () => { };\n"),
				case("Error.stackTraceLimit++;\n"),
				case("(Array.prototype as any).last = function () { return this.at(-1); };\n"),
				case("Object.defineProperty(Error, 'stackTraceLimit', { value: 0 });\n"),
				case("function quiet() { console['warn'] = () => { }; }\nquiet();\n"),
				// Calling their methods changes nothing.
				case("console.log(Object.keys({ a: 1 }));\n"),
			),
			(a(), a(), a(), a(), a(), a(), vec![])
		);
	}

	#[test]
	fn whole_module_references_reach_re_exported_declarations() {
		let case = |barrel: &str, test: &str| -> Vec<String> {
			let files = |value: &str| -> Vec<(&str, String)> {
				vec![
					(
						"src/app/impl.ts",
						format!("export const value = {value};\nexport const other = 1;\n"),
					),
					("src/app/barrel.ts", barrel.to_owned()),
					(
						"src/app/outer.ts",
						"export * as inner from './barrel.js';\n".to_owned(),
					),
					("src/app/test/a.test.ts", test.to_owned()),
				]
			};
			let (b, h) = (files("1"), files("2"));
			selected(&refs(&b), &refs(&h))
		};
		let named = "export { value, other } from './impl.js';\n";
		let star = "export * from './impl.js';\n";
		let dynamic = "test('a', async () => (await import('../barrel.js')).value);\n";
		let a = || vec!["src/app/test/a.test.ts".to_owned()];
		assert_eq!(
			(
				case(named, dynamic),
				case(star, dynamic),
				case(
					named,
					"import * as ns from '../barrel.js';\ntest('a', () => Object.keys(ns));\n"
				),
				case(
					star,
					"import { inner } from '../outer.js';\ntest('a', () => inner);\n"
				),
				// A named import through a barrel still depends on that name only.
				case(
					star,
					"import { other } from '../barrel.js';\ntest('a', () => other);\n"
				),
			),
			(a(), a(), a(), a(), vec![])
		);
	}

	#[test]
	fn a_module_that_does_not_parse_runs_everything() {
		let lib = |value: &str| ("src/app/lib.ts", format!("export const a = {value};\n"));
		let broken = ("src/app/broken.ts", "export const = {;\n");
		let (before, after) = (lib("1"), lib("2"));
		let sel = selection(
			&[(before.0, &before.1), broken, TEST_A],
			&[(after.0, &after.1), broken, TEST_A],
		);
		assert_eq!(
			sel.run_all.as_deref(),
			Some("parse error (src/app/broken.ts)")
		);
	}

	#[test]
	fn changes_that_reach_what_the_test_runners_use_run_everything() {
		// The runner loads lib/harness.ts into every run and calls assertClean, and serves
		// requests with lib/server.ts.
		let files = [
			(
				"test/runner.js",
				"const { assertClean } = await loadFn('lib/harness');\nconst { Server } = await import(`${out}/lib/server.js`);\nnew Server().serve();\nawait loadFn('lib/setup');\n// Not loaded: lib/test/a.test.js and lib/missing.js.\n",
			),
			// Loaded for its load-time effects only.
			("src/lib/setup.ts", "globalThis.y = 1;\n"),
			(
				"src/lib/harness.ts",
				"import { check } from './helper.js';\nimport './effects.js';\nexport function assertClean() { return check(); }\nexport function unrelated() { return 1; }\n",
			),
			(
				"src/lib/helper.ts",
				"export function check() { return 1; }\nexport function unused() { return 1; }\n",
			),
			("src/lib/effects.ts", "globalThis.x = 1;\n"),
			(
				"src/lib/server.ts",
				"export class Server {\n\tserve() { return 1; }\n\tother() { return 1; }\n}\n",
			),
			("src/lib/other.ts", "export const o = 1;\n"),
			("src/lib/test/a.test.ts", "test('a', () => 1);\n"),
		];
		let case = |path: &str, old: &str, new: &str| -> Option<String> {
			let head: Vec<(&str, String)> = files
				.iter()
				.map(|&(p, c)| {
					let c = if p == path {
						assert!(c.contains(old), "{p}");
						c.replacen(old, new, 1)
					} else {
						c.to_owned()
					};
					(p, c)
				})
				.collect();
			selection(&files, &refs(&head)).run_all
		};
		let harness = |m: &str| Some(format!("test harness (test/runner.js loads {m})"));
		assert_eq!(
			(
				case(
					"src/lib/harness.ts",
					"return check();",
					"return check() + 1;"
				),
				case(
					"src/lib/helper.ts",
					"check() { return 1;",
					"check() { return 2;"
				),
				// Load-time state of the modules it loads, like state that tests leave behind.
				case("src/lib/effects.ts", "= 1", "= 2"),
				case(
					"src/lib/server.ts",
					"serve() { return 1;",
					"serve() { return 2;"
				),
				case("src/lib/setup.ts", "= 1", "= 2"),
				case(
					"src/lib/harness.ts",
					"unrelated() { return 1;",
					"unrelated() { return 2;"
				),
				case(
					"src/lib/helper.ts",
					"unused() { return 1;",
					"unused() { return 2;"
				),
				case(
					"src/lib/server.ts",
					"other() { return 1;",
					"other() { return 2;"
				),
				case("src/lib/other.ts", "= 1", "= 2"),
				case("src/lib/test/a.test.ts", "=> 1", "=> 2"),
			),
			(
				harness("src/lib/harness.ts"),
				harness("src/lib/harness.ts"),
				None,
				harness("src/lib/server.ts"),
				harness("src/lib/setup.ts"),
				None,
				None,
				None,
				None,
				None
			)
		);
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
	fn removing_an_export_selects_the_tests_that_used_it() {
		let mid = (
			"src/app/mid.ts",
			"import { a } from './lib.js';\nexport function g() { return a(); }\n",
		);
		let test = (
			"src/app/test/g.test.ts",
			"import { g } from '../mid.js';\ntest('g', () => g());\n",
		);
		let base = [
			(
				"src/app/lib.ts",
				"export function a() { return 1; }\nexport function b() { return 2; }\n",
			),
			mid,
			test,
		];
		let head = [
			("src/app/lib.ts", "export function b() { return 2; }\n"),
			mid,
			test,
		];
		assert_eq!(selected(&base, &head), vec!["src/app/test/g.test.ts"]);
	}

	#[test]
	fn removing_a_method_selects_the_tests_that_called_it() {
		let mid = (
			"src/app/mid.ts",
			"import { C } from './lib.js';\nexport function g() { return new C().m(); }\n",
		);
		let test = (
			"src/app/test/g.test.ts",
			"import { g } from '../mid.js';\ntest('g', () => g());\n",
		);
		let base = [
			(
				"src/app/lib.ts",
				"export class C {\n\tm() { return 1; }\n\tn() { return 2; }\n}\n",
			),
			mid,
			test,
		];
		let head = [
			(
				"src/app/lib.ts",
				"export class C {\n\tn() { return 2; }\n}\n",
			),
			mid,
			test,
		];
		assert_eq!(selected(&base, &head), vec!["src/app/test/g.test.ts"]);
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
	fn repository_paths_depend_on_the_file_and_module_paths_on_what_it_loads() {
		let files = [
			("src/app/dep.ts", "export function start() { return 1; }\n"),
			(
				"src/app/main.ts",
				"import { start } from './dep.js';\nstart();\n",
			),
			// A fake tree whose file names happen to be repository paths: code does not run a
			// module that a path from the repository root names.
			(
				"src/app/test/tree.test.ts",
				"const tree = [{ path: 'src/app/main.ts' }];\ntest('a', () => tree);\n",
			),
			// An entry point by path alias, which a process runs.
			(
				"src/lib/starter.ts",
				"export function spawn() { return fork('lib/worker'); }\n",
			),
			(
				"src/lib/worker.ts",
				"import { start } from '../app/dep.js';\nstart();\n",
			),
			(
				"src/lib/test/starter.test.ts",
				"import { spawn } from '../starter.js';\ntest('a', () => spawn());\n",
			),
		];
		let changed = |path: &str, content: &'static str| -> Vec<String> {
			let head: Vec<(&str, &str)> = files
				.iter()
				.map(|&(p, c)| (p, if p == path { content } else { c }))
				.collect();
			selected(&files, &head)
		};
		assert_eq!(
			(
				changed("src/app/dep.ts", "export function start() { return 2; }\n"),
				changed(
					"src/app/main.ts",
					"// Starts.\nimport { start } from './dep.js';\nstart();\n"
				),
			),
			(
				vec!["src/lib/test/starter.test.ts".to_owned()],
				vec!["src/app/test/tree.test.ts".to_owned()]
			)
		);
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
	fn properties_that_a_later_spread_or_computed_key_can_overwrite_depend_on_the_object() {
		let imported = (
			"src/app/test/imported.test.ts",
			"import { values } from '../lib.js';\ntest('a', () => values.a);\n",
		);
		let local = (
			"src/app/test/local.test.ts",
			"import { readA } from '../lib.js';\ntest('a', () => readA());\n",
		);
		let lib = |(overrides, values): (&str, &str)| {
			format!(
				"const k = 'a';\nconst overrides = {overrides};\nexport const values = {values};\nexport function readA() {{ return values.a; }}\n"
			)
		};
		let case = |before, after| selected_by_lib(&lib(before), &lib(after), &[imported, local]);
		let both = || vec![imported.0.to_owned(), local.0.to_owned()];
		assert_eq!(
			(
				case(
					("{}", "{ a: 1, ...{ a: 2 } }"),
					("{}", "{ a: 1, ...{ a: 3 } }")
				),
				case(
					("{ a: 2 }", "{ a: 1, ...overrides }"),
					("{ a: 3 }", "{ a: 1, ...overrides }")
				),
				case(("{}", "{ a: 1, [k]: 2 }"), ("{}", "{ a: 1, [k]: 3 }")),
				// The properties after the last spread keep their own dependencies.
				case(
					("{}", "{ ...{ b: 0 }, a: 1, c: 2 }"),
					("{}", "{ ...{ b: 0 }, a: 1, c: 3 }")
				),
			),
			(both(), both(), both(), vec![])
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
	fn moving_a_read_across_a_load_time_mutation_selects_its_readers() {
		let test = (
			"src/app/test/a.test.ts",
			"import { snapshot } from '../lib.js';\ntest('a', () => snapshot);\n",
		);
		let lib = |body: &str| format!("export const state = {{ items: [] as number[] }};\n{body}");
		let case = |before: &str, after: &str| selected_by_lib(&lib(before), &lib(after), &[test]);
		let (push, read) = (
			"state.items.push(1);\n",
			"export const snapshot = state.items.length;\n",
		);
		assert_eq!(
			(
				case(&format!("{push}{read}"), &format!("{read}{push}")),
				// Without a load-time mutation, the order of reads does not matter.
				case(
					&format!("{read}export const other = state.items;\n"),
					&format!("export const other = state.items;\n{read}")
				),
			),
			(vec![test.0.to_owned()], vec![])
		);
	}

	#[test]
	fn functions_passed_to_load_time_calls_run_at_load_time() {
		let test = (
			"src/app/test/a.test.ts",
			"import { state } from '../lib.js';\ntest('a', () => state.count);\n",
		);
		let lib = |n: u32| {
			format!(
				"export const state = {{ count: 0 }};\nfunction write(x: number) {{ state.count += x * {n}; return x; }}\nexport const init = [1].map(write);\n"
			)
		};
		assert_eq!(selected_by_lib(&lib(1), &lib(2), &[test]), vec![test.0]);
	}

	#[test]
	fn object_methods_that_change_their_argument_write_it() {
		let test = (
			"src/app/test/a.test.ts",
			"import { config } from '../lib.js';\ntest('a', () => config.mode);\n",
		);
		// In declarations: a change of a top-level statement already selects every importer.
		let case = |before: &str, after: &str| {
			let lib = |call: &str| format!("export const config = {{ mode: 1 }};\n{call}");
			selected_by_lib(&lib(before), &lib(after), &[test])
		};
		let a = || vec![test.0.to_owned()];
		assert_eq!(
			(
				case(
					"export const patched = Object.defineProperties(config, { mode: { value: 2 } });\n",
					"export const patched = Object.defineProperties(config, { mode: { value: 3 } });\n"
				),
				case(
					"export const merged = Object.assign(config, { mode: 2 });\n",
					"export const merged = Object.assign(config, { mode: 3 });\n"
				),
				// A frozen object rejects writes to its members.
				case("", "export const frozen = Object.freeze(config);\n"),
				// Reading the object does not change it.
				case(
					"export const keys = Object.keys(config);\n",
					"export const keys = Object.entries(config);\n"
				),
			),
			(a(), a(), a(), vec![])
		);
	}

	#[test]
	fn whole_module_references_reach_through_cyclic_re_exports() {
		// a and b re-export each other, and a re-exports c.
		let files = |value: &str| -> Vec<(&str, String)> {
			vec![
				(
					"src/app/a.ts",
					"export * from './b.js';\nexport * from './c.js';\n".to_owned(),
				),
				(
					"src/app/b.ts",
					"export * from './a.js';\nexport const own = 1;\n".to_owned(),
				),
				("src/app/c.ts", format!("export const value = {value};\n")),
				(
					"src/app/test/a.test.ts",
					"import * as ns from '../a.js';\ntest('a', () => Object.keys(ns));\n"
						.to_owned(),
				),
				(
					"src/app/test/b.test.ts",
					"import * as ns from '../b.js';\ntest('b', () => Object.keys(ns));\n"
						.to_owned(),
				),
			]
		};
		let (base, head) = (files("1"), files("2"));
		assert_eq!(
			selected(&refs(&base), &refs(&head)),
			vec!["src/app/test/a.test.ts", "src/app/test/b.test.ts"]
		);
	}

	#[test]
	fn implementing_an_interface_of_a_package_through_analyzed_types_reaches_all_methods() {
		let test = (
			"src/app/test/a.test.ts",
			"import { C } from '../lib.js';\ntest('a', () => new C());\n",
		);
		let types = (
			"src/app/types.ts",
			"export type { IAddon } from 'xterm';\nimport type { IDisposable as D } from 'xterm';\nexport type IDisposable = D;\nexport interface IMyAddon extends IAddon { extra(): void }\nexport interface ILocal { activate(): void }\nexport * from './more.js';\n",
		);
		let more = (
			"src/app/more.ts",
			"import type { IAddon } from 'xterm';\nexport interface IFromStar extends IAddon {}\n",
		);
		let case = |name: &str| -> Vec<String> {
			let lib = |value: u32| {
				format!(
					"import type {{ {name} }} from './types.js';\nexport class C implements {name} {{ activate() {{ return {value}; }} }}\n"
				)
			};
			selected_by_lib(&lib(1), &lib(2), &[test, types, more])
		};
		let a = || vec![test.0.to_owned()];
		assert_eq!(
			(
				case("IAddon"),
				case("IDisposable"),
				case("IMyAddon"),
				case("IFromStar"),
				// An interface declared in analyzed code: only code that uses the name reaches it.
				case("ILocal"),
			),
			(a(), a(), a(), a(), vec![])
		);
	}

	#[test]
	fn methods_that_unanalyzed_code_calls_are_reached_with_their_class() {
		// Node.js streams call `_flush`, the DOM calls `connectedCallback` and an npm package calls
		// the methods of its interfaces: no analyzed code uses their names.
		let test = (
			"src/app/test/a.test.ts",
			"import { C } from '../lib.js';\ntest('a', () => new C());\n",
		);
		let others = [
			test,
			(
				"src/app/base.ts",
				"import { Transform } from 'stream';\nexport class Base extends Transform {}\n",
			),
			(
				"src/app/streams.ts",
				"export { Transform } from 'stream';\n",
			),
			("src/app/plain.ts", "export class Plain {}\n"),
		];
		let case = |header: &str, method: &str| -> Vec<String> {
			let lib = |value: u32| format!("{header} {{ {method}() {{ return {value}; }} }}\n");
			selected_by_lib(&lib(1), &lib(2), &others)
		};
		let a = || vec![test.0.to_owned()];
		assert_eq!(
			(
				case(
					"import { Transform } from 'stream';\nexport class C extends Transform",
					"_flush"
				),
				case("export class C extends HTMLElement", "connectedCallback"),
				case(
					"import type { IAddon } from 'xterm';\nexport class C implements IAddon",
					"activate"
				),
				// Through an analyzed superclass, or a module that re-exports the package's class.
				case(
					"import { Base } from './base.js';\nexport class C extends Base",
					"_flush"
				),
				case(
					"import { Transform } from './streams.js';\nexport class C extends Transform",
					"_flush"
				),
				// Analyzed heritage: only code that uses the name reaches the method.
				case(
					"import { Plain } from './plain.js';\nexport class C extends Plain",
					"_flush"
				),
				case(
					"interface ILocal { activate(): void }\nexport class C implements ILocal",
					"activate"
				),
			),
			(a(), a(), a(), a(), a(), vec![], vec![])
		);
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

	#[test]
	fn data_folders_select_the_tests_that_name_them() {
		let snapshot_test = |p: &'static str, helper: &'static str| {
			(
				p,
				match helper {
					"./" => {
						"import { assertSnapshot } from './snapshot.js';\ntest('a', () => assertSnapshot(1));\n"
					}
					_ => {
						"import { assertSnapshot } from '../snapshot.js';\ntest('a', () => assertSnapshot(1));\n"
					}
				},
			)
		};
		let files = [
			// A helper that computes paths into the __snapshots__ folder next to the running test.
			(
				"src/app/test/snapshot.ts",
				"export function assertSnapshot(v) { return read(testDir() + '/__snapshots__/' + v); }\n",
			),
			snapshot_test("src/app/test/a.test.ts", "./"),
			snapshot_test("src/app/test/b.test.ts", "./"),
			("src/app/test/plain.test.ts", "test('a', () => 1);\n"),
			snapshot_test("src/app/test/nested/c.test.ts", "../"),
			// A test that names a folder in a template literal.
			(
				"src/app/test/cases.test.ts",
				"test('a', () => read(`${dir}${sep}test-cases${sep}${name}`));\n",
			),
			("src/app/test/__snapshots__/a_title.0.snap", "1"),
			("src/app/test/test-cases/case.jsonl", "1"),
			// A folder with modules is not test data.
			("src/app/test/helpers/h.ts", "export const h = 'helpers';\n"),
			("src/app/test/helpers/data.json", "1"),
			("src/app/other/__snapshots__/x.snap", "1"),
		];
		let changed = |path: &str| -> Vec<String> {
			let head: Vec<(&str, &str)> = files
				.iter()
				.map(|&(p, c)| (p, if p == path { "2" } else { c }))
				.collect();
			selected(&files, &head)
		};
		let added: Vec<(&str, &str)> = files
			.iter()
			.copied()
			.chain([("src/app/test/nested/__snapshots__/c.snap", "1")])
			.collect();
		assert_eq!(
			(
				changed("src/app/test/__snapshots__/a_title.0.snap"),
				selected(&files, &added),
				changed("src/app/test/test-cases/case.jsonl"),
				changed("src/app/test/helpers/data.json"),
				changed("src/app/other/__snapshots__/x.snap"),
			),
			(
				vec![
					"src/app/test/a.test.ts".to_owned(),
					"src/app/test/b.test.ts".to_owned()
				],
				vec!["src/app/test/nested/c.test.ts".to_owned()],
				vec!["src/app/test/cases.test.ts".to_owned()],
				vec![],
				vec![]
			)
		);
	}

	#[test]
	fn module_loader_calls_depend_on_the_package() {
		let snap = snapshot(&[
			(
				"src/app/lib.ts",
				"export function load() { return loadModule('pkg-x', 'lib/x.js'); }\nexport function other() { return amd.loadModule('pkg-y', 'y.js'); }\n",
			),
			(
				"src/app/test/a.test.ts",
				"import { load } from '../lib.js';\ntest('a', () => load());\n",
			),
			(
				"src/app/test/b.test.ts",
				"import { other } from '../lib.js';\ntest('b', () => other());\n",
			),
		]);
		let graph = Graph::build(&snap, for_tests());
		let tests_of = |package: &str| {
			let mut tests = HashSet::new();
			dependent_tests(&snap, &graph, &[graph.packages[package]], &mut tests);
			let mut tests: Vec<String> = tests.iter().map(|t| t.to_string()).collect();
			tests.sort();
			tests
		};
		assert_eq!(
			(tests_of("pkg-x"), tests_of("pkg-y")),
			(
				vec!["src/app/test/a.test.ts".to_owned()],
				vec!["src/app/test/b.test.ts".to_owned()]
			)
		);
	}

	#[test]
	fn computed_paths_read_the_data_files_of_their_folder() {
		let files = [
			// A helper that reads expected output through an alias path: `lib/` is `src/lib/`. Its
			// path can name any file of the folder, but modules there are code, not data.
			(
				"src/lib/test/node/mapperUtils.ts",
				"export function expected(file) { return read(`lib/test/node/${file}`); }\n",
			),
			(
				"src/lib/test/node/mapper.test.ts",
				"import { expected } from './mapperUtils.js';\ntest('a', () => expected('mac_de.txt'));\n",
			),
			("src/lib/test/node/other.test.ts", "test('a', () => 1);\n"),
			// Names that are not paths of data files: no data file has the static start and end.
			(
				"src/lib/test/node/display.test.ts",
				"test('a', () => [`./file${i}.ts`, `../My output ${x}.txt`]);\n",
			),
			// A static start of the file name: `mac_${variant}.txt`.
			(
				"src/lib/test/node/mac.test.ts",
				"test('a', () => read(`lib/test/node/mac_${variant}.txt`));\n",
			),
			("src/lib/test/node/mac_de.txt", "1"),
			("src/lib/test/node/win_de.txt", "1"),
			// Paths relative to the module, and from the repository root.
			(
				"src/lib/test/rel/rel.test.ts",
				"test('a', () => read(`./${name}.json`));\n",
			),
			("src/lib/test/rel/case.json", "1"),
			(
				"src/lib/test/root/root.test.ts",
				"test('a', () => read(`src/lib/test/root/${name}.txt`));\n",
			),
			("src/lib/test/root/case.txt", "1"),
			// A computed path at the top of the tree is too broad to follow.
			(
				"src/lib/test/broad.test.ts",
				"test('a', () => read(`src/${name}`));\n",
			),
			("src/lib/data.json", "1"),
		];
		let changed = |path: &str| -> Vec<String> {
			let head: Vec<(&str, &str)> = files
				.iter()
				.map(|&(p, c)| {
					(
						p,
						if p != path {
							c
						} else if p.ends_with(".ts") {
							"test('a', () => 2);\n"
						} else {
							"2"
						},
					)
				})
				.collect();
			selected(&files, &head)
		};
		assert_eq!(
			(
				changed("src/lib/test/node/mac_de.txt"),
				changed("src/lib/test/node/win_de.txt"),
				changed("src/lib/test/node/other.test.ts"),
				changed("src/lib/test/rel/case.json"),
				changed("src/lib/test/root/case.txt"),
				changed("src/lib/data.json"),
			),
			(
				vec![
					"src/lib/test/node/mac.test.ts".to_owned(),
					"src/lib/test/node/mapper.test.ts".to_owned()
				],
				vec!["src/lib/test/node/mapper.test.ts".to_owned()],
				vec!["src/lib/test/node/other.test.ts".to_owned()],
				vec!["src/lib/test/rel/rel.test.ts".to_owned()],
				vec!["src/lib/test/root/root.test.ts".to_owned()],
				vec![]
			)
		);
	}

	#[test]
	fn paths_explain_how_a_test_reaches_a_change() {
		let test = (
			"src/app/test/a.test.ts",
			"test('a', async () => { const { Service } = await import('../lib.js'); return new Service().send(); });\n",
		);
		let lib = |body| ("src/app/lib.ts", body);
		let base = [lib("export class Service { send() { return 1; } }\n"), test];
		let head = [lib("export class Service { send() { return 2; } }\n"), test];
		let (snap, seeds) = (snapshot(&head), selection(&base, &head).head_seeds);
		let graph = Graph::build(&snap, for_tests());
		let mut targets = vec![false; graph.node_count()];
		for s in seeds {
			targets[s as usize] = true;
		}
		let roots: Vec<u32> = graph
			.file_nodes(snap.find(test.0).unwrap() as usize)
			.collect();
		let path: Vec<(String, Option<String>)> = graph
			.path_from(&roots, &[], &targets)
			.unwrap()
			.into_iter()
			.map(|(v, opener)| (graph.label(&snap, v), opener.map(|o| graph.label(&snap, o))))
			.collect();
		assert_eq!(
			path,
			vec![
				("src/app/test/a.test.ts :: <init>".to_owned(), None),
				("src/app/lib.ts (whole module)".to_owned(), None),
				(
					"src/app/lib.ts :: Service.prototype.send".to_owned(),
					Some("src/app/test/a.test.ts :: <init>".to_owned())
				),
			]
		);
	}
}
