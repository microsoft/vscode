/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from atom-typescript project, obtained from
 * https://github.com/TypeStrong/atom-typescript/tree/master/lib/main/lang
 * ------------------------------------------------------------------------------------------ */

import * as ts from 'typescript';
import * as path from 'path';
var fuzzaldrin = require('fuzzaldrin');

export function mapValues<T>(map: { [index: string]: T }): T[] {
	return Object.keys(map).reduce((result: T[], key: string) => {
		result.push(map[key]);
		return result;
	}, []);
}

/**
 * assign all properties of a list of object to an object
 * @param target the object that will receive properties
 * @param items items which properties will be assigned to a target
 */
export function assign(target: any, ...items: any[]): any {
	return items.reduce(function (target: any, source: any) {
		return Object.keys(source).reduce((target: any, key: string) => {
			target[key] = source[key];
			return target;
		}, target);
	}, target);
}

/**
 * clone an object (shallow)
 * @param target the object to clone
 */
export function clone<T>(target: T): T {
	return assign(Array.isArray(target) ? [] : {}, target);
}

/**
 * Create a quick lookup map from list
 */
export function createMap(arr: (string | number)[]): { [string: string]: boolean;[number: number]: boolean } {
	return arr.reduce((result: { [string: string]: boolean }, key: string) => {
		result[key] = true;
		return result;
	}, <{ [string: string]: boolean }>{});
}


/**
 * browserify path.resolve is buggy on windows
 */
export function pathResolve(from: string, to: string): string {
	var result = path.resolve(from, to);
	var index = result.indexOf(from[0]);
	return result.slice(index);
}


/**
 * C# like events and delegates for typed events
 * dispatching
 */
export interface ISignal<T> {
	/**
	 * Subscribes a listener for the signal.
	 *
	 * @params listener the callback to call when events are dispatched
	 * @params priority an optional priority for this signal
	 */
	add(listener: (parameter: T) => any, priority?: number): void;

	/**
	 * unsubscribe a listener for the signal
	 *
	 * @params listener the previously subscribed listener
	 */
	remove(listener: (parameter: T) => any): void;

	/**
	 * dispatch an event
	 *
	 * @params parameter the parameter attached to the event dispatching
	 */
	dispatch(parameter?: T): boolean;

	/**
	 * Remove all listener from the signal
	 */
	clear(): void;

	/**
	 * @return true if the listener has been subsribed to this signal
	 */
	hasListeners(): boolean;
}


export class Signal<T> implements ISignal<T> {

	/**
	 * list of listeners that have been suscribed to this signal
	 */
	private listeners: { (parameter: T): any }[] = [];

	/**
	 * Priorities corresponding to the listeners
	 */
	private priorities: number[] = [];

	/**
	 * Subscribes a listener for the signal.
	 *
	 * @params listener the callback to call when events are dispatched
	 * @params priority an optional priority for this signal
	 */
	add(listener: (parameter: T) => any, priority = 0): void {
		var index = this.listeners.indexOf(listener);
		if (index !== -1) {
			this.priorities[index] = priority;
			return;
		}
		for (var i = 0, l = this.priorities.length; i < l; i++) {
			if (this.priorities[i] < priority) {
				this.priorities.splice(i, 0, priority);
				this.listeners.splice(i, 0, listener);
				return;
			}
		}
		this.priorities.push(priority);
		this.listeners.push(listener);
	}

	/**
	 * unsubscribe a listener for the signal
	 *
	 * @params listener the previously subscribed listener
	 */
	remove(listener: (parameter: T) => any): void {
		var index = this.listeners.indexOf(listener);
		if (index >= 0) {
			this.priorities.splice(index, 1);
			this.listeners.splice(index, 1);
		}
	}

	/**
	 * dispatch an event
	 *
	 * @params parameter the parameter attached to the event dispatching
	 */
	dispatch(parameter?: T): boolean {
		var hasBeenCanceled = this.listeners.every((listener: (parameter: T) => any) => {
			var result = listener(parameter);
			return result !== false;
		});

		return hasBeenCanceled;
	}

	/**
	 * Remove all listener from the signal
	 */
	clear(): void {
		this.listeners = [];
		this.priorities = [];
	}

	/**
	 * @return true if the listener has been subsribed to this signal
	 */
	hasListeners(): boolean {
		return this.listeners.length > 0;
	}
}

export function binarySearch(array: number[], value: number): number {
	var low = 0;
	var high = array.length - 1;

	while (low <= high) {
		var middle = low + ((high - low) >> 1);
		var midValue = array[middle];

		if (midValue === value) {
			return middle;
		}
		else if (midValue > value) {
			high = middle - 1;
		}
		else {
			low = middle + 1;
		}
	}

	return ~low;
}

// Not optimized
export function selectMany<T>(arr: T[][]): T[] {
	var result = [];
	for (var i = 0; i < arr.length; i++) {
		for (var j = 0; j < arr[i].length; j++) {
			result.push(arr[i][j]);
		}
	}
	return result;
}

// Not particularly awesome e.g. '/..foo' will pass
export function pathIsRelative(str: string) {
	if (!str.length) {
		return false;
	}
	return str[0] === '.' || str.substring(0, 2) === './' || str.substring(0, 3) === '../';
}

/** Key is string. Note: this data structure might have been a bad idea. Sorry. */
export class Dict<T>{
	public table = Object.create(null);
	constructor() { }
	setValue(key: string, item: T) {
		this.table[key] = item;
	}
	getValue(key: string) { return this.table[key]; }
	clearValue(key: string) {
		delete this.table[key];
	}
	clearAll() { this.table = Object.create(null); }
	keys() { return Object.keys(this.table); }
	values(): T[] {
		var array = [];
		for (var key in this.table) {
			array.push(this.table[key]);
		}
		return array;
	}
}

/** for testing ui lags only */
export function delay(seconds: number = 2) {
	delayMilliseconds(seconds * 1000);
};

export function delayMilliseconds(milliseconds: number = 100) {
	// Delay the thread
	var d1 = new Date();
	var d2 = new Date();
	while (d2.valueOf() < d1.valueOf() + milliseconds) {
		d2 = new Date();
	}
};

var now = () => new Date().getTime();

export function debounce<T extends Function>(func: T, milliseconds: number, immediate = false): T {
	var timeout, args, context, timestamp, result;

	var wait = milliseconds;

	var later = function () {
		var last = now() - timestamp;

		if (last < wait && last > 0) {
			timeout = setTimeout(later, wait - last);
		} else {
			timeout = null;
			if (!immediate) {
				result = func.apply(context, args);
				if (!timeout) {
					context = args = null;
				}
			}
		}
	};

	return <any>function () {
		context = this;
		args = arguments;
		timestamp = now();
		var callNow = immediate && !timeout;
		if (!timeout) {
			timeout = setTimeout(later, wait);
		}
		if (callNow) {
			result = func.apply(context, args);
			context = args = null;
		}

		return result;
	};
};

var punctuations = createMap([';', '{', '}', '(', ')', '.', ':', '<', '>', '\'', '"']);
export var prefixEndsInPunctuation = (prefix) => prefix.length && prefix.trim().length && punctuations[prefix.trim()[prefix.trim().length - 1]];

var nameExtractorRegex = /return (.*);/;
/** Get the name using a lambda so that you don't have magic strings */
export function getName(nameLambda: () => any) {
	var m = nameExtractorRegex.exec(nameLambda + '');
	if (!m) {
		throw new Error('The function does not contain a statement matching \'return variableName; \'');
	}
	var access = m[1].split('.');
	return access[access.length - 1];
}

/** Sloppy but effective code to find distinct */
export function distinct(arr: string[]): string[] {
	var map = createMap(arr);
	return Object.keys(map);
}


export function getLeadingCommentRangesOfNode(node: ts.Node, sourceFile: ts.SourceFile) {
	return ts.getLeadingCommentRanges(sourceFile.text, node.pos);
}

/** From https://github.com/Microsoft/TypeScript/pull/2173/files */
function getExternalModuleNames(program: ts.Program): string[] {
	var entries: string[] = [];

	program.getSourceFiles().forEach(sourceFile => {

		// Look for ambient external module declarations
		ts.forEachChild(sourceFile, child => {
			if (child.kind === ts.SyntaxKind.ModuleDeclaration && (<ts.ModuleDeclaration>child).name.kind === ts.SyntaxKind.StringLiteral) {
				entries.push((<ts.ModuleDeclaration>child).name.text);
			}
		});
	});

	return entries;
}

/** This is great for auto import */
export interface GetPathCompletions {
	prefix: string;
	allFiles: string[];
	program: ts.Program;
	filePath: string;
	sourceFile: ts.SourceFile;
}
/** This is great for autocomplete */
export interface GetPathCompletionsForAutocomplete extends GetPathCompletions {
	position: number;
}
/** Get the token whose text contains the position */
export function getTokenAtPosition(sourceFile: ts.SourceFile, position: number): ts.Node {
	let current: ts.Node = sourceFile;
	outer: while (true) {
		if (isToken(current)) {
			// exit early
			return current;
		}

		// find the child that contains 'position'
		for (let i = 0, n = current.getChildCount(sourceFile); i < n; i++) {
			const child = current.getChildAt(i);
			const start = child.getFullStart();
			if (start <= position) {
				const end = child.getEnd();
				if (position < end || (position === end && child.kind === ts.SyntaxKind.EndOfFileToken)) {
					current = child;
					continue outer;
				}
			}
		}

		return current;
	}
}
function isToken(n: ts.Node): boolean {
	return n.kind >= ts.SyntaxKind.FirstToken && n.kind <= ts.SyntaxKind.LastToken;
}

function isStringLiteralInES6ImportDeclaration(node: ts.Node) {
	if (node.kind !== ts.SyntaxKind.StringLiteral) {
		return false;
	}
	while (node.parent.kind !== ts.SyntaxKind.SourceFile
		&& node.parent.kind !== ts.SyntaxKind.ImportDeclaration) {
		node = node.parent;
	}
	return node.parent && node.parent.kind === ts.SyntaxKind.ImportDeclaration;
}
function isStringLiteralInImportRequireDeclaration(node: ts.Node) {
	if (node.kind !== ts.SyntaxKind.StringLiteral) {
		return false;
	}
	while (node.parent.kind !== ts.SyntaxKind.SourceFile
		&& node.parent.kind !== ts.SyntaxKind.ImportEqualsDeclaration) {
		node = node.parent;
	}
	return node.parent && node.parent.kind === ts.SyntaxKind.ImportEqualsDeclaration;
}

/** Removes the quote characters / `.` and `/` as they cause fuzzaldrin to break */
function sanitizePrefix(prefix: string) {
	const result = prefix.replace(/\.|\/|\'|\"|/g, '');
	return result;
}
export interface Completion {
	/** stuff like "var"|"method" etc */
	kind?: string;
	/** stuff like "toString" */
	name?: string;
	/** This is displayParts (for functions). Empty for `var` etc. */
	display?: string;
	/** the docComment if any */
	comment?: string;

	/** If snippet is specified then the above stuff is ignored */
	snippet?: {
		name: string;
		description: string;
		template: string;
	};

	/** If a path completion is specified then the above stuff is ignored */
	pathCompletion?: {
		fileName: string;
		relativePath: string;
		fullPath: string;
		// TODO:
		// Also tell about the `string` start and end `index` which is what the completion should replace
	};
}
export function getFileName(fullFilePath: string) {
	let parts = fullFilePath.split('/');
	return parts[parts.length - 1];
}
export function getPathCompletionsForImport(query: GetPathCompletions): Completion[] {

	var sourceDir = path.dirname(query.filePath);
	var filePaths = query.allFiles.filter(p => p !== query.filePath && !(<any>p).endsWith('.json'));
	var files: {
		fileName: string;
		relativePath: string;
		fullPath: string;
	}[] = [];

	var externalModules = getExternalModuleNames(query.program);
	externalModules.forEach(e => files.push({
		fileName: `${e}`,
		relativePath: e,
		fullPath: e
	}));

	filePaths.forEach(p => {
		files.push({
			fileName: removeExt(getFileName(p)),
			relativePath: removeExt(makeRelativePath(sourceDir, p)),
			fullPath: p
		});
	});

	const sanitizedPrefix = sanitizePrefix(query.prefix);
	const endsInPunctuation: boolean = prefixEndsInPunctuation(sanitizedPrefix);
	if (!endsInPunctuation) {
		files = fuzzaldrin.filter(files, sanitizedPrefix, { key: 'fileName' });
	}

	return files.map(f => {
		const result: Completion = { pathCompletion: f };
		return result;
	});
}

/**
 * Very similar to above. But
 * - aborts if position not valid to autocomplete
 * - automatically excludes `externalModules` if position is reference tag
 */
export function getPathCompletionsForAutocomplete(query: GetPathCompletionsForAutocomplete): Completion[] {
	const sourceFile = query.sourceFile;
	const positionNode = getTokenAtPosition(sourceFile, query.position);

	const inReferenceTagPath = false;
	const inES6ModuleImportString = isStringLiteralInES6ImportDeclaration(positionNode);
	const inImportRequireString = isStringLiteralInImportRequireDeclaration(positionNode);

	if (!inReferenceTagPath && !inES6ModuleImportString && !inImportRequireString) {
		return [];
	}


	var sourceDir = path.dirname(query.filePath);
	var filePaths = query.allFiles.filter(p => p !== query.filePath && !(<any>p).endsWith('.json'));
	var files: {
		fileName: string;
		relativePath: string;
		fullPath: string;
	}[] = [];

	if (!inReferenceTagPath) {
		var externalModules = getExternalModuleNames(query.program);
		externalModules.forEach(e => files.push({
			fileName: `${e}`,
			relativePath: e,
			fullPath: e
		}));
	}

	filePaths.forEach(p => {
		files.push({
			fileName: removeExt(getFileName(p)),
			relativePath: removeExt(makeRelativePath(sourceDir, p)),
			fullPath: p
		});
	});

	const sanitizedPrefix = sanitizePrefix(query.prefix);
	const endsInPunctuation: boolean = prefixEndsInPunctuation(sanitizedPrefix);
	if (!endsInPunctuation){
		files = fuzzaldrin.filter(files, sanitizedPrefix, { key: 'fileName' });
	}

	return files.map(f => {
		const result: Completion = { pathCompletion: f };
		return result;
	});
}

export function removeExt(filePath: string) {
	return filePath.substr(0, filePath.lastIndexOf('.'));
}

export function makeRelativePath(relativeFolder: string, filePath: string) {
	var relativePath = path.relative(relativeFolder, filePath).split('\\').join('/');
	if (relativePath[0] !== '.') {
		relativePath = './' + relativePath;
	}
	return relativePath;
}