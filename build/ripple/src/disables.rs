/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//! Proves that a change only disables tests, so that no check needs to run for it: a skipped test
//! cannot fail. A change only disables tests when it modifies existing test files (`disables` in
//! the configuration), and every edit is one of:
//!
//! - `.skip` inserted after the name of a `test`, `suite`, `it` or `describe` call, such as
//!   `test(` -> `test.skip(`, or after a name in `(isWindows ? test : test.skip)(`. The call must be
//!   a statement of its own, because Mocha's TDD `test.skip` returns `undefined`, and the name must
//!   be the test framework's: a global, or imported under its own name from a test framework.
//! - New `//` comment lines above such a call, indented like it: directly above it, or above the
//!   comment lines directly above it.
//! - A `//` comment appended to the line of such a call.
//!
//! The tokens of both versions must be the same apart from the inserted `.skip`s, and their lines
//! the same apart from these edits. Anything else needs the checks, and so does an edit that could
//! fail a check that a skipped test cannot fail:
//! - ESLint fails on unused disable directives, and some rules only check calls without `.skip`.
//! - Hygiene rejects most characters outside printable ASCII, and the formatter indents a comment
//!   like the line below it.
//! - Directives such as `// @ts-expect-error` and `// eslint-disable-next-line` apply to the next
//!   line, so a new comment line must not separate one from its line.

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use anyhow::Result;
use oxc_allocator::Allocator;
use oxc_ast::{AstKind, ast::*};
use oxc_parser::{Kind, Parser, ParserReturn, config::TokensParserConfig};
use oxc_semantic::{AstNodes, NodeId, Scoping, SemanticBuilder, SymbolId};
use oxc_span::{GetSpan, SourceType};

use crate::config::Config;
use crate::engine::ReadBlob;
use crate::git::RawChange;

/// A test or suite that a change disables.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Disabled {
	pub path: String,
	/// The 1-based line of the call.
	pub line: usize,
	/// The callee, such as `test.skip`.
	pub call: String,
	pub title: String,
}

/// The tests that a change disables when it only disables tests, or why it needs the checks.
pub type Verdict = std::result::Result<Vec<Disabled>, String>;

/// Enough for disabling tests, and it keeps reading the files cheap.
const MAX_FILES: usize = 20;
/// The functions whose `.skip` registers a skipped test or suite in Mocha, Vitest, Playwright and
/// `node:test`.
const REGISTRATIONS: [&str; 4] = ["test", "suite", "it", "describe"];
/// Modules whose exports of the registrations have a `.skip` that takes the same arguments.
const FRAMEWORK_MODULES: [&str; 4] = ["mocha", "vitest", "@playwright/test", "node:test"];
const SCRIPT_EXTENSIONS: [&str; 8] = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
/// Regular files: symbolic links and submodules have other modes.
const REGULAR_FILE_MODES: [&str; 2] = ["100644", "100755"];
/// Globals through which code could replace the test framework's functions.
const GLOBAL_OBJECTS: [&str; 4] = ["globalThis", "global", "window", "self"];

/// Whether `changes` only disable tests, reading the changed files with `read`.
pub fn verify(config: &Config, changes: &[RawChange], read: &mut ReadBlob) -> Result<Verdict> {
	if let Some(reason) = check_files(config, changes) {
		return Ok(Err(reason));
	}
	let mut disabled = Vec::new();
	for c in changes {
		// check_files only accepts modifications, which have both versions.
		let (Some(old), Some(new)) = (&c.old, &c.new) else {
			unreachable!()
		};
		match verify_file(config, &c.path, &read(old)?, &read(new)?) {
			Ok(tests) => disabled.extend(tests),
			Err(reason) => return Ok(Err(format!("{}: {reason}", c.path))),
		}
	}
	Ok(Ok(disabled))
}

/// Checks the changed files without reading them: at most `MAX_FILES` modified regular files that
/// the configuration lists as test files. Returns why the change needs the checks.
fn check_files(config: &Config, changes: &[RawChange]) -> Option<String> {
	if changes.is_empty() {
		return Some("changes no files".into());
	}
	if changes.len() > MAX_FILES {
		return Some(format!("changes {} files", changes.len()));
	}
	changes.iter().find_map(|c| {
		if c.status != 'M' || c.old.is_none() || c.new.is_none() {
			Some(format!(
				"{}: only modifications are allowed (git status {})",
				c.path, c.status
			))
		} else if c.old_mode != c.new_mode || !REGULAR_FILE_MODES.contains(&c.new_mode.as_str()) {
			Some(format!(
				"{}: changes the mode or is not a regular file",
				c.path
			))
		} else if !SCRIPT_EXTENSIONS.iter().any(|e| c.path.ends_with(e))
			|| !config.is_disable_file(&c.path)
		{
			Some(format!("{}: not a test file", c.path))
		} else {
			None
		}
	})
}

/// A line that inserts `.skip`s and may append a comment.
struct SkipLine {
	/// The columns of the `.` of each inserted `.skip`.
	columns: Vec<usize>,
	/// The column where the whitespace before an appended `//` comment starts.
	comment: Option<usize>,
}

/// A token's kind and position, without the source it belongs to.
#[derive(Clone, Copy)]
struct Tok {
	kind: Kind,
	start: usize,
	end: usize,
}

/// Verifies that `after` only disables tests of `before`: the tests it disables, or why it does more.
pub fn verify_file(config: &Config, path: &str, before: &str, after: &str) -> Verdict {
	// Lines are split at \n only, while JavaScript also breaks lines at these.
	let separators = ['\r', '\u{2028}', '\u{2029}'];
	if before.contains(separators) || after.contains(separators) {
		return Err("contains carriage returns or Unicode line separators".into());
	}
	let lines: Vec<&str> = after.split('\n').collect();
	let (skip_lines, comment_lines) =
		align_lines(config, &before.split('\n').collect::<Vec<_>>(), &lines)?;
	if skip_lines.is_empty() {
		return Err("adds no '.skip'".into());
	}

	let source_type = SourceType::from_path(path).map_err(|_| "is not a script".to_owned())?;
	let (before_allocator, after_allocator) = (Allocator::default(), Allocator::default());
	let before_ret = parse(&before_allocator, before, source_type);
	let after_ret = parse(&after_allocator, after, source_type);
	if !parses(&before_ret) || !parses(&after_ret) {
		return Err("does not parse".into());
	}

	let mut line_starts = vec![0];
	for line in &lines {
		line_starts.push(line_starts[line_starts.len() - 1] + line.len() + 1);
	}
	let line_of = |position: usize| line_starts.partition_point(|&s| s <= position) - 1;
	// Where the `.` of each inserted `.skip` is.
	let starts = &line_starts;
	let insertions: BTreeSet<usize> = skip_lines
		.iter()
		.flat_map(|(&line, skip)| skip.columns.iter().map(move |&c| starts[line] + c))
		.collect();
	// The code must be the same apart from the inserted `.skip`s; only comments and whitespace may differ.
	let after_tokens = tokens(&after_ret);
	if !same_tokens(
		&tokens(&before_ret),
		before,
		&after_tokens,
		after,
		&insertions,
	) {
		return Err("changes code other than inserting '.skip'".into());
	}

	let semantic = SemanticBuilder::new()
		.with_build_nodes(true)
		.build(&after_ret.program)
		.semantic;
	let nodes = semantic.nodes();
	let mut skip_accesses: HashMap<usize, NodeId> = HashMap::new();
	for node in nodes.iter() {
		match node.kind() {
			AstKind::WithStatement(_) => return Err("uses a 'with' statement".into()),
			AstKind::StaticMemberExpression(m) => {
				if let Expression::Identifier(object) = &m.object {
					let (object, property) = (object.name.as_str(), m.property.name.as_str());
					if property == "skip" && !m.optional {
						skip_accesses.insert(m.object.span().end as usize, node.id());
					} else if GLOBAL_OBJECTS.contains(&object) && REGISTRATIONS.contains(&property)
					{
						return Err(format!("accesses '{object}.{property}'"));
					}
				}
			}
			AstKind::ComputedMemberExpression(m) => {
				if let Expression::Identifier(object) = &m.object
					&& GLOBAL_OBJECTS.contains(&object.name.as_str())
				{
					return Err(format!("accesses '{}[...]'", object.name.as_str()));
				}
			}
			_ => {}
		}
	}

	// The calls that the insertions skip, in source order, each once.
	let mut calls: Vec<(NodeId, NodeId, &str)> = Vec::new();
	for &position in &insertions {
		let line = line_of(position) + 1;
		let Some(&access) = skip_accesses.get(&position) else {
			return Err(format!(
				"line {line}: '.skip' does not follow the name of a call"
			));
		};
		let (call, statement, name) =
			find_registration(nodes, access).map_err(|reason| format!("line {line}: {reason}"))?;
		if let Some(binding) = find_binding(&after_ret.program, semantic.scoping(), name) {
			return Err(format!(
				"line {line}: '{name}' is not the test framework's ({binding})"
			));
		}
		if !calls.iter().any(|(c, ..)| *c == call) {
			calls.push((call, statement, name));
		}
	}

	// ESLint reports unused disable directives, and a rule that only checks calls without `.skip`
	// stops reporting what a directive near the call disables.
	let block_disable = after.match_indices("eslint-disable").any(|(i, d)| {
		let rest = &after[i + d.len()..];
		!rest.starts_with("-line") && !rest.starts_with("-next-line")
	});
	if block_disable {
		return Err("has an 'eslint-disable' comment that applies to more than one line".into());
	}

	let line_comments: HashSet<usize> = after_ret
		.program
		.comments
		.iter()
		.filter(|c| c.is_line())
		.map(|c| c.span.start as usize)
		.collect();
	let mut skipped = Vec::new();
	let mut attached = BTreeSet::new();
	for (call, statement, name) in calls {
		let span = nodes.kind(statement).span();
		let (start, end) = (span.start as usize, span.end as usize);
		let line = line_of(start);
		if line > 0 && has_next_line_directive(config, lines[line - 1]) {
			return Err(format!(
				"line {line}: a directive may apply to the call on the next line"
			));
		}
		if after[line_starts[line]..end].contains("eslint-disable") {
			return Err(format!(
				"line {}: an ESLint directive applies to the call or its body",
				line + 1
			));
		}
		// Comments may be added above a call that starts its line, and above the comment lines
		// directly above it.
		let indentation = &after[line_starts[line]..start];
		if indentation.bytes().all(|c| c == b'\t') {
			let mut first = line;
			while first > 0 && lines[first - 1].trim_start_matches('\t').starts_with("//") {
				first -= 1;
			}
			for k in (first..line).filter(|k| comment_lines.contains(k)) {
				// The formatter indents a comment like the code on the next line.
				let indented = lines[k]
					.strip_prefix(indentation)
					.is_some_and(|rest| rest.starts_with("//"));
				if !indented || !line_comments.contains(&(line_starts[k] + indentation.len())) {
					return Err(format!(
						"line {}: the comment must be indented like the call on line {}",
						k + 1,
						line + 1
					));
				}
				attached.insert(k);
			}
		}
		let AstKind::CallExpression(c) = nodes.kind(call) else {
			unreachable!()
		};
		skipped.push(Disabled {
			path: path.to_owned(),
			line: line + 1,
			call: if matches!(c.callee, Expression::ParenthesizedExpression(_)) {
				format!("(... ? {name}.skip : ...)")
			} else {
				format!("{name}.skip")
			},
			title: title(c, after),
		});
	}

	for &k in &comment_lines {
		if !attached.contains(&k) {
			return Err(format!(
				"line {}: comments can only be added above a skipped call",
				k + 1
			));
		}
		// An added line moves the next line of a directive above it.
		if k > 0
			&& !comment_lines.contains(&(k - 1))
			&& has_next_line_directive(config, lines[k - 1])
		{
			return Err(format!(
				"line {}: the comment would move a directive away from its line",
				k + 1
			));
		}
	}

	for (&line, skip) in &skip_lines {
		if let Some(column) = skip.comment {
			// The comment must follow the last code on the line, not extend a comment or a string.
			let end = line_starts[line] + column;
			let next = after_tokens.partition_point(|t| t.start < end);
			let comment =
				end + lines[line][column..].len() - lines[line][column..].trim_start().len();
			if next == 0 || after_tokens[next - 1].end != end || !line_comments.contains(&comment) {
				return Err(format!(
					"line {}: a comment can only be appended after the code",
					line + 1
				));
			}
		}
	}

	Ok(skipped)
}

/// Pairs each line of `after` with the line of `before` that it keeps or edits. A line may insert
/// `.skip`s and append a comment, and a new line may be a comment. Returns why the lines change
/// otherwise.
fn align_lines(
	config: &Config,
	before: &[&str],
	after: &[&str],
) -> std::result::Result<(BTreeMap<usize, SkipLine>, BTreeSet<usize>), String> {
	let mut skip_lines = BTreeMap::new();
	let mut comment_lines = BTreeSet::new();
	let mut i = 0;
	for (j, line) in after.iter().enumerate() {
		if before.get(i) == Some(line) {
			i += 1;
		} else if let Some(skip) = before.get(i).and_then(|b| match_skip_line(config, b, line)) {
			skip_lines.insert(j, skip);
			i += 1;
		} else if line.trim_start_matches('\t').starts_with("//")
			&& is_safe_comment(config, line.trim_start_matches('\t'))
		{
			comment_lines.insert(j);
		} else {
			return Err(format!(
				"line {}: changes more than inserting '.skip' or comments",
				j + 1
			));
		}
	}
	if i < before.len() {
		return Err(format!("removes or changes line {}", i + 1));
	}
	Ok((skip_lines, comment_lines))
}

/// Matches `after` to `before` with `.skip`s inserted, and possibly a comment appended.
fn match_skip_line(config: &Config, before: &str, after: &str) -> Option<SkipLine> {
	if let Some(columns) = skip_insertions(before, after) {
		return Some(SkipLine {
			columns,
			comment: None,
		});
	}
	let bytes = after.as_bytes();
	for (k, _) in after.match_indices("//") {
		let mut start = k;
		while start > 0 && matches!(bytes[start - 1], b' ' | b'\t') {
			start -= 1;
		}
		if start == k || !is_safe_comment(config, &after[k..]) {
			continue;
		}
		if let Some(columns) = skip_insertions(before, &after[..start]) {
			return Some(SkipLine {
				columns,
				comment: Some(start),
			});
		}
	}
	None
}

/// The columns in `after` of the `.skip`s inserted after names that turn `before` into `after`.
fn skip_insertions(before: &str, after: &str) -> Option<Vec<usize>> {
	let (b, a) = (before.as_bytes(), after.as_bytes());
	let is_name = |c: u8| c.is_ascii_alphanumeric() || c == b'_' || c == b'$';
	let mut columns = Vec::new();
	let (mut i, mut j) = (0, 0);
	while j < a.len() {
		if b.get(i) == Some(&a[j]) {
			i += 1;
			j += 1;
		} else if a[j..].starts_with(b".skip")
			&& j > 0 && is_name(a[j - 1])
			&& !b.get(i).is_some_and(|&c| is_name(c))
		{
			columns.push(j);
			j += ".skip".len();
		} else {
			return None;
		}
	}
	(i == b.len() && !columns.is_empty()).then_some(columns)
}

/// Whether a `//` comment can be added: plain text in characters that hygiene accepts, without
/// trailing whitespace, and nothing that a tool reads as a directive.
fn is_safe_comment(config: &Config, comment: &str) -> bool {
	let Some(text) = comment.strip_prefix("//") else {
		return false;
	};
	let plain = text.is_empty()
		|| text.strip_prefix(' ').is_some_and(|t| {
			t.starts_with(|c: char| !c.is_whitespace()) && !t.ends_with(char::is_whitespace)
		});
	plain
		&& text
			.chars()
			.all(|c| (' '..='~').contains(&c) || config.comment_characters.contains(&c))
		&& !is_directive(config, text)
}

/// Whether comment text is, or contains, something that TypeScript, ESLint, coverage tools,
/// formatters or the repository's tools (`directives` in the configuration) read.
fn is_directive(config: &Config, text: &str) -> bool {
	let lower = text.to_lowercase();
	let start = lower.trim_start();
	let word = |w: &str| {
		start
			.strip_prefix(w)
			.is_some_and(|rest| !rest.starts_with(|c: char| c.is_alphanumeric() || c == '_'))
	};
	["@", "#", "/", "<"].iter().any(|p| start.starts_with(p))
		|| ["eslint", "tslint", "istanbul", "c8", "v8", "prettier"]
			.iter()
			.any(|w| word(w))
		|| ["eslint-", "@ts-", "/*", "*/"]
			.iter()
			.any(|p| lower.contains(p))
		|| config.directives.iter().any(|d| lower.contains(d.as_str()))
}

/// Whether a line may hold a directive that applies to the next line.
fn has_next_line_directive(config: &Config, line: &str) -> bool {
	let lower = line.to_lowercase();
	[
		"@ts-",
		"eslint",
		"tslint",
		"next-line",
		"prettier-ignore",
		"istanbul",
		"c8 ignore",
		"v8 ignore",
	]
	.iter()
	.any(|p| lower.contains(p))
		|| config.directives.iter().any(|d| lower.contains(d.as_str()))
}

fn parse<'a>(
	allocator: &'a Allocator,
	source: &'a str,
	source_type: SourceType,
) -> ParserReturn<'a> {
	Parser::new(allocator, source, source_type)
		.with_config(TokensParserConfig)
		.parse()
}

fn parses(ret: &ParserReturn) -> bool {
	!ret.fatal_error && !ret.diagnostics.has_errors()
}

/// The tokens of a file. Comments and whitespace are not tokens.
fn tokens(ret: &ParserReturn) -> Vec<Tok> {
	ret.tokens
		.iter()
		.filter(|t| t.end() > t.start())
		.map(|t| Tok {
			kind: t.kind(),
			start: t.start() as usize,
			end: t.end() as usize,
		})
		.collect()
}

/// Whether the tokens are the same apart from a `.` and a `skip` at each insertion.
fn same_tokens(
	before: &[Tok],
	before_source: &str,
	after: &[Tok],
	after_source: &str,
	insertions: &BTreeSet<usize>,
) -> bool {
	let mut expected = before.iter();
	let mut inserted = 0;
	let mut actual = after.iter();
	while let Some(t) = actual.next() {
		if insertions.contains(&t.start) {
			let name = actual.next();
			if t.kind != Kind::Dot
				|| !name
					.is_some_and(|n| n.start == t.end && &after_source[n.start..n.end] == "skip")
			{
				return false;
			}
			inserted += 1;
			continue;
		}
		match expected.next() {
			Some(e)
				if e.kind == t.kind
					&& before_source[e.start..e.end] == after_source[t.start..t.end] => {}
			_ => return false,
		}
	}
	expected.next().is_none() && inserted == insertions.len()
}

/// The call that `name.skip` registers, its statement and `name`: `name.skip(...)`, or
/// `(condition ? name : name.skip)(...)` with `name` or `name.skip` in both branches. Returns why
/// there is none.
fn find_registration<'a>(
	nodes: &AstNodes<'a>,
	access: NodeId,
) -> std::result::Result<(NodeId, NodeId, &'a str), String> {
	let AstKind::StaticMemberExpression(m) = nodes.kind(access) else {
		unreachable!()
	};
	let Expression::Identifier(id) = &m.object else {
		unreachable!()
	};
	let name = id.name.as_str();
	if !REGISTRATIONS.contains(&name) {
		return Err(format!(
			"'{name}' is not one of {}",
			REGISTRATIONS.join(", ")
		));
	}
	let mut callee = access;
	if let AstKind::ConditionalExpression(c) = nodes.parent_kind(access)
		&& c.test.span() != m.span
	{
		let other = if c.consequent.span() == m.span {
			&c.alternate
		} else {
			&c.consequent
		};
		let other_name = match other {
			Expression::StaticMemberExpression(o) if o.property.name.as_str() == "skip" => {
				&o.object
			}
			_ => other,
		};
		let condition = nodes.parent_id(access);
		let parenthesized = matches!(
			nodes.parent_kind(condition),
			AstKind::ParenthesizedExpression(_)
		);
		if !matches!(other_name, Expression::Identifier(o) if o.name.as_str() == name)
			|| !parenthesized
		{
			return Err(format!(
				"'{name}.skip' is in a condition other than '(condition ? {name} : {name}.skip)'"
			));
		}
		callee = nodes.parent_id(condition);
	}
	let call = nodes.parent_id(callee);
	let callee_span = nodes.kind(callee).span();
	match nodes.kind(call) {
		AstKind::CallExpression(c) if c.callee.span() == callee_span && !c.optional => {}
		_ => return Err(format!("'{name}.skip' is not called")),
	}
	// Mocha's TDD `test.skip` returns undefined, so a chained `.timeout()` would throw.
	let statement = nodes.parent_id(call);
	if !matches!(nodes.kind(statement), AstKind::ExpressionStatement(_)) {
		return Err(format!("the result of '{name}.skip(...)' is used"));
	}
	Ok((call, statement, name))
}

/// How the file binds `name` itself, unless it imports it under the same name from a test framework.
fn find_binding(program: &Program, scoping: &Scoping, name: &str) -> Option<String> {
	// The import bindings: the module and the imported name, if the import names one.
	let mut imports: HashMap<SymbolId, (String, Option<String>)> = HashMap::new();
	for statement in &program.body {
		if let Statement::ImportDeclaration(d) = statement
			&& let Some(specifiers) = &d.specifiers
		{
			let module = d.source.value.as_str().unwrap_or_default().to_owned();
			for s in specifiers {
				let (local, imported) = match s {
					ImportDeclarationSpecifier::ImportSpecifier(s) => {
						(&s.local, Some(s.imported.name().as_str().to_owned()))
					}
					ImportDeclarationSpecifier::ImportDefaultSpecifier(s) => (&s.local, None),
					ImportDeclarationSpecifier::ImportNamespaceSpecifier(s) => (&s.local, None),
				};
				if let Some(symbol) = local.symbol_id.get() {
					imports.insert(symbol, (module.clone(), imported));
				}
			}
		}
	}
	scoping
		.symbol_ids()
		.filter(|&s| scoping.symbol_name(s) == name)
		.find_map(|s| match imports.get(&s) {
			Some((module, Some(imported)))
				if imported == name && FRAMEWORK_MODULES.contains(&module.as_str()) =>
			{
				None
			}
			Some((module, _)) => Some(format!("imported from '{module}'")),
			None => Some("declared in the file".to_owned()),
		})
}

/// The title of a test or suite: its first argument.
fn title(call: &CallExpression, source: &str) -> String {
	match call.arguments.first() {
		None => String::new(),
		Some(Argument::StringLiteral(s)) => s.value.as_str().unwrap_or_default().to_owned(),
		Some(Argument::TemplateLiteral(t)) if t.expressions.is_empty() => t
			.quasis
			.first()
			.and_then(|q| q.value.cooked)
			.and_then(|c| c.as_str())
			.unwrap_or_default()
			.to_owned(),
		Some(a) => source[a.span().start as usize..a.span().end as usize].to_owned(),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::config::for_tests;

	const TEST_FILE: &str = "/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isWindows } from '../../../base/common/platform.js';

suite('Foo', () => {
	test('adds', () => {
		assert.strictEqual(1 + 1, 2);
	});

	// Explains the next test.
	test('formats', () => {
		const text = `
test('inside a template', () => { });
`;
		assert.ok(text);
	});

	(isWindows ? test : test.skip)('runs on Windows', () => { });

	test('times out', () => {
	}).timeout(1000);

	setup(() => { });
});

suite('Bar', () => {
	// eslint-disable-next-line local/code-no-test-async-suite
	suite('async', async () => { });

	test('casts', () => {
		// eslint-disable-next-line local/code-no-any-casts
		assert.ok((1 as any) === 1);
	});
});
";

	const SKIP_ADDS: (&str, &str) = ("\ttest('adds'", "\ttest.skip('adds'");

	/// Applies replacements to `text`, and fails when one does not apply.
	fn edit(text: &str, replacements: &[(&str, &str)]) -> String {
		let mut text = text.to_owned();
		for (search, replace) in replacements {
			assert!(text.contains(search), "missing: {search}");
			text = text.replacen(search, replace, 1);
		}
		text
	}

	fn check(before: &str, after: &str) -> std::result::Result<Vec<String>, String> {
		verify_file(
			for_tests(),
			"src/vs/foo/test/common/foo.test.ts",
			before,
			after,
		)
		.map(|tests| {
			tests
				.iter()
				.map(|t| format!("{}: {} '{}'", t.line, t.call, t.title))
				.collect()
		})
	}

	#[test]
	fn accepts_skips_and_comments_added_to_test_and_suite_calls_and_rejects_everything_else() {
		let local_test =
			format!("function test(name: string, fn: () => void) {{ fn(); }}\n{TEST_FILE}");
		let imported_test = format!("import {{ test }} from './utils';\n{TEST_FILE}");
		let global_test = format!("const original = globalThis['test'];\n{TEST_FILE}");
		let vitest = "import { describe, it } from 'vitest';\n\ndescribe('a', () => {\n\tit('b', () => { });\n});\n";
		let windows = TEST_FILE.replace('\n', "\r\n");
		let cases: Vec<(&str, String, &str)> = vec![
			("test.skip", edit(TEST_FILE, &[SKIP_ADDS]), TEST_FILE),
			(
				"suite.skip",
				edit(TEST_FILE, &[("suite('Foo'", "suite.skip('Foo'")]),
				TEST_FILE,
			),
			(
				"both branches of a condition",
				edit(
					TEST_FILE,
					&[(
						"(isWindows ? test : test.skip)",
						"(isWindows ? test.skip : test.skip)",
					)],
				),
				TEST_FILE,
			),
			(
				"two tests",
				edit(
					TEST_FILE,
					&[SKIP_ADDS, ("\ttest('formats'", "\ttest.skip('formats'")],
				),
				TEST_FILE,
			),
			(
				"comment above",
				edit(
					TEST_FILE,
					&[(
						"\ttest('adds'",
						"\t// Flaky: https://github.com/microsoft/vscode/issues/1\n\ttest.skip('adds'",
					)],
				),
				TEST_FILE,
			),
			(
				"comments above a comment",
				edit(
					TEST_FILE,
					&[
						(
							"\t// Explains",
							"\t// TODO@someone flaky\n\t//\n\t// Explains",
						),
						("\ttest('formats'", "\ttest.skip('formats'"),
					],
				),
				TEST_FILE,
			),
			(
				"comment appended",
				edit(
					TEST_FILE,
					&[(
						"\ttest('adds', () => {",
						"\ttest.skip('adds', () => { // Flaky \u{2014} https://github.com/microsoft/vscode/issues/1",
					)],
				),
				TEST_FILE,
			),
			("vitest", edit(vitest, &[("\tit(", "\tit.skip(")]), vitest),
			(
				"only adds comments",
				edit(TEST_FILE, &[("\ttest('adds'", "\t// Flaky\n\ttest('adds'")]),
				TEST_FILE,
			),
			(
				"un-skips",
				edit(
					TEST_FILE,
					&[(
						"(isWindows ? test : test.skip)",
						"(isWindows ? test : test)",
					)],
				),
				TEST_FILE,
			),
			(
				"adds a condition",
				edit(
					TEST_FILE,
					&[("\ttest('adds'", "\t(isWindows ? test.skip : test)('adds'")],
				),
				TEST_FILE,
			),
			(
				"changes an assertion",
				edit(TEST_FILE, &[SKIP_ADDS, ("1 + 1, 2", "1 + 1, 3")]),
				TEST_FILE,
			),
			(
				"changes whitespace",
				edit(
					TEST_FILE,
					&[SKIP_ADDS, ("assert.ok(text);", "assert.ok(text) ;")],
				),
				TEST_FILE,
			),
			(
				"adds this.skip()",
				edit(
					TEST_FILE,
					&[(
						"\ttest('adds', () => {",
						"\ttest('adds', function () {\n\t\tthis.skip();",
					)],
				),
				TEST_FILE,
			),
			(
				"removes a line",
				edit(
					TEST_FILE,
					&[SKIP_ADDS, ("\t// Explains the next test.\n", "")],
				),
				TEST_FILE,
			),
			(
				"removes the final newline",
				edit(TEST_FILE, &[SKIP_ADDS]).trim_end().to_owned(),
				TEST_FILE,
			),
			(
				"skips inside a template",
				edit(
					TEST_FILE,
					&[SKIP_ADDS, ("test('inside", "test.skip('inside")],
				),
				TEST_FILE,
			),
			(
				"adds a comment inside a template",
				edit(
					TEST_FILE,
					&[SKIP_ADDS, ("test('inside", "// note\ntest('inside")],
				),
				TEST_FILE,
			),
			(
				"skips a call whose result is used",
				edit(
					TEST_FILE,
					&[("\ttest('times out'", "\ttest.skip('times out'")],
				),
				TEST_FILE,
			),
			(
				"skips another call",
				edit(TEST_FILE, &[("\tsetup(", "\tsetup.skip(")]),
				TEST_FILE,
			),
			(
				"skips a call that a directive applies to",
				edit(TEST_FILE, &[("\tsuite('async'", "\tsuite.skip('async'")]),
				TEST_FILE,
			),
			(
				"skips a test with a directive in its body",
				edit(TEST_FILE, &[("\ttest('casts'", "\ttest.skip('casts'")]),
				TEST_FILE,
			),
			(
				"adds a comment below a directive",
				edit(
					TEST_FILE,
					&[("\tsuite('async'", "\t// Flaky\n\tsuite.skip('async'")],
				),
				TEST_FILE,
			),
			(
				"adds a directive",
				edit(
					TEST_FILE,
					&[("\ttest('adds'", "\t// @ts-expect-error\n\ttest.skip('adds'")],
				),
				TEST_FILE,
			),
			(
				"adds a repository directive",
				edit(
					TEST_FILE,
					&[(
						"\ttest('adds'",
						"\t// allow-any-unicode-next-line\n\ttest.skip('adds'",
					)],
				),
				TEST_FILE,
			),
			(
				"adds non-ASCII",
				edit(
					TEST_FILE,
					&[("\ttest('adds'", "\t// Fl\u{e4}ky\n\ttest.skip('adds'")],
				),
				TEST_FILE,
			),
			(
				"indents a comment differently",
				edit(
					TEST_FILE,
					&[("\ttest('adds'", "\t\t// Flaky\n\ttest.skip('adds'")],
				),
				TEST_FILE,
			),
			(
				"adds a comment elsewhere",
				edit(
					TEST_FILE,
					&[SKIP_ADDS, ("\tsetup(", "\t// Flaky\n\tsetup(")],
				),
				TEST_FILE,
			),
			(
				"appends a comment to another line",
				edit(
					TEST_FILE,
					&[SKIP_ADDS, ("1 + 1, 2);", "1 + 1, 2); // Flaky")],
				),
				TEST_FILE,
			),
			(
				"skips a local test function",
				edit(&local_test, &[SKIP_ADDS]),
				&local_test,
			),
			(
				"skips an imported test function",
				edit(&imported_test, &[SKIP_ADDS]),
				&imported_test,
			),
			(
				"accesses a global test function",
				edit(&global_test, &[SKIP_ADDS]),
				&global_test,
			),
			(
				"has carriage returns",
				edit(&windows, &[SKIP_ADDS]),
				&windows,
			),
		];
		let results: Vec<(&str, std::result::Result<Vec<String>, String>)> = cases
			.iter()
			.map(|(name, after, before)| (*name, check(before, after)))
			.collect();
		let ok = |tests: &[&str]| Ok(tests.iter().map(|t| t.to_string()).collect());
		let err = |reason: &str| Err(reason.to_owned());
		assert_eq!(
			results,
			vec![
				("test.skip", ok(&["10: test.skip 'adds'"])),
				("suite.skip", ok(&["9: suite.skip 'Foo'"])),
				(
					"both branches of a condition",
					ok(&["22: (... ? test.skip : ...) 'runs on Windows'"])
				),
				(
					"two tests",
					ok(&["10: test.skip 'adds'", "15: test.skip 'formats'"])
				),
				("comment above", ok(&["11: test.skip 'adds'"])),
				("comments above a comment", ok(&["17: test.skip 'formats'"])),
				("comment appended", ok(&["10: test.skip 'adds'"])),
				("vitest", ok(&["4: it.skip 'b'"])),
				("only adds comments", err("adds no '.skip'")),
				(
					"un-skips",
					err("line 22: changes more than inserting '.skip' or comments")
				),
				(
					"adds a condition",
					err("line 10: changes more than inserting '.skip' or comments")
				),
				(
					"changes an assertion",
					err("line 11: changes more than inserting '.skip' or comments")
				),
				(
					"changes whitespace",
					err("line 19: changes more than inserting '.skip' or comments")
				),
				(
					"adds this.skip()",
					err("line 10: changes more than inserting '.skip' or comments")
				),
				(
					"removes a line",
					err("line 14: changes more than inserting '.skip' or comments")
				),
				(
					"removes the final newline",
					err("removes or changes line 39")
				),
				(
					"skips inside a template",
					err("changes code other than inserting '.skip'")
				),
				(
					"adds a comment inside a template",
					err("changes code other than inserting '.skip'")
				),
				(
					"skips a call whose result is used",
					err("line 24: the result of 'test.skip(...)' is used")
				),
				(
					"skips another call",
					err("line 27: 'setup' is not one of test, suite, it, describe")
				),
				(
					"skips a call that a directive applies to",
					err("line 31: a directive may apply to the call on the next line")
				),
				(
					"skips a test with a directive in its body",
					err("line 34: an ESLint directive applies to the call or its body")
				),
				(
					"adds a comment below a directive",
					err("line 32: the comment would move a directive away from its line")
				),
				(
					"adds a directive",
					err("line 10: changes more than inserting '.skip' or comments")
				),
				(
					"adds a repository directive",
					err("line 10: changes more than inserting '.skip' or comments")
				),
				(
					"adds non-ASCII",
					err("line 10: changes more than inserting '.skip' or comments")
				),
				(
					"indents a comment differently",
					err("line 10: the comment must be indented like the call on line 11")
				),
				(
					"adds a comment elsewhere",
					err("line 27: comments can only be added above a skipped call")
				),
				(
					"appends a comment to another line",
					err("line 11: changes more than inserting '.skip' or comments")
				),
				(
					"skips a local test function",
					err("line 11: 'test' is not the test framework's (declared in the file)")
				),
				(
					"skips an imported test function",
					err("line 11: 'test' is not the test framework's (imported from './utils')")
				),
				(
					"accesses a global test function",
					err("accesses 'globalThis[...]'")
				),
				(
					"has carriage returns",
					err("contains carriage returns or Unicode line separators")
				),
			]
		);
	}

	#[test]
	fn accepts_only_modified_regular_test_files_outside_of_test_inputs() {
		let file = |path: &str, status: char, old_mode: &str, new_mode: &str| RawChange {
			path: path.to_owned(),
			old_mode: old_mode.to_owned(),
			new_mode: new_mode.to_owned(),
			old: (status != 'A').then(|| "1".to_owned()),
			new: (status != 'D').then(|| "2".to_owned()),
			status,
		};
		let modified = |path: &str| file(path, 'M', "100644", "100644");
		let cases: Vec<(&str, Vec<RawChange>)> = vec![
			(
				"test files",
				vec![
					modified("src/a/test/a.test.ts"),
					modified("extensions/b/src/b.spec.ts"),
					modified("test/c.test.js"),
				],
			),
			("no files", vec![]),
			(
				"21 files",
				(0..21)
					.map(|i| modified(&format!("src/a/test/a{i}.test.ts")))
					.collect(),
			),
			(
				"a source file",
				vec![modified("src/a/test/a.test.ts"), modified("src/a/a.ts")],
			),
			("a test helper", vec![modified("src/a/test/testUtils.ts")]),
			(
				"a test input",
				vec![modified("extensions/c/test/fixtures/a.test.ts")],
			),
			(
				"a test that is not a script",
				vec![modified("src/a/test/a.test.ts.snap")],
			),
			(
				"an added test",
				vec![file("src/a/test/a.test.ts", 'A', "000000", "100644")],
			),
			(
				"a deleted test",
				vec![file("src/a/test/a.test.ts", 'D', "100644", "000000")],
			),
			(
				"a mode change",
				vec![file("src/a/test/a.test.ts", 'M', "100644", "100755")],
			),
			(
				"a symbolic link",
				vec![file("src/a/test/a.test.ts", 'M', "120000", "120000")],
			),
		];
		let results: Vec<(&str, Option<String>)> = cases
			.iter()
			.map(|(name, changes)| (*name, check_files(for_tests(), changes)))
			.collect();
		let reason = |r: &str| Some(r.to_owned());
		assert_eq!(
			results,
			vec![
				("test files", None),
				("no files", reason("changes no files")),
				("21 files", reason("changes 21 files")),
				("a source file", reason("src/a/a.ts: not a test file")),
				(
					"a test helper",
					reason("src/a/test/testUtils.ts: not a test file")
				),
				(
					"a test input",
					reason("extensions/c/test/fixtures/a.test.ts: not a test file")
				),
				(
					"a test that is not a script",
					reason("src/a/test/a.test.ts.snap: not a test file")
				),
				(
					"an added test",
					reason("src/a/test/a.test.ts: only modifications are allowed (git status A)")
				),
				(
					"a deleted test",
					reason("src/a/test/a.test.ts: only modifications are allowed (git status D)")
				),
				(
					"a mode change",
					reason("src/a/test/a.test.ts: changes the mode or is not a regular file")
				),
				(
					"a symbolic link",
					reason("src/a/test/a.test.ts: changes the mode or is not a regular file")
				),
			]
		);
	}

	#[test]
	fn the_repository_lists_the_test_files_that_the_checks_run() {
		let config = Config::parse(include_str!("../vscode.jsonc")).unwrap();
		let files: Vec<(&str, bool)> = [
			"src/vs/base/test/common/strings.test.ts",
			"src/vs/platform/agentHost/test/node/e2e/providers/copilotAgentHostE2E.integrationTest.ts",
			"extensions/vscode-api-tests/src/singlefolder-tests/chat.test.ts",
			"extensions/copilot/src/extension/inlineChat/test/vscode-node/a.spec.tsx",
			"extensions/esbuild-common.test.mts",
			"test/smoke/src/areas/chat/chat.test.ts",
			"test/componentFixtures/playwright/tests/editorTabBar.spec.ts",
			"build/lib/test/hygiene.test.ts",
			// Inputs of the Copilot simulation tests.
			"extensions/copilot/test/simulation/fixtures/tests/another-unit-test/strings.test.ts",
			"src/vs/base/test/common/utils.ts",
		]
		.iter()
		.map(|p| (*p, config.is_disable_file(p)))
		.collect();
		assert_eq!(
			files
				.iter()
				.filter(|(_, test)| !test)
				.map(|(p, _)| *p)
				.collect::<Vec<_>>(),
			vec![
				"extensions/copilot/test/simulation/fixtures/tests/another-unit-test/strings.test.ts",
				"src/vs/base/test/common/utils.ts",
			]
		);
	}

	#[test]
	fn verifies_the_changes_between_two_commits() {
		let repo = std::env::temp_dir().join(format!("ripple-disables-{}", std::process::id()));
		let _ = std::fs::remove_dir_all(&repo);
		std::fs::create_dir_all(repo.join("src/a/test")).unwrap();
		let git = |args: &[&str]| {
			let mut all = vec![
				"-c",
				"user.name=t",
				"-c",
				"user.email=t@example.com",
				"-c",
				"commit.gpgsign=false",
			];
			all.extend_from_slice(args);
			crate::git::git(&repo, &all).unwrap()
		};
		git(&["init", "-q"]);
		let test = "src/a/test/a.test.ts";
		std::fs::write(repo.join(test), TEST_FILE).unwrap();
		std::fs::write(repo.join("README.md"), "a\n").unwrap();
		git(&["add", "-A"]);
		git(&["commit", "-q", "-m", "base"]);
		std::fs::write(repo.join(test), edit(TEST_FILE, &[SKIP_ADDS])).unwrap();
		git(&["commit", "-q", "-am", "skip"]);
		std::fs::write(repo.join("README.md"), "b\n").unwrap();
		git(&["commit", "-q", "-am", "readme"]);

		let verdict = |base: &str, head: &str| {
			let changes = crate::git::diff_tree_raw(&repo, base, head).unwrap();
			let mut read = crate::engine::blob_texts(&repo).unwrap();
			verify(for_tests(), &changes, &mut read).unwrap()
		};
		let results = (verdict("HEAD~2", "HEAD~1"), verdict("HEAD~2", "HEAD"));
		std::fs::remove_dir_all(&repo).unwrap();
		assert_eq!(
			results,
			(
				Ok(vec![Disabled {
					path: test.to_owned(),
					line: 10,
					call: "test.skip".to_owned(),
					title: "adds".to_owned(),
				}]),
				Err("README.md: not a test file".to_owned())
			)
		);
	}
}
