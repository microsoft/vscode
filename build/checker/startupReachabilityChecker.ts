/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import ts from 'typescript';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';

//
// #############################################################################################
//
// A custom typescript checker for the electron-main process that detects calls to a curated set
// of Electron APIs whose first invocation can surface an OS-level permission prompt or portal
// dialog (e.g. the ScreenCast portal on Wayland, the TCC stack on macOS). These APIs must only
// be invoked in response to an explicit user action — never on the synchronous startup path.
//
// The check builds a forward call graph over the electron-main TypeScript program, walks it
// from a set of boot entry points (module-level initialization in main.ts and its synchronous
// import closure), and reports any reachable invocation of a forbidden API. Callbacks passed to
// known user-gesture-triggered handlers (e.g. setDisplayMediaRequestHandler, ipcMain.handle) are
// treated as deferred and are not followed from boot.
//
// When a violation is found, the full reachability path is printed so the author can see exactly
// why their innocent-looking helper is considered startup-reachable.
//
// Make changes to FORBIDDEN_SINKS to add new APIs; to DEFERRED_CALLERS to widen what counts as a
// user-gesture-triggered callback; and to BOOT_ROOTS_FILES to expand the set of entry points.
//
// #############################################################################################
//

const REPO_ROOT = resolve(join(import.meta.dirname, '../../'));
const TS_CONFIG_PATH = join(REPO_ROOT, 'build/checker/tsconfig.electron-main.json');

//
// Entry points: every module-level statement in these files is treated as boot-reachable.
// The synchronous import closure of each of these files is also treated as boot-reachable so
// that intermediate registrations along the startup chain are followed. Dynamic `import(...)`
// calls do not extend the closure.
//
const BOOT_ROOTS_FILES = [
	'src/vs/code/electron-main/main.ts',
];

//
// Forbidden sinks. A call to any of these from a boot-reachable function is reported as a
// violation. Sinks are matched by the type name of the call receiver plus the method name, so
// that an aliased local (e.g. `const dc = desktopCapturer; dc.getSources(...)`) is still caught.
//
interface IForbiddenSink {
	readonly typeName: string;
	readonly method: string;
	readonly reason: string;
}

const FORBIDDEN_SINKS: readonly IForbiddenSink[] = [
	{
		typeName: 'DesktopCapturer',
		method: 'getSources',
		reason: 'desktopCapturer.getSources triggers the ScreenCast portal on Wayland and TCC prompts on macOS. It must only be invoked in response to an explicit user action (e.g. inside setDisplayMediaRequestHandler\'s callback).',
	},
	{
		typeName: 'SystemPreferences',
		method: 'askForMediaAccess',
		reason: 'systemPreferences.askForMediaAccess shows an OS permission prompt. It must only be invoked in response to an explicit user action.',
	},
	{
		typeName: 'SystemPreferences',
		method: 'promptTouchID',
		reason: 'systemPreferences.promptTouchID shows a TouchID dialog. It must only be invoked in response to an explicit user action.',
	},
	{
		typeName: 'App',
		method: 'moveToApplicationsFolder',
		reason: 'app.moveToApplicationsFolder shows a confirmation dialog on macOS. It must only be invoked in response to an explicit user action.',
	},
];

//
// Deferred callers. When a call to one of these methods is encountered, the callback passed at
// the specified argument index is NOT followed from boot — it is treated as user-gesture-only.
// If `eventNames` is provided, only the listed event values (matched against the first argument
// when it is a string literal) cause the callback to be skipped; this is how `app.on('ready',
// cb)` (a boot callback) is distinguished from `app.on('activate', cb)` (a deferred callback).
//
interface IDeferredCaller {
	readonly typeName: string;          // Receiver type name. '*' matches any receiver (for free functions).
	readonly method: string;
	readonly callbackArgIndex: number;
	// If present and the call's first argument is a string literal, the callback is deferred
	// only when the string does NOT appear in `bootEventNames`. If absent, the callback is
	// always deferred.
	readonly bootEventNames?: readonly string[];
}

const DEFERRED_CALLERS: readonly IDeferredCaller[] = [
	// Screen-share / permission / device picker handlers — run only on user-initiated requests.
	{ typeName: 'Session', method: 'setDisplayMediaRequestHandler', callbackArgIndex: 0 },
	{ typeName: 'Session', method: 'setPermissionRequestHandler', callbackArgIndex: 0 },
	{ typeName: 'Session', method: 'setPermissionCheckHandler', callbackArgIndex: 0 },
	{ typeName: 'Session', method: 'setDevicePermissionHandler', callbackArgIndex: 0 },
	{ typeName: 'Session', method: 'setBluetoothPairingHandler', callbackArgIndex: 0 },
	{ typeName: 'Session', method: 'setUSBProtectedClassesHandler', callbackArgIndex: 0 },

	// IPC handlers — run when a renderer sends a message.
	{ typeName: 'IpcMain', method: 'handle', callbackArgIndex: 1 },
	{ typeName: 'IpcMain', method: 'handleOnce', callbackArgIndex: 1 },
	{ typeName: 'IpcMain', method: 'on', callbackArgIndex: 1 },
	{ typeName: 'IpcMain', method: 'once', callbackArgIndex: 1 },
	// validatedIpcMain shares the same shape.
	{ typeName: 'ValidatedIpcMain', method: 'handle', callbackArgIndex: 1 },
	{ typeName: 'ValidatedIpcMain', method: 'handleOnce', callbackArgIndex: 1 },
	{ typeName: 'ValidatedIpcMain', method: 'on', callbackArgIndex: 1 },
	{ typeName: 'ValidatedIpcMain', method: 'once', callbackArgIndex: 1 },

	// Electron App.on — 'ready' / 'will-finish-launching' are boot, everything else is deferred.
	{ typeName: 'App', method: 'on', callbackArgIndex: 1, bootEventNames: ['ready', 'will-finish-launching'] },
	{ typeName: 'App', method: 'once', callbackArgIndex: 1, bootEventNames: ['ready', 'will-finish-launching'] },
	{ typeName: 'App', method: 'addListener', callbackArgIndex: 1, bootEventNames: ['ready', 'will-finish-launching'] },

	// Window / web-contents / screen / global-shortcut event registrations — user-driven.
	{ typeName: 'BrowserWindow', method: 'on', callbackArgIndex: 1 },
	{ typeName: 'BrowserWindow', method: 'once', callbackArgIndex: 1 },
	{ typeName: 'WebContents', method: 'on', callbackArgIndex: 1 },
	{ typeName: 'WebContents', method: 'once', callbackArgIndex: 1 },
	{ typeName: 'Screen', method: 'on', callbackArgIndex: 1 },
	{ typeName: 'Screen', method: 'once', callbackArgIndex: 1 },
	{ typeName: 'GlobalShortcut', method: 'register', callbackArgIndex: 1 },

	// Disposable patterns — cleanup callbacks only run on disposal.
	{ typeName: '*', method: 'toDisposable', callbackArgIndex: 0 },
];

//
// Patterns the checker treats as synchronous helpers — the callback IS followed from boot. These
// are common VS Code idioms that wrap a callback and immediately invoke it.
//
// `invokeFunction(accessor => ...)` runs the callback synchronously, so for boot reachability we
// must follow into it. Likewise for the DI factory patterns that ultimately construct the target
// class on the spot.
//
interface ISyncCallbackInvoker {
	readonly typeName: string;
	readonly method: string;
	readonly callbackArgIndex: number;
}

const SYNC_CALLBACK_INVOKERS: readonly ISyncCallbackInvoker[] = [
	{ typeName: 'InstantiationService', method: 'invokeFunction', callbackArgIndex: 0 },
	{ typeName: '*', method: 'invokeFunction', callbackArgIndex: 0 },
];

//
// Constructor-summoning helpers. When we encounter one of these, we treat the first argument
// as a class reference and route to its constructor.
//
interface IConstructorSummoner {
	readonly typeName: string;
	readonly method: string;
	readonly classArgIndex: number;
}

const CONSTRUCTOR_SUMMONERS: readonly IConstructorSummoner[] = [
	{ typeName: 'InstantiationService', method: 'createInstance', classArgIndex: 0 },
	{ typeName: '*', method: 'createInstance', classArgIndex: 0 },
	{ typeName: '*', method: 'createSyncDescriptor', classArgIndex: 0 },
];

//
// A callable unit in the graph. Either a real function-like declaration in source, or a
// synthetic module-init node representing all top-level statements in a source file.
//
type FunctionLike =
	| ts.FunctionDeclaration
	| ts.FunctionExpression
	| ts.ArrowFunction
	| ts.MethodDeclaration
	| ts.ConstructorDeclaration
	| ts.GetAccessorDeclaration
	| ts.SetAccessorDeclaration;

interface IModuleInitNode {
	readonly kind: 'moduleInit';
	readonly sourceFile: ts.SourceFile;
}

type Callable = FunctionLike | IModuleInitNode;

function isModuleInit(c: Callable): c is IModuleInitNode {
	return (c as IModuleInitNode).kind === 'moduleInit';
}

function callableKey(c: Callable): string {
	if (isModuleInit(c)) {
		return `module-init:${c.sourceFile.fileName}`;
	}
	return `${c.getSourceFile().fileName}:${c.pos}`;
}

function callableLabel(c: Callable): string {
	if (isModuleInit(c)) {
		return `<module init> ${formatLocation(c.sourceFile, 0)}`;
	}
	const sf = c.getSourceFile();
	const name = getFunctionLikeName(c);
	return `${name} ${formatLocation(sf, c.getStart())}`;
}

function formatLocation(sf: ts.SourceFile, pos: number): string {
	const { line, character } = sf.getLineAndCharacterOfPosition(pos);
	const rel = relative(REPO_ROOT, sf.fileName).replace(/\\/g, '/');
	return `${rel}:${line + 1}:${character + 1}`;
}

function getFunctionLikeName(fn: FunctionLike): string {
	// Prefer the declared name when present.
	if (ts.isConstructorDeclaration(fn)) {
		const parent = fn.parent;
		if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
			return `${parent.name?.text ?? '<anonymous>'}.constructor`;
		}
		return '<anonymous>.constructor';
	}
	if (ts.isMethodDeclaration(fn) || ts.isGetAccessor(fn) || ts.isSetAccessor(fn)) {
		const cls = fn.parent;
		const className = (ts.isClassDeclaration(cls) || ts.isClassExpression(cls)) ? (cls.name?.text ?? '<anonymous>') : '<anonymous>';
		const methodName = fn.name && ts.isIdentifier(fn.name) ? fn.name.text : '<computed>';
		const prefix = ts.isGetAccessor(fn) ? 'get ' : ts.isSetAccessor(fn) ? 'set ' : '';
		return `${className}.${prefix}${methodName}`;
	}
	if (ts.isFunctionDeclaration(fn) && fn.name) {
		return fn.name.text;
	}
	// Function expression assigned to a variable — surface the variable name when possible.
	let parent: ts.Node | undefined = fn.parent;
	if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
		return `${parent.name.text} (${ts.isArrowFunction(fn) ? 'arrow' : 'fn-expr'})`;
	}
	if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
		return `${parent.name.text} (${ts.isArrowFunction(fn) ? 'arrow' : 'fn-expr'})`;
	}
	if (parent && ts.isPropertyDeclaration(parent) && parent.name && ts.isIdentifier(parent.name)) {
		const cls = parent.parent;
		const className = (ts.isClassDeclaration(cls) || ts.isClassExpression(cls)) ? (cls.name?.text ?? '<anonymous>') : '<anonymous>';
		return `${className}.${parent.name.text} (field)`;
	}
	return ts.isArrowFunction(fn) ? '<arrow>' : '<fn-expr>';
}

//
// Resolve the type-name of the receiver expression of a method call. Used to match against
// FORBIDDEN_SINKS / DEFERRED_CALLERS / SYNC_CALLBACK_INVOKERS / CONSTRUCTOR_SUMMONERS.
//
function getReceiverTypeName(checker: ts.TypeChecker, callExpr: ts.CallExpression): string | undefined {
	if (!ts.isPropertyAccessExpression(callExpr.expression)) {
		return undefined;
	}
	const receiver = callExpr.expression.expression;
	const type = checker.getTypeAtLocation(receiver);
	const symbol = type.getSymbol() ?? type.aliasSymbol;
	if (symbol) {
		return symbol.getName();
	}
	// Fallback: try the apparent type (handles e.g. `session.defaultSession` whose type is an
	// interface declared via a property type alias).
	const apparent = checker.getApparentType(type);
	return apparent.getSymbol()?.getName();
}

function getCalledMethodName(callExpr: ts.CallExpression): string | undefined {
	if (ts.isPropertyAccessExpression(callExpr.expression) && ts.isIdentifier(callExpr.expression.name)) {
		return callExpr.expression.name.text;
	}
	if (ts.isIdentifier(callExpr.expression)) {
		return callExpr.expression.text;
	}
	return undefined;
}

function matchesTypeName(specType: string, actualType: string | undefined): boolean {
	if (specType === '*') {
		return true;
	}
	return specType === actualType;
}

function getFirstArgStringLiteral(call: ts.CallExpression): string | undefined {
	const arg = call.arguments[0];
	if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
		return arg.text;
	}
	return undefined;
}

//
// Resolve a callee CallExpression / NewExpression to a list of FunctionLike declarations the
// checker can follow from. Returns multiple entries for overloaded methods or constructors with
// multiple call signatures. Returns [] if the callee can't be resolved (indirect call, dynamic
// dispatch, external library, etc.).
//
function resolveCalleeFunctions(checker: ts.TypeChecker, call: ts.CallExpression | ts.NewExpression): FunctionLike[] {
	const signature = checker.getResolvedSignature(call);
	const decl = signature?.declaration;
	if (!decl) {
		return [];
	}
	if (isFunctionLikeNode(decl) && !isAmbient(decl)) {
		return [decl];
	}
	return [];
}

function isFunctionLikeNode(node: ts.Node): node is FunctionLike {
	return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) ||
		ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ||
		ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node);
}

//
// True for declarations sourced from a .d.ts file. Such declarations have no body to walk and
// represent calls into external libraries (electron, node stdlib, etc.). Skipping them keeps the
// visited set small and avoids spurious "no body" lookups.
//
function isAmbient(node: ts.Node): boolean {
	return node.getSourceFile().isDeclarationFile;
}

//
// For a class reference passed as an argument to createInstance / createSyncDescriptor, return
// the class declaration's constructor (or all constructor declarations for overloaded ctors).
//
function resolveClassConstructors(checker: ts.TypeChecker, classArg: ts.Expression): ts.ConstructorDeclaration[] {
	let symbol = checker.getSymbolAtLocation(classArg);
	if (!symbol) {
		return [];
	}
	// `createInstance(CodeApplication, ...)` — the identifier resolves to the import alias
	// symbol, whose declarations are the ImportSpecifier (not the class). Unwrap to the real
	// symbol via getAliasedSymbol when applicable.
	if (symbol.flags & ts.SymbolFlags.Alias) {
		symbol = checker.getAliasedSymbol(symbol);
	}
	const decls = symbol.getDeclarations() ?? [];
	const result: ts.ConstructorDeclaration[] = [];
	for (const decl of decls) {
		if (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) {
			for (const member of decl.members) {
				if (ts.isConstructorDeclaration(member) && member.body) {
					result.push(member);
				}
			}
		}
	}
	return result;
}

//
// Find every static (non-dynamic, non-type-only) import that resolves to another source file in
// the program, to compute the synchronous boot closure.
//
function getStaticImportTargets(checker: ts.TypeChecker, sf: ts.SourceFile): ts.SourceFile[] {
	const targets: ts.SourceFile[] = [];
	for (const stmt of sf.statements) {
		let moduleSpecifier: ts.Expression | undefined;
		if (ts.isImportDeclaration(stmt)) {
			if (stmt.importClause?.isTypeOnly) {
				continue;
			}
			moduleSpecifier = stmt.moduleSpecifier;
		} else if (ts.isExportDeclaration(stmt) && stmt.moduleSpecifier) {
			if (stmt.isTypeOnly) {
				continue;
			}
			moduleSpecifier = stmt.moduleSpecifier;
		} else if (ts.isImportEqualsDeclaration(stmt) && ts.isExternalModuleReference(stmt.moduleReference)) {
			if (stmt.isTypeOnly) {
				continue;
			}
			moduleSpecifier = stmt.moduleReference.expression;
		}
		if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) {
			continue;
		}
		const symbol = checker.getSymbolAtLocation(moduleSpecifier);
		if (!symbol) {
			continue;
		}
		const decls = symbol.getDeclarations() ?? [];
		for (const decl of decls) {
			if (ts.isSourceFile(decl)) {
				targets.push(decl);
			}
		}
	}
	return targets;
}

//
// The body of a Callable that should be walked when collecting call edges. For module-init,
// this is the whole source file (but the walker skips into nested function bodies). For a
// FunctionLike, this is its body (or its initializer for arrow functions, plus property
// initializer expressions for class fields).
//
function getCallableBody(c: Callable): ts.Node | undefined {
	if (isModuleInit(c)) {
		return c.sourceFile;
	}
	return c.body;
}

//
// Walk a callable's body, collecting every call/new expression that is lexically inside it
// but not inside a nested function body. The callback receives the call/new expression so the
// caller can resolve its target.
//
function forEachShallowCall(body: ts.Node, visit: (call: ts.CallExpression | ts.NewExpression) => void): void {
	function walk(node: ts.Node): void {
		if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
			visit(node);
		}
		ts.forEachChild(node, child => {
			if (isFunctionLikeNode(child)) {
				// Nested function literal — it is its own callable, walked separately.
				return;
			}
			walk(child);
		});
	}
	walk(body);
}

//
// Build the program and run the checker.
//
function createProgram(tsconfigPath: string): ts.Program {
	const tsConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
	const configHostParser: ts.ParseConfigHost = {
		fileExists: existsSync,
		readDirectory: ts.sys.readDirectory,
		readFile: file => readFileSync(file, 'utf8'),
		useCaseSensitiveFileNames: process.platform === 'linux',
	};
	const parsed = ts.parseJsonConfigFileContent(tsConfig.config, configHostParser, resolve(dirname(tsconfigPath)), { noEmit: true });
	const compilerHost = ts.createCompilerHost(parsed.options, true);
	return ts.createProgram(parsed.fileNames, parsed.options, compilerHost);
}

function run(): boolean {
	const program = createProgram(TS_CONFIG_PATH);
	const checker = program.getTypeChecker();

	const moduleInits = new Map<ts.SourceFile, IModuleInitNode>();

	//
	// 1. Compute the synchronous boot closure of source files reachable from BOOT_ROOTS_FILES.
	//
	const bootFiles = new Set<ts.SourceFile>();
	const queue: ts.SourceFile[] = [];
	for (const root of BOOT_ROOTS_FILES) {
		const sf = program.getSourceFile(join(REPO_ROOT, root));
		if (!sf) {
			console.error(`[build/checker/startupReachabilityChecker.ts]: boot root file not found in program: ${root}`);
			return false;
		}
		bootFiles.add(sf);
		queue.push(sf);
	}
	while (queue.length > 0) {
		const sf = queue.shift()!;
		for (const target of getStaticImportTargets(checker, sf)) {
			if (target.isDeclarationFile) {
				continue;
			}
			if (!bootFiles.has(target)) {
				bootFiles.add(target);
				queue.push(target);
			}
		}
	}

	//
	// 2. Seed BFS with the synthetic module-init callable of every boot file.
	//
	const visited = new Map<string, Callable>();
	const parentEdge = new Map<string, { from: Callable; call: ts.CallExpression | ts.NewExpression } | undefined>();
	const work: Callable[] = [];

	for (const sf of bootFiles) {
		let init = moduleInits.get(sf);
		if (!init) {
			init = { kind: 'moduleInit', sourceFile: sf };
			moduleInits.set(sf, init);
		}
		const key = callableKey(init);
		if (!visited.has(key)) {
			visited.set(key, init);
			parentEdge.set(key, undefined);
			work.push(init);
		}
	}

	//
	// 3. BFS. For each callable, collect shallow calls and route them per the special-case rules.
	//
	const violations: { sink: IForbiddenSink; call: ts.CallExpression; path: Callable[]; pathCalls: (ts.CallExpression | ts.NewExpression | undefined)[] }[] = [];

	while (work.length > 0) {
		const cur = work.shift()!;
		const body = getCallableBody(cur);
		if (!body) {
			continue;
		}

		// Sink scan: any forbidden API called from this callable is a violation.
		forEachShallowCall(body, (call) => {
			if (!ts.isCallExpression(call)) {
				return;
			}
			const method = getCalledMethodName(call);
			if (!method) {
				return;
			}
			const receiver = getReceiverTypeName(checker, call);
			for (const sink of FORBIDDEN_SINKS) {
				if (sink.method === method && receiver === sink.typeName) {
					// Reconstruct the path from a boot root to this callable.
					const path: Callable[] = [];
					const pathCalls: (ts.CallExpression | ts.NewExpression | undefined)[] = [];
					let node: Callable | undefined = cur;
					let edge: { from: Callable; call: ts.CallExpression | ts.NewExpression } | undefined;
					while (node) {
						path.unshift(node);
						edge = parentEdge.get(callableKey(node));
						pathCalls.unshift(edge?.call);
						node = edge?.from;
					}
					violations.push({ sink, call, path, pathCalls });
					return;
				}
			}
		});

		// Edge collection: route calls per the rules.
		forEachShallowCall(body, (call) => {
			if (ts.isNewExpression(call)) {
				routeNewExpression(call);
				return;
			}
			routeCallExpression(call);
		});

		function enqueue(target: Callable, viaCall: ts.CallExpression | ts.NewExpression): void {
			const key = callableKey(target);
			if (visited.has(key)) {
				return;
			}
			visited.set(key, target);
			parentEdge.set(key, { from: cur, call: viaCall });
			work.push(target);
		}

		function routeNewExpression(newExpr: ts.NewExpression): void {
			for (const fn of resolveCalleeFunctions(checker, newExpr)) {
				enqueue(fn, newExpr);
			}
		}

		function routeCallExpression(call: ts.CallExpression): void {
			const method = getCalledMethodName(call);
			const receiver = method ? getReceiverTypeName(checker, call) : undefined;

			// Constructor summoners: route to the class arg's constructor(s).
			if (method) {
				for (const spec of CONSTRUCTOR_SUMMONERS) {
					if (spec.method === method && matchesTypeName(spec.typeName, receiver)) {
						const classArg = call.arguments[spec.classArgIndex];
						if (classArg) {
							for (const ctor of resolveClassConstructors(checker, classArg)) {
								enqueue(ctor, call);
							}
						}
						// Also follow into the call's resolved declaration so any non-class-arg work in
						// the wrapper (rare) is not lost.
						break;
					}
				}
			}

			// Deferred callers: skip the specified callback arg, but follow other args.
			let deferredCallbackIndex: number | undefined;
			if (method) {
				for (const spec of DEFERRED_CALLERS) {
					if (spec.method !== method) {
						continue;
					}
					if (!matchesTypeName(spec.typeName, receiver)) {
						continue;
					}
					if (spec.bootEventNames) {
						const eventName = getFirstArgStringLiteral(call);
						if (eventName !== undefined && spec.bootEventNames.includes(eventName)) {
							// Boot event — DO follow the callback. Don't mark as deferred.
							continue;
						}
					}
					deferredCallbackIndex = spec.callbackArgIndex;
					break;
				}
			}

			// Sync-callback invokers (e.g. `invokeFunction(arrow)`): the default branch below
			// already follows inline arrow / function-expression arguments, so no special-case
			// handling is needed here. The SYNC_CALLBACK_INVOKERS list is kept for documentation
			// and as the place to add identifier-callback handling in a future iteration.
			void SYNC_CALLBACK_INVOKERS;

			// Follow the resolved callee function declaration (the named method, free function, etc.).
			for (const fn of resolveCalleeFunctions(checker, call)) {
				enqueue(fn, call);
			}

			// Walk each argument: inline function literals are followed unless this position is
			// the deferred callback of a deferred caller. The default behavior already covers
			// SYNC_CALLBACK_INVOKERS, which exists in the spec only to document the convention.
			for (let i = 0; i < call.arguments.length; i++) {
				if (i === deferredCallbackIndex) {
					continue;
				}
				const arg = call.arguments[i];
				if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
					enqueue(arg, call);
				}
			}
		}
	}

	//
	// 4. Report.
	//
	if (violations.length === 0) {
		return true;
	}

	for (const v of violations) {
		const callLoc = formatLocation(v.call.getSourceFile(), v.call.getStart());
		console.error('');
		console.error(`[build/checker/startupReachabilityChecker.ts]: Forbidden startup-reachable call detected.`);
		console.error(`  Sink: ${v.sink.typeName}.${v.sink.method}`);
		console.error(`  At  : ${callLoc}`);
		console.error(`  Why : ${v.sink.reason}`);
		console.error(`  Reachability path from boot:`);
		for (let i = 0; i < v.path.length; i++) {
			const arrow = i === 0 ? '   ' : '→  ';
			console.error(`    ${arrow}${callableLabel(v.path[i])}`);
		}
		console.error(`    →  ${v.sink.typeName}.${v.sink.method} at ${callLoc}`);
	}

	console.error('');
	console.error(`[build/checker/startupReachabilityChecker.ts]: ${violations.length} violation(s) found.`);
	console.error(`To allow a call site, either invoke it from a user-gesture handler (see DEFERRED_CALLERS in build/checker/startupReachabilityChecker.ts) or, if the receiving API is itself a new user-gesture handler, add it to that list.`);
	return false;
}

if (!run()) {
	process.exit(1);
}
