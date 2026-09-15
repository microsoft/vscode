/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { localize } from '../../../nls.js';
import { semanticDiffReportSchema, semanticDiffValidationSubmissionSchema } from './semanticDiffSchema.js';

export { semanticDiffSubmissionSchema } from './semanticDiffSchema.js';

export const SEMANTIC_DIFF_TOOL_NAME = 'classify_diff_hunks';
export const SEMANTIC_DIFF_MIME_TYPE = 'application/vnd.vscode.semantic-diff-classification+json';
export const SEMANTIC_DIFF_INPUT_BYTE_LIMIT = 1024 * 1024;
export const SEMANTIC_DIFF_RESULT_BYTE_LIMIT = SEMANTIC_DIFF_INPUT_BYTE_LIMIT + 4096;

export type SemanticDiffChangeType = 'logic' | 'test' | 'supporting' | 'generated';
export type SemanticDiffConfidence = 'high' | 'medium' | 'low';
export type SemanticDiffComparison = 'staged' | 'workingTree' | 'commitRange';

export interface ISemanticDiffSource {
	repositoryLabel: string;
	comparison: SemanticDiffComparison;
	baseRevision: string;
	targetRevision: string | null;
	diffFingerprint: string | null;
	capturedAt: string;
	inventoryComplete: boolean;
}

export interface ISemanticDiffGroup {
	id: string;
	title: string;
	description: string;
}

export interface ISemanticDiffFile {
	id: string;
	path: string;
	oldPath: string | null;
	status: 'added' | 'modified' | 'deleted' | 'renamed';
	contentKind: 'text' | 'binary' | 'metadata';
}

export interface ISemanticDiffRange {
	start: number;
	count: number;
}

export interface ISemanticDiffClassification {
	groupId: string | null;
	changeType: SemanticDiffChangeType | null;
	secondaryChangeTypes: SemanticDiffChangeType[];
	summary: string;
	groupReason: string;
	typeReason: string;
	groupConfidence: SemanticDiffConfidence | null;
	typeConfidence: SemanticDiffConfidence | null;
	uncertainty: string | null;
}

export interface ISemanticDiffReviewFocus {
	oldRanges: ISemanticDiffRange[];
	newRanges: ISemanticDiffRange[];
	reason: string;
}

export interface ISemanticDiffChangeTypeRanges {
	changeType: SemanticDiffChangeType | null;
	oldRanges: ISemanticDiffRange[];
	newRanges: ISemanticDiffRange[];
}

export interface ISemanticDiffHunk {
	id: string;
	fileId: string;
	oldRange: ISemanticDiffRange;
	newRange: ISemanticDiffRange;
	additions: number;
	deletions: number;
	classification: ISemanticDiffClassification;
	changeTypeRanges?: ISemanticDiffChangeTypeRanges[];
	reviewFocus?: ISemanticDiffReviewFocus;
}

export interface ISemanticDiffLimitation {
	code: 'incompleteInventory' | 'truncatedDiff' | 'missingContext' | 'nonTextChange' | 'excludedContent' | 'unsupportedChange' | 'staleSource';
	message: string;
	fileId: string | null;
	hunkId: string | null;
}

export interface ISemanticDiffAnalysis {
	source: ISemanticDiffSource;
	groups: ISemanticDiffGroup[];
	files: ISemanticDiffFile[];
	hunks: ISemanticDiffHunk[];
	limitations: ISemanticDiffLimitation[];
}

export interface ISemanticDiffSubmission {
	schemaVersion: 1;
	analysis: ISemanticDiffAnalysis;
}

export interface ISemanticDiffSummary {
	groups: number;
	files: number;
	hunks: number;
	assignedHunks: number;
	unassignedHunks: number;
	untypedHunks: number;
	uncertainHunks: number;
	mixedTypeHunks: number;
	additions: number;
	deletions: number;
	byChangeType: Record<SemanticDiffChangeType | 'unknown', number>;
}

export interface ISemanticDiffReport extends ISemanticDiffSubmission {
	kind: 'semanticDiffClassification';
	status: 'complete' | 'partial';
	sourceVerification: 'agent-reported';
	summary: ISemanticDiffSummary;
}

export type SemanticDiffIssueCode =
	| 'SCHEMA_VIOLATION' | 'DUPLICATE_ID' | 'DUPLICATE_PATH' | 'UNKNOWN_FILE' | 'UNKNOWN_GROUP'
	| 'INVALID_SOURCE' | 'INVALID_PATH' | 'INVALID_RANGE' | 'OVERLAPPING_HUNKS'
	| 'INVALID_TYPE_COMBINATION' | 'INVALID_CONFIDENCE' | 'MISSING_UNCERTAINTY' | 'EMPTY_GROUP'
	| 'UNKNOWN_HUNK' | 'LIMITATION_SCOPE_MISMATCH' | 'MISSING_LIMITATION';

export interface ISemanticDiffIssue {
	path: string;
	code: SemanticDiffIssueCode;
	message: string;
}

export interface ISemanticDiffErrorEnvelope {
	schemaVersion: 1;
	status: 'error';
	error: {
		code: 'UNSUPPORTED_VERSION' | 'INPUT_LIMIT_EXCEEDED' | 'INVALID_CLASSIFICATION' | 'INTERNAL_ERROR';
		message: string;
		issues: ISemanticDiffIssue[];
		omittedIssueCount: number;
	};
}

export type SemanticDiffValidationResult = { ok: true; report: ISemanticDiffReport } | { ok: false; error: ISemanticDiffErrorEnvelope };

const changeTypes: readonly SemanticDiffChangeType[] = ['logic', 'test', 'supporting', 'generated'];

class Issues {
	readonly items: ISemanticDiffIssue[] = [];
	count = 0;
	limitExceeded = false;

	add(path: string, code: SemanticDiffIssueCode, message: string): void {
		this.count++;
		if (this.items.length < 20) {
			this.items.push({ path, code, message });
		}
	}

	schema(path: string): void {
		this.add(path, 'SCHEMA_VIOLATION', localize('semanticDiff.invalidField', "The field does not match the classification schema."));
	}

	failure(code: ISemanticDiffErrorEnvelope['error']['code'] = this.limitExceeded ? 'INPUT_LIMIT_EXCEEDED' : 'INVALID_CLASSIFICATION'): SemanticDiffValidationResult {
		const messages: Record<ISemanticDiffErrorEnvelope['error']['code'], string> = {
			UNSUPPORTED_VERSION: localize('semanticDiff.unsupportedVersion', "This classification schema version is not supported."),
			INPUT_LIMIT_EXCEEDED: localize('semanticDiff.inputLimit', "The classification exceeds the supported size or item limits."),
			INVALID_CLASSIFICATION: localize('semanticDiff.invalidClassification', "The classification contains invalid fields or inconsistent relationships."),
			INTERNAL_ERROR: localize('semanticDiff.internalError', "The classification could not be validated.")
		};
		return {
			ok: false,
			error: {
				schemaVersion: 1, status: 'error',
				error: { code, message: messages[code], issues: this.items, omittedIssueCount: this.count - this.items.length }
			}
		};
	}
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

class InvalidJson extends Error {
	constructor(readonly path: string) {
		super('Invalid JSON value');
	}
}

class InputLimit extends Error { }

function pointer(path: string, key: string | number): string {
	return `${path}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

/** Snapshot JSON data without invoking submitted accessors or serialization hooks. */
function readJson(raw: unknown, byteLimit: number): JsonValue {
	let bytes = 0;
	const ancestors = new Set<object>();
	const consume = (size: number) => {
		bytes += size;
		if (bytes > byteLimit) {
			throw new InputLimit();
		}
	};
	const read = (value: unknown, path: string, depth: number): JsonValue => {
		if (depth > 16) {
			throw new InvalidJson(path);
		}
		if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
			consume(VSBuffer.fromString(JSON.stringify(value)).byteLength);
			return value;
		}
		if (typeof value !== 'object' || !value || ancestors.has(value) || Object.getOwnPropertySymbols(value).length) {
			throw new InvalidJson(path);
		}
		const isArray = Array.isArray(value);
		const prototype = Object.getPrototypeOf(value);
		if (prototype !== (isArray ? Array.prototype : Object.prototype) && !(prototype === null && !isArray)) {
			throw new InvalidJson(path);
		}
		ancestors.add(value);
		consume(2);
		const readProperty = (key: string): JsonValue => {
			const descriptor = Object.getOwnPropertyDescriptor(value, key);
			if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
				throw new InvalidJson(pointer(path, key));
			}
			return read(descriptor.value, pointer(path, key), depth + 1);
		};
		let result: JsonValue;
		if (isArray) {
			if (Object.keys(value).length !== value.length) {
				throw new InvalidJson(path);
			}
			const entries: JsonValue[] = [];
			for (let i = 0; i < value.length; i++) {
				if (i) {
					consume(1);
				}
				entries.push(readProperty(String(i)));
			}
			result = entries;
		} else {
			const entries: { [key: string]: JsonValue } = {};
			for (const [index, key] of Object.keys(value).entries()) {
				consume(VSBuffer.fromString(JSON.stringify(key)).byteLength + 1 + (index ? 1 : 0));
				Object.defineProperty(entries, key, { value: readProperty(key), enumerable: true, configurable: true, writable: true });
			}
			result = entries;
		}
		ancestors.delete(value);
		return result;
	};
	return read(raw, '', 0);
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function matchesPattern(value: string, pattern: string): boolean {
	const match = new RegExp(pattern).exec(value);
	return !!match && (!(pattern.startsWith('^') && pattern.endsWith('$')) || match[0].length === value.length);
}

function isDateTime(value: string): boolean {
	const match = /^(?<year>[0-9]{4})-(?<month>[0-9]{2})-(?<day>[0-9]{2})[Tt](?<hour>[0-9]{2}):(?<minute>[0-9]{2}):(?<second>[0-9]{2})(?:\.[0-9]+)?(?<offset>[Zz]|[+-][0-9]{2}:[0-9]{2})$/.exec(value)?.groups;
	if (!match) {
		return false;
	}
	const year = Number(match.year);
	const month = Number(match.month);
	const day = Number(match.day);
	const hour = Number(match.hour);
	const minute = Number(match.minute);
	const second = Number(match.second);
	const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	const offsetHours = match.offset.length === 1 ? 0 : Number(match.offset.slice(1, 3));
	const offsetMinutes = match.offset.length === 1 ? 0 : Number(match.offset.slice(4, 6));
	const offsetSign = match.offset.startsWith('-') ? -1 : 1;
	const utcMinute = ((hour * 60 + minute - offsetSign * (offsetHours * 60 + offsetMinutes)) % 1440 + 1440) % 1440;
	return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] &&
		hour < 24 && minute < 60 && offsetHours < 24 && offsetMinutes < 60 &&
		(second < 60 || (second === 60 && utcMinute === 1439));
}

/** Validates the fixed schema's field vocabulary; conditional and uniqueness rules use typed checks below. */
function validateFields(value: JsonValue, schema: IJSONSchema, path: string, issues: Issues): void {
	if (schema.$ref) {
		const name = schema.$ref.slice('#/$defs/'.length);
		if (name === 'path' && (typeof value !== 'string' || !matchesPattern(value, semanticDiffValidationSubmissionSchema.$defs!.path.pattern!))) {
			issues.add(path, 'INVALID_PATH', localize('semanticDiff.invalidPath', "Use a repository-relative POSIX file path without traversal segments."));
			return;
		}
		validateFields(value, semanticDiffValidationSubmissionSchema.$defs![name], path, issues);
		return;
	}
	if (schema.anyOf) {
		if (!schema.anyOf.some(branch => {
			const branchIssues = new Issues();
			validateFields(value, branch, path, branchIssues);
			return branchIssues.count === 0;
		})) {
			issues.schema(path);
		}
		return;
	}
	if ((Object.hasOwn(schema, 'const') && value !== schema.const) || (schema.enum && !schema.enum.includes(value))) {
		issues.schema(path);
		return;
	}
	if (schema.type === 'object') {
		if (!isObject(value)) {
			issues.schema(path);
			return;
		}
		const properties = schema.properties!;
		for (const name of schema.required!) {
			if (!Object.hasOwn(value, name)) {
				issues.schema(pointer(path, name));
			}
		}
		for (const name of Object.keys(value)) {
			if (!Object.hasOwn(properties, name)) {
				issues.schema(pointer(path, name));
			}
		}
		for (const [name, property] of Object.entries(properties)) {
			if (Object.hasOwn(value, name)) {
				validateFields(value[name], property, pointer(path, name), issues);
			}
		}
	} else if (schema.type === 'array') {
		if (!Array.isArray(value)) {
			issues.schema(path);
			return;
		}
		if (schema.maxItems !== undefined && value.length > schema.maxItems) {
			if (path.endsWith('/secondaryChangeTypes')) {
				issues.add(path, 'INVALID_TYPE_COMBINATION', localize('semanticDiff.tooManyTypes', "A hunk can have at most three secondary change types."));
			} else {
				issues.limitExceeded = true;
				issues.schema(path);
			}
			return;
		}
		for (let i = 0; i < value.length; i++) {
			validateFields(value[i], schema.items as IJSONSchema, pointer(path, i), issues);
		}
	} else if (schema.type === 'string') {
		if (typeof value !== 'string' ||
			(schema.minLength !== undefined && [...value].length < schema.minLength) ||
			(schema.maxLength !== undefined && [...value].length > schema.maxLength) ||
			(schema.pattern !== undefined && !matchesPattern(value, schema.pattern)) ||
			(schema.format === 'date-time' && !isDateTime(value))) {
			issues.schema(path);
		}
	} else if (schema.type === 'integer') {
		if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < schema.minimum! || value > schema.maximum!) {
			issues.schema(path);
		}
	} else if ((schema.type === 'null' && value !== null) || (schema.type === 'boolean' && typeof value !== 'boolean')) {
		issues.schema(path);
	}
}

function hasSubmissionShape(value: JsonValue, issues: Issues): value is JsonValue & ISemanticDiffSubmission {
	validateFields(value, semanticDiffValidationSubmissionSchema, '', issues);
	return issues.count === 0;
}

function hasReportShape(value: JsonValue, issues: Issues): value is JsonValue & ISemanticDiffReport {
	validateFields(value, semanticDiffReportSchema, '', issues);
	return issues.count === 0;
}

function validateRelationships(analysis: ISemanticDiffAnalysis, issues: Issues): void {
	const groups = new Set<string>();
	const files = new Map<string, ISemanticDiffFile>();
	const hunks = new Map<string, ISemanticDiffHunk>();
	const paths = new Set<string>();
	const assignedGroups = new Set<string>();
	const fileHunks = new Map<string, ISemanticDiffHunk[]>();
	const duplicateId = (path: string) => issues.add(path, 'DUPLICATE_ID', localize('semanticDiff.duplicateId', "IDs must be unique within their inventory."));

	for (const [index, group] of analysis.groups.entries()) {
		if (groups.has(group.id)) {
			duplicateId(`/analysis/groups/${index}/id`);
		}
		groups.add(group.id);
	}
	for (const [index, file] of analysis.files.entries()) {
		const path = `/analysis/files/${index}`;
		if (files.has(file.id)) {
			duplicateId(`${path}/id`);
		}
		files.set(file.id, file);
		if (paths.has(file.path)) {
			issues.add(`${path}/path`, 'DUPLICATE_PATH', localize('semanticDiff.duplicatePath', "File paths must be unique."));
		}
		paths.add(file.path);
		if (file.status === 'renamed' ? file.oldPath === null || file.oldPath === file.path : file.oldPath !== null) {
			issues.add(`${path}/oldPath`, 'INVALID_PATH', localize('semanticDiff.renameShape', "A renamed file requires a different source path; other files require a null source path."));
		}
	}
	const source = analysis.source;
	if ((source.comparison === 'commitRange') !== (source.targetRevision !== null)) {
		issues.add('/analysis/source/targetRevision', 'INVALID_SOURCE', localize('semanticDiff.targetRevision', "A target revision is required only for a commit-range comparison; otherwise it must be null."));
	}
	for (const [index, hunk] of analysis.hunks.entries()) {
		const path = `/analysis/hunks/${index}`;
		if (hunks.has(hunk.id)) {
			duplicateId(`${path}/id`);
		}
		hunks.set(hunk.id, hunk);
		const file = files.get(hunk.fileId);
		if (!file) {
			issues.add(`${path}/fileId`, 'UNKNOWN_FILE', localize('semanticDiff.unknownFile', "Reference must name a file in analysis.files."));
		}
		if (file && file.contentKind !== 'text') {
			issues.add(`${path}/fileId`, 'INVALID_RANGE', localize('semanticDiff.nonTextHunks', "Nontext files must not contain textual hunks."));
		}
		if ((hunk.oldRange.count > 0 && hunk.oldRange.start === 0) ||
			(hunk.newRange.count > 0 && hunk.newRange.start === 0) ||
			hunk.additions + hunk.deletions === 0 ||
			hunk.additions > hunk.newRange.count || hunk.deletions > hunk.oldRange.count ||
			hunk.oldRange.count - hunk.deletions !== hunk.newRange.count - hunk.additions ||
			(file?.status === 'added' && hunk.oldRange.count !== 0) ||
			(file?.status === 'deleted' && hunk.newRange.count !== 0)) {
			issues.add(path, 'INVALID_RANGE', localize('semanticDiff.invalidRange', "Hunk ranges must contain a change, preserve equal context counts, and match the file status."));
		}
		const previous = fileHunks.get(hunk.fileId) ?? [];
		if (previous.some(other => overlaps(other.oldRange, hunk.oldRange) || overlaps(other.newRange, hunk.newRange) ||
			(other.oldRange.start === hunk.oldRange.start && other.oldRange.count === hunk.oldRange.count &&
				other.newRange.start === hunk.newRange.start && other.newRange.count === hunk.newRange.count))) {
			issues.add(path, 'OVERLAPPING_HUNKS', localize('semanticDiff.overlappingHunks', "Hunk coordinates must be unique and must not overlap or contain an interior zero-count anchor."));
		}
		const last = previous.at(-1);
		if (last && (hunk.oldRange.start < last.oldRange.start || hunk.newRange.start < last.newRange.start)) {
			issues.add(path, 'INVALID_RANGE', localize('semanticDiff.hunkOrder', "Hunks must be in ascending old and new source order within each file."));
		}
		previous.push(hunk);
		fileHunks.set(hunk.fileId, previous);
		const classification = hunk.classification;
		if (classification.groupId !== null) {
			assignedGroups.add(classification.groupId);
			if (!groups.has(classification.groupId)) {
				issues.add(`${path}/classification/groupId`, 'UNKNOWN_GROUP', localize('semanticDiff.unknownGroup', "Reference must name a group in analysis.groups or be null."));
			}
		}
		const types = classification.changeType === null ? [] : [classification.changeType, ...classification.secondaryChangeTypes];
		if ((classification.changeType === null && classification.secondaryChangeTypes.length > 0) ||
			types.some((type, i) => i > 0 && changeTypes.indexOf(type) <= changeTypes.indexOf(types[i - 1]))) {
			issues.add(`${path}/classification/secondaryChangeTypes`, 'INVALID_TYPE_COMBINATION', localize('semanticDiff.invalidTypes', "Types must be unique and in logic, test, supporting, generated order, with the highest-priority type primary. An unknown primary type requires no secondary types."));
		}
		for (const [axis, confidence] of [
			[classification.groupId, 'groupConfidence'],
			[classification.changeType, 'typeConfidence']
		] as const) {
			if ((axis === null) !== (classification[confidence] === null)) {
				issues.add(`${path}/classification/${confidence}`, 'INVALID_CONFIDENCE', localize('semanticDiff.invalidConfidence', "An unclassified axis requires null confidence; an assigned axis requires a confidence assessment."));
			}
		}
		if (isSemanticDiffHunkUncertain(hunk) && classification.uncertainty === null) {
			issues.add(`${path}/classification/uncertainty`, 'MISSING_UNCERTAINTY', localize('semanticDiff.missingUncertainty', "Explain uncertainty when an axis is unclassified or has low confidence."));
		}
		if (hunk.reviewFocus) {
			const ranges = [
				['oldRanges', hunk.reviewFocus.oldRanges, hunk.oldRange],
				['newRanges', hunk.reviewFocus.newRanges, hunk.newRange],
			] as const;
			if (ranges.every(([, focusRanges]) => focusRanges.length === 0)) {
				issues.add(`${path}/reviewFocus`, 'INVALID_RANGE', localize('semanticDiff.emptyReviewFocus', "A review focus requires at least one original or modified range."));
			}
			for (const [name, focusRanges, hunkRange] of ranges) {
				let previousEnd = -1;
				for (const [rangeIndex, range] of focusRanges.entries()) {
					if (!contains(hunkRange, range) || range.start < previousEnd) {
						issues.add(`${path}/reviewFocus/${name}/${rangeIndex}`, 'INVALID_RANGE', localize('semanticDiff.invalidReviewFocus', "Review focus ranges must be ordered, non-overlapping, and contained within the owning hunk."));
					}
					previousEnd = range.start + range.count;
				}
			}
		}
		if (hunk.changeTypeRanges) {
			const expectedTypes: readonly (SemanticDiffChangeType | null)[] = classification.changeType === null
				? [null]
				: [classification.changeType, ...classification.secondaryChangeTypes];
			if (hunk.changeTypeRanges.length !== expectedTypes.length ||
				hunk.changeTypeRanges.some((ranges, rangesIndex) => ranges.changeType !== expectedTypes[rangesIndex])) {
				issues.add(`${path}/changeTypeRanges`, 'INVALID_TYPE_COMBINATION', localize('semanticDiff.invalidChangeTypeRanges', "Changed-line types must match the primary type followed by the secondary types."));
			}
			for (const [rangesIndex, typeRanges] of hunk.changeTypeRanges.entries()) {
				if (typeRanges.oldRanges.length === 0 && typeRanges.newRanges.length === 0) {
					issues.add(`${path}/changeTypeRanges/${rangesIndex}`, 'INVALID_RANGE', localize('semanticDiff.emptyChangeTypeRanges', "A changed-line type requires at least one original or modified range."));
				}
				for (const [name, ranges, hunkRange] of [
					['oldRanges', typeRanges.oldRanges, hunk.oldRange],
					['newRanges', typeRanges.newRanges, hunk.newRange],
				] as const) {
					let previousEnd = -1;
					for (const [rangeIndex, range] of ranges.entries()) {
						if (!contains(hunkRange, range) || range.start < previousEnd) {
							issues.add(`${path}/changeTypeRanges/${rangesIndex}/${name}/${rangeIndex}`, 'INVALID_RANGE', localize('semanticDiff.invalidChangeTypeRange', "Changed-line ranges must be ordered, non-overlapping, and contained within the owning hunk."));
						}
						previousEnd = range.start + range.count;
					}
				}
			}
			for (const [name, ranges] of [
				['oldRanges', hunk.changeTypeRanges.flatMap(item => item.oldRanges)],
				['newRanges', hunk.changeTypeRanges.flatMap(item => item.newRanges)],
			] as const) {
				const ordered = ranges.toSorted((left, right) => left.start - right.start);
				for (let rangeIndex = 1; rangeIndex < ordered.length; rangeIndex++) {
					if (ordered[rangeIndex].start < ordered[rangeIndex - 1].start + ordered[rangeIndex - 1].count) {
						issues.add(`${path}/changeTypeRanges`, 'INVALID_RANGE', localize('semanticDiff.overlappingChangeTypeRanges', "Changed-line ranges for different types must not overlap on the {0}.", name === 'oldRanges' ? localize('semanticDiff.originalSide', "original side") : localize('semanticDiff.modifiedSide', "modified side")));
						break;
					}
				}
			}
		}
	}
	for (const [index, group] of analysis.groups.entries()) {
		if (!assignedGroups.has(group.id)) {
			issues.add(`/analysis/groups/${index}`, 'EMPTY_GROUP', localize('semanticDiff.emptyGroup', "Every group must contain at least one hunk."));
		}
	}
	for (const [index, limitation] of analysis.limitations.entries()) {
		const path = `/analysis/limitations/${index}`;
		if (limitation.fileId !== null && !files.has(limitation.fileId)) {
			issues.add(`${path}/fileId`, 'UNKNOWN_FILE', localize('semanticDiff.unknownLimitationFile', "A scoped limitation must name a file in analysis.files."));
		}
		if (limitation.hunkId !== null) {
			const hunk = hunks.get(limitation.hunkId);
			if (!hunk) {
				issues.add(`${path}/hunkId`, 'UNKNOWN_HUNK', localize('semanticDiff.unknownHunk', "A scoped limitation must name a hunk in analysis.hunks."));
			}
			if (limitation.fileId === null || (hunk && limitation.fileId !== hunk.fileId)) {
				issues.add(`${path}/fileId`, 'LIMITATION_SCOPE_MISMATCH', localize('semanticDiff.scopeMismatch', "A hunk-scoped limitation must also name that hunk's file."));
			}
		}
	}
	for (const [index, file] of analysis.files.entries()) {
		const scoped = analysis.limitations.filter(limitation => limitation.fileId === file.id && limitation.hunkId === null);
		if ((!fileHunks.has(file.id) && scoped.length === 0) ||
			(file.contentKind !== 'text' && !scoped.some(limitation => limitation.code === 'nonTextChange'))) {
			issues.add(`/analysis/files/${index}`, 'MISSING_LIMITATION', localize('semanticDiff.missingFileLimitation', "Files without hunks require a file-scoped limitation; nontext files require nonTextChange."));
		}
	}
	if (!source.inventoryComplete && !analysis.limitations.some(limitation => limitation.code === 'incompleteInventory')) {
		issues.add('/analysis/limitations', 'MISSING_LIMITATION', localize('semanticDiff.missingInventoryLimitation', "An incomplete inventory requires an incompleteInventory limitation."));
	}
}

function overlaps(left: ISemanticDiffRange, right: ISemanticDiffRange): boolean {
	if (left.count === 0 || right.count === 0) {
		const anchor = left.count === 0 ? left : right;
		const range = left.count === 0 ? right : left;
		return range.count > 0 && anchor.start > range.start && anchor.start < range.start + range.count - 1;
	}
	return left.start < right.start + right.count && right.start < left.start + left.count;
}

function contains(outer: ISemanticDiffRange, inner: ISemanticDiffRange): boolean {
	return inner.count > 0 && inner.start >= outer.start && inner.start + inner.count <= outer.start + outer.count;
}

export function isSemanticDiffHunkUncertain(hunk: ISemanticDiffHunk): boolean {
	const classification = hunk.classification;
	return classification.groupId === null || classification.changeType === null ||
		classification.groupConfidence === 'low' || classification.typeConfidence === 'low';
}

function deriveReport(analysis: ISemanticDiffAnalysis): ISemanticDiffReport {
	const summary: ISemanticDiffSummary = {
		groups: analysis.groups.length, files: analysis.files.length, hunks: analysis.hunks.length,
		assignedHunks: 0, unassignedHunks: 0, untypedHunks: 0, uncertainHunks: 0, mixedTypeHunks: 0,
		additions: 0, deletions: 0, byChangeType: { logic: 0, test: 0, supporting: 0, generated: 0, unknown: 0 }
	};
	for (const hunk of analysis.hunks) {
		const classification = hunk.classification;
		summary[classification.groupId === null ? 'unassignedHunks' : 'assignedHunks']++;
		summary.untypedHunks += Number(classification.changeType === null);
		summary.uncertainHunks += Number(isSemanticDiffHunkUncertain(hunk));
		summary.mixedTypeHunks += Number(classification.secondaryChangeTypes.length > 0);
		summary.additions += hunk.additions;
		summary.deletions += hunk.deletions;
		summary.byChangeType[classification.changeType ?? 'unknown']++;
	}
	return {
		schemaVersion: 1, kind: 'semanticDiffClassification', sourceVerification: 'agent-reported',
		status: analysis.source.inventoryComplete && analysis.limitations.length === 0 &&
			summary.unassignedHunks === 0 && summary.untypedHunks === 0 ? 'complete' : 'partial',
		analysis, summary
	};
}

function validate(raw: unknown, isReport: boolean): SemanticDiffValidationResult {
	const issues = new Issues();
	try {
		const value = readJson(raw, isReport ? SEMANTIC_DIFF_RESULT_BYTE_LIMIT : SEMANTIC_DIFF_INPUT_BYTE_LIMIT);
		if (isObject(value) && Object.hasOwn(value, 'schemaVersion') && value.schemaVersion !== 1) {
			issues.schema('/schemaVersion');
			return issues.failure('UNSUPPORTED_VERSION');
		}
		let report: ISemanticDiffReport;
		if (isReport) {
			if (!hasReportShape(value, issues)) {
				return issues.failure();
			}
			validateRelationships(value.analysis, issues);
			const derived = deriveReport(value.analysis);
			if (derived.status !== value.status) {
				issues.schema('/status');
			}
			if (!structuralEquals(derived.summary, value.summary)) {
				issues.schema('/summary');
			}
			if (VSBuffer.fromString(JSON.stringify({ schemaVersion: 1, analysis: value.analysis })).byteLength > SEMANTIC_DIFF_INPUT_BYTE_LIMIT) {
				issues.limitExceeded = true;
			}
			report = value;
		} else {
			if (!hasSubmissionShape(value, issues)) {
				return issues.failure();
			}
			validateRelationships(value.analysis, issues);
			report = deriveReport(value.analysis);
		}
		if (VSBuffer.fromString(JSON.stringify(report)).byteLength > SEMANTIC_DIFF_RESULT_BYTE_LIMIT) {
			issues.limitExceeded = true;
		}
		return issues.count || issues.limitExceeded ? issues.failure() : { ok: true, report };
	} catch (error) {
		if (error instanceof InputLimit) {
			return issues.failure('INPUT_LIMIT_EXCEEDED');
		}
		if (error instanceof InvalidJson) {
			issues.schema(error.path);
			return issues.failure();
		}
		return issues.failure('INTERNAL_ERROR');
	}
}

/** Validates an atomic submission and derives its summary without changing the submitted analysis. */
export function buildSemanticDiffReport(raw: unknown): SemanticDiffValidationResult {
	return validate(raw, false);
}

/** Validates a completed report, rejecting rather than repairing contradictory derived values. */
export function validateSemanticDiffReport(raw: unknown): SemanticDiffValidationResult {
	return validate(raw, true);
}

/** Parses bounded completed transport text and returns an explicit error for missing or invalid JSON. */
export function parseSemanticDiffReport(text: string | undefined): SemanticDiffValidationResult {
	const issues = new Issues();
	if (text === undefined) {
		issues.add('', 'SCHEMA_VIOLATION', localize('semanticDiff.missingJson', "The completed classification result is missing."));
		return issues.failure();
	}
	if (text.length > SEMANTIC_DIFF_RESULT_BYTE_LIMIT || VSBuffer.fromString(text).byteLength > SEMANTIC_DIFF_RESULT_BYTE_LIMIT) {
		return issues.failure('INPUT_LIMIT_EXCEEDED');
	}
	if (text.trim().length === 0) {
		issues.add('', 'SCHEMA_VIOLATION', localize('semanticDiff.emptyJson', "The completed classification result is empty."));
		return issues.failure();
	}
	try {
		return validateSemanticDiffReport(JSON.parse(text));
	} catch {
		issues.add('', 'SCHEMA_VIOLATION', localize('semanticDiff.invalidJson', "The completed classification result is not valid JSON."));
		return issues.failure();
	}
}

/** Keeps SDK tool output small; the validated analysis already lives in the invocation's input. */
export function serializeSemanticDiffToolResult(report: ISemanticDiffReport): string {
	return JSON.stringify({
		schemaVersion: report.schemaVersion,
		kind: 'semanticDiffClassificationReceipt',
		status: report.status,
		sourceVerification: report.sourceVerification,
		summary: report.summary,
	});
}

/** Resolves compact receipts and legacy SDK-offloaded results from the same successful server invocation. */
export function parseSemanticDiffToolResult(text: string | undefined, input: string | undefined): SemanticDiffValidationResult {
	const fullReport = parseSemanticDiffReport(text);
	if (fullReport.ok || fullReport.error.error.code === 'INPUT_LIMIT_EXCEEDED') {
		return fullReport;
	}

	let receipt: JsonValue | undefined;
	try {
		receipt = JSON.parse(text ?? '');
	} catch {
		// Older SDK histories replaced the validated report with this notice; never read its file path.
		if (!text?.startsWith('Output too large to read at once (') || !text.includes('). Saved to: ')) {
			return fullReport;
		}
	}
	if (receipt !== undefined && (!isObject(receipt) || receipt.kind !== 'semanticDiffClassificationReceipt')) {
		return fullReport;
	}

	const issues = new Issues();
	if (input === undefined) {
		issues.add('/analysis', 'SCHEMA_VIOLATION', localize('semanticDiff.missingSubmission', "The classification tool input is unavailable."));
		return issues.failure();
	}
	// SDKs pretty-print invocation inputs; the compact submission budget is enforced after parsing.
	const maxTransportInputBytes = SEMANTIC_DIFF_INPUT_BYTE_LIMIT * 2;
	if (input.length > maxTransportInputBytes || VSBuffer.fromString(input).byteLength > maxTransportInputBytes) {
		return issues.failure('INPUT_LIMIT_EXCEEDED');
	}
	let submission: unknown;
	try {
		submission = JSON.parse(input);
	} catch {
		issues.add('/analysis', 'SCHEMA_VIOLATION', localize('semanticDiff.invalidSubmission', "The classification tool input is not valid JSON."));
		return issues.failure();
	}
	const rebuilt = buildSemanticDiffReport(submission);
	if (!rebuilt.ok || receipt === undefined) {
		return rebuilt;
	}
	if (Object.hasOwn(receipt, 'analysis')) {
		issues.schema('/analysis');
		return issues.failure();
	}
	return validateSemanticDiffReport({ ...receipt, kind: 'semanticDiffClassification', analysis: rebuilt.report.analysis });
}

export function getSemanticDiffChangeTypeLabel(type: SemanticDiffChangeType | null): string {
	switch (type) {
		case 'logic': return localize('semanticDiff.logic', "Logic");
		case 'test': return localize('semanticDiff.test', "Test");
		case 'supporting': return localize('semanticDiff.supporting', "Supporting");
		case 'generated': return localize('semanticDiff.generated', "Generated");
		case null: return localize('semanticDiff.unclassifiedType', "Unclassified type");
	}
}

export function getSemanticDiffConfidenceLabel(confidence: SemanticDiffConfidence | null): string {
	switch (confidence) {
		case 'high': return localize('semanticDiff.high', "High");
		case 'medium': return localize('semanticDiff.medium', "Medium");
		case 'low': return localize('semanticDiff.low', "Low");
		case null: return localize('semanticDiff.unclassifiedConfidence', "Unclassified");
	}
}

export function formatSemanticDiffRange(range: ISemanticDiffRange, side: 'old' | 'new'): string {
	if (range.count === 0) {
		if (side === 'old') {
			return range.start === 0 ? localize('semanticDiff.insertionStart', "insertion at start of file") :
				localize('semanticDiff.insertionAnchor', "insertion after line {0}", range.start);
		}
		return range.start === 0 ? localize('semanticDiff.deletionStart', "deletion at start of file") :
			localize('semanticDiff.deletionAnchor', "deletion after line {0}", range.start);
	}
	return range.count === 1 ? localize('semanticDiff.line', "line {0}", range.start) :
		localize('semanticDiff.lines', "lines {0}-{1}", range.start, range.start + range.count - 1);
}

/** Plain text only: consumers must not interpret submitted text as Markdown, HTML, or links. */
export function formatSemanticDiffReport(report: ISemanticDiffReport): string {
	const { analysis, summary } = report;
	const lines: string[] = [];
	if (report.status === 'partial') {
		lines.push(localize('semanticDiff.partial', "Partial analysis"),
			localize('semanticDiff.unresolvedCounts', "Needs grouping: {0} hunks; unclassified type: {1} hunks. These counts can include the same hunk.", summary.unassignedHunks, summary.untypedHunks));
	}
	if (analysis.limitations.some(limitation => limitation.code === 'staleSource')) {
		lines.push(localize('semanticDiff.stale', "Stale analysis: the agent reported that the source changed."));
	}
	if (report.status === 'complete' && analysis.files.length === 0) {
		lines.push(localize('semanticDiff.empty', "No changes reported for this comparison."));
	} else if (report.status === 'partial' && analysis.files.length === 0) {
		lines.push(localize('semanticDiff.partialEmpty', "No files were reported. Evidence is incomplete; this does not establish that there are no changes."));
	}
	lines.push(localize('semanticDiff.globalCounts', "Submitted inventory: {0} groups, {1} files, {2} hunks; observed +{3}/-{4}.", summary.groups, summary.files, summary.hunks, summary.additions, summary.deletions),
		localize('semanticDiff.classificationCounts', "Grouped: {0}; needs grouping: {1}; unclassified type: {2}; uncertain: {3}; mixed type: {4}.",
			summary.assignedHunks, summary.unassignedHunks, summary.untypedHunks, summary.uncertainHunks, summary.mixedTypeHunks),
		localize('semanticDiff.primaryCounts', "Primary types: Logic {0}, Test {1}, Supporting {2}, Generated {3}, Unclassified type {4}.",
			summary.byChangeType.logic, summary.byChangeType.test, summary.byChangeType.supporting, summary.byChangeType.generated, summary.byChangeType.unknown));

	const appendFiles = (hunks: readonly ISemanticDiffHunk[]) => {
		for (const file of analysis.files) {
			const selected = hunks.filter(hunk => hunk.fileId === file.id);
			if (selected.length === 0) {
				continue;
			}
			lines.push(formatFile(file), localize('semanticDiff.fileCounts', "{0} hunks; observed +{1}/-{2}.", selected.length,
				selected.reduce((sum, hunk) => sum + hunk.additions, 0), selected.reduce((sum, hunk) => sum + hunk.deletions, 0)));
			for (const hunk of selected) {
				const classification = hunk.classification;
				lines.push(
					localize('semanticDiff.hunk', "Hunk {0}: {1}", hunk.id, classification.summary),
					localize('semanticDiff.ranges', "Old: {0}; New: {1}. Ranges include context.", formatSemanticDiffRange(hunk.oldRange, 'old'), formatSemanticDiffRange(hunk.newRange, 'new')),
					localize('semanticDiff.hunkType', "Primary type: {0}; observed +{1}/-{2}.", getSemanticDiffChangeTypeLabel(classification.changeType), hunk.additions, hunk.deletions));
				for (const type of classification.secondaryChangeTypes) {
					lines.push(localize('semanticDiff.secondaryType', "Also: {0}", getSemanticDiffChangeTypeLabel(type)));
				}
				for (const typeRanges of hunk.changeTypeRanges ?? []) {
					lines.push(localize('semanticDiff.changeTypeRanges', "{0} changed lines. Original: {1}. Modified: {2}.",
						getSemanticDiffChangeTypeLabel(typeRanges.changeType),
						typeRanges.oldRanges.map(range => formatSemanticDiffRange(range, 'old')).join(', ') || localize('semanticDiff.none', "none"),
						typeRanges.newRanges.map(range => formatSemanticDiffRange(range, 'new')).join(', ') || localize('semanticDiff.none', "none")));
				}
				if (hunk.reviewFocus) {
					lines.push(localize('semanticDiff.reviewFocus', "Review focus: {0}\nOriginal: {1}. Modified: {2}.",
						hunk.reviewFocus.reason,
						hunk.reviewFocus.oldRanges.map(range => formatSemanticDiffRange(range, 'old')).join(', ') || localize('semanticDiff.none', "none"),
						hunk.reviewFocus.newRanges.map(range => formatSemanticDiffRange(range, 'new')).join(', ') || localize('semanticDiff.none', "none")));
				}
				lines.push(
					localize('semanticDiff.groupReason', "Group reason: {0}", classification.groupReason),
					localize('semanticDiff.typeReason', "Type reason: {0}", classification.typeReason),
					localize('semanticDiff.confidences', "Group confidence: {0}; type confidence: {1}.", getSemanticDiffConfidenceLabel(classification.groupConfidence), getSemanticDiffConfidenceLabel(classification.typeConfidence)));
				if (classification.uncertainty !== null) {
					lines.push(localize('semanticDiff.uncertainty', "Uncertainty: {0}", classification.uncertainty));
				}
			}
		}
	};
	for (const group of analysis.groups) {
		const hunks = analysis.hunks.filter(hunk => hunk.classification.groupId === group.id);
		lines.push('', group.title, group.description,
			localize('semanticDiff.groupCounts', "{0} files, {1} hunks; observed +{2}/-{3}.", new Set(hunks.map(hunk => hunk.fileId)).size, hunks.length,
				hunks.reduce((sum, hunk) => sum + hunk.additions, 0), hunks.reduce((sum, hunk) => sum + hunk.deletions, 0)));
		appendFiles(hunks);
	}
	const unassigned = analysis.hunks.filter(hunk => hunk.classification.groupId === null);
	if (unassigned.length) {
		lines.push('', localize('semanticDiff.needsGrouping', "Needs grouping"));
		appendFiles(unassigned);
	}
	const withoutHunks = analysis.files.filter(file => !analysis.hunks.some(hunk => hunk.fileId === file.id));
	if (withoutHunks.length) {
		lines.push('', localize('semanticDiff.notText', "Not analyzed as text"), ...withoutHunks.map(formatFile));
	}
	if (analysis.limitations.length) {
		lines.push('', localize('semanticDiff.limitations', "Limitations"));
		for (const limitation of analysis.limitations) {
			const file = analysis.files.find(file => file.id === limitation.fileId);
			lines.push(localize('semanticDiff.limitation', "{0}: {1} Scope: {2}; hunk: {3}.", limitation.code, limitation.message,
				file?.path ?? localize('semanticDiff.comparisonScope', "whole comparison"), limitation.hunkId ?? localize('semanticDiff.noHunkScope', "not hunk-specific")));
		}
	}
	const source = analysis.source;
	const comparisons: Record<SemanticDiffComparison, string> = {
		staged: localize('semanticDiff.staged', "Staged"),
		workingTree: localize('semanticDiff.workingTree', "Working tree"),
		commitRange: localize('semanticDiff.commitRange', "Commit range")
	};
	const unavailable = localize('semanticDiff.notAvailable', "Not available");
	lines.push('', localize('semanticDiff.analysisDetails', "Analysis details"),
		localize('semanticDiff.source', "Repository: {0}; comparison: {1}.", source.repositoryLabel, comparisons[source.comparison]),
		localize('semanticDiff.revisions', "Base revision: {0}; target revision: {1}.", source.baseRevision, source.targetRevision ?? unavailable),
		localize('semanticDiff.capture', "Captured at: {0}; diff fingerprint: {1}.", source.capturedAt, source.diffFingerprint ?? unavailable),
		localize('semanticDiff.inventoryComplete', "Inventory complete: {0}.", source.inventoryComplete ? localize('semanticDiff.yes', "Yes") : localize('semanticDiff.no', "No")),
		localize('semanticDiff.provenance', "Classification and source metadata reported by the agent; not verified against Git."),
		localize('semanticDiff.freshness', "Source freshness is unknown beyond the reported capture time."),
		localize('semanticDiff.notApproval', "Classifications are not a review or approval. Supporting and generated changes remain reviewable."));
	return lines.join('\n');
}

function formatFile(file: ISemanticDiffFile): string {
	const statuses: Record<ISemanticDiffFile['status'], string> = {
		added: localize('semanticDiff.added', "Added"), modified: localize('semanticDiff.modified', "Modified"),
		deleted: localize('semanticDiff.deleted', "Deleted"), renamed: localize('semanticDiff.renamed', "Renamed")
	};
	const kinds: Record<ISemanticDiffFile['contentKind'], string> = {
		text: localize('semanticDiff.text', "Text"), binary: localize('semanticDiff.binary', "Binary"),
		metadata: localize('semanticDiff.metadata', "Metadata")
	};
	const path = file.oldPath === null ? file.path : localize('semanticDiff.rename', "{0} → {1}", file.oldPath, file.path);
	return localize('semanticDiff.file', "{0} ({1}; {2})", path, statuses[file.status], kinds[file.contentKind]);
}
