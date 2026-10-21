/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Per-file analysis. Parses one TypeScript module with oxc and extracts the facts the impact
//! graph needs: the module's runtime declarations and their members, a content hash of each that
//! ignores comments, formatting and TypeScript-only syntax, the value-level references between
//! them, the property names they use, and the module's imports, exports and load-time edges.

use std::collections::HashMap;

use oxc_allocator::Allocator;
use oxc_ast::{AstKind, ast::*};
use oxc_parser::{Parser, config::TokensParserConfig};
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, SourceType, Span};
use oxc_syntax::{
	operator::UnaryOperator,
	scope::ScopeId,
	symbol::{SymbolFlags, SymbolId},
};
use xxhash_rust::xxh3::{Xxh3, xxh3_64};

use crate::config::Config;

/// A module specifier: from an import or export, a dynamic import, `require`, or a string literal
/// that looks like a module or file path (a relative path or one starting with a path alias, such
/// as a worker entry point or a fixture folder).
#[derive(Debug, Clone)]
pub struct ImportSpec {
	pub specifier: String,
	/// True when the module is not loaded at runtime because only types are used from it.
	pub type_only: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Imported {
	Named(String),
	Default,
	Namespace,
}

#[derive(Debug, Clone)]
pub struct ImportBinding {
	pub spec: u32,
	pub imported: Imported,
	pub value_used: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Ref {
	/// Another declaration (or member) of the same module.
	Local(u32),
	/// An import binding, with the statically accessed member (`binding.member`).
	Import {
		binding: u32,
		member: Option<Box<str>>,
	},
	/// Everything a module exports (dynamic imports, path strings, opaque namespace use).
	All(u32),
	/// A global injected by the test runners (see `injectedGlobals` in the configuration).
	Global(Box<str>),
}

#[derive(Debug, Clone)]
pub enum ExportTarget {
	Local(u32),
	Binding(u32),
	ReExport { spec: u32, name: String },
	Namespace(u32),
}

/// A runtime declaration of a module, or a member of one. Index 0 is the module initializer,
/// which holds the statements that run when the module is loaded.
#[derive(Debug, Clone, Default)]
pub struct Decl {
	pub key: String,
	pub hash: u64,
	pub refs: Vec<Ref>,
	/// The declaration has load-time side effects, so the module initializer depends on it.
	pub pinned: bool,
	/// Members reachable as `X.member` (enum members, object literal properties, namespace
	/// exports, static class members), sorted by name.
	pub members: Vec<(Box<str>, u32)>,
	/// Every member declaration, including instance methods.
	pub children: Vec<u32>,
	/// For instance methods: the method name (as a name id). Code only reaches the method if
	/// it uses that property name somewhere.
	pub gate: u64,
	/// Property names (as name ids) this declaration accesses: `x.name`, `{ name } = x`, 'name'.
	pub uses: Vec<u64>,
}

#[derive(Debug, Clone, Default)]
pub struct FileFacts {
	pub decls: Vec<Decl>,
	pub specs: Vec<ImportSpec>,
	pub bindings: Vec<ImportBinding>,
	/// Sorted by exported name.
	pub exports: Vec<(String, ExportTarget)>,
	pub stars: Vec<u32>,
	/// Specs loaded when the module is evaluated, in source order.
	pub loads: Vec<u32>,
	/// Number of `test(...)` calls, used as a cost estimate for test files.
	pub tests: u32,
	/// Loading the module has effects outside of it, such as registering with a registry.
	pub global_effects: bool,
	/// The top-level statements whose relative order affects module evaluation, in source
	/// order: initializer statements and declarations whose load-time code has effects or reads
	/// mutable module state, as (identity, declaration).
	pub order: Vec<(u64, u32)>,
	/// The node of each exported name (see `export_decl`), sorted by name.
	pub export_decls: Vec<(String, u32)>,
	/// The node standing for the `export * from` list, if any.
	pub star_decl: Option<u32>,
	pub error: bool,
}

impl FileFacts {
	/// All targets of an exported name. Declaration merging can give one name several targets.
	pub fn exports_named(&self, name: &str) -> &[(String, ExportTarget)] {
		let start = self.exports.partition_point(|(n, _)| n.as_str() < name);
		let end = start + self.exports[start..].partition_point(|(n, _)| n.as_str() == name);
		&self.exports[start..end]
	}

	/// The node of an exported name. Its content is what the name is bound to, so retargeting an
	/// export changes it even when no declaration changes.
	pub fn export_decl(&self, name: &str) -> Option<u32> {
		self.export_decls
			.binary_search_by(|(n, _)| n.as_str().cmp(name))
			.ok()
			.map(|i| self.export_decls[i].1)
	}
}

/// Stable id of a property name.
pub fn name_id(name: &str) -> u64 {
	xxh3_64(name.as_bytes()) | 1
}

/// Methods the runtime calls without the name appearing in source. The configuration can add
/// methods that a repository's conventions call this way.
pub const IMPLICIT_METHODS: &[&str] = &[
	"constructor",
	"toString",
	"toJSON",
	"valueOf",
	"then",
	"handleEvent",
	"next",
	"return",
	"throw",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Owner {
	/// Imports and TypeScript-only statements: no runtime node.
	Skip,
	Init,
	Decl(u32),
	/// `export { a, b as c }`: only maps names.
	ExportList,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Escape {
	No,
	Yes,
	/// A direct call of a function declared in this module (or a parameter, or a local).
	Call(SymbolId),
}

#[derive(Clone)]
enum SymbolTarget {
	Binding(u32),
	Locals(Vec<u32>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MemberKind {
	Enum,
	Object,
	Namespace,
	Static,
	Instance,
}

struct Member {
	name: String,
	span: Span,
	has_init: bool,
	kind: MemberKind,
}

fn js_str(s: &oxc_str::JSStr) -> String {
	s.as_str().map(str::to_owned).unwrap_or_default()
}

fn collect_pattern_names(p: &BindingPattern, out: &mut Vec<String>) {
	match p {
		BindingPattern::BindingIdentifier(id) => out.push(id.name.as_str().to_owned()),
		BindingPattern::ObjectPattern(o) => {
			for prop in &o.properties {
				collect_pattern_names(&prop.value, out);
			}
			if let Some(rest) = &o.rest {
				collect_pattern_names(&rest.argument, out);
			}
		}
		BindingPattern::ArrayPattern(a) => {
			for e in a.elements.iter().flatten() {
				collect_pattern_names(e, out);
			}
			if let Some(rest) = &a.rest {
				collect_pattern_names(&rest.argument, out);
			}
		}
		BindingPattern::AssignmentPattern(a) => collect_pattern_names(&a.left, out),
	}
}

/// Names bound by a declaration that exists at runtime, or `None` for TypeScript-only declarations.
fn runtime_names(decl: &Declaration) -> Option<Vec<String>> {
	match decl {
		Declaration::VariableDeclaration(v) => {
			if v.declare {
				return None;
			}
			let mut names = Vec::new();
			for d in &v.declarations {
				collect_pattern_names(&d.id, &mut names);
			}
			Some(names)
		}
		Declaration::FunctionDeclaration(f) => {
			if f.declare || f.body.is_none() {
				return None;
			}
			f.id.as_ref().map(|id| vec![id.name.as_str().to_owned()])
		}
		Declaration::ClassDeclaration(c) => {
			if c.declare {
				return None;
			}
			c.id.as_ref().map(|id| vec![id.name.as_str().to_owned()])
		}
		Declaration::TSEnumDeclaration(e) => {
			(!e.declare).then(|| vec![e.id.name.as_str().to_owned()])
		}
		Declaration::TSNamespaceDeclaration(n) => {
			(!n.declare).then(|| vec![n.id.name.as_str().to_owned()])
		}
		Declaration::TSImportEqualsDeclaration(i) => {
			(!i.import_kind.is_type()).then(|| vec![i.id.name.as_str().to_owned()])
		}
		_ => None,
	}
}

/// Calls at load time that are known not to have observable global side effects: JavaScript
/// built-ins, and the functions and objects the configuration declares pure.
fn is_pure_callee(callee: &Expression, config: &Config) -> bool {
	match callee {
		Expression::Identifier(id) => {
			let name = id.name.as_str();
			matches!(
				name,
				"Symbol" | "Number" | "String" | "Boolean" | "parseInt" | "parseFloat"
			) || config.is_pure_function(name)
		}
		Expression::StaticMemberExpression(m) => match &m.object {
			Expression::Identifier(o) => {
				let name = o.name.as_str();
				(matches!(
					name,
					"Object" | "Math" | "JSON" | "Array" | "Number" | "String" | "Date"
				) || config.is_pure_object(name))
					&& m.property.name.as_str() != "assign"
					&& m.property.name.as_str() != "defineProperty"
			}
			_ => false,
		},
		_ => false,
	}
}

/// Globals whose functions do not mutate shared state.
const PURE_GLOBALS: &[&str] = &[
	"Symbol",
	"Object",
	"Math",
	"JSON",
	"Array",
	"Number",
	"String",
	"Boolean",
	"BigInt",
	"Date",
	"RegExp",
	"Promise",
	"Map",
	"Set",
	"WeakMap",
	"WeakSet",
	"Error",
	"TypeError",
	"parseInt",
	"parseFloat",
	"isNaN",
	"isFinite",
	"encodeURIComponent",
	"decodeURIComponent",
	"Intl",
	"TextEncoder",
	"TextDecoder",
	"URL",
	"URLSearchParams",
	"Uint8Array",
	"Uint16Array",
	"Uint32Array",
	"Int32Array",
	"Float64Array",
	"ArrayBuffer",
	"DataView",
	"console",
	"crypto",
	"performance",
];

/// Methods that do not mutate their receiver or shared state, on any receiver.
const PURE_METHODS: &[&str] = &[
	"bind",
	"indexOf",
	"lastIndexOf",
	"includes",
	"startsWith",
	"endsWith",
	"slice",
	"substring",
	"substr",
	"split",
	"join",
	"map",
	"filter",
	"find",
	"findIndex",
	"some",
	"every",
	"reduce",
	"concat",
	"toString",
	"toLowerCase",
	"toUpperCase",
	"trim",
	"trimStart",
	"trimEnd",
	"replace",
	"replaceAll",
	"match",
	"matchAll",
	"test",
	"exec",
	"charCodeAt",
	"codePointAt",
	"charAt",
	"padStart",
	"padEnd",
	"repeat",
	"keys",
	"values",
	"entries",
	"has",
	"get",
	"at",
	"flat",
	"flatMap",
	"localeCompare",
	"normalize",
	"toFixed",
	"getTime",
	"now",
	"randomUUID",
	"getRandomValues",
	"fromCharCode",
	"isArray",
	"freeze",
];

fn is_literal(e: &Expression) -> bool {
	match e {
		Expression::NumericLiteral(_)
		| Expression::StringLiteral(_)
		| Expression::BooleanLiteral(_) => true,
		Expression::TemplateLiteral(t) => t.expressions.is_empty(),
		Expression::UnaryExpression(u) => is_literal(&u.argument),
		Expression::BinaryExpression(b) => is_literal(&b.left) && is_literal(&b.right),
		Expression::ParenthesizedExpression(p) => is_literal(&p.expression),
		_ => false,
	}
}

fn object_literal<'b, 'a>(
	e: &'b Expression<'a>,
	config: &Config,
) -> Option<&'b ObjectExpression<'a>> {
	match e {
		Expression::ObjectExpression(o) => Some(o),
		Expression::TSAsExpression(x) => object_literal(&x.expression, config),
		Expression::TSSatisfiesExpression(x) => object_literal(&x.expression, config),
		Expression::ParenthesizedExpression(x) => object_literal(&x.expression, config),
		Expression::CallExpression(c)
			if is_pure_callee(&c.callee, config) && c.arguments.len() == 1 =>
		{
			match c.arguments.first() {
				Some(Argument::ObjectExpression(o)) => Some(o),
				_ => None,
			}
		}
		_ => None,
	}
}

fn class_members(c: &Class, out: &mut Vec<Member>) {
	for element in &c.body.body {
		match element {
			ClassElement::MethodDefinition(m)
				if m.kind != MethodDefinitionKind::Constructor
					&& !m.computed && m.value.body.is_some() =>
			{
				if let Some(name) = m
					.key
					.static_name()
					.and_then(|n| n.as_str().map(str::to_owned))
				{
					let kind = if m.r#static {
						MemberKind::Static
					} else {
						MemberKind::Instance
					};
					out.push(Member {
						name,
						span: m.span,
						has_init: true,
						kind,
					});
				}
			}
			ClassElement::PropertyDefinition(p) if p.r#static && !p.computed && !p.declare => {
				if let Some(name) = p
					.key
					.static_name()
					.and_then(|n| n.as_str().map(str::to_owned))
				{
					out.push(Member {
						name,
						span: p.span,
						has_init: true,
						kind: MemberKind::Static,
					});
				}
			}
			_ => {}
		}
	}
}

/// Members of a declaration that are tracked as declarations of their own. Everything else in
/// the declaration (class constructors and fields, spreads, computed keys) stays with the parent.
fn member_list(decl: &Declaration, config: &Config) -> Vec<Member> {
	let mut out = Vec::new();
	match decl {
		Declaration::TSEnumDeclaration(e) => {
			for m in &e.body.members {
				let name = match &m.id {
					TSEnumMemberName::Identifier(id) => id.name.as_str().to_owned(),
					TSEnumMemberName::String(s) => js_str(&s.value),
					_ => return Vec::new(),
				};
				if m.initializer.as_ref().is_some_and(|i| !is_literal(i)) {
					return Vec::new();
				}
				out.push(Member {
					name,
					span: m.span,
					has_init: m.initializer.is_some(),
					kind: MemberKind::Enum,
				});
			}
		}
		Declaration::VariableDeclaration(v)
			if v.kind == VariableDeclarationKind::Const && v.declarations.len() == 1 =>
		{
			let d = &v.declarations[0];
			if let (BindingPattern::BindingIdentifier(_), Some(o)) = (
				&d.id,
				d.init.as_ref().and_then(|e| object_literal(e, config)),
			) {
				for p in &o.properties {
					if let ObjectPropertyKind::ObjectProperty(p) = p {
						if !p.computed {
							if let Some(name) = p
								.key
								.static_name()
								.and_then(|n| n.as_str().map(str::to_owned))
							{
								out.push(Member {
									name,
									span: p.span,
									has_init: true,
									kind: MemberKind::Object,
								});
							}
						}
					}
				}
			}
		}
		Declaration::TSNamespaceDeclaration(n) => {
			if let TSNamespaceDeclarationBody::TSModuleBlock(block) = &n.body {
				for s in &block.body {
					if let Statement::ExportDeclaration(d) = s {
						if let Some(names) = runtime_names(&d.declaration) {
							if names.len() == 1 {
								out.push(Member {
									name: names[0].clone(),
									span: s.span(),
									has_init: true,
									kind: MemberKind::Namespace,
								});
							}
						}
					}
				}
			}
		}
		Declaration::ClassDeclaration(c) => class_members(c, &mut out),
		_ => {}
	}
	out
}

/// A member span of a memberized declaration: (span, member declaration, has initializer, kind).
type MemberSpan = (Span, u32, bool, MemberKind);

/// Adds the members of declaration `parent` as declarations of their own.
fn memberize(
	facts: &mut FileFacts,
	parent: u32,
	members: Vec<Member>,
	spans: &mut Vec<MemberSpan>,
) {
	let parent_key = facts.decls[parent as usize].key.clone();
	let mut named = Vec::new();
	let mut children = Vec::new();
	// Keys must be unique: an accessor pair shares one name.
	let mut key_counts: HashMap<String, u32> = HashMap::new();
	for m in members {
		let child = facts.decls.len() as u32;
		let gate = if m.kind == MemberKind::Instance {
			name_id(&m.name)
		} else {
			0
		};
		let key = if m.kind == MemberKind::Instance {
			format!("{parent_key}.prototype.{}", m.name)
		} else {
			format!("{parent_key}.{}", m.name)
		};
		let count = key_counts.entry(key.clone()).or_insert(0);
		let key = if *count == 0 {
			key
		} else {
			format!("{key}#{count}")
		};
		*count += 1;
		facts.decls.push(Decl {
			key,
			gate,
			..Decl::default()
		});
		spans.push((m.span, child, m.has_init, m.kind));
		children.push(child);
		if m.kind != MemberKind::Instance {
			named.push((m.name.into_boxed_str(), child));
		}
	}
	named.sort();
	named.dedup_by(|a, b| a.0 == b.0);
	facts.decls[parent as usize].members = named;
	facts.decls[parent as usize].children = children;
}

fn looks_like_path(s: &str, config: &Config) -> bool {
	s.len() > 3
		&& s.len() < 240
		&& (s.starts_with("./") || s.starts_with("../") || config.has_alias(s))
		&& !s
			.bytes()
			.any(|b| b.is_ascii_whitespace() || b == b'*' || b == b'$' || b == b'{')
}

fn is_identifier_like(s: &str) -> bool {
	let mut chars = s.chars();
	chars
		.next()
		.is_some_and(|c| c.is_ascii_alphabetic() || c == '_' || c == '$')
		&& chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
		&& s.len() < 80
}

/// Analyzes one module. Never fails: on a fatal parse error the whole file becomes a single
/// initializer node whose hash covers the full source.
pub fn analyze(path: &str, source: &str, config: &Config) -> FileFacts {
	let allocator = Allocator::default();
	let source_type = SourceType::from_path(path).unwrap_or_else(|_| SourceType::ts());
	let ret = Parser::new(&allocator, source, source_type)
		.with_config(TokensParserConfig)
		.parse();
	let mut facts = FileFacts::default();
	if ret.fatal_error {
		facts.error = true;
		facts.global_effects = true;
		facts.decls.push(Decl {
			key: "<init>".into(),
			hash: xxh3_64(source.as_bytes()),
			..Decl::default()
		});
		return facts;
	}
	let program = &ret.program;
	let semantic = SemanticBuilder::new()
		.with_build_nodes(true)
		.build(program)
		.semantic;
	let nodes = semantic.nodes();
	let scoping = semantic.scoping();

	let body = &program.body;
	let stmt_spans: Vec<Span> = body.iter().map(|s| s.span()).collect();
	let stmt_index = |pos: u32| -> Option<usize> {
		let i = stmt_spans.partition_point(|s| s.start <= pos);
		(i > 0 && pos < stmt_spans[i - 1].end).then(|| i - 1)
	};

	let mut owners = vec![Owner::Skip; body.len()];
	facts.decls.push(Decl {
		key: "<init>".into(),
		..Decl::default()
	});
	let mut key_counts: HashMap<String, u32> = HashMap::new();
	let mut add_decl = |facts: &mut FileFacts, names: &[String]| -> u32 {
		let base = if names.is_empty() {
			"<anonymous>".to_owned()
		} else {
			names.join(",")
		};
		let count = key_counts.entry(base.clone()).or_insert(0);
		let key = if *count == 0 {
			base
		} else {
			format!("{base}#{count}")
		};
		*count += 1;
		facts.decls.push(Decl {
			key,
			..Decl::default()
		});
		(facts.decls.len() - 1) as u32
	};
	let mut member_spans: Vec<MemberSpan> = Vec::new();
	let push_spec = |facts: &mut FileFacts, specifier: String, type_only: bool| -> u32 {
		facts.specs.push(ImportSpec {
			specifier,
			type_only,
		});
		(facts.specs.len() - 1) as u32
	};

	let mut binding_by_symbol: HashMap<SymbolId, u32> = HashMap::new();
	// Import declarations whose load depends on whether any binding is used as a value.
	let mut pending_imports: Vec<(u32, Vec<u32>)> = Vec::new();
	let mut local_exports: Vec<(String, String)> = Vec::new();
	let mut exports: Vec<(String, ExportTarget)> = Vec::new();
	let mut namespace_scopes: Vec<ScopeId> = Vec::new();

	for (i, stmt) in body.iter().enumerate() {
		match stmt {
			Statement::ImportDeclaration(d) => {
				let type_only = d.import_kind.is_type();
				let spec = push_spec(&mut facts, js_str(&d.source.value), type_only);
				match &d.specifiers {
					Some(list) if !list.is_empty() => {
						let mut bindings = Vec::new();
						for s in list {
							let (imported, local, is_type) = match s {
								ImportDeclarationSpecifier::ImportSpecifier(s) => (
									Imported::Named(s.imported.name().as_str().to_owned()),
									&s.local,
									s.import_kind.is_type(),
								),
								ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => {
									(Imported::Default, &s.local, false)
								}
								ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => {
									(Imported::Namespace, &s.local, false)
								}
							};
							if type_only || is_type {
								continue;
							}
							let b = facts.bindings.len() as u32;
							facts.bindings.push(ImportBinding {
								spec,
								imported,
								value_used: false,
							});
							if let Some(sym) = local.symbol_id.get() {
								binding_by_symbol.insert(sym, b);
							}
							bindings.push(b);
						}
						pending_imports.push((spec, bindings));
					}
					_ => {
						if !type_only {
							facts.loads.push(spec);
						}
					}
				}
			}
			Statement::ExportNamedDeclaration(d) => {
				owners[i] = Owner::ExportList;
				if !d.export_kind.is_type() {
					for s in &d.specifiers {
						if !s.export_kind.is_type() {
							local_exports.push((
								s.exported.name().as_str().to_owned(),
								s.local.name().as_str().to_owned(),
							));
						}
					}
				}
			}
			Statement::ExportFromDeclaration(d) => {
				let type_only = d.export_kind.is_type();
				let spec = push_spec(&mut facts, js_str(&d.source.value), type_only);
				if !type_only {
					facts.loads.push(spec);
					for s in &d.specifiers {
						if !s.export_kind.is_type() {
							exports.push((
								s.exported.name().as_str().to_owned(),
								ExportTarget::ReExport {
									spec,
									name: s.local.name().as_str().to_owned(),
								},
							));
						}
					}
				}
			}
			Statement::ExportAllDeclaration(d) => {
				let type_only = d.export_kind.is_type();
				let spec = push_spec(&mut facts, js_str(&d.source.value), type_only);
				if !type_only {
					facts.loads.push(spec);
					match &d.exported {
						Some(name) => exports.push((
							name.name().as_str().to_owned(),
							ExportTarget::Namespace(spec),
						)),
						None => facts.stars.push(spec),
					}
				}
			}
			Statement::ExportDefaultDeclaration(d) => {
				let runtime = match &d.declaration {
					ExportDefaultDeclarationKind::FunctionDeclaration(f) => f.body.is_some(),
					ExportDefaultDeclarationKind::TSInterfaceDeclaration(_) => false,
					_ => true,
				};
				if runtime {
					let idx = add_decl(&mut facts, &["default".to_owned()]);
					owners[i] = Owner::Decl(idx);
					exports.push(("default".to_owned(), ExportTarget::Local(idx)));
					if let ExportDefaultDeclarationKind::ClassDeclaration(c) = &d.declaration {
						let mut members = Vec::new();
						class_members(c, &mut members);
						memberize(&mut facts, idx, members, &mut member_spans);
					}
				}
			}
			_ => {
				let decl = match stmt {
					Statement::ExportDeclaration(d) => Some(&d.declaration),
					_ => stmt.as_declaration(),
				};
				match decl {
					Some(decl) => {
						if let Some(names) = runtime_names(decl) {
							let idx = add_decl(&mut facts, &names);
							owners[i] = Owner::Decl(idx);
							if matches!(stmt, Statement::ExportDeclaration(_)) {
								for n in &names {
									exports.push((n.clone(), ExportTarget::Local(idx)));
								}
							}
							if let Declaration::TSNamespaceDeclaration(n) = decl {
								if let Some(scope) = n.scope_id.get() {
									namespace_scopes.push(scope);
								}
							}
							memberize(
								&mut facts,
								idx,
								member_list(decl, config),
								&mut member_spans,
							);
						}
					}
					None => owners[i] = Owner::Init,
				}
			}
		}
	}

	member_spans.sort_unstable_by_key(|m| (m.0.start, std::cmp::Reverse(m.0.end)));
	// The innermost member containing a source position (members do not nest).
	let member_at = |pos: u32| -> Option<u32> {
		let i = member_spans.partition_point(|m| m.0.start <= pos);
		(i > 0 && pos < member_spans[i - 1].0.end).then(|| member_spans[i - 1].1)
	};
	// The declaration owning a source position: a member, a declaration or the initializer.
	let node_at = |pos: u32| -> Option<u32> {
		if let Some(m) = member_at(pos) {
			return Some(m);
		}
		match owners[stmt_index(pos)?] {
			Owner::Decl(d) => Some(d),
			Owner::Init => Some(0),
			_ => None,
		}
	};

	// Map each top-level symbol, and each symbol declared directly in a namespace, to the runtime
	// declarations that declare it.
	let root = scoping.root_scope_id();
	let mut targets: Vec<(SymbolId, SymbolTarget)> = Vec::new();
	let mut local_by_name: HashMap<String, SymbolTarget> = HashMap::new();
	for (scope_index, scope) in std::iter::once(root)
		.chain(namespace_scopes.iter().copied())
		.enumerate()
	{
		for sym in scoping.iter_bindings_in(scope) {
			let target = if let Some(&b) = binding_by_symbol.get(&sym) {
				SymbolTarget::Binding(b)
			} else {
				let mut locals = Vec::new();
				let spans = std::iter::once(scoping.symbol_span(sym))
					.chain(scoping.symbol_redeclarations(sym).iter().map(|r| r.span));
				for span in spans {
					let owner = if scope_index == 0 {
						match stmt_index(span.start).map(|si| owners[si]) {
							Some(Owner::Decl(d)) => Some(d),
							Some(Owner::Init) => Some(0),
							_ => None,
						}
					} else {
						node_at(span.start)
					};
					if let Some(d) = owner {
						if !locals.contains(&d) {
							locals.push(d);
						}
					}
				}
				if locals.is_empty() {
					continue;
				}
				SymbolTarget::Locals(locals)
			};
			if scope_index == 0 {
				local_by_name.insert(scoping.symbol_name(sym).to_owned(), target.clone());
			}
			targets.push((sym, target));
		}
	}

	// Value-level references between declarations.
	for (sym, target) in &targets {
		for &rid in scoping.get_resolved_reference_ids(*sym) {
			let reference = scoping.get_reference(rid);
			if !reference.flags().is_value() {
				continue;
			}
			let node_id = reference.node_id();
			let span = nodes.get_node(node_id).kind().span();
			let Some(si) = stmt_index(span.start) else {
				continue;
			};
			if owners[si] == Owner::ExportList {
				if let SymbolTarget::Binding(b) = target {
					facts.bindings[*b as usize].value_used = true;
				}
				continue;
			}
			let Some(src) = node_at(span.start) else {
				continue;
			};
			let member: Option<Box<str>> = match nodes.parent_kind(node_id) {
				AstKind::StaticMemberExpression(m) if m.object.span() == span => {
					Some(m.property.name.as_str().into())
				}
				AstKind::ComputedMemberExpression(m) if m.object.span() == span => {
					match &m.expression {
						Expression::StringLiteral(s) => Some(js_str(&s.value).into_boxed_str()),
						_ => None,
					}
				}
				_ => None,
			};
			match target {
				SymbolTarget::Binding(b) => {
					facts.bindings[*b as usize].value_used = true;
					facts.decls[src as usize].refs.push(Ref::Import {
						binding: *b,
						member,
					});
				}
				SymbolTarget::Locals(locals) => {
					for &t in locals {
						let members = &facts.decls[t as usize].members;
						let t = match &member {
							Some(m) => members
								.binary_search_by(|(n, _)| (**n).cmp(&**m))
								.map_or(t, |i| members[i].1),
							None => t,
						};
						if t != src {
							facts.decls[src as usize].refs.push(Ref::Local(t));
						}
					}
				}
			}
		}
	}

	// `this` and `super` in a static member or an object literal member stand for the class or
	// the object. Code reaches such a member directly (`X.member`), without its parent, so the
	// member depends on the sibling that `this.name` names, or else on the parent. (Instance
	// members are only reachable through their class, so they need no edge.)
	let mut parent_of: HashMap<u32, u32> = HashMap::new();
	for (p, decl) in facts.decls.iter().enumerate() {
		for &c in &decl.children {
			parent_of.insert(c, p as u32);
		}
	}
	for node in nodes.iter() {
		let span = match node.kind() {
			AstKind::ThisExpression(t) => t.span,
			AstKind::Super(s) => s.span,
			_ => continue,
		};
		let i = member_spans.partition_point(|m| m.0.start <= span.start);
		if i == 0 || span.start >= member_spans[i - 1].0.end {
			continue;
		}
		let (_, member, _, kind) = member_spans[i - 1];
		if !matches!(kind, MemberKind::Static | MemberKind::Object) {
			continue;
		}
		let Some(&parent) = parent_of.get(&member) else {
			continue;
		};
		let sibling = match (node.kind(), nodes.parent_kind(node.id())) {
			(AstKind::ThisExpression(_), AstKind::StaticMemberExpression(m))
				if m.object.span() == span =>
			{
				let members = &facts.decls[parent as usize].members;
				members
					.binary_search_by(|(n, _)| (**n).cmp(m.property.name.as_str()))
					.ok()
					.map(|i| members[i].1)
			}
			_ => None,
		};
		let target = sibling.unwrap_or(parent);
		if target != member {
			facts.decls[member as usize].refs.push(Ref::Local(target));
		}
	}

	// Imports whose bindings are only used as types are elided by the compiler and never load.
	for (spec, bindings) in &pending_imports {
		if bindings
			.iter()
			.any(|&b| facts.bindings[b as usize].value_used)
		{
			facts.loads.push(*spec);
		} else {
			facts.specs[*spec as usize].type_only = true;
		}
	}
	facts.loads.sort_unstable();

	for (exported, local) in local_exports {
		match local_by_name.get(&local) {
			Some(SymbolTarget::Binding(b)) => exports.push((exported, ExportTarget::Binding(*b))),
			Some(SymbolTarget::Locals(locals)) => {
				for &l in locals {
					exports.push((exported.clone(), ExportTarget::Local(l)));
				}
			}
			None => {}
		}
	}

	// Whether an effect on an expression (calling it or assigning to it) can be observed outside
	// this module: its root is an import or an unknown global. Methods of local values and literals
	// stay local. Calls of local functions depend on what those functions do.
	let escapes = |e: &Expression| -> Escape {
		let mut cur = e;
		let mut called_directly = true;
		loop {
			match cur {
				Expression::StaticMemberExpression(m) => cur = &m.object,
				Expression::ComputedMemberExpression(m) => cur = &m.object,
				Expression::PrivateFieldExpression(m) => cur = &m.object,
				Expression::CallExpression(c) => cur = &c.callee,
				Expression::ParenthesizedExpression(p) => cur = &p.expression,
				Expression::TSAsExpression(x) => cur = &x.expression,
				Expression::TSSatisfiesExpression(x) => cur = &x.expression,
				Expression::TSNonNullExpression(x) => cur = &x.expression,
				Expression::Identifier(id) => {
					let symbol = id
						.reference_id
						.get()
						.and_then(|r| scoping.get_reference(r).symbol_id());
					return match symbol {
						Some(sym) if binding_by_symbol.contains_key(&sym) => Escape::Yes,
						Some(sym) if called_directly => Escape::Call(sym),
						Some(_) => Escape::No,
						None if PURE_GLOBALS.contains(&id.name.as_str()) => Escape::No,
						None => Escape::Yes,
					};
				}
				// Immediately invoked functions: their bodies are analyzed as load-time code.
				Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
					return Escape::No;
				}
				Expression::ThisExpression(_)
				| Expression::ArrayExpression(_)
				| Expression::ObjectExpression(_)
				| Expression::NewExpression(_) => return Escape::No,
				Expression::StringLiteral(_)
				| Expression::TemplateLiteral(_)
				| Expression::NumericLiteral(_)
				| Expression::RegExpLiteral(_) => return Escape::No,
				_ => return Escape::Yes,
			}
			called_directly = false;
		}
	};
	// `if (DEBUG_FLAG)` blocks guarded by a top-level `const DEBUG_FLAG = false` never run.
	let false_consts: Vec<&str> = body
		.iter()
		.filter_map(|s| match s {
			Statement::VariableDeclaration(v) if v.kind == VariableDeclarationKind::Const => {
				Some(v)
			}
			_ => None,
		})
		.flat_map(|v| v.declarations.iter())
		.filter_map(|d| match (&d.id, &d.init) {
			(BindingPattern::BindingIdentifier(id), Some(Expression::BooleanLiteral(b)))
				if !b.value =>
			{
				Some(id.name.as_str())
			}
			_ => None,
		})
		.collect();

	// A function expression that is called right away, such as `(() => { ... })()`.
	let is_iife = |function: oxc_syntax::node::NodeId| -> bool {
		let span = nodes.get_node(function).kind().span();
		let mut up = nodes.parent_id(function);
		loop {
			match nodes.get_node(up).kind() {
				AstKind::ParenthesizedExpression(_) => up = nodes.parent_id(up),
				AstKind::CallExpression(c) => {
					return c.callee.get_inner_expression().span() == span;
				}
				_ => return false,
			}
		}
	};

	// A function that may run while its enclosing code runs: immediately invoked, or passed as an
	// argument to a call that runs (such as `list.forEach(x => register(x))`).
	let runs_at_load = |function: oxc_syntax::node::NodeId, deferred: &[bool]| -> bool {
		if is_iife(function) {
			return true;
		}
		let up = nodes.parent_id(function);
		match nodes.get_node(up).kind() {
			AstKind::CallExpression(_) | AstKind::NewExpression(_) => !deferred[up.index()],
			_ => false,
		}
	};

	// One pass over all nodes: TypeScript-only spans to leave out of the hashes, load-time side
	// effects, property name uses, dynamic imports, path strings, injected globals and test counts.
	// Node ids are assigned in traversal order, so a parent is always visited before its children.
	let mut excluded: Vec<Span> = Vec::new();
	let mut deferred = vec![false; nodes.len()];
	let mut path_strings: Vec<(u32, String)> = Vec::new();
	let mut dynamic: Vec<(u32, String)> = Vec::new();
	let mut globals: Vec<(u32, String)> = Vec::new();
	let mut uses: Vec<(u32, u64)> = Vec::new();
	// Effects of the code inside each declaration (function bodies included), and direct calls
	// of local functions, at load time (by statement) and later (by declaration).
	let mut escaping = vec![false; facts.decls.len()];
	let mut local_calls: Vec<Vec<SymbolId>> = vec![Vec::new(); facts.decls.len()];
	let mut load_calls: Vec<(usize, SymbolId)> = Vec::new();
	let debug_effects = std::env::var_os("RIPPLE_EFFECT_DEBUG").is_some();
	// Top-level declarations by symbol, and whether a symbol is mutable module state (`let`/`var`).
	let locals_of: HashMap<SymbolId, Vec<u32>> = targets
		.iter()
		.filter_map(|(sym, t)| match t {
			SymbolTarget::Locals(l) => Some((*sym, l.clone())),
			SymbolTarget::Binding(_) => None,
		})
		.collect();
	let is_mutable = |sym: SymbolId| {
		let flags = scoping.symbol_flags(sym);
		flags.contains(SymbolFlags::FunctionScopedVariable)
			|| (flags.contains(SymbolFlags::BlockScopedVariable)
				&& !flags.contains(SymbolFlags::ConstVariable))
	};
	let symbol_of = |id: &IdentifierReference| {
		id.reference_id
			.get()
			.and_then(|r| scoping.get_reference(r).symbol_id())
	};
	let mut order_relevant = vec![false; facts.decls.len()];
	let mut writes: Vec<(u32, u32)> = Vec::new();
	for node in nodes.iter() {
		let id = node.id();
		let kind = node.kind();
		if id.index() != 0 {
			let parent = nodes.parent_id(id);
			debug_assert!(parent.index() < id.index());
			// Code that runs later than module load: function bodies, instance field initializers,
			// and member or parameter decorators, which only annotate their class.
			let d = deferred[parent.index()]
				|| match (nodes.get_node(parent).kind(), kind) {
					(AstKind::Class(_), _) => false,
					(_, AstKind::Decorator(_)) => true,
					(AstKind::Function(_) | AstKind::ArrowFunctionExpression(_), _) => {
						!runs_at_load(parent, &deferred)
					}
					(AstKind::PropertyDefinition(p), _) if !p.r#static => {
						kind.span().start >= p.key.span().end
					}
					(AstKind::AccessorProperty(p), _) if !p.r#static => {
						kind.span().start >= p.key.span().end
					}
					(AstKind::IfStatement(i), _) => {
						matches!(&i.test, Expression::Identifier(t) if false_consts.contains(&t.name.as_str()))
							&& kind.span().start >= i.test.span().end
							&& i.alternate
								.as_ref()
								.is_none_or(|a| kind.span().start < a.span().start)
					}
					_ => false,
				};
			deferred[id.index()] = d;
		}
		match kind {
			AstKind::TSTypeAnnotation(_)
			| AstKind::TSTypeParameterDeclaration(_)
			| AstKind::TSTypeParameterInstantiation(_)
			| AstKind::TSInterfaceDeclaration(_)
			| AstKind::TSTypeAliasDeclaration(_)
			| AstKind::TSClassImplements(_)
			| AstKind::TSIndexSignature(_)
			| AstKind::TSThisParameter(_)
			| AstKind::TSExternalModuleDeclaration(_)
			| AstKind::TSGlobalDeclaration(_) => excluded.push(kind.span()),
			AstKind::TSAsExpression(e) => {
				excluded.push(Span::new(e.expression.span().end, e.span.end))
			}
			AstKind::TSSatisfiesExpression(e) => {
				excluded.push(Span::new(e.expression.span().end, e.span.end))
			}
			AstKind::TSNonNullExpression(e) => {
				excluded.push(Span::new(e.expression.span().end, e.span.end))
			}
			AstKind::TSTypeAssertion(e) => {
				excluded.push(Span::new(e.span.start, e.expression.span().start))
			}
			AstKind::Function(f) if f.body.is_none() || f.declare => excluded.push(f.span),
			AstKind::MethodDefinition(m) if m.value.body.is_none() => excluded.push(m.span),
			AstKind::PropertyDefinition(p)
				if p.declare
					|| p.r#type == PropertyDefinitionType::TSAbstractPropertyDefinition =>
			{
				excluded.push(p.span)
			}
			AstKind::VariableDeclaration(v) if v.declare => excluded.push(v.span),
			AstKind::TSEnumDeclaration(e) if e.declare => excluded.push(e.span),
			AstKind::TSNamespaceDeclaration(n) if n.declare => excluded.push(n.span),
			_ => {}
		}
		match kind {
			AstKind::ImportExpression(e) => {
				if let Expression::StringLiteral(s) = &e.source {
					dynamic.push((e.span.start, js_str(&s.value)));
				}
			}
			AstKind::CallExpression(c) => {
				if let Expression::Identifier(callee) = &c.callee {
					let name = callee.name.as_str();
					if name == "test" || name == "it" {
						facts.tests += 1;
					} else if name == "require" {
						if let Some(Argument::StringLiteral(s)) = c.arguments.first() {
							dynamic.push((c.span.start, js_str(&s.value)));
						}
					}
				}
			}
			AstKind::StaticMemberExpression(m) => {
				let name = m.property.name.as_str();
				uses.push((m.span.start, name_id(name)));
				if config.is_injected_global(name) {
					if let Expression::Identifier(o) = m.object.get_inner_expression() {
						if matches!(o.name.as_str(), "globalThis" | "self" | "window") {
							globals.push((m.span.start, name.to_owned()));
						}
					}
				}
			}
			AstKind::BindingProperty(p) if !p.computed => {
				if let Some(n) = p
					.key
					.static_name()
					.and_then(|n| n.as_str().map(str::to_owned))
				{
					uses.push((p.span.start, name_id(&n)));
				}
			}
			AstKind::AssignmentTargetPropertyIdentifier(p) => {
				uses.push((p.span.start, name_id(p.binding.name.as_str())))
			}
			AstKind::AssignmentTargetPropertyProperty(p) if !p.computed => {
				if let Some(n) = p
					.name
					.static_name()
					.and_then(|n| n.as_str().map(str::to_owned))
				{
					uses.push((p.span.start, name_id(&n)));
				}
			}
			AstKind::StringLiteral(s) => {
				let value = js_str(&s.value);
				if is_identifier_like(&value) {
					uses.push((s.span.start, name_id(&value)));
				}
				if looks_like_path(&value, config) {
					match nodes.parent_kind(id) {
						AstKind::ImportDeclaration(_)
						| AstKind::ExportAllDeclaration(_)
						| AstKind::ExportFromDeclaration(_)
						| AstKind::ImportExpression(_) => {}
						_ => path_strings.push((s.span.start, value)),
					}
				}
			}
			_ => {}
		}
		if !deferred[id.index()] {
			// Module evaluation order matters for statements that run code with effects or read
			// mutable module state at load time.
			let relevant = match kind {
				AstKind::CallExpression(c) => {
					!is_pure_callee(&c.callee, config)
						&& !matches!(&c.callee, Expression::StaticMemberExpression(m) if PURE_METHODS.contains(&m.property.name.as_str()))
				}
				AstKind::IdentifierReference(r) => {
					symbol_of(r).is_some_and(|sym| locals_of.contains_key(&sym) && is_mutable(sym))
				}
				AstKind::UnaryExpression(u) => u.operator == UnaryOperator::Delete,
				AstKind::NewExpression(_)
				| AstKind::AssignmentExpression(_)
				| AstKind::UpdateExpression(_)
				| AstKind::AwaitExpression(_)
				| AstKind::TaggedTemplateExpression(_)
				| AstKind::Decorator(_)
				| AstKind::StaticBlock(_) => true,
				_ => false,
			};
			if relevant {
				if let Some(Owner::Decl(d)) = stmt_index(kind.span().start).map(|si| owners[si]) {
					order_relevant[d as usize] = true;
				}
			}
			// Mutable module state depends on the code that writes it at load time.
			let written = match kind {
				AstKind::AssignmentExpression(a) => match &a.left {
					AssignmentTarget::AssignmentTargetIdentifier(t) => symbol_of(t),
					_ => None,
				},
				AstKind::UpdateExpression(u) => match &u.argument {
					SimpleAssignmentTarget::AssignmentTargetIdentifier(t) => symbol_of(t),
					_ => None,
				},
				_ => None,
			};
			if let (Some(locals), Some(writer)) = (
				written.and_then(|sym| locals_of.get(&sym)),
				node_at(kind.span().start),
			) {
				writes.extend(
					locals
						.iter()
						.filter(|&&l| l != writer)
						.map(|&l| (l, writer)),
				);
			}
		}
		// Effects that can be observed outside this module. Effects on module-local state only
		// reach other code through the declarations holding that state.
		let escape = match kind {
			AstKind::CallExpression(c) if is_pure_callee(&c.callee, config) => Escape::No,
			AstKind::CallExpression(c) if matches!(&c.callee, Expression::StaticMemberExpression(m) if PURE_METHODS.contains(&m.property.name.as_str())) => {
				Escape::No
			}
			AstKind::CallExpression(c) => escapes(&c.callee),
			AstKind::AssignmentExpression(a) => match &a.left {
				AssignmentTarget::AssignmentTargetIdentifier(_) => Escape::No,
				AssignmentTarget::StaticMemberExpression(m) => escapes(&m.object),
				AssignmentTarget::ComputedMemberExpression(m) => escapes(&m.object),
				_ => Escape::Yes,
			},
			AstKind::UpdateExpression(u) => match &u.argument {
				SimpleAssignmentTarget::AssignmentTargetIdentifier(_) => Escape::No,
				SimpleAssignmentTarget::StaticMemberExpression(m) => escapes(&m.object),
				SimpleAssignmentTarget::ComputedMemberExpression(m) => escapes(&m.object),
				_ => Escape::Yes,
			},
			AstKind::TaggedTemplateExpression(t) => escapes(&t.tag),
			AstKind::AwaitExpression(_) | AstKind::ImportExpression(_) => Escape::Yes,
			AstKind::UnaryExpression(u) if u.operator == UnaryOperator::Delete => Escape::Yes,
			AstKind::Decorator(_) | AstKind::StaticBlock(_) if !deferred[id.index()] => Escape::Yes,
			_ => Escape::No,
		};
		if escape == Escape::No {
			continue;
		}
		let Some(si) = stmt_index(kind.span().start) else {
			continue;
		};
		let owner = match owners[si] {
			Owner::Decl(d) => d as usize,
			Owner::Init => 0,
			_ => continue,
		};
		if deferred[id.index()] {
			match escape {
				Escape::Yes => escaping[owner] = true,
				Escape::Call(sym) => local_calls[owner].push(sym),
				Escape::No => {}
			}
			continue;
		}
		let global = match escape {
			Escape::Yes => true,
			Escape::Call(sym) => {
				load_calls.push((owner, sym));
				false
			}
			Escape::No => false,
		};
		let effect = global;
		facts.global_effects |= global;
		if global && debug_effects {
			let sp = kind.span();
			let line = source[..sp.start as usize].matches('\n').count() + 1;
			eprintln!(
				"{path}:{line}: {}",
				&source[sp.start as usize..(sp.end as usize).min(sp.start as usize + 100)]
					.replace('\n', " ")
			);
		}
		if effect {
			if let Some(Owner::Decl(d)) = stmt_index(kind.span().start).map(|si| owners[si]) {
				facts.decls[d as usize].pinned = true;
			}
		}
	}

	for (state, writer) in writes {
		facts.decls[state as usize].refs.push(Ref::Local(writer));
	}

	// A local function is impure if its body has escaping effects or calls an impure (or unknown)
	// function. Load-time calls of impure local functions are global effects.
	let mut decls_of: HashMap<SymbolId, Vec<u32>> = HashMap::new();
	for (sym, target) in &targets {
		if let SymbolTarget::Locals(locals) = target {
			decls_of.insert(
				*sym,
				locals
					.iter()
					.map(|&d| facts.decls[d as usize].children.first().map_or(d, |_| d))
					.collect(),
			);
		}
	}
	let mut impure = escaping;
	loop {
		let mut changed = false;
		for d in 0..impure.len() {
			if !impure[d]
				&& local_calls[d].iter().any(|s| {
					decls_of
						.get(s)
						.is_none_or(|ts| ts.iter().any(|&t| impure[t as usize]))
				}) {
				impure[d] = true;
				changed = true;
			}
		}
		if !changed {
			break;
		}
	}
	for (owner, sym) in load_calls {
		if decls_of
			.get(&sym)
			.is_none_or(|ts| ts.iter().any(|&t| impure[t as usize]))
		{
			facts.global_effects = true;
			if owner != 0 {
				facts.decls[owner].pinned = true;
			}
		}
	}

	excluded.sort_unstable_by_key(|s| (s.start, s.end));
	let mut merged: Vec<Span> = Vec::with_capacity(excluded.len());
	for s in excluded {
		match merged.last_mut() {
			Some(last) if s.start <= last.end => last.end = last.end.max(s.end),
			_ => merged.push(s),
		}
	}
	let is_excluded = |pos: u32| -> bool {
		let i = merged.partition_point(|s| s.start <= pos);
		i > 0 && pos < merged[i - 1].end
	};

	let add_all = |facts: &mut FileFacts, pos: u32, specifier: String| {
		if is_excluded(pos) {
			return;
		}
		let Some(src) = node_at(pos) else { return };
		let spec = push_spec(facts, specifier, false);
		facts.decls[src as usize].refs.push(Ref::All(spec));
	};
	for (pos, specifier) in dynamic.into_iter().chain(path_strings) {
		add_all(&mut facts, pos, specifier);
	}
	for (pos, name) in globals {
		if let Some(src) = node_at(pos) {
			facts.decls[src as usize]
				.refs
				.push(Ref::Global(name.into_boxed_str()));
		}
	}
	for (pos, name) in uses {
		if !is_excluded(pos) {
			if let Some(src) = node_at(pos) {
				facts.decls[src as usize].uses.push(name);
			}
		}
	}

	// Content hashes over the tokens of each declaration, skipping TypeScript-only spans. Comments
	// and whitespace are not tokens, so they never affect a hash.
	let tokens = &ret.tokens;
	let bytes = source.as_bytes();
	let mut hashers: Vec<Xxh3> = (0..facts.decls.len()).map(|_| Xxh3::new()).collect();
	for (si, span) in stmt_spans.iter().enumerate() {
		let d = match owners[si] {
			Owner::Decl(d) => d as usize,
			Owner::Init => 0,
			_ => continue,
		};
		let mut statement = Xxh3::new();
		let start = tokens.partition_point(|t| t.start() < span.start);
		let mut ex = merged.partition_point(|e| e.end <= span.start);
		let mut m = member_spans.partition_point(|m| m.0.end <= span.start);
		for t in &tokens[start..] {
			if t.start() >= span.end {
				break;
			}
			if t.start() == t.end() {
				continue;
			}
			while ex < merged.len() && merged[ex].end <= t.start() {
				ex += 1;
			}
			if ex < merged.len() && merged[ex].start <= t.start() {
				continue;
			}
			while m < member_spans.len() && member_spans[m].0.end <= t.start() {
				m += 1;
			}
			let target = if m < member_spans.len() && member_spans[m].0.start <= t.start() {
				member_spans[m].1 as usize
			} else {
				d
			};
			let h = &mut hashers[target];
			h.update(&bytes[t.start() as usize..t.end() as usize]);
			h.update(&[0xff]);
			statement.update(&bytes[t.start() as usize..t.end() as usize]);
			statement.update(&[0xff]);
		}
		// The evaluation order of the module body, identified by declaration keys (and by content
		// for initializer statements). Function declarations are hoisted, so their order is free.
		match owners[si] {
			Owner::Init => facts.order.push((statement.digest() ^ 0x1, 0)),
			Owner::Decl(d) if order_relevant[d as usize] => facts
				.order
				.push((xxh3_64(facts.decls[d as usize].key.as_bytes()), d)),
			_ => {}
		}
	}
	// The syntax tree as node kinds, in source order: the same tokens can parse differently
	// (automatic semicolon insertion), and the parse decides the behavior. TypeScript-only wrapper
	// nodes are left out like their tokens.
	for node in nodes.iter() {
		let kind = node.kind();
		if matches!(
			kind,
			AstKind::Program(_)
				| AstKind::TSAsExpression(_)
				| AstKind::TSSatisfiesExpression(_)
				| AstKind::TSNonNullExpression(_)
				| AstKind::TSInstantiationExpression(_)
		) || is_excluded(kind.span().start)
		{
			continue;
		}
		if let Some(d) = node_at(kind.span().start) {
			hashers[d as usize].update(&[0xfb, kind.ty() as u8]);
		}
	}

	// Retargeting an import changes the behavior of every declaration that uses it.
	for (d, decl) in facts.decls.iter_mut().enumerate() {
		decl.refs.sort_unstable();
		decl.refs.dedup();
		decl.uses.sort_unstable();
		decl.uses.dedup();
		let h = &mut hashers[d];
		for r in &decl.refs {
			match r {
				Ref::Local(_) => {}
				Ref::Import { binding, .. } => {
					let b = &facts.bindings[*binding as usize];
					h.update(facts.specs[b.spec as usize].specifier.as_bytes());
					h.update(&[0xfe]);
					match &b.imported {
						Imported::Named(n) => h.update(n.as_bytes()),
						Imported::Default => h.update(b"<default>"),
						Imported::Namespace => h.update(b"<namespace>"),
					}
					h.update(&[0xfe]);
				}
				Ref::All(spec) => {
					h.update(facts.specs[*spec as usize].specifier.as_bytes());
					h.update(&[0xfd]);
				}
				Ref::Global(name) => {
					h.update(name.as_bytes());
					h.update(&[0xfc]);
				}
			}
		}
		decl.hash = h.digest();
	}
	// An enum member without an initializer is the previous member's value plus one.
	let mut previous: Option<u64> = None;
	for &(_, child, has_init, kind) in &member_spans {
		let decl = &mut facts.decls[child as usize];
		if kind == MemberKind::Enum && !has_init {
			decl.hash =
				xxh3_64(&[decl.hash.to_le_bytes(), previous.unwrap_or(0).to_le_bytes()].concat());
		}
		previous = (kind == MemberKind::Enum).then_some(decl.hash);
	}

	exports.sort_by(|a, b| a.0.cmp(&b.0));
	facts.exports = exports;
	add_export_decls(&mut facts);
	facts
}

/// Adds a node per exported name, whose content is what the name is bound to, and one for the
/// `export * from` list. Consumers depend on the export nodes along their import's resolution
/// chain, so retargeting an export or a re-export selects them although no declaration changed.
fn add_export_decls(facts: &mut FileFacts) {
	let spec = |s: u32| facts.specs[s as usize].specifier.as_str();
	let mut names: Vec<(String, u64)> = Vec::new();
	for (name, target) in &facts.exports {
		let mut h = Xxh3::new();
		if let Some((last, hash)) = names.last_mut() {
			if last == name {
				h.update(&hash.to_le_bytes());
			}
		}
		match target {
			ExportTarget::Local(d) => {
				h.update(b"local:");
				h.update(facts.decls[*d as usize].key.as_bytes());
			}
			ExportTarget::Binding(b) => {
				let b = &facts.bindings[*b as usize];
				h.update(b"import:");
				h.update(spec(b.spec).as_bytes());
				h.update(&[0]);
				match &b.imported {
					Imported::Named(n) => h.update(n.as_bytes()),
					Imported::Default => h.update(b"<default>"),
					Imported::Namespace => h.update(b"<namespace>"),
				}
			}
			ExportTarget::ReExport { spec: s, name } => {
				h.update(b"reexport:");
				h.update(spec(*s).as_bytes());
				h.update(&[0]);
				h.update(name.as_bytes());
			}
			ExportTarget::Namespace(s) => {
				h.update(b"namespace:");
				h.update(spec(*s).as_bytes());
			}
		}
		match names.last_mut() {
			Some((last, hash)) if last == name => *hash = h.digest(),
			_ => names.push((name.clone(), h.digest())),
		}
	}
	for (name, hash) in names {
		facts.decls.push(Decl {
			key: format!("<export>{name}"),
			hash,
			..Decl::default()
		});
		facts
			.export_decls
			.push((name, (facts.decls.len() - 1) as u32));
	}
	if !facts.stars.is_empty() {
		let mut h = Xxh3::new();
		for &s in &facts.stars {
			h.update(facts.specs[s as usize].specifier.as_bytes());
			h.update(&[0]);
		}
		facts.decls.push(Decl {
			key: "<export*>".to_owned(),
			hash: h.digest(),
			..Decl::default()
		});
		facts.star_decl = Some((facts.decls.len() - 1) as u32);
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn analyze(path: &str, source: &str) -> FileFacts {
		super::analyze(path, source, crate::config::for_tests())
	}

	fn key_hashes(f: &FileFacts) -> Vec<(String, u64)> {
		f.decls.iter().map(|d| (d.key.clone(), d.hash)).collect()
	}

	fn find<'a>(f: &'a FileFacts, key: &str) -> (u32, &'a Decl) {
		let i = f
			.decls
			.iter()
			.position(|d| d.key == key)
			.unwrap_or_else(|| panic!("no declaration {key}"));
		(i as u32, &f.decls[i])
	}

	#[test]
	fn types_comments_and_formatting_do_not_change_hashes() {
		let a = analyze(
			"a.ts",
			"import { A } from './a.js';\nexport function f(x: number): string { return String(x) + g(x); }\nexport interface I { a: A }\nfunction g(x) { return x.y; }\n",
		);
		let b = analyze(
			"a.ts",
			"import { A } from './a.js';\n// comment\nexport function f(x: string | number):   string {\n\treturn String(x as any) + g<number>(x satisfies unknown);\n}\nexport interface I { a: A; b: number }\nfunction g<T>(x: T) { return x!.y; }\n",
		);
		assert_eq!(key_hashes(&a), key_hashes(&b));
	}

	#[test]
	fn significant_line_breaks_change_hashes() {
		let hash = |src: &str| {
			analyze("a.ts", src)
				.decls
				.iter()
				.find(|d| d.key == "f")
				.unwrap()
				.hash
		};
		// Automatic semicolon insertion: `return` followed by a line break returns undefined.
		assert_ne!(
			hash("export function f() { return 1; }\n"),
			hash("export function f() { return\n1; }\n")
		);
		// `a\n++b` is `a; ++b`, while `a++\nb` is `a++; b`: the same tokens.
		assert_ne!(
			hash("export function f(a, b) { a\n++b }\n"),
			hash("export function f(a, b) { a++\nb }\n")
		);
	}

	#[test]
	fn body_changes_are_isolated_to_their_declaration() {
		let a = analyze(
			"a.ts",
			"export function f() { return 1; }\nexport function g() { return f(); }\n",
		);
		let b = analyze(
			"a.ts",
			"export function f() { return 2; }\nexport function g() { return f(); }\n",
		);
		let ka = key_hashes(&a);
		let kb = key_hashes(&b);
		assert_ne!(ka[1], kb[1]);
		assert_eq!(ka[2], kb[2]);
		assert_eq!(a.decls[2].refs, vec![Ref::Local(1)]);
	}

	#[test]
	fn type_only_imports_do_not_load() {
		let f = analyze(
			"a.ts",
			"import { IFoo } from './foo.js';\nimport { Bar } from './bar.js';\nimport './side.js';\nexport class C implements IFoo { b = new Bar(); }\n",
		);
		let loaded: Vec<&str> = f
			.loads
			.iter()
			.map(|&s| f.specs[s as usize].specifier.as_str())
			.collect();
		assert_eq!(loaded, vec!["./bar.js", "./side.js"]);
		assert_eq!(
			f.decls[1].refs,
			vec![Ref::Import {
				binding: 1,
				member: None
			}]
		);
		assert!(!f.decls[1].pinned);
	}

	#[test]
	fn load_time_effects_pin_declarations() {
		let f = analyze(
			"a.ts",
			"export const color = registerColor('x');\nexport const label = localize('a', 'b');\nexport const fn = () => register();\nclass S { constructor(@IFoo foo: IFoo) {} @memoize() get x() { return 1; } }\n",
		);
		let pinned: Vec<(&str, bool)> = ["color", "label", "fn", "S"]
			.iter()
			.map(|k| (*k, find(&f, k).1.pinned))
			.collect();
		assert_eq!(
			pinned,
			vec![
				("color", true),
				("label", false),
				("fn", false),
				("S", false)
			]
		);
	}

	#[test]
	fn enum_and_object_members_are_separate_declarations() {
		let a = analyze(
			"a.ts",
			"export enum Config { A = 'a', B = 'b' }\nexport const Keys = { x: 1, y: 2 } as const;\nexport function f() { return Config.A + Keys.y; }\nexport function g() { return Object.keys(Keys); }\n",
		);
		let b = analyze(
			"a.ts",
			"export enum Config { A = 'a', B = 'b', C = 'c' }\nexport const Keys = { x: 1, y: 2, z: 3 } as const;\nexport function f() { return Config.A + Keys.y; }\nexport function g() { return Object.keys(Keys); }\n",
		);
		let keys = |f: &FileFacts| {
			f.decls
				.iter()
				.map(|d| d.key.clone())
				.filter(|k| !k.starts_with("<export>"))
				.collect::<Vec<_>>()
		};
		assert_eq!(
			keys(&a),
			vec![
				"<init>", "Config", "Config.A", "Config.B", "Keys", "Keys.x", "Keys.y", "f", "g"
			]
		);
		assert_eq!(
			find(&a, "f").1.refs,
			vec![
				Ref::Local(find(&a, "Config.A").0),
				Ref::Local(find(&a, "Keys.y").0)
			]
		);
		// Adding members changes the parents (for opaque users like `g`), not the existing members.
		assert_eq!(find(&a, "Config.A").1.hash, find(&b, "Config.A").1.hash);
		assert_eq!(find(&a, "Keys.y").1.hash, find(&b, "Keys.y").1.hash);
		assert_ne!(find(&a, "Keys").1.hash, find(&b, "Keys").1.hash);
	}

	#[test]
	fn implicit_enum_values_depend_on_previous_members() {
		let a = analyze("a.ts", "export enum E { A, B, C }\n");
		let b = analyze("a.ts", "export enum E { X, A, B, C }\n");
		assert_ne!(find(&a, "E.B").1.hash, find(&b, "E.B").1.hash);
	}

	#[test]
	fn namespace_members_are_separate_declarations() {
		let a = analyze(
			"a.ts",
			"export namespace Token { export const None = 1; export function is(x: unknown) { return x === None; } }\nexport function f() { return Token.is(2); }\n",
		);
		let b = analyze(
			"a.ts",
			"export namespace Token { export const None = 1; export function is(x: unknown) { return x === None; } export function from() { return 3; } }\nexport function f() { return Token.is(2); }\n",
		);
		assert_eq!(
			find(&a, "f").1.refs,
			vec![Ref::Local(find(&a, "Token.is").0)]
		);
		assert_eq!(
			find(&a, "Token.is").1.refs,
			vec![Ref::Local(find(&a, "Token.None").0)]
		);
		assert_eq!(find(&a, "Token.is").1.hash, find(&b, "Token.is").1.hash);
	}

	#[test]
	fn class_methods_are_gated_by_name() {
		let a = analyze(
			"a.ts",
			"export class Service { constructor() { this.x = 1; } send() { return helper(); } static create() { return new Service(); } }\nfunction helper() { return 1; }\nexport function use(s: Service) { return s.send(); }\n",
		);
		let send = find(&a, "Service.prototype.send").1;
		assert_eq!(send.gate, name_id("send"));
		assert_eq!(send.refs, vec![Ref::Local(find(&a, "helper").0)]);
		assert_eq!(find(&a, "Service.create").1.gate, 0);
		assert!(find(&a, "use").1.uses.contains(&name_id("send")));
		assert_eq!(
			find(&a, "Service")
				.1
				.members
				.iter()
				.map(|(n, _)| n.to_string())
				.collect::<Vec<_>>(),
			vec!["create"]
		);
	}

	#[test]
	fn global_effects_and_injected_globals() {
		let pure = analyze(
			"a.ts",
			"let isWindows = false;\nif (typeof process === 'object') { isWindows = process.platform === 'win32'; }\nexport { isWindows };\n",
		);
		assert!(!pure.global_effects);
		let registers = analyze(
			"a.ts",
			"import { register } from './r.js';\nregister('x');\n",
		);
		assert!(registers.global_effects);
		let product = analyze(
			"a.ts",
			"export const product = globalThis._PRODUCT;\nexport const other = globalThis._OTHER;\n",
		);
		assert_eq!(
			(&product.decls[1].refs, &product.decls[2].refs),
			(&vec![Ref::Global("_PRODUCT".into())], &vec![])
		);
	}

	#[test]
	fn load_time_calls_of_local_functions_depend_on_their_effects() {
		let pure = analyze(
			"a.ts",
			"function lang() { return globalThis._LANGUAGE; }\nconst isPseudo = lang() === 'pseudo';\nexport function f() { return isPseudo; }\n",
		);
		assert!(!pure.global_effects);
		let registers = analyze(
			"a.ts",
			"import { registry } from './r.js';\nfunction setup() { registry.add(1); }\nfunction init() { setup(); }\ninit();\n",
		);
		assert!(registers.global_effects);
	}

	#[test]
	fn callbacks_of_load_time_calls_run_at_load() {
		let f = analyze(
			"a.ts",
			"import { registry } from './r.js';\nexport const ids = ['a', 'b'].map(id => registry.add(id));\n",
		);
		assert!(f.global_effects);
		assert!(find(&f, "ids").1.pinned);
		let pure = analyze(
			"a.ts",
			"export const generateUuid = (function () { return crypto.randomUUID.bind(crypto); })();\n",
		);
		assert!(!pure.global_effects);
	}

	#[test]
	fn configured_pure_calls_do_not_pin_declarations() {
		let f = analyze(
			"a.ts",
			"export const a = localize('a', 'b');\nexport const b = URI.parse('x');\nexport const c = translate('a', 'b');\nexport const D = URI.from({ x: 1, y: 2 });\n",
		);
		let pinned: Vec<(&str, bool)> = ["a", "b", "c"]
			.iter()
			.map(|k| (*k, find(&f, k).1.pinned))
			.collect();
		assert_eq!(pinned, vec![("a", false), ("b", false), ("c", true)]);
		assert_eq!(find(&f, "D").1.members.len(), 2);
	}

	#[test]
	fn import_list_changes_do_not_change_the_initializer() {
		let a = analyze(
			"a.ts",
			"import { x } from './x.js';\nexport function f() { return x; }\n",
		);
		let b = analyze(
			"a.ts",
			"import { x } from './x.js';\nimport { y } from './y.js';\nexport function f() { return x; }\nexport function g() { return y; }\n",
		);
		assert_eq!(a.decls[0].hash, b.decls[0].hash);
	}

	#[test]
	fn namespace_member_access_is_tracked() {
		let f = analyze(
			"a.ts",
			"import * as strings from './strings.js';\nexport function f(s: string) { return strings.trim(s); }\n",
		);
		assert_eq!(
			f.decls[1].refs,
			vec![Ref::Import {
				binding: 0,
				member: Some("trim".into())
			}]
		);
	}

	#[test]
	fn members_with_the_same_name_have_distinct_keys() {
		let f = analyze(
			"a.ts",
			"export class P {\n\tequals(o) { return P.equals(this, o); }\n\tstatic equals(a, b) { return a === b; }\n\tget x() { return 1; }\n\tset x(v) { }\n}\n",
		);
		let keys: Vec<&str> = f
			.decls
			.iter()
			.map(|d| d.key.as_str())
			.filter(|k| k.starts_with("P."))
			.collect();
		assert_eq!(
			keys,
			vec![
				"P.prototype.equals",
				"P.equals",
				"P.prototype.x",
				"P.prototype.x#1"
			]
		);
	}

	#[test]
	fn this_in_static_and_object_members_depends_on_the_sibling_or_the_parent() {
		let f = analyze(
			"a.ts",
			"import { A } from './a.js';\nexport class E extends A {\n\tstatic run(c) { return this._inner(c); }\n\tstatic _inner(c) { return c.apply(); }\n\tstatic make() { return new this(); }\n\tstatic base() { return super.base(); }\n\tsend() { return this._inner(); }\n}\nexport const K = { a: 1, b() { return this.a; } };\n",
		);
		let refs = |key: &str| find(&f, key).1.refs.clone();
		let local = |key: &str| Ref::Local(find(&f, key).0);
		assert_eq!(
			(
				refs("E.run"),
				refs("E.make"),
				refs("E.base"),
				refs("E.prototype.send"),
				refs("K.b")
			),
			(
				vec![local("E._inner")],
				vec![local("E")],
				vec![local("E")],
				vec![],
				vec![local("K.a")]
			)
		);
	}
}
