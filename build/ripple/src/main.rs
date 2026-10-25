/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! ripple: a content-addressed change impact engine for TypeScript repositories (prototype).

mod analyze;
mod config;
mod deps;
mod engine;
mod git;
mod graph;

use std::collections::{HashMap, HashSet};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result, bail};

use crate::config::{Config, Role};
use crate::engine::{Engine, blob_texts, changed_nodes, select};
use crate::graph::{Graph, Snapshot};

const USAGE: &str = "usage: ripple <command> --config FILE [--repo PATH] [options]\n\
	\n\
	\tstats [--rev REV]: graph statistics of a commit\n\
	\taffected --base REV [--head REV]: the test files a change can affect\n\
	\tanalyze --file PATH: analysis summary of one module\n\
	\tplan --base REV [--head REV] [--out-dir DIR]: the unit test files to run for a change\n\
	\tblame --test PATH --since REV [--until REV]: the commits in a range that can affect a test\n\
	\twhy --test PATH --base REV [--head REV]: how a change reaches a test that it selects\n\
	\treplay --since DATE [--until REV] [--out FILE] [--hubs 1]: selection statistics over first-parent history";

/// The commands of `USAGE`.
const COMMANDS: &[&str] = &[
	"stats", "affected", "analyze", "plan", "blame", "why", "replay",
];

/// The options of all commands. Each one takes a value.
const OPTIONS: &[&str] = &[
	"config", "repo", "rev", "base", "head", "file", "out-dir", "test", "since", "until", "out",
	"hubs",
];

struct Args {
	command: String,
	options: Vec<(String, String)>,
}

impl Args {
	/// Parses `<command> [--option value]...`, rejecting unknown options and missing values, so
	/// that a typo or a renamed option fails instead of being ignored.
	fn parse(mut it: impl Iterator<Item = String>) -> Result<Self> {
		let command = it.next().unwrap_or_default();
		let mut options = Vec::new();
		while let Some(a) = it.next() {
			let Some(name) = a.strip_prefix("--") else {
				bail!("unexpected argument '{a}'\n\n{USAGE}");
			};
			if !OPTIONS.contains(&name) {
				bail!("unknown option '--{name}'\n\n{USAGE}");
			}
			match it.next() {
				Some(value) if !value.starts_with("--") => options.push((name.to_owned(), value)),
				_ => bail!("--{name} needs a value\n\n{USAGE}"),
			}
		}
		Ok(Self { command, options })
	}

	fn get(&self, name: &str) -> Option<&str> {
		self.options
			.iter()
			.find(|(n, _)| n == name)
			.map(|(_, v)| v.as_str())
	}
}

/// The cost estimate of the unit tests among `files`: the number of tests in each unit test file.
fn weight<S: AsRef<str>>(snap: &Snapshot, files: impl Iterator<Item = S>) -> f64 {
	files
		.filter_map(|p| snap.find(p.as_ref()))
		.map(|i| &snap.entries[i as usize])
		.filter(|e| e.role == Role::UnitTest)
		.map(|e| e.facts.as_ref().map_or(1, |f| f.tests.max(1)) as f64)
		// Not `sum()`: an empty float sum is -0.0, which prints as "-0.0%".
		.fold(0.0, |total, w| total + w)
}

fn main() -> Result<()> {
	let args = Args::parse(std::env::args().skip(1))?;
	let command = args.command.as_str();
	if !COMMANDS.contains(&command) {
		bail!("{USAGE}");
	}
	let config = args
		.get("config")
		.context("--config is required: the repository configuration (see README.md)")?;
	let config = Config::load(Path::new(config))?;
	let repo = git::repo_root(&PathBuf::from(args.get("repo").unwrap_or(".")))?;
	match command {
		"stats" => stats(&config, repo, args.get("rev").unwrap_or("HEAD")),
		"affected" => affected(
			&config,
			repo,
			args.get("base").context("--base is required")?,
			args.get("head").unwrap_or("HEAD"),
		),
		"analyze" => {
			let path = args.get("file").context("--file is required")?;
			let source = std::fs::read_to_string(repo.join(path))?;
			let facts = analyze::analyze(path, &source, &config);
			println!(
				"role={:?} global_effects={} decls={} loads={}",
				config.role(path),
				facts.global_effects,
				facts.decls.len(),
				facts.loads.len()
			);
			Ok(())
		}
		"plan" => plan(
			&config,
			repo,
			args.get("base").context("--base is required")?,
			args.get("head").unwrap_or("HEAD"),
			args.get("out-dir"),
		),
		"blame" => blame(
			&config,
			repo,
			args.get("test").context("--test is required")?,
			args.get("since").context("--since is required")?,
			args.get("until").unwrap_or("HEAD"),
		),
		"why" => why(
			&config,
			repo,
			args.get("test").context("--test is required")?,
			args.get("base").context("--base is required")?,
			args.get("head").unwrap_or("HEAD"),
		),
		"replay" => replay(
			&config,
			repo,
			args.get("since").context("--since is required")?,
			args.get("until").unwrap_or("HEAD"),
			args.get("out"),
			args.get("hubs").is_some(),
		),
		_ => unreachable!(),
	}
}

fn stats(config: &Config, repo: PathBuf, rev: &str) -> Result<()> {
	let mut engine = Engine::new(repo, config);
	let t = Instant::now();
	let snap = engine.snapshot(rev)?;
	let analyze_ms = t.elapsed().as_millis();
	let t = Instant::now();
	let graph = Graph::build(&snap, config);
	let link_ms = t.elapsed().as_millis();
	let code = snap.entries.iter().filter(|e| e.facts.is_some()).count();
	let errors = snap
		.entries
		.iter()
		.filter(|e| e.facts.as_ref().is_some_and(|f| f.error))
		.count();
	let decls: usize = snap
		.entries
		.iter()
		.filter_map(|e| e.facts.as_ref())
		.map(|f| f.decls.len())
		.sum();
	let pinned: usize = snap
		.entries
		.iter()
		.filter_map(|e| e.facts.as_ref())
		.map(|f| f.decls.iter().filter(|d| d.pinned).count())
		.sum();
	let tests = |role: Role| snap.entries.iter().filter(|e| e.role == role).count();
	println!(
		"files: {} ({} modules, {} parse errors), unit test files: {}, integration test files: {}",
		snap.entries.len(),
		code,
		errors,
		tests(Role::UnitTest),
		tests(Role::IntegrationTest)
	);
	println!(
		"nodes: {} ({} declarations, {} pinned to module load, {} packages), edges: {}, unresolved imports: {}",
		graph.node_count(),
		decls,
		pinned,
		graph.packages.len(),
		graph.edges,
		graph.unresolved
	);
	println!(
		"read + analyze: {analyze_ms} ms, link: {link_ms} ms ({} threads)",
		rayon::current_num_threads()
	);
	let roots = snap
		.entries
		.iter()
		.filter(|e| e.facts.as_ref().is_some_and(|f| f.global_effects))
		.count();
	let closure = graph.effectful.iter().filter(|e| **e).count();
	println!(
		"modules with global load-time effects: {roots}, modules that load one (transitively): {closure} of {code}"
	);
	if let Ok(list) = std::env::var("RIPPLE_EFFECTS") {
		for p in list.split(',') {
			if let Some(i) = snap.find(p) {
				let e = &snap.entries[i as usize];
				println!(
					"  {p}: global_effects={} effectful={}",
					e.facts.as_ref().is_some_and(|f| f.global_effects),
					graph.effectful[i as usize]
				);
				// Follow effectful loads down to a module with its own global effects.
				let mut cur = i;
				let mut chain = Vec::new();
				while snap.entries[cur as usize]
					.facts
					.as_ref()
					.is_some_and(|f| !f.global_effects)
					&& chain.len() < 20
				{
					let Some(&next) = graph.loads[cur as usize]
						.iter()
						.find(|&&t| graph.effectful[t as usize])
					else {
						break;
					};
					chain.push(snap.entries[next as usize].path.to_string());
					cur = next;
				}
				if !chain.is_empty() {
					println!("    via {}", chain.join(" -> "));
				}
			}
		}
	}
	Ok(())
}

fn affected(config: &Config, repo: PathBuf, base: &str, head: &str) -> Result<()> {
	let mut engine = Engine::new(repo.clone(), config);
	let mut blobs = blob_texts(&repo)?;
	let t = Instant::now();
	let bs = engine.snapshot(base)?;
	let hs = engine.snapshot(head)?;
	let (bg, hg) = (Graph::build(&bs, config), Graph::build(&hs, config));
	let changes = git::diff_tree(&repo, base, head)?;
	// Explains the selection: the declarations that each changed module changed. Other files are
	// opaque, and select the code that loads or reads them.
	for c in &changes {
		let facts = |snap: &Snapshot| {
			snap.find(&c.path)
				.and_then(|i| snap.entries[i as usize].facts.clone())
		};
		match (facts(&bs), facts(&hs)) {
			(Some(bf), Some(hf)) => {
				let before: HashMap<&str, u64> =
					bf.decls.iter().map(|d| (d.key.as_str(), d.hash)).collect();
				let after: HashSet<&str> = hf.decls.iter().map(|d| d.key.as_str()).collect();
				let changed: Vec<String> = hf
					.decls
					.iter()
					.filter(|d| before.get(d.key.as_str()) != Some(&d.hash))
					.map(|d| d.key.clone())
					.chain(
						bf.decls
							.iter()
							.filter(|d| !after.contains(d.key.as_str()))
							.map(|d| format!("{} (removed)", d.key)),
					)
					.collect();
				eprintln!(
					"{}: {} of {} declarations changed{}{}",
					c.path,
					changed.len(),
					bf.decls.len().max(hf.decls.len()),
					if changed.is_empty() { "" } else { ": " },
					changed.join(", ")
				);
			}
			(None, Some(_)) => eprintln!("{}: added", c.path),
			(Some(_), None) => eprintln!("{}: removed", c.path),
			(None, None) => {}
		}
	}
	let sel = select(config, &mut blobs, &bs, &bg, &hs, &hg, &changes)?;
	let mut files: Vec<&Arc<str>> = if sel.run_all.is_some() {
		hs.entries
			.iter()
			.filter(|e| e.role.is_test())
			.map(|e| &e.path)
			.collect()
	} else if sel.run_all_integration.is_some() {
		hs.entries
			.iter()
			.filter(|e| e.role == Role::IntegrationTest)
			.map(|e| &e.path)
			.chain(
				sel.decl
					.iter()
					.filter(|p| hs.role(p) != Role::IntegrationTest),
			)
			.collect()
	} else {
		sel.decl.iter().collect()
	};
	files.sort();
	for f in &files {
		println!("{f}");
	}
	eprintln!(
		"{} changed files, {} changed declarations -> {} test files (file-level: {}, runtime file-level: {}){} in {} ms",
		changes.len(),
		sel.changed_decls,
		files.len(),
		sel.file_all.len(),
		sel.file_runtime.len(),
		match (&sel.run_all, &sel.run_all_integration) {
			(Some(r), _) => format!("; run everything: {r}"),
			(None, Some(r)) => format!("; run every integration test: {r}"),
			(None, None) => String::new(),
		},
		t.elapsed().as_millis()
	);
	Ok(())
}

/// Plans which unit and integration test files a change needs and prints the plan as JSON.
/// Selection is off only when a change reaches outside the module graph (`Selection::run_all`,
/// and for the integration tests also `Selection::run_all_integration`), so callers then run every
/// test of the kind; otherwise the plan selects the files the change can affect, however many.
/// With `out_dir`, also writes the plan to `<out_dir>/plan.json` and, when selection is on and
/// selects any file, the selected files to `<out_dir>/unit.txt` and `<out_dir>/integration.txt`,
/// one per line. Each test runner runs the listed files it would run by default. On GitHub Actions
/// it writes the output `select` (whether to run only the listed unit test files; the integration
/// tests can only be selected when it is true) and a job summary.
fn plan(
	config: &Config,
	repo: PathBuf,
	base: &str,
	head: &str,
	out_dir: Option<&str>,
) -> Result<()> {
	let mut engine = Engine::new(repo.clone(), config);
	let mut blobs = blob_texts(&repo)?;
	let bs = engine.snapshot(base)?;
	let hs = engine.snapshot(head)?;
	let (bg, hg) = (Graph::build(&bs, config), Graph::build(&hs, config));
	let changes = git::diff_tree(&repo, base, head)?;
	let sel = select(config, &mut blobs, &bs, &bg, &hs, &hg, &changes)?;

	let all = |role: Role| -> Vec<&str> {
		hs.entries
			.iter()
			.filter(|e| e.role == role)
			.map(|e| &*e.path)
			.collect()
	};
	let selected = |role: Role| -> Vec<&str> {
		let mut files: Vec<&str> = sel
			.decl
			.iter()
			.map(|p| &**p)
			.filter(|p| hs.role(p) == role)
			.collect();
		files.sort_unstable();
		files
	};
	let (all_unit, unit) = (all(Role::UnitTest), selected(Role::UnitTest));
	let (all_integration, integration) =
		(all(Role::IntegrationTest), selected(Role::IntegrationTest));
	let share = {
		let total = weight(&hs, all_unit.iter());
		if total > 0.0 {
			weight(&hs, unit.iter()) / total
		} else {
			0.0
		}
	};
	let reason = match &sel.run_all {
		Some(r) => format!("running every unit test: {r}"),
		None => format!(
			"running the {} unit test files the change can affect ({:.1}% of the unit test work)",
			unit.len(),
			share * 100.0
		),
	};
	let select_only = sel.run_all.is_none();
	let integration_reason = match sel.run_all.as_ref().or(sel.run_all_integration.as_ref()) {
		Some(r) => format!("running every integration test: {r}"),
		None => format!(
			"running the {} integration test files the change can affect",
			integration.len()
		),
	};
	let select_integration = select_only && sel.run_all_integration.is_none();

	let json = serde_json::json!({
		"select": select_only,
		"reason": reason,
		"share": (share * 10000.0).round() / 10000.0,
		"changedFiles": changes.len(),
		"changedDeclarations": sel.changed_decls,
		"unit": unit,
		"integration": {
			"select": select_integration,
			"reason": integration_reason,
			"files": integration,
		},
	})
	.to_string();
	println!("{json}");
	eprintln!("{reason}");
	eprintln!("{integration_reason}");

	if let Some(dir) = out_dir {
		let dir = Path::new(dir);
		std::fs::create_dir_all(dir)?;
		std::fs::write(dir.join("plan.json"), &json)?;
		write_list(&dir.join("unit.txt"), select_only, &unit)?;
		write_list(
			&dir.join("integration.txt"),
			select_integration,
			&integration,
		)?;
	}
	if let Some(path) = std::env::var_os("GITHUB_OUTPUT") {
		let mut out = std::fs::OpenOptions::new().append(true).open(path)?;
		writeln!(out, "select={select_only}")?;
	}
	if let Some(path) = std::env::var_os("GITHUB_STEP_SUMMARY") {
		let mut out = std::fs::OpenOptions::new().append(true).open(path)?;
		writeln!(
			out,
			"### Unit test plan\n\n{} changed files, {} changed declarations: {reason}.\n",
			changes.len(),
			sel.changed_decls
		)?;
		write_selected_files(&mut out, select_only, &unit, all_unit.len(), "unit")?;
		writeln!(out, "### Integration test plan\n\n{integration_reason}.\n")?;
		write_selected_files(
			&mut out,
			select_integration,
			&integration,
			all_integration.len(),
			"integration",
		)?;
	}
	Ok(())
}

/// Writes the selected test files to `path`, one per line, when selection is on and selects any
/// file, and otherwise removes the list that an earlier plan left there.
fn write_list(path: &Path, select: bool, files: &[&str]) -> Result<()> {
	if select && !files.is_empty() {
		std::fs::write(path, files.join("\n") + "\n")?;
	} else if path.exists() {
		std::fs::remove_file(path)?;
	}
	Ok(())
}

/// Lists the selected test files of a kind in a collapsed section of a job summary.
fn write_selected_files(
	out: &mut impl Write,
	select: bool,
	files: &[&str],
	total: usize,
	kind: &str,
) -> Result<()> {
	if select && !files.is_empty() {
		writeln!(
			out,
			"<details><summary>Selected {} of {total} {kind} test files</summary>\n",
			files.len()
		)?;
		for f in files {
			writeln!(out, "- `{f}`")?;
		}
		writeln!(out, "\n</details>\n")?;
	}
	Ok(())
}

/// A first-parent commit: (sha, first parent, subject).
type Commit = (String, String, String);

/// The first-parent commits selected by `git log` arguments, oldest first.
fn first_parent_commits(repo: &Path, range: &[&str]) -> Result<Vec<Commit>> {
	let mut args = vec!["log", "--first-parent", "--reverse", "--format=%H %P%x09%s"];
	args.extend_from_slice(range);
	Ok(git::git(repo, &args)?
		.lines()
		.filter_map(|l| {
			let (shas, subject) = l.split_once('\t')?;
			let mut s = shas.split(' ');
			Some((
				s.next()?.to_owned(),
				s.next()?.to_owned(),
				subject.to_owned(),
			))
		})
		.collect())
}

/// Lists the first-parent commits in `since..until` whose changes can affect a test: the
/// candidates when that test starts failing, without bisecting builds.
fn blame(config: &Config, repo: PathBuf, test: &str, since: &str, until: &str) -> Result<()> {
	let commits = first_parent_commits(&repo, &[&format!("{since}..{until}")])?;
	let Some(first) = commits.first() else {
		bail!("no commits in range")
	};
	let t = Instant::now();
	let mut engine = Engine::new(repo.clone(), config);
	let mut blobs = blob_texts(&repo)?;
	let mut base = engine.snapshot(&first.1)?;
	let mut bg = Graph::build(&base, config);
	let mut hits = 0;
	for (sha, parent, subject) in &commits {
		let changes = git::diff_tree(&repo, parent, sha)?;
		let head = engine.apply(&base, &changes)?;
		let hg = Graph::build(&head, config);
		let sel = select(config, &mut blobs, &base, &bg, &head, &hg, &changes)?;
		let run_all = sel
			.run_all
			.as_ref()
			.map(|r| ("run everything", r))
			.or_else(|| {
				sel.run_all_integration
					.as_ref()
					.filter(|_| head.role(test) == Role::IntegrationTest)
					.map(|r| ("run every integration test", r))
			});
		if run_all.is_some() || sel.decl.iter().any(|p| &**p == test) {
			hits += 1;
			println!(
				"{} {}{}",
				&sha[..12],
				subject,
				run_all
					.map(|(what, r)| format!("  [{what}: {r}]"))
					.unwrap_or_default()
			);
		}
		base = head;
		bg = hg;
	}
	eprintln!(
		"{hits} of {} commits can affect {test} ({} ms)",
		commits.len(),
		t.elapsed().as_millis()
	);
	Ok(())
}

/// Explains why a change selects a test: a path from the test's code to what the change changed,
/// through the declarations, whole modules, packages and globals in between.
fn why(config: &Config, repo: PathBuf, test: &str, base: &str, head: &str) -> Result<()> {
	let mut engine = Engine::new(repo.clone(), config);
	let mut blobs = blob_texts(&repo)?;
	let bs = engine.snapshot(base)?;
	let hs = engine.snapshot(head)?;
	let (bg, hg) = (Graph::build(&bs, config), Graph::build(&hs, config));
	let changes = git::diff_tree(&repo, base, head)?;
	let sel = select(config, &mut blobs, &bs, &bg, &hs, &hg, &changes)?;
	if let Some(reason) = &sel.run_all {
		println!("every unit test runs: {reason}");
		return Ok(());
	}
	if !sel.decl.iter().any(|p| &**p == test) {
		println!("the change does not select {test}");
		return Ok(());
	}
	// Only the base graph has the code that the change removed.
	for (snap, graph, seeds) in [(&hs, &hg, &sel.head_seeds), (&bs, &bg, &sel.base_seeds)] {
		let Some(f) = snap.find(test) else {
			continue;
		};
		let mut targets = vec![false; graph.node_count()];
		for &s in seeds {
			targets[s as usize] = true;
		}
		let roots: Vec<u32> = graph.file_nodes(f as usize).collect();
		let Some(path) = graph.path_from(&roots, &[], &targets) else {
			continue;
		};
		let seed = path[path.len() - 1].0;
		let data = |p: &str| !bs.role(p).is_module() && !hs.role(p).is_module();
		let read: Vec<&str> = changes
			.iter()
			.map(|c| c.path.as_str())
			.filter(|p| graph.readers(p, data(p)).0.contains(&seed))
			.collect();
		for (i, &(v, opener)) in path.iter().enumerate() {
			let mut line = format!(
				"{}{}",
				if i == 0 { "" } else { "  -> " },
				graph.label(snap, v)
			);
			if let Some(o) = opener {
				line += &format!("  (method opened by its name in {})", graph.label(snap, o));
			}
			if v == seed && read.is_empty() {
				line += "  (changed)";
			} else if v == seed {
				line += &format!("  (reads {} by path)", read.join(", "));
			}
			println!("{line}");
		}
		return Ok(());
	}
	bail!("found no path from {test} to the change")
}

/// Replays first-parent history and compares the share of unit test work that file-level and
/// declaration-level selection pick for each commit.
fn replay(
	config: &Config,
	repo: PathBuf,
	since: &str,
	until: &str,
	out: Option<&str>,
	hubs: bool,
) -> Result<()> {
	let commits = first_parent_commits(&repo, &[&format!("--since={since}"), until])?;
	let Some(first) = commits.first() else {
		bail!("no commits")
	};
	let mut out = match out {
		Some(p) => Some(std::fs::File::create(p)?),
		None => None,
	};

	let mut engine = Engine::new(repo.clone(), config);
	let mut blobs = blob_texts(&repo)?;
	let t = Instant::now();
	let mut base = engine.snapshot(&first.1)?;
	let mut bg = Graph::build(&base, config);
	eprintln!(
		"initial snapshot: {} files analyzed in {} ms",
		engine.analyzed,
		t.elapsed().as_millis()
	);

	let mut rows: Vec<[f64; 4]> = Vec::new();
	// Per changed declaration: (commits where it was the widest change, share of tests it selects, summed share).
	let mut hub_stats: HashMap<String, (usize, f64, f64)> = HashMap::new();
	let mut zero = [0usize; 4];
	let mut run_all_commits = 0;
	let mut module_commits = 0;
	let mut step_ms = 0u128;
	for (sha, parent, subject) in &commits {
		let t = Instant::now();
		let changes = git::diff_tree(&repo, parent, sha)?;
		let head = engine.apply(&base, &changes)?;
		let hg = Graph::build(&head, config);
		let sel = select(config, &mut blobs, &base, &bg, &head, &hg, &changes)?;
		step_ms += t.elapsed().as_millis();
		let touches_modules = changes.iter().any(|c| config.role(&c.path).is_module());
		module_commits += touches_modules as usize;
		let all_tests: HashSet<Arc<str>> = head
			.entries
			.iter()
			.filter(|e| e.role == Role::UnitTest)
			.map(|e| e.path.clone())
			.collect();
		let total = weight(&head, all_tests.iter());
		let frac = |files: &HashSet<Arc<str>>| -> f64 {
			if sel.run_all.is_some() {
				1.0
			} else {
				weight(&head, files.iter()) / total
			}
		};
		let row = [
			1.0,
			frac(&sel.file_all),
			frac(&sel.file_runtime),
			frac(&sel.decl),
		];
		run_all_commits += sel.run_all.is_some() as usize;
		for (i, f) in row.iter().enumerate() {
			zero[i] += (*f == 0.0) as usize;
		}
		rows.push(row);
		if hubs && sel.run_all.is_none() && row[3] > 0.05 {
			let paths: Vec<&str> = changes.iter().map(|c| c.path.as_str()).collect();
			let (seeds, _) = changed_nodes(&base, &bg, &head, &hg, &paths);
			let unit_tests = all_tests.len() as f64;
			let mut widest: Option<(String, f64)> = None;
			for seed in seeds {
				let f = hg.node_file[seed as usize];
				if f == u32::MAX {
					continue;
				}
				let reached = hg
					.dependent_files([seed])
					.0
					.iter()
					.enumerate()
					.filter(|(i, r)| **r && head.entries[*i].role == Role::UnitTest)
					.count() as f64 / unit_tests;
				let entry = &head.entries[f as usize];
				let local = (seed - hg.base[f as usize]) as usize;
				let key = entry
					.facts
					.as_ref()
					.map_or("<asset>".to_owned(), |facts| facts.decls[local].key.clone());
				if widest.as_ref().is_none_or(|(_, r)| reached > *r) {
					widest = Some((format!("{}#{key}", entry.path), reached));
				}
			}
			if let Some((name, reached)) = widest {
				let s = hub_stats.entry(name).or_insert((0, 0.0, 0.0));
				s.0 += 1;
				s.1 = s.1.max(reached);
				s.2 += row[3];
			}
		}
		if let Some(out) = &mut out {
			let pr = subject
				.rsplit_once("(#")
				.and_then(|(_, r)| r.split_once(')'))
				.map(|(n, _)| n)
				.unwrap_or("");
			let decl_tests = sel
				.decl
				.iter()
				.filter(|p| head.role(p) == Role::UnitTest)
				.count();
			let decl_integration_tests = sel
				.decl
				.iter()
				.filter(|p| head.role(p) == Role::IntegrationTest)
				.count();
			writeln!(
				out,
				"{}",
				serde_json::json!({
					"sha": sha,
					"pr": pr,
					"changed": changes.len(),
					"modules": touches_modules,
					"packages": sel.packages,
					"runAll": sel.run_all,
					"runAllIntegration": sel.run_all_integration,
					"changedDecls": sel.changed_decls,
					"fileAll": row[1],
					"fileRuntime": row[2],
					"decl": row[3],
					"declTestFiles": decl_tests,
					"declIntegrationTestFiles": decl_integration_tests,
				})
			)?;
		}
		base = head;
		bg = hg;
	}

	let n = rows.len();
	println!(
		"replayed {n} first-parent commits since {since} ({module_commits} change modules, {run_all_commits} run everything)"
	);
	println!(
		"average time per commit (diff, analyze changed blobs, relink, select): {} ms",
		step_ms / n.max(1) as u128
	);
	println!(
		"\nshare of unit test work selected per commit (weighted by test count, run everything = 100%):"
	);
	println!(
		"{:<38} {:>8} {:>8} {:>8} {:>8} {:>10}",
		"level", "mean", "p50", "p75", "p90", "selects 0"
	);
	let names = [
		"everything",
		"file-level imports (incl. types)",
		"file-level runtime loads",
		"ripple: declaration-level",
	];
	for (i, name) in names.iter().enumerate() {
		let mut v: Vec<f64> = rows.iter().map(|r| r[i]).collect();
		v.sort_by(|a, b| a.partial_cmp(b).unwrap());
		let q = |p: f64| v[((v.len() as f64 - 1.0) * p).round() as usize] * 100.0;
		let mean = v.iter().sum::<f64>() / n as f64 * 100.0;
		println!(
			"{name:<38} {mean:>7.1}% {:>7.1}% {:>7.1}% {:>7.1}% {:>9.1}%",
			q(0.5),
			q(0.75),
			q(0.9),
			zero[i] as f64 / n as f64 * 100.0
		);
	}
	if hubs {
		let mut list: Vec<(String, (usize, f64, f64))> = hub_stats.into_iter().collect();
		list.sort_by(|a, b| b.1.2.partial_cmp(&a.1.2).unwrap());
		println!(
			"\nwidest changed declaration in commits selecting >5% (points of the mean it explains):"
		);
		for (name, (commits, reach, total)) in list.iter().take(30) {
			println!(
				"{:>6.2} pts  {commits:>3} commits  reaches {:>5.1}%  {name}",
				total / n as f64 * 100.0,
				reach * 100.0
			);
		}
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	fn parse(args: &[&str]) -> Result<Args> {
		Args::parse(args.iter().map(|a| a.to_string()))
	}

	#[test]
	fn options_must_be_known_and_have_values() {
		let args = parse(&["plan", "--config", "c.jsonc", "--base", "main"]).unwrap();
		assert_eq!(
			(
				args.command.as_str(),
				args.get("config"),
				args.get("base"),
				args.get("head")
			),
			("plan", Some("c.jsonc"), Some("main"), None)
		);
		let errors: Vec<String> = [
			&["plan", "--config"][..],
			&["plan", "--base", "--head", "HEAD"],
			&["plan", "--lists", "dir"],
			&["plan", "origin/main"],
		]
		.iter()
		.map(|args| {
			let error = parse(args).err().map(|e| e.to_string()).unwrap_or_default();
			error.lines().next().unwrap_or_default().to_owned()
		})
		.collect();
		assert_eq!(
			errors,
			vec![
				"--config needs a value",
				"--base needs a value",
				"unknown option '--lists'",
				"unexpected argument 'origin/main'"
			]
		);
	}

	#[test]
	fn no_selected_work_is_zero() {
		let share = weight(&Snapshot::default(), std::iter::empty::<&str>());
		assert_eq!(format!("{:.1}%", share * 100.0), "0.0%");
	}
}
