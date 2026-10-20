/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! ripple: a content-addressed change impact engine for the VS Code repository (prototype).

mod analyze;
mod deps;
mod engine;
mod git;
mod graph;
mod keys;

use std::collections::HashSet;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result, bail};

use crate::engine::{Engine, Selection, changed_nodes, select};
use crate::graph::{Graph, Snapshot, is_unit_test};

struct Args {
	command: String,
	options: Vec<(String, String)>,
}

impl Args {
	fn parse() -> Self {
		let mut it = std::env::args().skip(1);
		let command = it.next().unwrap_or_default();
		let mut options = Vec::new();
		while let Some(a) = it.next() {
			if let Some(name) = a.strip_prefix("--") {
				options.push((name.to_owned(), it.next().unwrap_or_default()));
			}
		}
		Self { command, options }
	}

	fn get(&self, name: &str) -> Option<&str> {
		self.options
			.iter()
			.find(|(n, _)| n == name)
			.map(|(_, v)| v.as_str())
	}
}

/// Electron renders every unit test; the node and browser runners skip platform-specific ones.
fn runners(path: &str) -> [bool; 3] {
	let has = |s: &str| path.contains(s);
	let electron_only =
		has("/electron-browser/") || has("/electron-main/") || has("/electron-utility/");
	[
		true,
		!electron_only && !has("/browser/"),
		!electron_only && !has("/node/"),
	]
}

/// Test weights per runner (electron, node, browser), using the number of tests in each file.
fn weights<S: AsRef<str>>(snap: &Snapshot, files: impl Iterator<Item = S>) -> [f64; 3] {
	let mut w = [0.0; 3];
	for p in files {
		let p = p.as_ref();
		if !is_unit_test(p) {
			continue;
		}
		let tests = snap
			.find(p)
			.and_then(|i| snap.entries[i as usize].facts.as_ref())
			.map_or(1, |f| f.tests.max(1)) as f64;
		for (r, on) in runners(p).iter().enumerate() {
			if *on {
				w[r] += tests;
			}
		}
	}
	w
}

fn main() -> Result<()> {
	let args = Args::parse();
	let repo = git::repo_root(&PathBuf::from(args.get("repo").unwrap_or(".")))?;
	match args.command.as_str() {
		"stats" => stats(repo, args.get("rev").unwrap_or("HEAD")),
		"affected" => affected(
			repo,
			args.get("base").context("--base is required")?,
			args.get("head").unwrap_or("HEAD"),
		),
		"analyze" => {
			let path = args.get("file").context("--file is required")?;
			let facts = analyze::analyze(path, &std::fs::read_to_string(repo.join(path))?);
			println!(
				"global_effects={} decls={} loads={}",
				facts.global_effects,
				facts.decls.len(),
				facts.loads.len()
			);
			Ok(())
		}
		"plan" => plan(
			repo,
			args.get("base").context("--base is required")?,
			args.get("head").unwrap_or("HEAD"),
			args.get("max-share")
				.map_or(Ok(0.5), |s| s.parse())
				.context("--max-share must be a number")?,
			args.get("lists"),
		),
		"pushes" => pushes(
			repo,
			args.get("file").context("--file is required")?,
			args.get("out").context("--out is required")?,
			args.get("limit").map(|l| l.parse().unwrap_or(usize::MAX)),
		),
		"blame" => blame(
			repo,
			args.get("test").context("--test is required")?,
			args.get("since").context("--since is required")?,
			args.get("until").unwrap_or("origin/main"),
		),
		"replay" => replay(
			repo,
			args.get("since").unwrap_or("2026-10-06"),
			args.get("until").unwrap_or("origin/main"),
			args.get("out"),
			args.get("hubs").is_some(),
		),
		_ => bail!(
			"usage: ripple <stats|affected|replay> [--repo PATH] [--rev REV] [--base REV --head REV] [--since DATE --until REV --out FILE]"
		),
	}
}

fn stats(repo: PathBuf, rev: &str) -> Result<()> {
	let mut engine = Engine::new(repo);
	let t = Instant::now();
	let snap = engine.snapshot(rev)?;
	let analyze_ms = t.elapsed().as_millis();
	let t = Instant::now();
	let graph = Graph::build(&snap);
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
	let tests = snap
		.entries
		.iter()
		.filter(|e| is_unit_test(&e.path))
		.count();
	println!(
		"files: {} ({} code, {} parse errors), unit test files: {}",
		snap.entries.len(),
		code,
		errors,
		tests
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

fn affected(repo: PathBuf, base: &str, head: &str) -> Result<()> {
	let mut engine = Engine::new(repo.clone());
	let t = Instant::now();
	let bs = engine.snapshot(base)?;
	let hs = engine.snapshot(head)?;
	let (bg, hg) = (Graph::build(&bs), Graph::build(&hs));
	let changes = git::diff_tree(&repo, base, head)?;
	if std::env::var_os("RIPPLE_DEBUG").is_some() {
		for c in &changes {
			let (bf, hf) = (
				bs.find(&c.path)
					.and_then(|i| bs.entries[i as usize].facts.clone()),
				hs.find(&c.path)
					.and_then(|i| hs.entries[i as usize].facts.clone()),
			);
			let (Some(bf), Some(hf)) = (bf, hf) else {
				eprintln!("{}: added, removed or not code", c.path);
				continue;
			};
			let before: std::collections::HashMap<&str, u64> =
				bf.decls.iter().map(|d| (d.key.as_str(), d.hash)).collect();
			let changed: Vec<String> = hf
				.decls
				.iter()
				.filter(|d| before.get(d.key.as_str()) != Some(&d.hash))
				.map(|d| format!("{}{}", d.key, if d.pinned { "*" } else { "" }))
				.collect();
			eprintln!(
				"{}: {} of {} declarations changed: {}",
				c.path,
				changed.len(),
				hf.decls.len(),
				changed.join(", ")
			);
		}
	}
	let sel = select(&repo, &bs, &bg, &hs, &hg, &changes)?;
	let mut files: Vec<&Arc<str>> = if sel.run_all.is_some() {
		hs.entries
			.iter()
			.map(|e| &e.path)
			.filter(|p| is_unit_test(p) || crate::graph::is_integration_test(p))
			.collect()
	} else {
		sel.decl.iter().collect()
	};
	files.sort();
	for f in &files {
		println!("{f}");
	}
	eprintln!(
		"{} changed files, {} changed declarations -> {} test files (file-level: {}, runtime file-level: {}), os-sensitive: {}, webkit: {}{} in {} ms",
		changes.len(),
		sel.changed_decls,
		files.len(),
		sel.file_all.len(),
		sel.file_runtime.len(),
		sel.os_sensitive,
		sel.webkit,
		sel.run_all
			.as_ref()
			.map(|r| format!("; run everything: {r}"))
			.unwrap_or_default(),
		t.elapsed().as_millis()
	);
	Ok(())
}

/// Replays real pull request push sequences. For every push, selects the unit tests the change
/// can affect relative to the pull request's fork point, and counts which of them must run when
/// results are cached by test key across the pull request's earlier pushes.
fn pushes(repo: PathBuf, file: &str, out: &str, limit: Option<usize>) -> Result<()> {
	use std::collections::{HashMap, HashSet};
	let text = std::fs::read_to_string(file)?;
	// run id, head sha, pull request key, created at, ...
	let mut by_pr: HashMap<String, Vec<(String, String)>> = HashMap::new();
	for line in text.lines() {
		let f: Vec<&str> = line.split('\t').collect();
		if f.len() >= 4 {
			by_pr
				.entry(f[2].to_owned())
				.or_default()
				.push((f[3].to_owned(), f[1].to_owned()));
		}
	}
	let mut prs: Vec<(String, Vec<String>)> = by_pr
		.into_iter()
		.map(|(pr, mut v)| {
			v.sort();
			let mut seen = HashSet::new();
			(
				pr,
				v.into_iter()
					.filter(|(_, sha)| seen.insert(sha.clone()))
					.map(|(_, sha)| sha)
					.collect(),
			)
		})
		.collect();
	prs.sort();
	let mut out = std::fs::File::create(out)?;
	let mut engine = Engine::new(repo.clone());
	let mut reader = git::BlobReader::new(&repo)?;
	let mut package_hashes = keys::PackageHashes::default();
	let mut scratch = crate::graph::Scratch::default();
	let started = Instant::now();
	let mut done = 0;
	for (pr, shas) in prs.iter().take(limit.unwrap_or(usize::MAX)) {
		// Keys that passed in earlier pushes of this pull request, per test file.
		let mut verified: HashMap<Arc<str>, HashSet<u64>> = HashMap::new();
		for (k, sha) in shas.iter().enumerate() {
			let Ok(fork) = git::git(&repo, &["merge-base", sha, "origin/main"]) else {
				continue;
			};
			let fork = fork.trim().to_owned();
			let bs = engine.snapshot(&fork)?;
			let hs = engine.snapshot(sha)?;
			let (bg, hg) = (Graph::build(&bs), Graph::build(&hs));
			let changes = git::diff_tree(&repo, &fork, sha)?;
			let sel = select(&repo, &bs, &bg, &hs, &hg, &changes)?;
			let all: Vec<Arc<str>> = hs
				.entries
				.iter()
				.filter(|e| is_unit_test(&e.path))
				.map(|e| e.path.clone())
				.collect();
			let selected: Vec<Arc<str>> = if sel.run_all.is_some() {
				all.clone()
			} else {
				sel.decl
					.iter()
					.filter(|p| is_unit_test(p))
					.cloned()
					.collect()
			};
			let keys = keys::Keys::new(&hs, &hg, &mut reader, &mut package_hashes)?;
			let mut run = Vec::new();
			for t in &selected {
				let Some(f) = hs.find(t) else { continue };
				let key = keys.test_key(&hg, f, &mut scratch);
				if verified.entry(t.clone()).or_default().insert(key) {
					run.push(t.clone());
				}
			}
			let w = |files: &[Arc<str>]| -> f64 { weights(&hs, files.iter()).iter().sum() };
			let total = w(&all);
			writeln!(
				out,
				"{{\"pr\":\"{}\",\"k\":{k},\"sha\":\"{sha}\",\"runAll\":{},\"os\":{},\"webkit\":{},\"product\":{},\"selected\":{},\"run\":{},\"selectedShare\":{:.5},\"runShare\":{:.5}}}",
				pr.replace('"', "'"),
				sel.run_all.is_some(),
				sel.os_sensitive,
				sel.webkit,
				sel.product_changed,
				selected.len(),
				run.len(),
				w(&selected) / total,
				w(&run) / total
			)?;
			done += 1;
			if done % 100 == 0 {
				eprintln!("{done} pushes in {:.0} s", started.elapsed().as_secs_f64());
			}
		}
	}
	eprintln!("{done} pushes in {:.0} s", started.elapsed().as_secs_f64());
	Ok(())
}

/// Lists the first-parent commits in `since..until` whose changes can affect a test: the
/// candidates when that test starts failing on main, without bisecting builds.
fn blame(repo: PathBuf, test: &str, since: &str, until: &str) -> Result<()> {
	let log = git::git(
		&repo,
		&[
			"log",
			"--first-parent",
			"--reverse",
			"--format=%H %P%x09%s",
			&format!("{since}..{until}"),
		],
	)?;
	let commits: Vec<(String, String, String)> = log
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
		.collect();
	let Some(first) = commits.first() else {
		bail!("no commits in range")
	};
	let t = Instant::now();
	let mut engine = Engine::new(repo.clone());
	let mut base = engine.snapshot(&first.1)?;
	let mut bg = Graph::build(&base);
	let mut hits = 0;
	for (sha, parent, subject) in &commits {
		let changes = git::diff_tree(&repo, parent, sha)?;
		let head = engine.apply(&base, &changes)?;
		let hg = Graph::build(&head);
		let sel = select(&repo, &base, &bg, &head, &hg, &changes)?;
		if sel.run_all.is_some() || sel.decl.iter().any(|p| &**p == test) {
			hits += 1;
			println!(
				"{} {}{}",
				&sha[..12],
				subject,
				sel.run_all
					.as_ref()
					.map(|r| format!("  [run everything: {r}]"))
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

/// Node runner exclusions (see test/unit/node/index.js).
fn node_runner_excludes(path: &str) -> bool {
	path.contains("/vs/workbench/contrib/testing/test/")
		|| path.ends_with("vs/platform/environment/test/node/nativeModules.test.ts")
		|| path.ends_with("vs/base/parts/storage/test/node/storage.test.ts")
		|| path.ends_with("vs/sessions/test/web.test.ts")
}

/// Plans which unit test files a change needs, per test runner, and prints the plan as JSON.
/// Selection is off when a change reaches outside the module graph or selects more than
/// `max_share` of the unit test work, so callers then run every test. With `lists`, also writes
/// the plan to `<lists>/plan.json` and, when selection is on, each runner's non-empty file list
/// to `<lists>/<runner>.txt`, one file per line. On GitHub Actions it writes the output `select`
/// (whether to run only the listed files) and a job summary.
fn plan(
	repo: PathBuf,
	base: &str,
	head: &str,
	max_share: f64,
	lists_dir: Option<&str>,
) -> Result<()> {
	let mut engine = Engine::new(repo.clone());
	let bs = engine.snapshot(base)?;
	let hs = engine.snapshot(head)?;
	let (bg, hg) = (Graph::build(&bs), Graph::build(&hs));
	let changes = git::diff_tree(&repo, base, head)?;
	let sel = select(&repo, &bs, &bg, &hs, &hg, &changes)?;

	let all: Vec<&str> = hs
		.entries
		.iter()
		.map(|e| &*e.path)
		.filter(|p| is_unit_test(p))
		.collect();
	let mut selected: Vec<&str> = sel
		.decl
		.iter()
		.map(|p| &**p)
		.filter(|p| is_unit_test(p))
		.collect();
	selected.sort();
	let for_runner = |files: &[&str], r: usize| -> Vec<String> {
		files
			.iter()
			.filter(|p| runners(p)[r] && (r != 1 || !node_runner_excludes(p)))
			.map(|p| p.to_string())
			.collect()
	};
	let lists: Vec<Vec<String>> = (0..3).map(|r| for_runner(&selected, r)).collect();
	let totals: Vec<usize> = (0..3).map(|r| for_runner(&all, r).len()).collect();
	let share = {
		let total: f64 = weights(&hs, all.iter()).iter().sum();
		let picked: f64 = weights(&hs, selected.iter()).iter().sum();
		if total > 0.0 { picked / total } else { 0.0 }
	};
	let reason = match &sel.run_all {
		Some(r) => format!("running every unit test: {r}"),
		None if share > max_share => format!(
			"running every unit test: the change affects {:.0}% of the unit test work (limit {:.0}%)",
			share * 100.0,
			max_share * 100.0
		),
		None => format!(
			"running the {} unit test files the change can affect ({:.1}% of the unit test work)",
			selected.len(),
			share * 100.0
		),
	};
	let select_only = sel.run_all.is_none() && share <= max_share;

	let names = ["electron", "node", "browser"];
	let json = serde_json::json!({
		"select": select_only,
		"reason": reason,
		"share": (share * 10000.0).round() / 10000.0,
		"changedFiles": changes.len(),
		"changedDeclarations": sel.changed_decls,
		"unit": names.iter().zip(&lists).map(|(n, l)| (n.to_string(), serde_json::json!(l))).collect::<serde_json::Map<_, _>>(),
	})
	.to_string();
	println!("{json}");
	eprintln!("{reason}");

	if let Some(dir) = lists_dir {
		let dir = std::path::Path::new(dir);
		std::fs::create_dir_all(dir)?;
		std::fs::write(dir.join("plan.json"), &json)?;
		for (name, list) in names.iter().zip(&lists) {
			let file = dir.join(format!("{name}.txt"));
			if select_only && !list.is_empty() {
				std::fs::write(file, list.join("\n") + "\n")?;
			} else if file.exists() {
				std::fs::remove_file(file)?;
			}
		}
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
		writeln!(out, "| Runner | Selected test files |\n|---|---|")?;
		for ((name, list), total) in names.iter().zip(&lists).zip(&totals) {
			writeln!(out, "| {name} | {} of {total} |", list.len())?;
		}
		if select_only && !selected.is_empty() {
			writeln!(out, "\n<details><summary>Selected test files</summary>\n")?;
			for f in &selected {
				writeln!(out, "- `{f}`")?;
			}
			writeln!(out, "\n</details>")?;
		}
		writeln!(
			out,
			"\nLinux runs every unit test; macOS and Windows run the selected files. See `build/ripple/README.md`."
		)?;
	}
	Ok(())
}

fn replay(repo: PathBuf, since: &str, until: &str, out: Option<&str>, hubs: bool) -> Result<()> {
	let log = git::git(
		&repo,
		&[
			"log",
			"--first-parent",
			"--reverse",
			"--format=%H %P%x09%s",
			&format!("--since={since}"),
			until,
		],
	)?;
	let commits: Vec<(String, String, String)> = log
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
		.collect();
	let Some(first) = commits.first() else {
		bail!("no commits")
	};
	let mut out = match out {
		Some(p) => Some(std::fs::File::create(p)?),
		None => None,
	};

	let mut engine = Engine::new(repo.clone());
	let t = Instant::now();
	let mut base = engine.snapshot(&first.1)?;
	let mut bg = Graph::build(&base);
	eprintln!(
		"initial snapshot: {} files analyzed in {} ms",
		engine.analyzed,
		t.elapsed().as_millis()
	);

	let mut rows: Vec<[f64; 4]> = Vec::new();
	let mut entry_counts: Vec<usize> = vec![0; crate::engine::ENTRIES.len()];
	let mut product_commits = 0;
	// Per changed declaration: (commits where it was the widest change, share of tests it selects, summed share).
	let mut hub_stats: std::collections::HashMap<String, (usize, f64, f64)> =
		std::collections::HashMap::new();
	let mut zero = [0usize; 4];
	let mut global_commits = 0;
	let mut src_commits = 0;
	let mut step_ms = 0u128;
	for (sha, parent, subject) in &commits {
		let t = Instant::now();
		let changes = git::diff_tree(&repo, parent, sha)?;
		let head = engine.apply(&base, &changes)?;
		let hg = Graph::build(&head);
		let sel: Selection = select(&repo, &base, &bg, &head, &hg, &changes)?;
		step_ms += t.elapsed().as_millis();
		let global: Vec<&str> = sel.run_all.as_deref().into_iter().collect();
		let touches_src = changes.iter().any(|c| c.path.starts_with("src/"));
		src_commits += touches_src as usize;
		let all_tests: HashSet<Arc<str>> = head
			.entries
			.iter()
			.filter(|e| is_unit_test(&e.path))
			.map(|e| e.path.clone())
			.collect();
		let total = weights(&head, all_tests.iter());
		let frac = |files: &HashSet<Arc<str>>| -> f64 {
			if !global.is_empty() {
				return 1.0;
			}
			let w = weights(&head, files.iter());
			(w[0] + w[1] + w[2]) / (total[0] + total[1] + total[2])
		};
		let row = [
			1.0,
			frac(&sel.file_all),
			frac(&sel.file_runtime),
			frac(&sel.decl),
		];
		global_commits += !global.is_empty() as usize;
		for (i, f) in row.iter().enumerate() {
			zero[i] += (*f == 0.0) as usize;
		}
		rows.push(row);
		product_commits += sel.product_changed as usize;
		for (i, (_, affected)) in sel.entries.iter().enumerate() {
			entry_counts[i] += *affected as usize;
		}
		if hubs && global.is_empty() && row[3] > 0.05 {
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
					.filter(|(i, r)| **r && is_unit_test(&head.entries[*i].path))
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
			let decl_tests = sel.decl.iter().filter(|p| is_unit_test(p)).count();
			writeln!(
				out,
				"{{\"sha\":\"{sha}\",\"pr\":\"{pr}\",\"changed\":{},\"src\":{touches_src},\"ci\":{},\"os\":{},\"osReason\":\"{}\",\"webkit\":{},\"product\":{},\"entries\":{{{}}},\"packages\":{},\"global\":{},\"globalPaths\":\"{}\",\"changedDecls\":{},\"fileAll\":{:.5},\"fileRuntime\":{:.5},\"decl\":{:.5},\"declTestFiles\":{decl_tests}}}",
				changes.len(),
				sel.ci_definition,
				sel.os_sensitive,
				sel.os_reason.replace('"', "'"),
				sel.webkit,
				sel.product_changed,
				sel.entries
					.iter()
					.map(|(n, a)| format!("\"{n}\":{a}"))
					.collect::<Vec<_>>()
					.join(","),
				sel.packages,
				!global.is_empty(),
				global.join(" ").replace('"', "'"),
				sel.changed_decls,
				row[1],
				row[2],
				row[3]
			)?;
		}
		base = head;
		bg = hg;
	}

	let n = rows.len();
	println!(
		"replayed {n} first-parent commits since {since} ({src_commits} touch src/, {global_commits} hit a global trigger)"
	);
	println!(
		"average time per commit (diff, analyze changed blobs, relink, select): {} ms",
		step_ms / n.max(1) as u128
	);
	println!(
		"\nshare of unit test work selected per commit (weighted by test count, global triggers = 100%):"
	);
	println!(
		"{:<38} {:>8} {:>8} {:>8} {:>8} {:>10}",
		"level", "mean", "p50", "p75", "p90", "selects 0"
	);
	let names = [
		"today: everything",
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
	println!(
		"\ncommits changing product runtime code: {:.1}%; entry points reaching a change:",
		product_commits as f64 / n as f64 * 100.0
	);
	for (i, (name, path)) in crate::engine::ENTRIES.iter().enumerate() {
		println!(
			"  {name:<14} {:>5.1}%  ({path})",
			entry_counts[i] as f64 / n as f64 * 100.0
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
