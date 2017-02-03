/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as NLS from 'vs/nls';

import * as Objects from 'vs/base/common/objects';
import * as Strings from 'vs/base/common/strings';
import * as Assert from 'vs/base/common/assert';
import * as Paths from 'vs/base/common/paths';
import * as Types from 'vs/base/common/types';
import * as UUID from 'vs/base/common/uuid';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';

import { ValidationStatus, ValidationState, ILogger, Parser } from 'vs/base/common/parsers';
import { IStringDictionary } from 'vs/base/common/collections';

import { IMarkerData } from 'vs/platform/markers/common/markers';

export enum FileLocationKind {
	Auto,
	Relative,
	Absolute
}

export module FileLocationKind {
	export function fromString(value: string): FileLocationKind {
		value = value.toLowerCase();
		if (value === 'absolute') {
			return FileLocationKind.Absolute;
		} else if (value === 'relative') {
			return FileLocationKind.Relative;
		} else {
			return undefined;
		}
	}
}

export interface ProblemPattern {
	regexp: RegExp;

	file?: number;

	message?: number;

	location?: number;

	line?: number;

	column?: number;

	endLine?: number;

	endColumn?: number;

	code?: number;

	severity?: number;

	loop?: boolean;

	[key: string]: any;
}

export let problemPatternProperties = ['file', 'message', 'location', 'line', 'column', 'endLine', 'endColumn', 'code', 'severity', 'loop'];

export interface WatchingPattern {
	regexp: RegExp;
	file?: number;
}

export interface WatchingMatcher {
	activeOnStart: boolean;
	beginsPattern: WatchingPattern;
	endsPattern: WatchingPattern;
}

export enum ApplyToKind {
	allDocuments,
	openDocuments,
	closedDocuments
}

export module ApplyToKind {
	export function fromString(value: string): ApplyToKind {
		value = value.toLowerCase();
		if (value === 'alldocuments') {
			return ApplyToKind.allDocuments;
		} else if (value === 'opendocuments') {
			return ApplyToKind.openDocuments;
		} else if (value === 'closeddocuments') {
			return ApplyToKind.closedDocuments;
		} else {
			return undefined;
		}
	}
}

export interface ProblemMatcher {
	owner: string;
	applyTo: ApplyToKind;
	fileLocation: FileLocationKind;
	filePrefix?: string;
	pattern: ProblemPattern | ProblemPattern[];
	severity?: Severity;
	watching?: WatchingMatcher;
}

export interface NamedProblemMatcher extends ProblemMatcher {
	name: string;
}

export function isNamedProblemMatcher(value: ProblemMatcher): value is NamedProblemMatcher {
	return Types.isString((<NamedProblemMatcher>value).name) ? true : false;
}

let valueMap: { [key: string]: string; } = {
	E: 'error',
	W: 'warning',
	I: 'info',
};

interface Location {
	startLineNumber: number;
	startColumn: number;
	endLineNumber: number;
	endColumn: number;
}

interface ProblemData {
	file?: string;
	location?: string;
	line?: string;
	column?: string;
	endLine?: string;
	endColumn?: string;
	message?: string;
	severity?: string;
	code?: string;
	[key: string]: string;
}

export interface ProblemMatch {
	resource: URI;
	marker: IMarkerData;
	description: ProblemMatcher;
}

export interface HandleResult {
	match: ProblemMatch;
	continue: boolean;
}

export function getResource(filename: string, matcher: ProblemMatcher): URI {
	let kind = matcher.fileLocation;
	let fullPath: string;
	if (kind === FileLocationKind.Absolute) {
		fullPath = filename;
	} else if (kind === FileLocationKind.Relative) {
		fullPath = Paths.join(matcher.filePrefix, filename);
	}
	fullPath = fullPath.replace(/\\/g, '/');
	if (fullPath[0] !== '/') {
		fullPath = '/' + fullPath;
	}
	return URI.parse('file://' + fullPath);
}

export interface ILineMatcher {
	matchLength: number;
	next(line: string): ProblemMatch;
	handle(lines: string[], start?: number): HandleResult;
}

export function createLineMatcher(matcher: ProblemMatcher): ILineMatcher {
	let pattern = matcher.pattern;
	if (Types.isArray(pattern)) {
		return new MultiLineMatcher(matcher);
	} else {
		return new SingleLineMatcher(matcher);
	}
}

class AbstractLineMatcher implements ILineMatcher {
	private matcher: ProblemMatcher;

	constructor(matcher: ProblemMatcher) {
		this.matcher = matcher;
	}

	public handle(lines: string[], start: number = 0): HandleResult {
		return { match: null, continue: false };
	}

	public next(line: string): ProblemMatch {
		return null;
	}

	public get matchLength(): number {
		throw new Error('Subclass reponsibility');
	}

	protected fillProblemData(data: ProblemData, pattern: ProblemPattern, matches: RegExpExecArray): void {
		this.fillProperty(data, 'file', pattern, matches, true);
		this.fillProperty(data, 'message', pattern, matches, true);
		this.fillProperty(data, 'code', pattern, matches, true);
		this.fillProperty(data, 'severity', pattern, matches, true);
		this.fillProperty(data, 'location', pattern, matches, true);
		this.fillProperty(data, 'line', pattern, matches);
		this.fillProperty(data, 'column', pattern, matches);
		this.fillProperty(data, 'endLine', pattern, matches);
		this.fillProperty(data, 'endColumn', pattern, matches);
	}

	private fillProperty(data: ProblemData, property: string, pattern: ProblemPattern, matches: RegExpExecArray, trim: boolean = false): void {
		if (Types.isUndefined(data[property]) && !Types.isUndefined(pattern[property]) && pattern[property] < matches.length) {
			let value = matches[pattern[property]];
			if (trim) {
				value = Strings.trim(value);
			}
			data[property] = value;
		}
	}

	protected getMarkerMatch(data: ProblemData): ProblemMatch {
		let location = this.getLocation(data);
		if (data.file && location && data.message) {
			let marker: IMarkerData = {
				severity: this.getSeverity(data),
				startLineNumber: location.startLineNumber,
				startColumn: location.startColumn,
				endLineNumber: location.startLineNumber,
				endColumn: location.endColumn,
				message: data.message
			};
			if (!Types.isUndefined(data.code)) {
				marker.code = data.code;
			}
			return {
				description: this.matcher,
				resource: this.getResource(data.file),
				marker: marker
			};
		}
		return undefined;
	}

	protected getResource(filename: string): URI {
		return getResource(filename, this.matcher);
	}

	private getLocation(data: ProblemData): Location {
		if (data.location) {
			return this.parseLocationInfo(data.location);
		}
		if (!data.line) {
			return null;
		}
		let startLine = parseInt(data.line);
		let startColumn = data.column ? parseInt(data.column) : undefined;
		let endLine = data.endLine ? parseInt(data.endLine) : undefined;
		let endColumn = data.endColumn ? parseInt(data.endColumn) : undefined;
		return this.createLocation(startLine, startColumn, endLine, endColumn);
	}

	private parseLocationInfo(value: string): Location {
		if (!value || !value.match(/(\d+|\d+,\d+|\d+,\d+,\d+,\d+)/)) {
			return null;
		}
		let parts = value.split(',');
		let startLine = parseInt(parts[0]);
		let startColumn = parts.length > 1 ? parseInt(parts[1]) : undefined;
		if (parts.length > 3) {
			return this.createLocation(startLine, startColumn, parseInt(parts[2]), parseInt(parts[3]));
		} else {
			return this.createLocation(startLine, startColumn, undefined, undefined);
		}
	}

	private createLocation(startLine: number, startColumn: number, endLine: number, endColumn: number): Location {
		if (startLine && startColumn && endColumn) {
			return { startLineNumber: startLine, startColumn: startColumn, endLineNumber: endLine || startLine, endColumn: endColumn };
		}
		if (startLine && startColumn) {
			return { startLineNumber: startLine, startColumn: startColumn, endLineNumber: startLine, endColumn: startColumn };
		}
		return { startLineNumber: startLine, startColumn: 1, endLineNumber: startLine, endColumn: Number.MAX_VALUE };
	}

	private getSeverity(data: ProblemData): Severity {
		let result: Severity = null;
		if (data.severity) {
			let value = data.severity;
			if (value && value.length > 0) {
				if (value.length === 1 && valueMap[value[0]]) {
					value = valueMap[value[0]];
				}
				result = Severity.fromValue(value);
			}
		}
		if (result === null || result === Severity.Ignore) {
			result = this.matcher.severity || Severity.Error;
		}
		return result;
	}
}

class SingleLineMatcher extends AbstractLineMatcher {

	private pattern: ProblemPattern;

	constructor(matcher: ProblemMatcher) {
		super(matcher);
		this.pattern = <ProblemPattern>matcher.pattern;
	}

	public get matchLength(): number {
		return 1;
	}

	public handle(lines: string[], start: number = 0): HandleResult {
		Assert.ok(lines.length - start === 1);
		let data: ProblemData = Object.create(null);
		let matches = this.pattern.regexp.exec(lines[start]);
		if (matches) {
			this.fillProblemData(data, this.pattern, matches);
			let match = this.getMarkerMatch(data);
			if (match) {
				return { match: match, continue: false };
			}
		}
		return { match: null, continue: false };
	}

	public next(line: string): ProblemMatch {
		return null;
	}
}

class MultiLineMatcher extends AbstractLineMatcher {

	private patterns: ProblemPattern[];
	private data: ProblemData;

	constructor(matcher: ProblemMatcher) {
		super(matcher);
		this.patterns = <ProblemPattern[]>matcher.pattern;
	}

	public get matchLength(): number {
		return this.patterns.length;
	}

	public handle(lines: string[], start: number = 0): HandleResult {
		Assert.ok(lines.length - start === this.patterns.length);
		this.data = Object.create(null);
		let data = this.data;
		for (let i = 0; i < this.patterns.length; i++) {
			let pattern = this.patterns[i];
			let matches = pattern.regexp.exec(lines[i + start]);
			if (!matches) {
				return { match: null, continue: false };
			} else {
				// Only the last pattern can loop
				if (pattern.loop && i === this.patterns.length - 1) {
					data = Objects.clone(data);
				}
				this.fillProblemData(data, pattern, matches);
			}
		}
		let loop = this.patterns[this.patterns.length - 1].loop;
		if (!loop) {
			this.data = null;
		}
		return { match: this.getMarkerMatch(data), continue: loop };
	}

	public next(line: string): ProblemMatch {
		let pattern = this.patterns[this.patterns.length - 1];
		Assert.ok(pattern.loop === true && this.data !== null);
		let matches = pattern.regexp.exec(line);
		if (!matches) {
			this.data = null;
			return null;
		}
		let data = Objects.clone(this.data);
		this.fillProblemData(data, pattern, matches);
		return this.getMarkerMatch(data);
	}
}

let _defaultPatterns: { [name: string]: ProblemPattern | ProblemPattern[]; } = Object.create(null);
_defaultPatterns['msCompile'] = {
	regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\)\s*:\s+(error|warning|info)\s+(\w{1,2}\d+)\s*:\s*(.*)$/,
	file: 1,
	location: 2,
	severity: 3,
	code: 4,
	message: 5
};
_defaultPatterns['gulp-tsc'] = {
	regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(\d+)\s+(.*)$/,
	file: 1,
	location: 2,
	code: 3,
	message: 4
};
_defaultPatterns['tsc'] = {
	regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(TS\d+)\s*:\s*(.*)$/,
	file: 1,
	location: 2,
	severity: 3,
	code: 4,
	message: 5
};
_defaultPatterns['cpp'] = {
	regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(C\d+)\s*:\s*(.*)$/,
	file: 1,
	location: 2,
	severity: 3,
	code: 4,
	message: 5
};
_defaultPatterns['csc'] = {
	regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(CS\d+)\s*:\s*(.*)$/,
	file: 1,
	location: 2,
	severity: 3,
	code: 4,
	message: 5
};
_defaultPatterns['vb'] = {
	regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(BC\d+)\s*:\s*(.*)$/,
	file: 1,
	location: 2,
	severity: 3,
	code: 4,
	message: 5
};
_defaultPatterns['lessCompile'] = {
	regexp: /^\s*(.*) in file (.*) line no. (\d+)$/,
	message: 1,
	file: 2,
	line: 3
};
_defaultPatterns['jshint'] = {
	regexp: /^(.*):\s+line\s+(\d+),\s+col\s+(\d+),\s(.+?)(?:\s+\((\w)(\d+)\))?$/,
	file: 1,
	line: 2,
	column: 3,
	message: 4,
	severity: 5,
	code: 6
};
_defaultPatterns['jshint-stylish'] = [
	{
		regexp: /^(.+)$/,
		file: 1
	},
	{
		regexp: /^\s+line\s+(\d+)\s+col\s+(\d+)\s+(.+?)(?:\s+\((\w)(\d+)\))?$/,
		line: 1,
		column: 2,
		message: 3,
		severity: 4,
		code: 5,
		loop: true
	}
];
_defaultPatterns['eslint-compact'] = {
	regexp: /^(.+):\sline\s(\d+),\scol\s(\d+),\s(Error|Warning|Info)\s-\s(.+)\s\((.+)\)$/,
	file: 1,
	line: 2,
	column: 3,
	severity: 4,
	message: 5,
	code: 6
};
_defaultPatterns['eslint-stylish'] = [
	{
		regexp: /^([^\s].*)$/,
		file: 1
	},
	{
		regexp: /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)\s\s+(.*)$/,
		line: 1,
		column: 2,
		severity: 3,
		message: 4,
		code: 5,
		loop: true
	}
];
_defaultPatterns['go'] = {
	regexp: /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+))?: (.*)$/,
	file: 2,
	line: 4,
	column: 6,
	message: 7
};

export function defaultPattern(name: 'msCompile'): ProblemPattern;
export function defaultPattern(name: 'tsc'): ProblemPattern;
export function defaultPattern(name: 'cpp'): ProblemPattern;
export function defaultPattern(name: 'csc'): ProblemPattern;
export function defaultPattern(name: 'vb'): ProblemPattern;
export function defaultPattern(name: 'lessCompile'): ProblemPattern;
export function defaultPattern(name: 'jshint'): ProblemPattern;
export function defaultPattern(name: 'gulp-tsc'): ProblemPattern;
export function defaultPattern(name: 'go'): ProblemPattern;
export function defaultPattern(name: 'jshint-stylish'): ProblemPattern[];
export function defaultPattern(name: string): ProblemPattern | ProblemPattern[];
export function defaultPattern(name: string): ProblemPattern | ProblemPattern[] {
	return _defaultPatterns[name];
}

export namespace Config {
	/**
	* Defines possible problem severity values
	*/
	export namespace ProblemSeverity {
		export const Error: string = 'error';
		export const Warning: string = 'warning';
		export const Info: string = 'info';
	}

	export interface ProblemPattern {

		/**
		* The regular expression to find a problem in the console output of an
		* executed task.
		*/
		regexp?: string;

		/**
		* The match group index of the filename.
		* If omitted 1 is used.
		*/
		file?: number;

		/**
		* The match group index of the problems's location. Valid location
		* patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn).
		* If omitted the line and colum properties are used.
		*/
		location?: number;

		/**
		* The match group index of the problem's line in the source file.
		*
		* Defaults to 2.
		*/
		line?: number;

		/**
		* The match group index of the problem's column in the source file.
		*
		* Defaults to 3.
		*/
		column?: number;

		/**
		* The match group index of the problem's end line in the source file.
		*
		* Defaults to undefined. No end line is captured.
		*/
		endLine?: number;

		/**
		* The match group index of the problem's end column in the source file.
		*
		* Defaults to undefined. No end column is captured.
		*/
		endColumn?: number;

		/**
		* The match group index of the problem's severity.
		*
		* Defaults to undefined. In this case the problem matcher's severity
		* is used.
		*/
		severity?: number;

		/**
		* The match group index of the problems's code.
		*
		* Defaults to undefined. No code is captured.
		*/
		code?: number;

		/**
		* The match group index of the message. If omitted it defaults
		* to 4 if location is specified. Otherwise it defaults to 5.
		*/
		message?: number;

		/**
		* Specifies if the last pattern in a multi line problem matcher should
		* loop as long as it does match a line consequently. Only valid on the
		* last problem pattern in a multi line problem matcher.
		*/
		loop?: boolean;

		[key: string]: any;
	}

	/**
	* A watching pattern
	*/
	export interface WatchingPattern {
		/**
		* The actual regular expression
		*/
		regexp?: string;

		/**
		* The match group index of the filename. If provided the expression
		* is matched for that file only.
		*/
		file?: number;
	}

	/**
	* A description to track the start and end of a watching task.
	*/
	export interface WatchingMatcher {

		/**
		* If set to true the watcher is in active mode when the task
		* starts. This is equals of issuing a line that matches the
		* beginPattern.
		*/
		activeOnStart?: boolean;

		/**
		* If matched in the output the start of a watching task is signaled.
		*/
		beginsPattern?: string | WatchingPattern;

		/**
		* If matched in the output the end of a watching task is signaled.
		*/
		endsPattern?: string | WatchingPattern;
	}

	/**
	* A description of a problem matcher that detects problems
	* in build output.
	*/
	export interface ProblemMatcher {

		/**
		* The name of a base problem matcher to use. If specified the
		* base problem matcher will be used as a template and properties
		* specified here will replace properties of the base problem
		* matcher
		*/
		base?: string;

		/**
		* The owner of the produced VSCode problem. This is typically
		* the identifier of a VSCode language service if the problems are
		* to be merged with the one produced by the language service
		* or a generated internal id. Defaults to the generated internal id.
		*/
		owner?: string;

		/**
		* Specifies to which kind of documents the problems found by this
		* matcher are applied. Valid values are:
		*
		*   "allDocuments": problems found in all documents are applied.
		*   "openDocuments": problems found in documents that are open
		*   are applied.
		*   "closedDocuments": problems found in closed documents are
		*   applied.
		*/
		applyTo?: string;

		/**
		* The severity of the VSCode problem produced by this problem matcher.
		*
		* Valid values are:
		*   "error": to produce errors.
		*   "warning": to produce warnings.
		*   "info": to produce infos.
		*
		* The value is used if a pattern doesn't specify a severity match group.
		* Defaults to "error" if omitted.
		*/
		severity?: string;

		/**
		* Defines how filename reported in a problem pattern
		* should be read. Valid values are:
		*  - "absolute": the filename is always treated absolute.
		*  - "relative": the filename is always treated relative to
		*    the current working directory. This is the default.
		*  - ["relative", "path value"]: the filename is always
		*    treated relative to the given path value.
		*/
		fileLocation?: string | string[];

		/**
		* The name of a predefined problem pattern, the inline definintion
		* of a problem pattern or an array of problem patterns to match
		* problems spread over multiple lines.
		*/
		pattern?: string | ProblemPattern | ProblemPattern[];

		/**
		* A regular expression signaling that a watched tasks begins executing
		* triggered through file watching.
		*/
		watchedTaskBeginsRegExp?: string;

		/**
		* A regular expression signaling that a watched tasks ends executing.
		*/
		watchedTaskEndsRegExp?: string;

		watching?: WatchingMatcher;
	}

	export type ProblemMatcherType = string | ProblemMatcher | (string | ProblemMatcher)[];

	export interface NamedProblemMatcher extends ProblemMatcher {
		/**
		* An optional name. This name can be used to refer to the
		* problem matchter from within a task.
		*/
		name?: string;
	}

	export function isNamedProblemMatcher(value: ProblemMatcher): value is NamedProblemMatcher {
		return Types.isString((<NamedProblemMatcher>value).name);
	}
}


export class ProblemMatcherParser extends Parser {

	private resolver: { get(name: string): ProblemMatcher; };

	constructor(resolver: { get(name: string): ProblemMatcher; }, logger: ILogger, validationStatus: ValidationStatus = new ValidationStatus()) {
		super(logger, validationStatus);
		this.resolver = resolver;
	}

	public parse(json: Config.ProblemMatcher): ProblemMatcher {
		let result = this.createProblemMatcher(json);
		if (!this.checkProblemMatcherValid(json, result)) {
			return null;
		}
		this.addWatchingMatcher(json, result);

		return result;
	}

	private checkProblemMatcherValid(externalProblemMatcher: Config.ProblemMatcher, problemMatcher: ProblemMatcher): boolean {
		if (!problemMatcher || !problemMatcher.pattern || !problemMatcher.owner || Types.isUndefined(problemMatcher.fileLocation)) {
			this.status.state = ValidationState.Fatal;
			this.log(NLS.localize('ProblemMatcherParser.invalidMarkerDescription', 'Error: Invalid problemMatcher description. A matcher must at least define a pattern, owner and a file location. The problematic matcher is:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
			return false;
		}
		return true;
	}

	private createProblemMatcher(description: Config.ProblemMatcher): ProblemMatcher {
		let result: ProblemMatcher = null;

		let owner = description.owner ? description.owner : UUID.generateUuid();
		let applyTo = Types.isString(description.applyTo) ? ApplyToKind.fromString(description.applyTo) : ApplyToKind.allDocuments;
		if (!applyTo) {
			applyTo = ApplyToKind.allDocuments;
		}
		let fileLocation: FileLocationKind = undefined;
		let filePrefix: string = undefined;

		let kind: FileLocationKind;
		if (Types.isUndefined(description.fileLocation)) {
			fileLocation = FileLocationKind.Relative;
			filePrefix = '${cwd}';
		} else if (Types.isString(description.fileLocation)) {
			kind = FileLocationKind.fromString(<string>description.fileLocation);
			if (kind) {
				fileLocation = kind;
				if (kind === FileLocationKind.Relative) {
					filePrefix = '${cwd}';
				}
			}
		} else if (Types.isStringArray(description.fileLocation)) {
			let values = <string[]>description.fileLocation;
			if (values.length > 0) {
				kind = FileLocationKind.fromString(values[0]);
				if (values.length === 1 && kind === FileLocationKind.Absolute) {
					fileLocation = kind;
				} else if (values.length === 2 && kind === FileLocationKind.Relative && values[1]) {
					fileLocation = kind;
					filePrefix = values[1];
				}
			}
		}

		let pattern = description.pattern ? this.createProblemPattern(description.pattern) : undefined;

		let severity = description.severity ? Severity.fromValue(description.severity) : undefined;
		if (severity === Severity.Ignore) {
			this.status.state = ValidationState.Info;
			this.log(NLS.localize('ProblemMatcherParser.unknownSeverity', 'Info: unknown severity {0}. Valid values are error, warning and info.\n', description.severity));
			severity = Severity.Error;
		}

		if (Types.isString(description.base)) {
			let variableName = <string>description.base;
			if (variableName.length > 1 && variableName[0] === '$') {
				let base = this.resolver.get(variableName.substring(1));
				if (base) {
					result = Objects.clone(base);
					if (description.owner) {
						result.owner = owner;
					}
					if (fileLocation) {
						result.fileLocation = fileLocation;
					}
					if (filePrefix) {
						result.filePrefix = filePrefix;
					}
					if (description.pattern) {
						result.pattern = pattern;
					}
					if (description.severity) {
						result.severity = severity;
					}
				}
			}
		} else if (fileLocation) {
			result = {
				owner: owner,
				applyTo: applyTo,
				fileLocation: fileLocation,
				pattern: pattern,
			};
			if (filePrefix) {
				result.filePrefix = filePrefix;
			}
			if (severity) {
				result.severity = severity;
			}
		}
		if (Config.isNamedProblemMatcher(description)) {
			(<NamedProblemMatcher>result).name = description.name;
		}
		return result;
	}

	private createProblemPattern(value: string | Config.ProblemPattern | Config.ProblemPattern[]): ProblemPattern | ProblemPattern[] {
		let pattern: ProblemPattern;
		if (Types.isString(value)) {
			let variableName: string = <string>value;
			if (variableName.length > 1 && variableName[0] === '$') {
				return defaultPattern(variableName.substring(1));
			}
		} else if (Types.isArray(value)) {
			let values = <Config.ProblemPattern[]>value;
			let result: ProblemPattern[] = [];
			for (let i = 0; i < values.length; i++) {
				pattern = this.createSingleProblemPattern(values[i], false);
				if (i < values.length - 1) {
					if (!Types.isUndefined(pattern.loop) && pattern.loop) {
						pattern.loop = false;
						this.status.state = ValidationState.Error;
						this.log(NLS.localize('ProblemMatcherParser.loopProperty.notLast', 'The loop property is only supported on the last line matcher.'));
					}
				}
				result.push(pattern);
			}
			this.validateProblemPattern(result);
			return result;
		} else {
			pattern = this.createSingleProblemPattern(<Config.ProblemPattern>value, true);
			if (!Types.isUndefined(pattern.loop) && pattern.loop) {
				pattern.loop = false;
				this.status.state = ValidationState.Error;
				this.log(NLS.localize('ProblemMatcherParser.loopProperty.notMultiLine', 'The loop property is only supported on multi line matchers.'));
			}
			this.validateProblemPattern([pattern]);
			return pattern;
		}
		return null;
	}

	private createSingleProblemPattern(value: Config.ProblemPattern, setDefaults: boolean): ProblemPattern {
		let result: ProblemPattern = {
			regexp: this.createRegularExpression(value.regexp)
		};
		problemPatternProperties.forEach(property => {
			if (!Types.isUndefined(value[property])) {
				result[property] = value[property];
			}
		});
		if (setDefaults) {
			if (result.location) {
				result = Objects.mixin(result, {
					file: 1,
					message: 0
				}, false);
			} else {
				result = Objects.mixin(result, {
					file: 1,
					line: 2,
					column: 3,
					message: 0
				}, false);
			}
		}
		return result;
	}

	private validateProblemPattern(values: ProblemPattern[]): void {
		let file: boolean, message: boolean, location: boolean, line: boolean;
		let regexp: number = 0;
		values.forEach(pattern => {
			file = file || !Types.isUndefined(pattern.file);
			message = message || !Types.isUndefined(pattern.message);
			location = location || !Types.isUndefined(pattern.location);
			line = line || !Types.isUndefined(pattern.line);
			if (pattern.regexp) {
				regexp++;
			}
		});
		if (regexp !== values.length) {
			this.status.state = ValidationState.Error;
			this.log(NLS.localize('ProblemMatcherParser.problemPattern.missingRegExp', 'The problem pattern is missing a regular expression.'));
		}
		if (!(file && message && (location || line))) {
			this.status.state = ValidationState.Error;
			this.log(NLS.localize('ProblemMatcherParser.problemPattern.missingProperty', 'The problem pattern is invalid. It must have at least a file, message and line or location match group.'));
		}
	}

	private addWatchingMatcher(external: Config.ProblemMatcher, internal: ProblemMatcher): void {
		let oldBegins = this.createRegularExpression(external.watchedTaskBeginsRegExp);
		let oldEnds = this.createRegularExpression(external.watchedTaskEndsRegExp);
		if (oldBegins && oldEnds) {
			internal.watching = {
				activeOnStart: false,
				beginsPattern: { regexp: oldBegins },
				endsPattern: { regexp: oldEnds }
			};
			return;
		}
		if (Types.isUndefinedOrNull(external.watching)) {
			return;
		}
		let watching = external.watching;
		let begins: WatchingPattern = this.createWatchingPattern(watching.beginsPattern);
		let ends: WatchingPattern = this.createWatchingPattern(watching.endsPattern);
		if (begins && ends) {
			internal.watching = {
				activeOnStart: Types.isBoolean(watching.activeOnStart) ? watching.activeOnStart : false,
				beginsPattern: begins,
				endsPattern: ends
			};
			return;
		}
		if (begins || ends) {
			this.status.state = ValidationState.Error;
			this.log(NLS.localize('ProblemMatcherParser.problemPattern.watchingMatcher', 'A problem matcher must define both a begin pattern and an end pattern for watching.'));
		}
	}

	private createWatchingPattern(external: string | Config.WatchingPattern): WatchingPattern {
		if (Types.isUndefinedOrNull(external)) {
			return null;
		}
		let regexp: RegExp;
		let file: number;
		if (Types.isString(external)) {
			regexp = this.createRegularExpression(external);
		} else {
			regexp = this.createRegularExpression(external.regexp);
			if (Types.isNumber(external.file)) {
				file = external.file;
			}
		}
		if (!regexp) {
			return null;
		}
		return file ? { regexp, file } : { regexp };
	}

	private createRegularExpression(value: string): RegExp {
		let result: RegExp = null;
		if (!value) {
			return result;
		}
		try {
			result = new RegExp(value);
		} catch (err) {
			this.status.state = ValidationState.Fatal;
			this.log(NLS.localize('ProblemMatcherParser.invalidRegexp', 'Error: The string {0} is not a valid regular expression.\n', value));
		}
		return result;
	}
}

// let problemMatchersExtPoint = ExtensionsRegistry.registerExtensionPoint<Config.NamedProblemMatcher | Config.NamedProblemMatcher[]>('problemMatchers', {
// TODO@Dirk: provide here JSON schema for extension point
// });

export class ProblemMatcherRegistry {
	private matchers: IStringDictionary<ProblemMatcher>;

	constructor() {
		this.matchers = Object.create(null);
		/*
		problemMatchersExtPoint.setHandler((extensions, collector) => {
			// TODO@Dirk: validate extensions here and collect errors/warnings in `collector`
			extensions.forEach(extension => {
				let extensions = extension.value;
				if (Types.isArray(extensions)) {
					(<Config.NamedProblemMatcher[]>extensions).forEach(this.onProblemMatcher, this);
				} else {
					this.onProblemMatcher(extensions)
				}
			});
		});
		*/
	}

	// private onProblemMatcher(json: Config.NamedProblemMatcher): void {
	// 	let logger: ILogger = {
	// 		log: (message) => { console.warn(message); }
	// 	}
	// 	let parser = new ProblemMatcherParser(this, logger);
	// 	let result = parser.parse(json);
	// 	if (isNamedProblemMatcher(result) && parser.status.isOK()) {
	// 		this.add(result.name, result);
	// 	}
	// }

	public add(name: string, matcher: ProblemMatcher): void {
		this.matchers[name] = matcher;
	}

	public get(name: string): ProblemMatcher {
		return this.matchers[name];
	}

	public exists(name: string): boolean {
		return !!this.matchers[name];
	}

	public remove(name: string): void {
		delete this.matchers[name];
	}
}

export const registry: ProblemMatcherRegistry = new ProblemMatcherRegistry();

registry.add('msCompile', {
	owner: 'msCompile',
	applyTo: ApplyToKind.allDocuments,
	fileLocation: FileLocationKind.Absolute,
	pattern: defaultPattern('msCompile')
});

registry.add('lessCompile', {
	owner: 'lessCompile',
	applyTo: ApplyToKind.allDocuments,
	fileLocation: FileLocationKind.Absolute,
	pattern: defaultPattern('lessCompile'),
	severity: Severity.Error
});

registry.add('tsc', {
	owner: 'typescript',
	applyTo: ApplyToKind.closedDocuments,
	fileLocation: FileLocationKind.Relative,
	filePrefix: '${cwd}',
	pattern: defaultPattern('tsc')
});

let matcher = {
	owner: 'typescript',
	applyTo: ApplyToKind.closedDocuments,
	fileLocation: FileLocationKind.Relative,
	filePrefix: '${cwd}',
	pattern: defaultPattern('tsc'),
	watching: {
		activeOnStart: true,
		beginsPattern: { regexp: /^\s*(?:message TS6032:|\d{1,2}:\d{1,2}:\d{1,2}(?: AM| PM)? -) File change detected\. Starting incremental compilation\.\.\./ },
		endsPattern: { regexp: /^\s*(?:message TS6042:|\d{1,2}:\d{1,2}:\d{1,2}(?: AM| PM)? -) Compilation complete\. Watching for file changes\./ }
	}
};
(<any>matcher).tscWatch = true;
registry.add('tsc-watch', matcher);

registry.add('gulp-tsc', {
	owner: 'typescript',
	applyTo: ApplyToKind.closedDocuments,
	fileLocation: FileLocationKind.Relative,
	filePrefix: '${cwd}',
	pattern: defaultPattern('gulp-tsc')
});

registry.add('jshint', {
	owner: 'jshint',
	applyTo: ApplyToKind.allDocuments,
	fileLocation: FileLocationKind.Absolute,
	pattern: defaultPattern('jshint')
});

registry.add('jshint-stylish', {
	owner: 'jshint',
	applyTo: ApplyToKind.allDocuments,
	fileLocation: FileLocationKind.Absolute,
	pattern: defaultPattern('jshint-stylish')
});

registry.add('eslint-compact', {
	owner: 'eslint',
	applyTo: ApplyToKind.allDocuments,
	fileLocation: FileLocationKind.Relative,
	filePrefix: '${cwd}',
	pattern: defaultPattern('eslint-compact')
});

registry.add('eslint-stylish', {
	owner: 'eslint',
	applyTo: ApplyToKind.allDocuments,
	fileLocation: FileLocationKind.Absolute,
	pattern: defaultPattern('eslint-stylish')
});

registry.add('go', {
	owner: 'go',
	applyTo: ApplyToKind.allDocuments,
	fileLocation: FileLocationKind.Relative,
	filePrefix: '${cwd}',
	pattern: defaultPattern('go')
});
