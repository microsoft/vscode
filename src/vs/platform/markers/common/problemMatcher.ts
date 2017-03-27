/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';

import * as Objects from 'vs/base/common/objects';
import * as Strings from 'vs/base/common/strings';
import * as Assert from 'vs/base/common/assert';
import * as Paths from 'vs/base/common/paths';
import * as Types from 'vs/base/common/types';
import * as UUID from 'vs/base/common/uuid';
import Severity from 'vs/base/common/severity';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IJSONSchema } from 'vs/base/common/jsonSchema';
import { ValidationStatus, ValidationState, IProblemReporter, Parser } from 'vs/base/common/parsers';
import { IStringDictionary } from 'vs/base/common/collections';

import { IMarkerData } from 'vs/platform/markers/common/markers';
import { ExtensionsRegistry, ExtensionMessageCollector } from 'vs/platform/extensions/common/extensionsRegistry';

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

	character?: number;

	endLine?: number;

	endCharacter?: number;

	code?: number;

	severity?: number;

	loop?: boolean;
}

export interface NamedProblemPattern extends ProblemPattern {
	name: string;
}

export type MultiLineProblemPattern = ProblemPattern[];

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

export interface NamedMultiLineProblemPattern {
	name: string;
	patterns: MultiLineProblemPattern;
}

export function isNamedProblemMatcher(value: ProblemMatcher): value is NamedProblemMatcher {
	return value && Types.isString((<NamedProblemMatcher>value).name) ? true : false;
}

let valueMap: { [key: string]: string; } = {
	E: 'error',
	W: 'warning',
	I: 'info',
};

interface Location {
	startLineNumber: number;
	startCharacter: number;
	endLineNumber: number;
	endCharacter: number;
}

interface ProblemData {
	file?: string;
	location?: string;
	line?: string;
	character?: string;
	endLine?: string;
	endCharacter?: string;
	message?: string;
	severity?: string;
	code?: string;
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
		this.fillProperty(data, 'character', pattern, matches);
		this.fillProperty(data, 'endLine', pattern, matches);
		this.fillProperty(data, 'endCharacter', pattern, matches);
	}

	private fillProperty(data: ProblemData, property: keyof ProblemData, pattern: ProblemPattern, matches: RegExpExecArray, trim: boolean = false): void {
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
				startColumn: location.startCharacter,
				endLineNumber: location.startLineNumber,
				endColumn: location.endCharacter,
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
		let startColumn = data.character ? parseInt(data.character) : undefined;
		let endLine = data.endLine ? parseInt(data.endLine) : undefined;
		let endColumn = data.endCharacter ? parseInt(data.endCharacter) : undefined;
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
			return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: endLine || startLine, endCharacter: endColumn };
		}
		if (startLine && startColumn) {
			return { startLineNumber: startLine, startCharacter: startColumn, endLineNumber: startLine, endCharacter: startColumn };
		}
		return { startLineNumber: startLine, startCharacter: 1, endLineNumber: startLine, endCharacter: Number.MAX_VALUE };
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
	}

	export interface NamedProblemPattern extends ProblemPattern {
		/**
		 * The name of the problem pattern.
		 */
		name: string;
	}

	export namespace NamedProblemPattern {
		export function is(value: ProblemPattern): value is NamedProblemPattern {
			let candidate: NamedProblemPattern = value as NamedProblemPattern;
			return candidate && Types.isString(candidate.name);
		}
	}

	export type MultiLineProblemPattern = ProblemPattern[];

	export namespace MultiLineProblemPattern {
		export function is(value: any): value is MultiLineProblemPattern {
			return value && Types.isArray(value);
		}
	}

	export interface NamedMultiLineProblemPattern {
		/**
		 * The name of the problem pattern.
		 */
		name: string;

		/**
		 * The actual patterns
		 */
		patterns: MultiLineProblemPattern;
	}

	export namespace NamedMultiLineProblemPattern {
		export function is(value: any): value is NamedMultiLineProblemPattern {
			let candidate = value as NamedMultiLineProblemPattern;
			return candidate && Types.isString(candidate.name) && Types.isArray(candidate.patterns);
		}
	}

	export type NamedProblemPatterns = (Config.NamedProblemPattern | Config.NamedMultiLineProblemPattern)[];

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

class ProblemPatternParser extends Parser {

	constructor(logger: IProblemReporter) {
		super(logger);
	}

	public parse(value: Config.ProblemPattern): ProblemPattern;
	public parse(value: Config.MultiLineProblemPattern): MultiLineProblemPattern[];
	public parse(value: Config.NamedProblemPattern): NamedProblemPattern;
	public parse(value: Config.NamedMultiLineProblemPattern): NamedMultiLineProblemPattern;
	public parse(value: Config.ProblemPattern | Config.MultiLineProblemPattern | Config.NamedProblemPattern | Config.NamedMultiLineProblemPattern): any {
		if (Config.NamedMultiLineProblemPattern.is(value)) {
			this.createNamedMultiLineProblemPattern(value);
		} else if (Config.MultiLineProblemPattern.is(value)) {
			return this.createMultiLineProblemPattern(value);
		} else if (Config.NamedProblemPattern.is(value)) {
			let result = this.createSingleProblemPattern(value) as NamedProblemPattern;
			result.name = value.name;
			return result;
		} else if (value) {
			return this.createSingleProblemPattern(value);
		} else {
			return null;
		}
	}

	private createSingleProblemPattern(value: Config.ProblemPattern): ProblemPattern {
		let result = this.doCreateSingleProblemPattern(value, true);
		return this.validateProblemPattern([result]) ? result : null;
	}

	private createNamedMultiLineProblemPattern(value: Config.NamedMultiLineProblemPattern): NamedMultiLineProblemPattern {
		let result = {
			name: value.name,
			patterns: this.createMultiLineProblemPattern(value.patterns)
		};
		return result.patterns ? result : null;
	}

	private createMultiLineProblemPattern(values: Config.MultiLineProblemPattern): MultiLineProblemPattern {
		let result: MultiLineProblemPattern = [];
		for (let i = 0; i < values.length; i++) {
			let pattern = this.doCreateSingleProblemPattern(values[i], false);
			if (i < values.length - 1) {
				if (!Types.isUndefined(pattern.loop) && pattern.loop) {
					pattern.loop = false;
					this.error(localize('ProblemPatternParser.loopProperty.notLast', 'The loop property is only supported on the last line matcher.'));
				}
			}
			result.push(pattern);
		}
		return this.validateProblemPattern(result) ? result : null;
	}

	private doCreateSingleProblemPattern(value: Config.ProblemPattern, setDefaults: boolean): ProblemPattern {
		let result: ProblemPattern = {
			regexp: this.createRegularExpression(value.regexp)
		};

		function copyProperty(result: ProblemPattern, source: Config.ProblemPattern, resultKey: keyof ProblemPattern, sourceKey: keyof Config.ProblemPattern) {
			let value = source[sourceKey];
			if (typeof value === 'number') {
				result[resultKey] = value;
			}
		}
		copyProperty(result, value, 'file', 'file');
		copyProperty(result, value, 'location', 'location');
		copyProperty(result, value, 'line', 'line');
		copyProperty(result, value, 'character', 'column');
		copyProperty(result, value, 'endLine', 'endLine');
		copyProperty(result, value, 'endCharacter', 'endColumn');
		copyProperty(result, value, 'severity', 'severity');
		copyProperty(result, value, 'code', 'code');
		copyProperty(result, value, 'message', 'message');
		if (value.loop === true || value.loop === false) {
			result.loop = value.loop;
		}
		if (setDefaults) {
			if (result.location) {
				let defaultValue: Partial<ProblemPattern> = {
					file: 1,
					message: 0
				};
				result = Objects.mixin(result, defaultValue, false);
			} else {
				let defaultValue: Partial<ProblemPattern> = {
					file: 1,
					line: 2,
					character: 3,
					message: 0
				};
				result = Objects.mixin(result, defaultValue, false);
			}
		}
		return result;
	}

	private validateProblemPattern(values: ProblemPattern[]): boolean {
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
			this.error(localize('ProblemPatternParser.problemPattern.missingRegExp', 'The problem pattern is missing a regular expression.'));
			return false;
		}
		if (!(file && message && (location || line))) {
			this.error(localize('ProblemPatternParser.problemPattern.missingProperty', 'The problem pattern is invalid. It must have at least a file, message and line or location match group.'));
			return false;
		}
		return true;
	}

	private createRegularExpression(value: string): RegExp {
		let result: RegExp = null;
		if (!value) {
			return result;
		}
		try {
			result = new RegExp(value);
		} catch (err) {
			this.error(localize('ProblemPatternParser.invalidRegexp', 'Error: The string {0} is not a valid regular expression.\n', value));
		}
		return result;
	}
}

export class ExtensionRegistryReporter implements IProblemReporter {
	constructor(private _collector: ExtensionMessageCollector, private _validationStatus: ValidationStatus = new ValidationStatus()) {
	}

	public info(message: string): void {
		this._validationStatus.state = ValidationState.Info;
		this._collector.info(message);
	}

	public warn(message: string): void {
		this._validationStatus.state = ValidationState.Warning;
		this._collector.warn(message);
	}

	public error(message: string): void {
		this._validationStatus.state = ValidationState.Error;
		this._collector.error(message);
	}

	public fatal(message: string): void {
		this._validationStatus.state = ValidationState.Fatal;
		this._collector.error(message);
	}

	public get status(): ValidationStatus {
		return this._validationStatus;
	}
}

export namespace Schemas {

	export const ProblemPattern: IJSONSchema = {
		default: {
			regexp: '^([^\\\\s].*)\\\\((\\\\d+,\\\\d+)\\\\):\\\\s*(.*)$',
			file: 1,
			location: 2,
			message: 3
		},
		type: 'object',
		additionalProperties: false,
		properties: {
			regexp: {
				type: 'string',
				description: localize('ProblemPatternSchema.regexp', 'The regular expression to find an error, warning or info in the output.')
			},
			file: {
				type: 'integer',
				description: localize('ProblemPatternSchema.file', 'The match group index of the filename. If omitted 1 is used.')
			},
			location: {
				type: 'integer',
				description: localize('ProblemPatternSchema.location', 'The match group index of the problem\'s location. Valid location patterns are: (line), (line,column) and (startLine,startColumn,endLine,endColumn). If omitted (line,column) is assumed.')
			},
			line: {
				type: 'integer',
				description: localize('ProblemPatternSchema.line', 'The match group index of the problem\'s line. Defaults to 2')
			},
			column: {
				type: 'integer',
				description: localize('ProblemPatternSchema.column', 'The match group index of the problem\'s line character. Defaults to 3')
			},
			endLine: {
				type: 'integer',
				description: localize('ProblemPatternSchema.endLine', 'The match group index of the problem\'s end line. Defaults to undefined')
			},
			endColumn: {
				type: 'integer',
				description: localize('ProblemPatternSchema.endColumn', 'The match group index of the problem\'s end line character. Defaults to undefined')
			},
			severity: {
				type: 'integer',
				description: localize('ProblemPatternSchema.severity', 'The match group index of the problem\'s severity. Defaults to undefined')
			},
			code: {
				type: 'integer',
				description: localize('ProblemPatternSchema.code', 'The match group index of the problem\'s code. Defaults to undefined')
			},
			message: {
				type: 'integer',
				description: localize('ProblemPatternSchema.message', 'The match group index of the message. If omitted it defaults to 4 if location is specified. Otherwise it defaults to 5.')
			},
			loop: {
				type: 'boolean',
				description: localize('ProblemPatternSchema.loop', 'In a multi line matcher loop indicated whether this pattern is executed in a loop as long as it matches. Can only specified on a last pattern in a multi line pattern.')
			}
		}
	};

	export const NamedProblemPattern: IJSONSchema = Objects.clone(ProblemPattern);
	NamedProblemPattern.properties = Objects.clone(NamedProblemPattern.properties);
	NamedProblemPattern.properties['name'] = {
		type: 'string',
		description: localize('NamedProblemPatternSchema.name', 'The name of the problem pattern.')
	};


	export const MultLileProblemPattern: IJSONSchema = {
		type: 'array',
		items: ProblemPattern
	};

	export const NamedMultiLineProblemPattern: IJSONSchema = {
		type: 'object',
		additionalProperties: false,
		properties: {
			name: {
				type: 'string',
				description: localize('NamedMultiLineProblemPatternSchema.name', 'The name of the problem multi line problem pattern.')
			},
			patterns: {
				type: 'array',
				description: localize('NamedMultiLineProblemPatternSchema.patterns', 'The actual patterns.'),
				items: ProblemPattern
			}
		}
	};
}

let problemPatternExtPoint = ExtensionsRegistry.registerExtensionPoint<Config.NamedProblemPatterns>('problemPatterns', [], {
	description: localize('ProblemPatternExtPoint', 'Contributes problem patterns'),
	type: 'array',
	items: {
		anyOf: [
			Schemas.NamedProblemPattern,
			Schemas.NamedMultiLineProblemPattern
		]
	}
});

export interface IProblemPatternRegistry {
	onReady(): TPromise<void>;

	exists(key: string): boolean;
	get(key: string): ProblemPattern | MultiLineProblemPattern;
}

class ProblemPatternRegistryImpl implements IProblemPatternRegistry {

	private patterns: IStringDictionary<ProblemPattern | ProblemPattern[]>;
	private readyPromise: TPromise<void>;

	constructor() {
		this.patterns = Object.create(null);
		this.fillDefaults();
		this.readyPromise = new TPromise<void>((resolve, reject) => {
			problemPatternExtPoint.setHandler((extensions) => {
				// We get all statically know extension during startup in one batch
				try {
					extensions.forEach(extension => {
						let problemPatterns = extension.value as Config.NamedProblemPatterns;
						let parser = new ProblemPatternParser(new ExtensionRegistryReporter(extension.collector));
						for (let pattern of problemPatterns) {
							if (Config.NamedMultiLineProblemPattern.is(pattern)) {
								let result = parser.parse(pattern);
								if (parser.problemReporter.status.state < ValidationState.Error) {
									this.add(result.name, result.patterns);
								} else {
									extension.collector.error(localize('ProblemPatternRegistry.error', 'Invalid problem pattern. The pattern will be ignored.'));
									extension.collector.error(JSON.stringify(pattern, undefined, 4));
								}
							}
							else if (Config.NamedProblemPattern.is(pattern)) {
								let result = parser.parse(pattern);
								if (parser.problemReporter.status.state < ValidationState.Error) {
									this.add(pattern.name, result);
								} else {
									extension.collector.error(localize('ProblemPatternRegistry.error', 'Invalid problem pattern. The pattern will be ignored.'));
									extension.collector.error(JSON.stringify(pattern, undefined, 4));
								}
							}
							parser.reset();
						}
					});
				} catch (error) {
					// Do nothing
				}
				resolve(undefined);
			});
		});
	}

	public onReady(): TPromise<void> {
		return this.readyPromise;
	}

	public add(key: string, value: ProblemPattern | ProblemPattern[]): void {
		this.patterns[key] = value;
	}

	public get(key: string): ProblemPattern | ProblemPattern[] {
		return this.patterns[key];
	}

	public exists(key: string): boolean {
		return !!this.patterns[key];
	}

	public remove(key: string): void {
		delete this.patterns[key];
	}

	private fillDefaults(): void {
		this.add('msCompile', {
			regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\)\s*:\s+(error|warning|info)\s+(\w{1,2}\d+)\s*:\s*(.*)$/,
			file: 1,
			location: 2,
			severity: 3,
			code: 4,
			message: 5
		});
		this.add('gulp-tsc', {
			regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(\d+)\s+(.*)$/,
			file: 1,
			location: 2,
			code: 3,
			message: 4
		});
		this.add('cpp', {
			regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(C\d+)\s*:\s*(.*)$/,
			file: 1,
			location: 2,
			severity: 3,
			code: 4,
			message: 5
		});
		this.add('csc', {
			regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(CS\d+)\s*:\s*(.*)$/,
			file: 1,
			location: 2,
			severity: 3,
			code: 4,
			message: 5
		});
		this.add('vb', {
			regexp: /^([^\s].*)\((\d+|\d+,\d+|\d+,\d+,\d+,\d+)\):\s+(error|warning|info)\s+(BC\d+)\s*:\s*(.*)$/,
			file: 1,
			location: 2,
			severity: 3,
			code: 4,
			message: 5
		});
		this.add('lessCompile', {
			regexp: /^\s*(.*) in file (.*) line no. (\d+)$/,
			message: 1,
			file: 2,
			line: 3
		});
		this.add('jshint', {
			regexp: /^(.*):\s+line\s+(\d+),\s+col\s+(\d+),\s(.+?)(?:\s+\((\w)(\d+)\))?$/,
			file: 1,
			line: 2,
			character: 3,
			message: 4,
			severity: 5,
			code: 6
		});
		this.add('jshint-stylish', [
			{
				regexp: /^(.+)$/,
				file: 1
			},
			{
				regexp: /^\s+line\s+(\d+)\s+col\s+(\d+)\s+(.+?)(?:\s+\((\w)(\d+)\))?$/,
				line: 1,
				character: 2,
				message: 3,
				severity: 4,
				code: 5,
				loop: true
			}
		]);
		this.add('eslint-compact', {
			regexp: /^(.+):\sline\s(\d+),\scol\s(\d+),\s(Error|Warning|Info)\s-\s(.+)\s\((.+)\)$/,
			file: 1,
			line: 2,
			character: 3,
			severity: 4,
			message: 5,
			code: 6
		});
		this.add('eslint-stylish', [
			{
				regexp: /^([^\s].*)$/,
				file: 1
			},
			{
				regexp: /^\s+(\d+):(\d+)\s+(error|warning|info)\s+(.+?)\s\s+(.*)$/,
				line: 1,
				character: 2,
				severity: 3,
				message: 4,
				code: 5,
				loop: true
			}
		]);
		this.add('go', {
			regexp: /^([^:]*: )?((.:)?[^:]*):(\d+)(:(\d+))?: (.*)$/,
			file: 2,
			line: 4,
			character: 6,
			message: 7
		});
	}
}

export const ProblemPatternRegistry: IProblemPatternRegistry = new ProblemPatternRegistryImpl();

export class ProblemMatcherParser extends Parser {

	constructor(logger: IProblemReporter) {
		super(logger);
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
		if (!problemMatcher) {
			this.error(localize('ProblemMatcherParser.noProblemMatcher', 'Error: the description can\'t be converted into a problem matcher:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
			return false;
		}
		if (!problemMatcher.pattern) {
			this.error(localize('ProblemMatcherParser.noProblemPattern', 'Error: the description doesn\'t define a valid problem pattern:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
			return false;
		}
		if (!problemMatcher.owner) {
			this.error(localize('ProblemMatcherParser.noOwner', 'Error: the description doesn\'t define an owner:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
			return false;
		}
		if (Types.isUndefined(problemMatcher.fileLocation)) {
			this.error(localize('ProblemMatcherParser.noFileLocation', 'Error: the description doesn\'t define a file location:\n{0}\n', JSON.stringify(externalProblemMatcher, null, 4)));
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
			this.info(localize('ProblemMatcherParser.unknownSeverity', 'Info: unknown severity {0}. Valid values are error, warning and info.\n', description.severity));
			severity = Severity.Error;
		}

		if (Types.isString(description.base)) {
			let variableName = <string>description.base;
			if (variableName.length > 1 && variableName[0] === '$') {
				let base = ProblemMatcherRegistry.get(variableName.substring(1));
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
		if (Types.isString(value)) {
			let variableName: string = <string>value;
			if (variableName.length > 1 && variableName[0] === '$') {
				let result = ProblemPatternRegistry.get(variableName.substring(1));
				if (!result) {
					this.error(localize('ProblemMatcherParser.noDefinedPatter', 'Error: the pattern with the identifier {0} doesn\'t exist.', variableName));
				}
				return result;
			} else {
				if (variableName.length === 0) {
					this.error(localize('ProblemMatcherParser.noIdentifier', 'Error: the pattern property refers to an empty identifier.'));
				} else {
					this.error(localize('ProblemMatcherParser.noValidIdentifier', 'Error: the pattern property {0} is not a valid pattern variable name.', variableName));
				}
			}
		} else if (value) {
			let problemPatternParser = new ProblemPatternParser(this.problemReporter);
			return problemPatternParser.parse(value);
		}
		return null;
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
			this.error(localize('ProblemMatcherParser.problemPattern.watchingMatcher', 'A problem matcher must define both a begin pattern and an end pattern for watching.'));
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
		return file ? { regexp, file } : { regexp, file: 1 };
	}

	private createRegularExpression(value: string): RegExp {
		let result: RegExp = null;
		if (!value) {
			return result;
		}
		try {
			result = new RegExp(value);
		} catch (err) {
			this.error(localize('ProblemMatcherParser.invalidRegexp', 'Error: The string {0} is not a valid regular expression.\n', value));
		}
		return result;
	}
}

export namespace Schemas {

	export const WatchingPattern: IJSONSchema = {
		type: 'object',
		additionalProperties: false,
		properties: {
			regexp: {
				type: 'string',
				description: localize('WatchingPatternSchema.regexp', 'The regular expression to detect the begin or end of a watching task.')
			},
			file: {
				type: 'integer',
				description: localize('WatchingPatternSchema.file', 'The match group index of the filename. Can be omitted.')
			},
		}
	};


	export const PatternType: IJSONSchema = {
		anyOf: [
			{
				type: 'string',
				description: localize('PatternTypeSchema.name', 'The name of a contributed or predefined pattern')
			},
			Schemas.ProblemPattern,
			Schemas.MultLileProblemPattern
		],
		description: localize('PatternTypeSchema.description', 'A problem pattern or the name of a contributed or predefined problem pattern. Can be omitted if base is specified.')
	};

	export const ProblemMatcher: IJSONSchema = {
		type: 'object',
		additionalProperties: false,
		properties: {
			base: {
				type: 'string',
				description: localize('ProblemMatcherSchema.base', 'The name of a base problem matcher to use.')
			},
			owner: {
				type: 'string',
				description: localize('ProblemMatcherSchema.owner', 'The owner of the problem inside Code. Can be omitted if base is specified. Defaults to \'external\' if omitted and base is not specified.')
			},
			severity: {
				type: 'string',
				enum: ['error', 'warning', 'info'],
				description: localize('ProblemMatcherSchema.severity', 'The default severity for captures problems. Is used if the pattern doesn\'t define a match group for severity.')
			},
			applyTo: {
				type: 'string',
				enum: ['allDocuments', 'openDocuments', 'closedDocuments'],
				description: localize('ProblemMatcherSchema.applyTo', 'Controls if a problem reported on a text document is applied only to open, closed or all documents.')
			},
			pattern: PatternType,
			fileLocation: {
				oneOf: [
					{
						type: 'string',
						enum: ['absolute', 'relative']
					},
					{
						type: 'array',
						items: {
							type: 'string'
						}
					}
				],
				description: localize('ProblemMatcherSchema.fileLocation', 'Defines how file names reported in a problem pattern should be interpreted.')
			},
			watching: {
				type: 'object',
				additionalProperties: false,
				properties: {
					activeOnStart: {
						type: 'boolean',
						description: localize('ProblemMatcherSchema.watching.activeOnStart', 'If set to true the watcher is in active mode when the task starts. This is equals of issuing a line that matches the beginPattern')
					},
					beginsPattern: {
						oneOf: [
							{
								type: 'string'
							},
							Schemas.WatchingPattern
						],
						description: localize('ProblemMatcherSchema.watching.beginsPattern', 'If matched in the output the start of a watching task is signaled.')
					},
					endsPattern: {
						oneOf: [
							{
								type: 'string'
							},
							Schemas.WatchingPattern
						],
						description: localize('ProblemMatcherSchema.watching.endsPattern', 'If matched in the output the end of a watching task is signaled.')
					}
				},
				description: localize('ProblemMatcherSchema.watching', 'Patterns to track the begin and end of a watching pattern.')
			}
		}
	};

	export const LegacyProblemMatcher: IJSONSchema = Objects.clone(ProblemMatcher);
	LegacyProblemMatcher.properties = Objects.clone(LegacyProblemMatcher.properties);
	LegacyProblemMatcher.properties['watchedTaskBeginsRegExp'] = {
		type: 'string',
		deprecationMessage: localize('LegacyProblemMatcherSchema.watchedBegin.deprecated', 'This property is deprecated. Use the watching property instead.'),
		description: localize('LegacyProblemMatcherSchema.watchedBegin', 'A regular expression signaling that a watched tasks begins executing triggered through file watching.')
	};
	LegacyProblemMatcher.properties['watchedTaskEndsRegExp'] = {
		type: 'string',
		deprecationMessage: localize('LegacyProblemMatcherSchema.watchedEnd.deprecated', 'This property is deprecated. Use the watching property instead.'),
		description: localize('LegacyProblemMatcherSchema.watchedEnd', 'A regular expression signaling that a watched tasks ends executing.')
	};

	export const NamedProblemMatcher: IJSONSchema = Objects.clone(ProblemMatcher);
	NamedProblemMatcher.properties = Objects.clone(NamedProblemMatcher.properties);
	NamedProblemMatcher.properties['name'] = {
		type: 'string',
		description: localize('NamedProblemMatcherSchema.name', 'The name of the problem matcher.')
	};
}

let problemMatchersExtPoint = ExtensionsRegistry.registerExtensionPoint<Config.NamedProblemMatcher[]>('problemMatchers', [problemPatternExtPoint], {
	description: localize('ProblemMatcherExtPoint', 'Contributes problem matchers'),
	type: 'array',
	items: Schemas.NamedProblemMatcher
});

export interface IProblemMatcherRegistry {
	onReady(): TPromise<void>;
	exists(name: string): boolean;
	get(name: string): ProblemMatcher;
}

class ProblemMatcherRegistryImpl implements IProblemMatcherRegistry {

	private matchers: IStringDictionary<ProblemMatcher>;
	private readyPromise: TPromise<void>;

	constructor() {
		this.matchers = Object.create(null);
		this.fillDefaults();
		this.readyPromise = new TPromise<void>((resolve, reject) => {
			problemMatchersExtPoint.setHandler((extensions) => {
				try {
					extensions.forEach(extension => {
						let problemMatchers = extension.value;
						let parser = new ProblemMatcherParser(new ExtensionRegistryReporter(extension.collector));
						for (let matcher of problemMatchers) {
							let result = parser.parse(matcher);
							if (result && isNamedProblemMatcher(result)) {
								this.add(result.name, result);
							}
						}
					});
				} catch (error) {
				}
				let matcher = this.get('tsc-watch');
				if (matcher) {
					(<any>matcher).tscWatch = true;
				}
				resolve(undefined);
			});
		});
	}

	public onReady(): TPromise<void> {
		return this.readyPromise;
	}

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

	private fillDefaults(): void {
		this.add('msCompile', {
			owner: 'msCompile',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: ProblemPatternRegistry.get('msCompile')
		});

		this.add('lessCompile', {
			owner: 'lessCompile',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: ProblemPatternRegistry.get('lessCompile'),
			severity: Severity.Error
		});

		this.add('gulp-tsc', {
			owner: 'typescript',
			applyTo: ApplyToKind.closedDocuments,
			fileLocation: FileLocationKind.Relative,
			filePrefix: '${cwd}',
			pattern: ProblemPatternRegistry.get('gulp-tsc')
		});

		this.add('jshint', {
			owner: 'jshint',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: ProblemPatternRegistry.get('jshint')
		});

		this.add('jshint-stylish', {
			owner: 'jshint',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: ProblemPatternRegistry.get('jshint-stylish')
		});

		this.add('eslint-compact', {
			owner: 'eslint',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Relative,
			filePrefix: '${cwd}',
			pattern: ProblemPatternRegistry.get('eslint-compact')
		});

		this.add('eslint-stylish', {
			owner: 'eslint',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Absolute,
			pattern: ProblemPatternRegistry.get('eslint-stylish')
		});

		this.add('go', {
			owner: 'go',
			applyTo: ApplyToKind.allDocuments,
			fileLocation: FileLocationKind.Relative,
			filePrefix: '${cwd}',
			pattern: ProblemPatternRegistry.get('go')
		});
	}
}

export const ProblemMatcherRegistry: IProblemMatcherRegistry = new ProblemMatcherRegistryImpl();