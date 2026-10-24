/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type ts from 'typescript';

/*
 * Proves that a pull request only disables tests, so that the pull request checks can skip the
 * test jobs and the other checks that such a change cannot affect. A pull request only disables
 * tests when it modifies existing test files, and every change is one of:
 *
 * - `.skip` inserted after the name of a `test`, `suite`, `it` or `describe` call, such as
 *   `test(` -> `test.skip(`, or after a name in `(isWindows ? test : test.skip)(`. The call must
 *   be a statement of its own, because Mocha's TDD `test.skip` returns `undefined`, and the name
 *   must be the test framework's: a global, or imported from a test framework module.
 * - New `//` comment lines above such a call, indented like it: directly above it, or above the
 *   comment lines directly above it.
 * - A `//` comment appended to the line of such a call.
 *
 * Any other change runs all checks, and so does a change that could fail a skipped check:
 * - ESLint fails on unused disable directives, and some rules only check calls without `.skip`.
 * - Hygiene rejects most non-ASCII characters, and the formatter indents comments like the next line.
 * - Directives such as `// @ts-expect-error` and `// eslint-disable-next-line` apply to the next line.
 * - Files with test names in folders of test inputs are data, not tests.
 *
 * The checks load this file from the pull request base, so a pull request cannot change how it
 * is judged; a pull request that changes this file runs all checks.
 */

type TypeScript = typeof ts;

/** Runs a git command in the repository and returns its output. */
type Git = (args: readonly string[]) => string;

interface IPullRequestFile {
	readonly filename: string;
	readonly status: string;
}

interface IListFilesParameters {
	readonly owner: string;
	readonly repo: string;
	readonly pull_number: number;
	readonly per_page: number;
}

interface IGitHub {
	readonly paginate: (method: object, parameters: IListFilesParameters) => Promise<readonly IPullRequestFile[]>;
	readonly rest: { readonly pulls: { readonly listFiles: object } };
}

interface IContext {
	readonly eventName: string;
	readonly sha: string;
	readonly repo: { readonly owner: string; readonly repo: string };
	readonly payload: {
		readonly pull_request?: {
			readonly number: number;
			readonly changed_files?: number;
			readonly head: { readonly sha: string };
		};
	};
}

interface ISummary {
	addRaw(text: string, addEOL?: boolean): ISummary;
	write(): Promise<unknown>;
}

interface ICore {
	info(message: string): void;
	notice(message: string): void;
	warning(message: string): void;
	setOutput(name: string, value: string): void;
	readonly summary: ISummary;
}

/** A file that a pull request changes, as `git diff-tree --raw` reports it. */
export interface IChangedFile {
	readonly path: string;
	readonly status: string;
	readonly oldMode: string;
	readonly newMode: string;
	readonly oldBlob: string;
	readonly newBlob: string;
}

/** A test or suite that a pull request skips. */
export interface ISkippedTest {
	readonly path: string;
	/** 1-based line of the call. */
	readonly line: number;
	/** The skipping callee, such as `test.skip`. */
	readonly call: string;
	readonly title: string;
}

export type Verdict =
	| { readonly testDisableOnly: true; readonly skipped: readonly ISkippedTest[] }
	| { readonly testDisableOnly: false; readonly reason: string };

const maxChangedFiles = 20;

/** Names whose `.skip` registers a skipped test or suite in Mocha, Vitest, Playwright and `node:test`. */
const registrations = new Set(['test', 'suite', 'it', 'describe']);

/** Modules whose exports of these names have a `.skip` that takes the same arguments. */
const testFrameworkModules = new Set(['mocha', 'vitest', '@playwright/test', 'node:test']);

const testFileName = /\.(test|spec|integrationTest)\.[cm]?[jt]sx?$/;

/** Regular files; symbolic links and submodules have other modes. */
const regularFileModes = new Set(['100644', '100755']);

/** Characters that hygiene allows: printable ASCII and a few typographic characters. */
const commentCharacters = /^[\x20-\x7e\u2014\u2026\u2190\u2192\u00b7\u2022\u00d7]*$/;

/** Comments that TypeScript, ESLint, hygiene, tsec or the telemetry tools read, and comment delimiters. */
const directiveComment = /^\s*(@|#|\/|<|eslint|tslint|tsec|istanbul|c8\b|v8\b|prettier)|eslint-|@ts-|allow-any-unicode|__GDPR__|\/\*|\*\//i;

/** Lines that may hold a directive that applies to the next line. */
const nextLineDirective = /@ts-|eslint|tslint|tsec|allow-any-unicode|next-line|prettier-ignore|istanbul|c8 ignore|v8 ignore/i;

const lineComment = /^\t*\/\//;

/**
 * Folders of test inputs, such as the files that the Copilot simulation tests read, which can
 * have test file names. `componentFixtures` holds tests.
 */
function isDataFolder(segment: string): boolean {
	return (segment !== 'componentFixtures' && /fixtures?$/i.test(segment))
		|| /^(__fixtures__|__snapshots__|snapshots?|testdata|test-data|corpus|scenarios?|test-scenario.*|test-?workspace\d*|test-new-workspace)$/i.test(segment);
}

/** Parses the output of `git diff-tree -r -z`. */
export function parseDiffTree(output: string): IChangedFile[] {
	const fields = output.split('\0');
	if (fields.at(-1) === '') {
		fields.pop();
	}
	if (fields.length % 2 !== 0) {
		throw new Error('Unexpected git diff-tree output');
	}
	const files: IChangedFile[] = [];
	for (let i = 0; i < fields.length; i += 2) {
		const match = /^:(?<oldMode>\d{6}) (?<newMode>\d{6}) (?<oldBlob>[0-9a-f]+) (?<newBlob>[0-9a-f]+) (?<status>[A-Z])\d*$/.exec(fields[i]);
		if (!match?.groups) {
			throw new Error(`Unexpected git diff-tree output: ${fields[i]}`);
		}
		const { oldMode, newMode, oldBlob, newBlob, status } = match.groups;
		files.push({ path: fields[i + 1], status, oldMode, newMode, oldBlob, newBlob });
	}
	return files;
}

/**
 * Checks the paths that a pull request changes: at most {@link maxChangedFiles} test files, none
 * of them test inputs. Returns the reason when the paths do not qualify.
 */
export function checkChangedPaths(paths: readonly string[]): string | undefined {
	if (paths.length === 0) {
		return 'changes no files';
	}
	if (paths.length > maxChangedFiles) {
		return `changes ${paths.length} files`;
	}
	for (const path of paths) {
		if (!testFileName.test(path)) {
			return `${path}: not a test file`;
		}
		if (path.split('/').slice(0, -1).some(isDataFolder)) {
			return `${path}: in a folder of test inputs`;
		}
	}
	return undefined;
}

/** Checks that the pull request only modifies regular test files. Returns the reason when it does more. */
export function checkChangedFiles(files: readonly IChangedFile[]): string | undefined {
	for (const file of files) {
		if (file.status !== 'M') {
			return `${file.path}: only modifications are allowed (git status ${file.status})`;
		}
		if (file.oldMode !== file.newMode || !regularFileModes.has(file.newMode)) {
			return `${file.path}: changes the mode or is not a regular file`;
		}
	}
	return checkChangedPaths(files.map(file => file.path));
}

/** Verifies the changed files, reading their contents with `readBlob`. */
export function verifyChanges(ts: TypeScript, files: readonly IChangedFile[], readBlob: (blob: string) => string): Verdict {
	const problem = checkChangedFiles(files);
	if (problem) {
		return { testDisableOnly: false, reason: problem };
	}
	const skipped: ISkippedTest[] = [];
	for (const file of files) {
		const result = verifyTestFileChange(ts, file.path, readBlob(file.oldBlob), readBlob(file.newBlob));
		if (typeof result === 'string') {
			return { testDisableOnly: false, reason: `${file.path}: ${result}` };
		}
		skipped.push(...result);
	}
	return { testDisableOnly: true, skipped };
}

interface ISkipLine {
	/** Columns of the inserted `.skip`s. */
	readonly columns: readonly number[];
	/** Column where the whitespace before an appended `//` comment starts. */
	readonly commentColumn?: number;
}

interface IToken {
	readonly kind: ts.SyntaxKind;
	readonly start: number;
	readonly end: number;
}

interface ISkipAccess {
	/** The `name.skip` expression. */
	readonly access: ts.PropertyAccessExpression;
	readonly name: string;
}

interface IRegistration {
	readonly call: ts.CallExpression;
	readonly statement: ts.ExpressionStatement;
	readonly name: string;
}

/**
 * Verifies that `after` only disables tests of `before`, and returns the skipped tests, or the
 * reason when it does more.
 */
export function verifyTestFileChange(ts: TypeScript, path: string, before: string, after: string): readonly ISkippedTest[] | string {
	// Lines are split at \n only; TypeScript also breaks lines at \r.
	if (before.includes('\r') || after.includes('\r')) {
		return 'contains carriage returns';
	}
	const lines = after.split('\n');
	const alignment = alignLines(before.split('\n'), lines);
	if (typeof alignment === 'string') {
		return alignment;
	}
	const { skipLines, commentLines } = alignment;
	if (skipLines.size === 0) {
		return 'adds no \'.skip\'';
	}
	if (hasSyntaxErrors(ts, path, after)) {
		return 'does not parse';
	}

	const lineStarts = [0];
	for (const line of lines) {
		lineStarts.push(lineStarts[lineStarts.length - 1] + line.length + 1);
	}
	const lineOf = (position: number) => {
		let low = 0;
		let high = lines.length - 1;
		while (low < high) {
			const middle = (low + high + 1) >> 1;
			if (lineStarts[middle] <= position) {
				low = middle;
			} else {
				high = middle - 1;
			}
		}
		return low;
	};

	const scriptKind = getScriptKind(ts, path);
	const beforeFile = ts.createSourceFile(path, before, ts.ScriptTarget.Latest, true, scriptKind);
	const afterFile = ts.createSourceFile(path, after, ts.ScriptTarget.Latest, true, scriptKind);
	const afterTokens = collectTokens(ts, afterFile);

	// Where the `.` of each inserted `.skip` is.
	const insertions = new Set<number>();
	for (const [line, { columns }] of skipLines) {
		for (const column of columns) {
			insertions.add(lineStarts[line] + column);
		}
	}
	// The code must be the same apart from the inserted `.skip`s; only comments and whitespace may differ.
	if (!hasSameTokens(ts, collectTokens(ts, beforeFile), before, afterTokens, after, insertions)) {
		return 'changes code other than inserting \'.skip\'';
	}

	const skipAccesses = new Map<number, ISkipAccess>();
	let unsupported: string | undefined;
	const visit = (node: ts.Node): void => {
		if (ts.isWithStatement(node)) {
			unsupported = 'uses a \'with\' statement';
		} else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && ts.isIdentifier(node.name)) {
			if (node.name.text === 'skip' && !node.questionDotToken) {
				skipAccesses.set(node.expression.end, { access: node, name: node.expression.text });
			} else if (registrations.has(node.name.text) && isGlobalObject(node.expression.text)) {
				unsupported = `accesses '${node.expression.text}.${node.name.text}'`;
			}
		} else if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression) && isGlobalObject(node.expression.text)) {
			unsupported = `accesses '${node.expression.text}[...]'`;
		}
		ts.forEachChild(node, visit);
	};
	visit(afterFile);
	if (unsupported) {
		return unsupported;
	}

	const calls = new Map<ts.CallExpression, IRegistration>();
	for (const position of [...insertions].sort((a, b) => a - b)) {
		const line = lineOf(position) + 1;
		const skipAccess = skipAccesses.get(position);
		if (!skipAccess) {
			return `line ${line}: '.skip' does not follow the name of a call`;
		}
		const registration = findRegistration(ts, skipAccess);
		if (typeof registration === 'string') {
			return `line ${line}: ${registration}`;
		}
		const binding = findBinding(ts, afterFile, registration.name);
		if (binding) {
			return `line ${line}: '${registration.name}' is not the test framework's (${binding})`;
		}
		calls.set(registration.call, registration);
	}

	// ESLint reports unused disable directives, and a rule that only checks calls without
	// `.skip` stops reporting the problems that a directive near the call disables.
	if (/eslint-disable(?!-line|-next-line)/.test(after)) {
		return 'has an \'eslint-disable\' comment that applies to more than one line';
	}

	const skipped: ISkippedTest[] = [];
	const attachedCommentLines = new Set<number>();
	for (const { call, statement, name } of calls.values()) {
		const start = statement.getStart(afterFile);
		const line = lineOf(start);
		if (line > 0 && nextLineDirective.test(lines[line - 1])) {
			return `line ${line}: a directive may apply to the call on the next line`;
		}
		if (after.slice(lineStarts[line], statement.end).includes('eslint-disable')) {
			return `line ${line + 1}: an ESLint directive applies to the call or its body`;
		}
		// Comments may be added above a call that starts its line, and above the comment lines directly above it.
		const indentation = after.slice(lineStarts[line], start);
		if (/^\t*$/.test(indentation)) {
			let firstLine = line;
			while (firstLine > 0 && lineComment.test(lines[firstLine - 1])) {
				firstLine--;
			}
			for (let commentLine = firstLine; commentLine < line; commentLine++) {
				if (commentLines.has(commentLine)) {
					// The formatter indents a comment like the code on the next line.
					if (!lines[commentLine].startsWith(`${indentation}//`)) {
						return `line ${commentLine + 1}: the comment must be indented like the call on line ${line + 1}`;
					}
					attachedCommentLines.add(commentLine);
				}
			}
		}
		skipped.push({ path, line: line + 1, call: callName(ts, call, name), title: titleOf(ts, call, afterFile) });
	}

	for (const commentLine of commentLines) {
		if (!attachedCommentLines.has(commentLine)) {
			return `line ${commentLine + 1}: comments can only be added above a skipped call`;
		}
		// An added line moves the next line of a directive above it.
		if (commentLine > 0 && !commentLines.has(commentLine - 1) && nextLineDirective.test(lines[commentLine - 1])) {
			return `line ${commentLine + 1}: the comment would move a directive away from its line`;
		}
	}

	for (const [line, { commentColumn }] of skipLines) {
		if (commentColumn !== undefined) {
			const end = lineStarts[line] + commentColumn;
			const next = afterTokens.findIndex(token => token.start >= end);
			const last = afterTokens[(next === -1 ? afterTokens.length : next) - 1];
			// The comment must follow the last code on the line, not extend a comment.
			if (!last || last.end !== end) {
				return `line ${line + 1}: a comment can only be appended after the code`;
			}
		}
	}

	return skipped.sort((a, b) => a.line - b.line);
}

function isGlobalObject(name: string): boolean {
	return name === 'globalThis' || name === 'global' || name === 'window' || name === 'self';
}

/**
 * Pairs each line of `after` with the line of `before` that it keeps or changes. Lines may
 * insert `.skip` and append a comment, and new lines may be comments. Returns the reason when
 * the lines change otherwise.
 */
function alignLines(before: readonly string[], after: readonly string[]): { readonly skipLines: Map<number, ISkipLine>; readonly commentLines: Set<number> } | string {
	const skipLines = new Map<number, ISkipLine>();
	const commentLines = new Set<number>();
	let i = 0;
	for (let j = 0; j < after.length; j++) {
		if (i < before.length && after[j] === before[i]) {
			i++;
			continue;
		}
		const skipLine = i < before.length ? matchSkipLine(before[i], after[j]) : undefined;
		if (skipLine) {
			skipLines.set(j, skipLine);
			i++;
		} else if (lineComment.test(after[j]) && isSafeComment(after[j].replace(/^\t*/, ''))) {
			commentLines.add(j);
		} else {
			return `line ${j + 1}: changes more than inserting '.skip' or comments`;
		}
	}
	if (i < before.length) {
		return `removes or changes line ${i + 1}`;
	}
	return { skipLines, commentLines };
}

/** Matches `after` to `before` with `.skip`s inserted and possibly a comment appended. */
function matchSkipLine(before: string, after: string): ISkipLine | undefined {
	const columns = skipInsertions(before, after);
	if (columns) {
		return { columns };
	}
	for (const match of after.matchAll(/[ \t]+\/\//g)) {
		const prefixColumns = skipInsertions(before, after.slice(0, match.index));
		if (prefixColumns && isSafeComment(after.slice(match.index).trimStart())) {
			return { columns: prefixColumns, commentColumn: match.index };
		}
	}
	return undefined;
}

/** Returns the columns in `after` at which `.skip`s are inserted after names to turn `before` into `after`. */
function skipInsertions(before: string, after: string): number[] | undefined {
	const columns: number[] = [];
	let i = 0;
	let j = 0;
	while (j < after.length) {
		if (i < before.length && before[i] === after[j]) {
			i++;
			j++;
		} else if (after.startsWith('.skip', j) && j > 0 && /[\w$]/.test(after[j - 1]) && !/[\w$]/.test(before[i] ?? '')) {
			columns.push(j);
			j += '.skip'.length;
		} else {
			return undefined;
		}
	}
	return i === before.length && columns.length > 0 ? columns : undefined;
}

/** Whether a `//` comment is safe to add: printable, not a directive and without trailing whitespace. */
function isSafeComment(comment: string): boolean {
	const text = /^\/\/(?<text>.*)$/.exec(comment)?.groups?.text;
	return text !== undefined
		&& (text === '' || /^ \S(.*\S)?$/.test(text))
		&& commentCharacters.test(text)
		&& !directiveComment.test(text);
}

function hasSyntaxErrors(ts: TypeScript, path: string, text: string): boolean {
	const { diagnostics } = ts.transpileModule(text, { fileName: path, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.Preserve } });
	return (diagnostics ?? []).some(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error);
}

function getScriptKind(ts: TypeScript, path: string): ts.ScriptKind {
	if (path.endsWith('.tsx')) {
		return ts.ScriptKind.TSX;
	}
	if (path.endsWith('.jsx')) {
		return ts.ScriptKind.JSX;
	}
	return /\.[cm]?js$/.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

/** The tokens of a file, without comments. */
function collectTokens(ts: TypeScript, sourceFile: ts.SourceFile): IToken[] {
	const tokens: IToken[] = [];
	const visit = (node: ts.Node): void => {
		if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) {
			return;
		}
		const children = node.getChildren(sourceFile);
		if (children.length === 0) {
			const start = node.getStart(sourceFile);
			if (node.end > start) {
				tokens.push({ kind: node.kind, start, end: node.end });
			}
			return;
		}
		children.forEach(visit);
	};
	visit(sourceFile);
	return tokens;
}

/** Whether the tokens are the same apart from a `.` and `skip` at each insertion. */
function hasSameTokens(ts: TypeScript, beforeTokens: readonly IToken[], before: string, afterTokens: readonly IToken[], after: string, insertions: ReadonlySet<number>): boolean {
	let b = 0;
	let inserted = 0;
	for (let a = 0; a < afterTokens.length; a++) {
		const token = afterTokens[a];
		if (insertions.has(token.start)) {
			const name = afterTokens[a + 1];
			if (token.kind !== ts.SyntaxKind.DotToken || !name || name.start !== token.end || after.slice(name.start, name.end) !== 'skip') {
				return false;
			}
			a++;
			inserted++;
			continue;
		}
		const expected = beforeTokens[b++];
		if (!expected || expected.kind !== token.kind || before.slice(expected.start, expected.end) !== after.slice(token.start, token.end)) {
			return false;
		}
	}
	return b === beforeTokens.length && inserted === insertions.size;
}

/**
 * Finds the call that `name.skip` registers: `name.skip(...)`, or `(condition ? name : name.skip)(...)`
 * with `name` or `name.skip` in both branches. Returns the reason when there is none.
 */
function findRegistration(ts: TypeScript, { access, name }: ISkipAccess): IRegistration | string {
	if (!registrations.has(name)) {
		return `'${name}' is not one of ${[...registrations].join(', ')}`;
	}
	let callee: ts.Expression = access;
	const parent = access.parent;
	if (ts.isConditionalExpression(parent) && parent.condition !== access) {
		const other = parent.whenTrue === access ? parent.whenFalse : parent.whenTrue;
		const otherName = ts.isPropertyAccessExpression(other) && ts.isIdentifier(other.name) && other.name.text === 'skip' ? other.expression : other;
		if (!ts.isIdentifier(otherName) || otherName.text !== name || !ts.isParenthesizedExpression(parent.parent)) {
			return `'${name}.skip' is in a condition other than '(condition ? ${name} : ${name}.skip)'`;
		}
		callee = parent.parent;
	}
	const call = callee.parent;
	if (!ts.isCallExpression(call) || call.expression !== callee || call.questionDotToken) {
		return `'${name}.skip' is not called`;
	}
	// Mocha's TDD `test.skip` returns undefined, so a chained `.timeout()` would throw.
	if (!ts.isExpressionStatement(call.parent)) {
		return `the result of '${name}.skip(...)' is used`;
	}
	return { call, statement: call.parent, name };
}

/** Describes how the file declares `name` itself, unless it imports it from a test framework module. */
function findBinding(ts: TypeScript, sourceFile: ts.SourceFile, name: string): string | undefined {
	let binding: string | undefined;
	const bindsName = (node: ts.BindingName): boolean => ts.isIdentifier(node)
		? node.text === name
		: node.elements.some(element => !ts.isOmittedExpression(element) && bindsName(element.name));
	const visit = (node: ts.Node): void => {
		if (binding) {
			return;
		}
		if (ts.isImportDeclaration(node)) {
			const module = ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : '';
			const clause = node.importClause;
			const bindings = clause?.namedBindings;
			if (clause?.name?.text === name || (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name)) {
				binding = `imported from '${module}'`;
			} else if (bindings && ts.isNamedImports(bindings)) {
				for (const element of bindings.elements) {
					if (element.name.text === name && ((element.propertyName ?? element.name).text !== name || !testFrameworkModules.has(module))) {
						binding = `imported from '${module}'`;
					}
				}
			}
			return;
		}
		if ((ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) && bindsName(node.name)) {
			binding = 'declared in the file';
		} else if ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node) || ts.isImportEqualsDeclaration(node))
			&& node.name && ts.isIdentifier(node.name) && node.name.text === name) {
			binding = 'declared in the file';
		}
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	return binding;
}

function callName(ts: TypeScript, call: ts.CallExpression, name: string): string {
	return ts.isParenthesizedExpression(call.expression) ? `(... ? ${name}.skip : ...)` : `${name}.skip`;
}

function titleOf(ts: TypeScript, call: ts.CallExpression, sourceFile: ts.SourceFile): string {
	const title = call.arguments[0];
	if (!title) {
		return '';
	}
	return ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title) ? title.text : title.getText(sourceFile);
}

async function detect({ git, github, loadTypeScript, context, core }: IDetectTestDisableOnlyOptions): Promise<Verdict> {
	const pullRequest = context.payload.pull_request;
	if (context.eventName !== 'pull_request' || !pullRequest) {
		return { testDisableOnly: false, reason: 'not a pull request' };
	}
	if ((pullRequest.changed_files ?? 0) > maxChangedFiles) {
		return { testDisableOnly: false, reason: `changes ${pullRequest.changed_files} files` };
	}

	// Most pull requests change other files, which their file list shows without fetching anything.
	const pullRequestFiles = await github.paginate(github.rest.pulls.listFiles, {
		owner: context.repo.owner,
		repo: context.repo.repo,
		pull_number: pullRequest.number,
		per_page: 100,
	});
	const pathProblem = checkChangedPaths(pullRequestFiles.map(file => file.filename))
		?? pullRequestFiles.filter(file => file.status !== 'modified').map(file => `${file.filename}: only modifications are allowed (${file.status})`)[0];
	if (pathProblem) {
		return { testDisableOnly: false, reason: pathProblem };
	}

	// The checks test the merge of the pull request into the base branch, so its changes to its
	// first parent are everything that the pull request changes.
	git(['fetch', '--no-tags', '--depth=2', '--filter=blob:none', 'origin', context.sha]);
	const [merge, ...parents] = git(['rev-list', '--parents', '-n', '1', context.sha]).trim().split(' ');
	if (parents.length !== 2 || parents[1] !== pullRequest.head.sha) {
		return { testDisableOnly: false, reason: `${context.sha} is not a merge of the pull request head ${pullRequest.head.sha}` };
	}
	const files = parseDiffTree(git(['diff-tree', '-r', '-z', '--no-renames', parents[0], merge]));
	const problem = checkChangedFiles(files);
	if (problem) {
		return { testDisableOnly: false, reason: problem };
	}

	core.info(`The pull request changes only test files: ${files.map(file => file.path).join(', ')}`);
	const ts = await loadTypeScript();
	return verifyChanges(ts, files, blob => git(['cat-file', 'blob', blob]));
}

function escapeTableCell(text: string): string {
	return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

export interface IDetectTestDisableOnlyOptions {
	readonly git: Git;
	readonly github: IGitHub;
	/** Loads TypeScript, which is only needed when the pull request changes nothing but test files. */
	readonly loadTypeScript: () => Promise<TypeScript>;
	readonly context: IContext;
	readonly core: ICore;
}

/**
 * Sets the `verified` output to `'true'` when the pull request only disables tests, and
 * otherwise to `'false'`, including when the detection fails.
 */
export async function detectTestDisableOnly(options: IDetectTestDisableOnlyOptions): Promise<void> {
	const { core } = options;
	let verdict: Verdict;
	try {
		verdict = await detect(options);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		core.warning(`Could not determine whether the pull request only disables tests, so all checks run. ${message}`);
		verdict = { testDisableOnly: false, reason: 'the detection failed' };
	}

	if (verdict.testDisableOnly) {
		const tests = verdict.skipped.map(test => `${test.path}:${test.line} ${test.call} '${test.title}'`);
		core.notice(`The pull request only disables tests, so the checks skip the tests: ${tests.join('; ')}`);
		try {
			await core.summary
				.addRaw('### Only disables tests\n\nThe pull request only disables these tests, so the checks skip the tests and the other checks that it cannot affect.\n\n')
				.addRaw('| Call | Title | Location |\n| --- | --- | --- |\n')
				.addRaw(verdict.skipped.map(test => `| \`${test.call}\` | ${escapeTableCell(test.title)} | ${escapeTableCell(`${test.path}:${test.line}`)} |`).join('\n'), true)
				.write();
		} catch (error) {
			core.warning(`Could not write the job summary: ${error instanceof Error ? error.message : String(error)}`);
		}
	} else {
		core.info(`All checks run: ${verdict.reason}`);
	}
	core.setOutput('verified', String(verdict.testDisableOnly));
}
