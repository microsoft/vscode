/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! The impact graph. Every runtime declaration of every module is a node; node 0 of a module is
//! its initializer. Edges point from a node to what it depends on: the declarations it references
//! (resolved through re-export chains), and for initializers, the modules they load.

use std::collections::HashMap;
use std::ops::Range;
use std::sync::Arc;

use crate::analyze::{ExportTarget, FileFacts, IMPLICIT_METHODS, Imported, Ref, name_id};
use crate::config::{Config, Role};

#[derive(Clone)]
pub struct Entry {
	pub path: Arc<str>,
	pub oid: Arc<str>,
	pub role: Role,
	pub facts: Option<Arc<FileFacts>>,
}

/// The files of one commit, sorted by path.
#[derive(Clone, Default)]
pub struct Snapshot {
	pub entries: Vec<Entry>,
}

impl Snapshot {
	pub fn find(&self, path: &str) -> Option<u32> {
		self.entries
			.binary_search_by(|e| (*e.path).cmp(path))
			.ok()
			.map(|i| i as u32)
	}

	/// The role of a path in this snapshot, `Asset` if it does not exist.
	pub fn role(&self, path: &str) -> Role {
		self.find(path)
			.map_or(Role::Asset, |i| self.entries[i as usize].role)
	}

	/// Entries inside a directory.
	pub fn under(&self, dir: &str) -> Range<usize> {
		let prefix = format!("{}/", dir.trim_end_matches('/'));
		let start = self.entries.partition_point(|e| *e.path < *prefix);
		let end = start + self.entries[start..].partition_point(|e| e.path.starts_with(&prefix));
		start..end
	}
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Res {
	None,
	File(u32),
	/// A directory, such as a fixture folder read by a test: index into `Linker::dirs`.
	Dir(u32),
	Pkg(u32),
}

const BUILTINS: &[&str] = &[
	"assert",
	"async_hooks",
	"buffer",
	"child_process",
	"cluster",
	"constants",
	"crypto",
	"dgram",
	"diagnostics_channel",
	"dns",
	"events",
	"fs",
	"http",
	"http2",
	"https",
	"inspector",
	"module",
	"net",
	"os",
	"path",
	"perf_hooks",
	"process",
	"punycode",
	"querystring",
	"readline",
	"stream",
	"string_decoder",
	"timers",
	"tls",
	"trace_events",
	"tty",
	"url",
	"util",
	"v8",
	"vm",
	"wasi",
	"worker_threads",
	"zlib",
];

fn join(dir: &str, rel: &str) -> Option<String> {
	let mut parts: Vec<&str> = dir.split('/').filter(|s| !s.is_empty()).collect();
	for seg in rel.split('/') {
		match seg {
			"" | "." => {}
			".." => {
				parts.pop()?;
			}
			s => parts.push(s),
		}
	}
	Some(parts.join("/"))
}

struct Linker<'s> {
	snap: &'s Snapshot,
	config: &'s Config,
	base: &'s [u32],
	res: Vec<Option<Box<[Res]>>>,
	memo: HashMap<(u32, Box<str>), Vec<u32>>,
	packages: HashMap<String, u32>,
	globals: HashMap<String, u32>,
	dirs: Vec<Box<str>>,
	dir_index: HashMap<Box<str>, u32>,
	file_nodes_end: u32,
	next: u32,
}

impl<'s> Linker<'s> {
	fn node_count(&self, f: u32) -> u32 {
		self.snap.entries[f as usize]
			.facts
			.as_ref()
			.map_or(1, |facts| facts.decls.len() as u32)
	}

	fn all_nodes(&self, f: u32) -> Range<u32> {
		let b = self.base[f as usize];
		b..b + self.node_count(f)
	}

	fn global(&mut self, name: &str) -> u32 {
		if let Some(&id) = self.globals.get(name) {
			return id;
		}
		let id = self.next;
		self.next += 1;
		self.globals.insert(name.to_owned(), id);
		id
	}

	/// The node of `member` when `v` is a declaration with tracked members, otherwise `v`.
	fn member_node(&self, v: u32, member: &str) -> u32 {
		if v >= self.file_nodes_end {
			return v;
		}
		let f = self.base.partition_point(|&b| b <= v) - 1;
		let Some(facts) = self.snap.entries[f].facts.as_deref() else {
			return v;
		};
		let members = &facts.decls[(v - self.base[f]) as usize].members;
		members
			.binary_search_by(|(n, _)| (**n).cmp(member))
			.map_or(v, |i| self.base[f] + members[i].1)
	}

	fn package(&mut self, spec: &str) -> Res {
		if spec.starts_with("node:") {
			return Res::None;
		}
		let mut segments = spec.split('/');
		let name = match (spec.starts_with('@'), segments.next(), segments.next()) {
			(true, Some(scope), Some(pkg)) => format!("{scope}/{pkg}"),
			(false, Some(pkg), _) => pkg.to_owned(),
			_ => return Res::None,
		};
		if BUILTINS.contains(&name.as_str()) {
			return Res::None;
		}
		if let Some(&id) = self.packages.get(&name) {
			return Res::Pkg(id);
		}
		let id = self.next;
		self.next += 1;
		self.packages.insert(name, id);
		Res::Pkg(id)
	}

	fn resolve_path(&mut self, p: &str) -> Res {
		let candidates: Vec<String> = if let Some(stem) = p.strip_suffix(".js") {
			vec![format!("{stem}.ts"), format!("{stem}.tsx"), p.to_owned()]
		} else if let Some(stem) = p.strip_suffix(".mjs") {
			vec![format!("{stem}.mts"), p.to_owned()]
		} else {
			vec![
				p.to_owned(),
				format!("{p}.ts"),
				format!("{p}/index.ts"),
				format!("{p}.js"),
			]
		};
		for c in candidates {
			if let Some(i) = self.snap.find(&c) {
				return Res::File(i);
			}
		}
		let p = p.trim_end_matches('/');
		let range = self.snap.under(p);
		if !range.is_empty() {
			if let Some(&d) = self.dir_index.get(p) {
				return Res::Dir(d);
			}
			// Tests that read a folder read data (fixtures, media, scripts). Strings that name a
			// folder of source code are almost always path manipulation.
			let code = self.snap.entries[range.clone()]
				.iter()
				.filter(|e| e.role.is_module())
				.count();
			if code * 2 > range.len() && range.len() > 30 {
				return Res::None;
			}
			let d = self.dirs.len() as u32;
			self.dirs.push(p.into());
			self.dir_index.insert(p.into(), d);
			return Res::Dir(d);
		}
		Res::None
	}

	fn resolve_specifier(&mut self, from: &str, spec: &str) -> Res {
		if spec.starts_with("./") || spec.starts_with("../") {
			let dir = from.rsplit_once('/').map_or("", |(d, _)| d);
			match join(dir, spec) {
				Some(p) => self.resolve_path(&p),
				None => Res::None,
			}
		} else if let Some(p) = self.config.resolve_alias(spec) {
			self.resolve_path(&p)
		} else if spec.starts_with('/') || spec.starts_with('.') || spec.contains("://") {
			Res::None
		} else {
			self.package(spec)
		}
	}

	fn spec_res(&mut self, f: u32, spec: u32) -> Res {
		if self.res[f as usize].is_none() {
			let snap = self.snap;
			let entry = &snap.entries[f as usize];
			let facts = entry.facts.as_ref().expect("only code files have specs");
			let resolved: Vec<Res> = facts
				.specs
				.iter()
				.map(|s| self.resolve_specifier(&entry.path, &s.specifier))
				.collect();
			self.res[f as usize] = Some(resolved.into_boxed_slice());
		}
		self.res[f as usize].as_ref().unwrap()[spec as usize]
	}

	fn resolve_export(&mut self, f: u32, name: &str, depth: u32) -> Vec<u32> {
		let snap = self.snap;
		let Some(facts) = snap.entries[f as usize].facts.as_deref() else {
			return vec![self.base[f as usize]];
		};
		if depth > 24 {
			return vec![];
		}
		if let Some(v) = self.memo.get(&(f, name.into())) {
			return v.clone();
		}
		let mut out = Vec::new();
		for (_, target) in facts.exports_named(name) {
			match target {
				ExportTarget::Local(d) => out.push(self.base[f as usize] + d),
				ExportTarget::Binding(b) => {
					out.extend(self.resolve_binding(f, *b, None, depth + 1))
				}
				ExportTarget::ReExport { spec, name: inner } => match self.spec_res(f, *spec) {
					Res::File(t) => out.extend(self.resolve_export(t, inner, depth + 1)),
					Res::Pkg(p) => out.push(p),
					_ => {}
				},
				ExportTarget::Namespace(spec) => match self.spec_res(f, *spec) {
					Res::File(t) => out.extend(self.all_nodes(t)),
					Res::Pkg(p) => out.push(p),
					_ => {}
				},
			}
		}
		if out.is_empty() {
			for &star in &facts.stars {
				if let Res::File(t) = self.spec_res(f, star) {
					let r = self.resolve_export(t, name, depth + 1);
					if !r.is_empty() {
						out = r;
						out.extend(facts.star_decl.map(|s| self.base[f as usize] + s));
						break;
					}
				}
			}
		} else if let Some(e) = facts.export_decl(name) {
			// Consumers also depend on what each module along the chain binds the name to.
			out.push(self.base[f as usize] + e);
		}
		self.memo.insert((f, name.into()), out.clone());
		out
	}

	fn resolve_binding(&mut self, f: u32, b: u32, member: Option<&str>, depth: u32) -> Vec<u32> {
		let snap = self.snap;
		let facts = snap.entries[f as usize].facts.as_deref().unwrap();
		let binding = &facts.bindings[b as usize];
		let with_member = |linker: &Self, nodes: Vec<u32>| -> Vec<u32> {
			match member {
				Some(m) => nodes
					.into_iter()
					.map(|v| linker.member_node(v, m))
					.collect(),
				None => nodes,
			}
		};
		match self.spec_res(f, binding.spec) {
			Res::File(t) => match &binding.imported {
				Imported::Named(n) => {
					let r = self.resolve_export(t, n, depth);
					with_member(self, r)
				}
				Imported::Default => {
					let r = self.resolve_export(t, "default", depth);
					with_member(self, r)
				}
				Imported::Namespace => {
					let r = member
						.map(|m| self.resolve_export(t, m, depth))
						.unwrap_or_default();
					if r.is_empty() {
						self.all_nodes(t).collect()
					} else {
						r
					}
				}
			},
			Res::Pkg(p) => vec![p],
			_ => vec![],
		}
	}
}

/// Adjacency in compressed sparse row form.
struct Csr<T = u32> {
	start: Vec<u32>,
	items: Vec<T>,
}

impl<T: Copy + Default> Csr<T> {
	fn group(n: usize, pairs: &[(u32, T)]) -> Self {
		let mut start = vec![0u32; n + 1];
		for &(k, _) in pairs {
			start[k as usize + 1] += 1;
		}
		for i in 0..n {
			start[i + 1] += start[i];
		}
		let mut pos = start.clone();
		let mut items = vec![T::default(); pairs.len()];
		for &(k, v) in pairs {
			items[pos[k as usize] as usize] = v;
			pos[k as usize] += 1;
		}
		Self { start, items }
	}

	fn of(&self, k: u32) -> &[T] {
		&self.items[self.start[k as usize] as usize..self.start[k as usize + 1] as usize]
	}
}

impl Csr<u32> {
	fn reverse(n: usize, edges: &[(u32, u32)]) -> Self {
		let swapped: Vec<(u32, u32)> = edges.iter().map(|&(u, v)| (v, u)).collect();
		Self::group(n, &swapped)
	}

	fn reach(&self, seeds: impl IntoIterator<Item = u32>) -> Vec<bool> {
		let n = self.start.len() - 1;
		let mut seen = vec![false; n];
		let mut stack = Vec::new();
		for s in seeds {
			if !seen[s as usize] {
				seen[s as usize] = true;
				stack.push(s);
			}
		}
		while let Some(v) = stack.pop() {
			for &u in
				&self.items[self.start[v as usize] as usize..self.start[v as usize + 1] as usize]
			{
				if !seen[u as usize] {
					seen[u as usize] = true;
					stack.push(u);
				}
			}
		}
		seen
	}
}

/// Reusable buffers for `Graph::reaches`.
#[derive(Default)]
pub struct Scratch {
	stamp: u32,
	visited: Vec<u32>,
	used: std::collections::HashSet<u64>,
	pending: HashMap<u64, Vec<u32>>,
}

pub struct Graph {
	/// First node of each snapshot entry.
	pub base: Vec<u32>,
	/// Owning entry of each node, or `u32::MAX` for packages.
	pub node_file: Vec<u32>,
	pub packages: HashMap<String, u32>,
	/// Number of nodes owned by files; package nodes follow.
	file_nodes_end: u32,
	nodes: Csr,
	forward: Csr,
	/// Name gate of each node (instance methods), 0 for none.
	gate: Vec<u64>,
	/// Property names used by each node.
	uses: Csr<u64>,
	/// File-level reverse imports, including type-only imports (what a file-level tool would use).
	files_all: Csr,
	/// File-level reverse runtime loads.
	files_runtime: Csr,
	/// Nodes and files that read a directory by path, keyed by directory.
	dirs: HashMap<Box<str>, (Vec<u32>, Vec<u32>)>,
	/// Globals injected by the test runners, and the nodes standing for them.
	pub globals: HashMap<String, u32>,
	/// Modules loaded by each entry's initializer.
	pub loads: Vec<Box<[u32]>>,
	/// Loading the entry has effects outside of it, directly or through modules it loads.
	pub effectful: Vec<bool>,
	/// Name ids of the methods code calls without naming them (see `IMPLICIT_METHODS`).
	implicit: Vec<u64>,
	pub edges: usize,
	pub unresolved: u32,
}

impl Graph {
	pub fn build(snap: &Snapshot, config: &Config) -> Self {
		let n = snap.entries.len();
		let mut base = Vec::with_capacity(n);
		let mut next = 0u32;
		for e in &snap.entries {
			base.push(next);
			next += e.facts.as_ref().map_or(1, |f| f.decls.len() as u32);
		}
		let mut linker = Linker {
			snap,
			config,
			base: &base,
			res: vec![None; n],
			memo: HashMap::new(),
			packages: HashMap::new(),
			globals: HashMap::new(),
			dirs: Vec::new(),
			dir_index: HashMap::new(),
			file_nodes_end: next,
			next,
		};
		let mut loads: Vec<Box<[u32]>> = vec![Box::new([]); n];
		let mut load_edges: Vec<(u32, u32)> = Vec::new();
		let mut dir_refs: Vec<(u32, u32, u32)> = Vec::new();
		let mut edges: Vec<(u32, u32)> = Vec::new();
		let mut files_all: Vec<(u32, u32)> = Vec::new();
		let mut files_runtime: Vec<(u32, u32)> = Vec::new();
		let mut unresolved = 0;
		for f in 0..n as u32 {
			let Some(facts) = snap.entries[f as usize].facts.as_deref() else {
				continue;
			};
			let b = base[f as usize];
			for (si, spec) in facts.specs.iter().enumerate() {
				if let Res::File(t) = linker.spec_res(f, si as u32) {
					if t != f {
						files_all.push((f, t));
						if !spec.type_only {
							files_runtime.push((f, t));
						}
					}
				}
			}
			for (d, decl) in facts.decls.iter().enumerate() {
				let u = b + d as u32;
				if decl.pinned && d != 0 {
					edges.push((b, u));
				}
				for child in &decl.children {
					edges.push((u, b + child));
				}
				for r in &decl.refs {
					match r {
						Ref::Local(t) => edges.push((u, b + t)),
						Ref::Import { binding, member } => {
							let targets = linker.resolve_binding(f, *binding, member.as_deref(), 0);
							if targets.is_empty() {
								// A module that does not export the name (for example a type used as a value
								// or a non-module file): depend on the whole module. Built-ins are leaves.
								if let Res::File(t) =
									linker.spec_res(f, facts.bindings[*binding as usize].spec)
								{
									unresolved += 1;
									if std::env::var_os("RIPPLE_DEBUG").is_some() {
										let binding = &facts.bindings[*binding as usize];
										eprintln!(
											"unresolved: {} imports {:?} from {}",
											snap.entries[f as usize].path,
											binding.imported,
											facts.specs[binding.spec as usize].specifier
										);
									}
									edges.extend(linker.all_nodes(t).map(|v| (u, v)));
								}
							}
							edges.extend(targets.into_iter().map(|v| (u, v)));
						}
						Ref::All(spec) => match linker.spec_res(f, *spec) {
							Res::File(t) => edges.extend(linker.all_nodes(t).map(|v| (u, v))),
							Res::Dir(d) => dir_refs.push((d, u, f)),
							Res::Pkg(p) => edges.push((u, p)),
							_ => {}
						},
						Ref::Global(name) => {
							let g = linker.global(name);
							edges.push((u, g));
						}
					}
				}
			}
			let mut targets = Vec::new();
			for &spec in &facts.loads {
				match linker.spec_res(f, spec) {
					Res::File(t) => {
						edges.push((b, base[t as usize]));
						targets.push(t);
						load_edges.push((f, t));
					}
					Res::Pkg(p) => edges.push((b, p)),
					_ => {}
				}
			}
			loads[f as usize] = targets.into_boxed_slice();
		}
		// Style sheets change the document of every test that loads them.
		let roots = (0..n as u32).filter(|&f| {
			let e = &snap.entries[f as usize];
			e.facts
				.as_ref()
				.map_or(e.path.ends_with(".css"), |facts| facts.global_effects)
		});
		let effectful = Csr::reverse(n, &load_edges).reach(roots);
		let total = linker.next as usize;
		let mut gate = vec![0u64; total];
		let mut uses: Vec<(u32, u64)> = Vec::new();
		for (f, e) in snap.entries.iter().enumerate() {
			if let Some(facts) = &e.facts {
				for (d, decl) in facts.decls.iter().enumerate() {
					let u = base[f] + d as u32;
					gate[u as usize] = decl.gate;
					uses.extend(decl.uses.iter().map(|&n| (u, n)));
				}
			}
		}
		let mut node_file = vec![u32::MAX; total];
		for f in 0..n {
			let end = if f + 1 < n { base[f + 1] } else { next };
			for v in base[f]..end {
				node_file[v as usize] = f as u32;
			}
		}
		let packages = std::mem::take(&mut linker.packages);
		let globals = std::mem::take(&mut linker.globals);
		let mut dirs: HashMap<Box<str>, (Vec<u32>, Vec<u32>)> = HashMap::new();
		for (d, u, f) in dir_refs {
			let entry = dirs.entry(linker.dirs[d as usize].clone()).or_default();
			entry.0.push(u);
			entry.1.push(f);
		}
		if std::env::var_os("RIPPLE_DEBUG").is_some() {
			let mut list: Vec<(&Box<str>, &(Vec<u32>, Vec<u32>))> = dirs.iter().collect();
			list.sort_by_key(|(d, _)| (d.matches('/').count(), d.len()));
			for (d, (_, files)) in list.iter().take(40) {
				let names: Vec<&str> = files
					.iter()
					.take(3)
					.map(|&f| &*snap.entries[f as usize].path)
					.collect();
				eprintln!(
					"dir ref: {d} <- {} refs, e.g. {}",
					files.len(),
					names.join(", ")
				);
			}
		}
		let swapped: Vec<(u32, u32)> = edges.iter().copied().collect();
		Self {
			dirs,
			globals,
			loads,
			effectful,
			implicit: IMPLICIT_METHODS
				.iter()
				.map(|m| name_id(m))
				.chain(config.implicit_methods.iter().map(|m| name_id(m)))
				.collect(),
			forward: Csr::group(total, &swapped),
			gate,
			uses: Csr::group(total, &uses),
			nodes: Csr::reverse(total, &edges),
			files_all: Csr::reverse(n, &files_all),
			files_runtime: Csr::reverse(n, &files_runtime),
			edges: edges.len(),
			file_nodes_end: next,
			base,
			node_file,
			packages,
			unresolved,
		}
	}

	pub fn node_count(&self) -> usize {
		self.node_file.len()
	}

	/// The nodes of a snapshot entry.
	pub fn file_nodes(&self, f: usize) -> Range<u32> {
		let end = self.base.get(f + 1).copied().unwrap_or(self.file_nodes_end);
		self.base[f]..end
	}

	/// Entries with at least one node that (transitively) depends on a seed node, ignoring name
	/// gates, and whether any path went through a gated node.
	pub fn dependent_files(&self, seeds: impl IntoIterator<Item = u32>) -> (Vec<bool>, bool) {
		let seen = self.nodes.reach(seeds);
		let mut files = vec![false; self.base.len()];
		let mut gated = false;
		for (v, s) in seen.iter().enumerate() {
			if *s {
				gated |= self.gate[v] != 0;
				let f = self.node_file[v];
				if f != u32::MAX {
					files[f as usize] = true;
				}
			}
		}
		(files, gated)
	}

	/// Entries a module loads when it is evaluated, transitively, excluding the module itself
	/// unless it is part of a cycle.
	pub fn load_closure(&self, f: u32) -> Vec<bool> {
		let mut seen = vec![false; self.base.len()];
		let mut stack: Vec<u32> = self.loads[f as usize].to_vec();
		while let Some(t) = stack.pop() {
			if !seen[t as usize] {
				seen[t as usize] = true;
				stack.extend_from_slice(&self.loads[t as usize]);
			}
		}
		seen
	}

	/// Whether the code of an entry can reach a target node, opening an instance method only once
	/// the closure uses its name. Reaching a class does not reach its methods by itself.
	pub fn reaches(&self, file: u32, targets: &[bool], scratch: &mut Scratch) -> bool {
		scratch.stamp += 1;
		if scratch.visited.len() < self.node_file.len() {
			scratch.visited.resize(self.node_file.len(), 0);
		}
		let stamp = scratch.stamp;
		scratch.used.clear();
		scratch.used.extend(self.implicit.iter().copied());
		scratch.pending.clear();
		let mut stack: Vec<u32> = self.file_nodes(file as usize).collect();
		for &n in &stack {
			scratch.visited[n as usize] = stamp;
		}
		while let Some(n) = stack.pop() {
			if targets[n as usize] {
				return true;
			}
			for &name in self.uses.of(n) {
				if scratch.used.insert(name) {
					if let Some(waiting) = scratch.pending.remove(&name) {
						for v in waiting {
							if scratch.visited[v as usize] != stamp {
								scratch.visited[v as usize] = stamp;
								stack.push(v);
							}
						}
					}
				}
			}
			for &v in self.forward.of(n) {
				if scratch.visited[v as usize] == stamp {
					continue;
				}
				let g = self.gate[v as usize];
				if g != 0 && !scratch.used.contains(&g) {
					scratch.pending.entry(g).or_default().push(v);
					continue;
				}
				scratch.visited[v as usize] = stamp;
				stack.push(v);
			}
		}
		false
	}

	/// Nodes and files that read a directory containing `path`.
	pub fn dir_dependents(&self, path: &str) -> (Vec<u32>, Vec<u32>) {
		let (mut nodes, mut files) = (Vec::new(), Vec::new());
		for (i, _) in path.match_indices('/') {
			if let Some((n, f)) = self.dirs.get(&path[..i]) {
				nodes.extend_from_slice(n);
				files.extend_from_slice(f);
			}
		}
		(nodes, files)
	}

	/// Entries that (transitively) import a seed entry. `runtime` ignores type-only imports.
	pub fn importing_files(
		&self,
		seeds: impl IntoIterator<Item = u32>,
		runtime: bool,
	) -> Vec<bool> {
		if runtime {
			self.files_runtime.reach(seeds)
		} else {
			self.files_all.reach(seeds)
		}
	}
}
