/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement } from '@vscode/prompt-tsx';
import { IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { equals } from '../../../../util/vs/base/common/arrays';
import { AsyncIterableObject } from '../../../../util/vs/base/common/async';
import { CharCode } from '../../../../util/vs/base/common/charCode';
import { URI } from '../../../../util/vs/base/common/uri';
import { TextEdit, Uri } from '../../../../vscodeTypes';
import { OutcomeAnnotation, OutcomeAnnotationLabel } from '../../../inlineChat/node/promptCraftingTypes';
import { Lines, LinesEdit } from '../../../prompt/node/editGeneration';
import { IGuessedIndentation, guessIndentation } from '../../../prompt/node/indentationGuesser';
import { PartialAsyncTextReader } from '../../../prompt/node/streamingEdits';
import { CodeBlock } from '../panel/safeElements';

const MARKER_PREFIX = '---';

type Marker = string;

export namespace Marker {
	export const FILEPATH = MARKER_PREFIX + 'FILEPATH';
	export const FIND = MARKER_PREFIX + 'FIND';
	export const REPLACE = MARKER_PREFIX + 'REPLACE';
	export const COMPLETE = MARKER_PREFIX + 'COMPLETE';
}


export class PatchEditRules extends PromptElement {
	render() {
		return (
			<>
				When proposing a code change, provide one or more modifications in the following format:<br />
				Each modification consist of three sections headed by `{Marker.FILEPATH}`, `{Marker.FIND}` and `{Marker.REPLACE}`.<br />
				After {Marker.FILEPATH} add the path to the file that needs to be changed.<br />
				After {Marker.FIND} add a code block containing a section of the program that will be replaced.<br />
				Add multiple lines so that a find tool can find and identify a section of the programm. Start and end with a line that will not be modified. <br />
				Include all comments and empty lines exactly as they appear in the original source code. Do not abreviate any line or summarize the code with `...`. <br />
				After {Marker.REPLACE} add a code block with the updated version of the original code in the find section. Maintain the same indentation and code style as in the original code.<br />
				After all modifications, add {Marker.COMPLETE}.<br />
			</>
		);
	}
}

export interface PatchEditInputCodeBlockProps extends BasePromptElementProps {
	readonly uri: Uri;
	readonly languageId?: string;
	readonly code: string[] | string;
	readonly isSummarized?: boolean;
	readonly shouldTrim?: boolean;
}

export class PatchEditInputCodeBlock extends PromptElement<PatchEditInputCodeBlockProps> {
	constructor(
		props: PatchEditInputCodeBlockProps,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	render() {
		const code = typeof this.props.code === 'string' ? this.props.code : this.props.code.join('\n');
		return <>
			{getFileMarker(this.promptPathRepresentationService.getFilePath(this.props.uri))}<br />
			<CodeBlock code={code} uri={this.props.uri} languageId={this.props.languageId} includeFilepath={false} shouldTrim={this.props.shouldTrim} />
		</>;
	}
}


export interface PatchEditExamplePatchProps extends BasePromptElementProps {
	readonly changes: { uri: URI; find: Lines; replace: Lines }[];
}

export class PatchEditExamplePatch extends PromptElement<PatchEditExamplePatchProps> {
	constructor(
		props: PatchEditExamplePatchProps,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	render() {
		return <>
			{this.props.changes.map(patch => (
				<>
					{getFileMarker(this.promptPathRepresentationService.getFilePath(patch.uri))}<br />
					{Marker.FIND}<br />
					```<br />
					{patch.find.join('\n')}<br />
					```<br />
					{Marker.REPLACE}<br />
					```<br />
					{patch.replace.join('\n')}<br />
					```<br />
				</>
			))}
			{Marker.COMPLETE}
		</>;
	}
}


export function getFileMarker(filePath: string): string {
	return `${Marker.FILEPATH} ${filePath}`;
}

export function getCustomMarker(markerName: string): string {
	return `${MARKER_PREFIX}${markerName}`;
}

function isWhitespaceOrEmpty(line: string): boolean {
	return !line.match(/\S/);
}


export function findEdit(code: Lines, findLines: Lines, replaceLines: Lines, fallbackInsertLine: number): LinesEdit | OutcomeAnnotation {
	let firstFindLineIndex = 0;
	// find first non empty line
	while (firstFindLineIndex < findLines.length && isWhitespaceOrEmpty(findLines[firstFindLineIndex])) {
		firstFindLineIndex++;
	}
	if (firstFindLineIndex === findLines.length) {
		const codeIndentInfo = guessIndentation(code, 4, false);
		const codeIndentLevel = code.length > 0 ? getMinimalIndentLevel(code, 0, code.length - 1, codeIndentInfo.tabSize) : 0;
		const replaceString = getReplaceString(replaceLines, codeIndentLevel, codeIndentInfo);
		return LinesEdit.insert(fallbackInsertLine, replaceString);
	}

	const firstFindLine = findLines[firstFindLineIndex];
	const firstFindIndentLength = getIndentLength(firstFindLine);

	let lastError: OutcomeAnnotation | undefined;
	let i = 0, k = firstFindLineIndex;

	outer: while (i < code.length) {

		// find the first find line in the code
		while (i < code.length && !endsWith(code[i], firstFindLine, firstFindIndentLength)) {
			i++;
		}
		if (i === code.length) {
			return lastError ?? { message: `First find line not found`, label: OutcomeAnnotationLabel.INVALID_PATCH, severity: 'error' };
		}

		const firstLineIndex = i;
		let endLineIndex = -1;
		while (i < code.length && k < findLines.length) {
			const codeLine = code[i];
			const codeIndentLength = getIndentLength(codeLine);
			if (codeIndentLength === codeLine.length) { // all whitespace
				i++;
				continue;
			}
			const findLine = findLines[k];
			const findLineIndentLength = getIndentLength(findLine);
			if (findLineIndentLength === findLine.length) { // all whitespace
				k++;
				continue;
			}
			if (endsWith(codeLine, findLine, findLineIndentLength)) {
				endLineIndex = i;
				i++;
				k++;
			} else {
				// a line in the find lines does not match the line in the code
				i = firstLineIndex + 1; // try to find the find line again starting on the next line
				k = firstFindLineIndex;
				if (findLine.indexOf('...') !== -1) {
					lastError = { message: `Find contains ellipses`, label: OutcomeAnnotationLabel.INVALID_PATCH_LAZY, severity: 'error' };
				} else if (isComment(codeLine)) {
					lastError = { message: `Find not matching a comment`, label: OutcomeAnnotationLabel.INVALID_PATCH_COMMENT, severity: 'error' };
				} else {
					lastError = { message: `Find line ${k} does not match line ${i}`, label: OutcomeAnnotationLabel.INVALID_PATCH, severity: 'error' };
				}
				continue outer; // continue with the outer loop
			}
		}
		while (k < findLines.length && isWhitespaceOrEmpty(findLines[k])) {
			k++;
		}
		if (k === findLines.length && firstLineIndex !== -1 && endLineIndex !== -1) {
			const codeIndentInfo = guessIndentation(code, 4, false);
			const codeIndentLevel = getMinimalIndentLevel(code, firstLineIndex, endLineIndex, codeIndentInfo.tabSize);
			const replaceString = getReplaceString(replaceLines, codeIndentLevel, codeIndentInfo);
			return LinesEdit.replace(firstLineIndex, endLineIndex + 1, replaceString, endLineIndex === code.length - 1);
		}
	}
	return lastError ?? { message: `Not all lines of find found`, label: OutcomeAnnotationLabel.INVALID_PATCH, severity: 'error' };
}

function isWhiteSpace(charCode: number): boolean {
	return charCode === CharCode.Space || charCode === CharCode.Tab;
}

function isComment(line: string): boolean {
	return line.match(/^\s*(\/\/|\/\*|#)/) !== null;
}


function getReplaceString(lines: Lines, newIndentLevel: number, indentInfo: IGuessedIndentation): Lines {
	let start, end = 0;
	for (start = 0; start < lines.length && isWhitespaceOrEmpty(lines[start]); start++) { }
	if (start === lines.length) {
		return [];
	}
	for (end = lines.length; end > start && isWhitespaceOrEmpty(lines[end - 1]); end--) { }

	if (start === end) {
		// all replace lines are empty or whitespace only
		return [];
	}

	// find the line with the smallest indentation and remember the computed indentation level for each line
	let minIndentLevel = Number.MAX_SAFE_INTEGER;
	const indentations: Indentation[] = [];
	for (let i = start; i < end; i++) {
		const line = lines[i];
		const indentation = computeIndentation(line, indentInfo.tabSize);
		if (indentation.length !== line.length /* more than whitespace */ && indentation.level < minIndentLevel) {
			minIndentLevel = indentation.level;
		}
		indentations.push(indentation);
	}

	// there is at least one line with non-whitespace characters, so minIndentLevel is less than Number.MAX_SAFE_INTEGER

	// now adjust each line to the requested codeIndentLevel
	const adjustedLines = [];
	for (let i = start; i < end; i++) {
		const line = lines[i];
		const { level, length } = indentations[i - start];
		const newLevel = Math.max(0, newIndentLevel + level - minIndentLevel);
		const newIndentation = indentInfo.insertSpaces ? ' '.repeat(indentInfo.tabSize * newLevel) : '\t'.repeat(newLevel);
		adjustedLines.push(newIndentation + line.substring(length));
	}
	return adjustedLines;
}

function getIndentLength(line: string): number {
	let i = 0;
	while (i < line.length && isWhiteSpace(line.charCodeAt(i))) {
		i++;
	}
	return i;
}

function getMinimalIndentLevel(lines: Lines, startLineIndex: number, endLineIndex: number, tabSize: number): number {
	let minIndentLevel = Number.MAX_SAFE_INTEGER;
	for (let i = startLineIndex; i <= endLineIndex; i++) {
		const line = lines[i];
		const indentation = computeIndentation(line, tabSize);
		if (indentation.length !== line.length /* more than whitespace */ && indentation.level < minIndentLevel) {
			minIndentLevel = indentation.level;
		}
	}
	return minIndentLevel !== Number.MAX_SAFE_INTEGER ? minIndentLevel : 0;
}

type Indentation = { level: number; length: number };

function computeIndentation(line: string, tabSize: number): Indentation {
	let nSpaces = 0;
	let level = 0;
	let i = 0;
	let length = 0;
	const len = line.length;
	while (i < len) {
		const chCode = line.charCodeAt(i);
		if (chCode === CharCode.Space) {
			nSpaces++;
			if (nSpaces === tabSize) {
				level++;
				nSpaces = 0;
				length = i + 1;
			}
		} else if (chCode === CharCode.Tab) {
			level++;
			nSpaces = 0;
			length = i + 1;
		} else {
			break;
		}
		i++;
	}
	return { level, length };
}


function endsWith(line: string, suffix: string, suffixIndentLength: number): boolean {
	let i = line.length - 1, k = suffix.length - 1;
	while (i >= 0 && k >= suffixIndentLength && line.charCodeAt(i) === suffix.charCodeAt(k)) {
		i--;
		k--;
	}
	if (k >= suffixIndentLength) {
		// not the full suffix matched
		return false;
	}

	// make sure all is whitespace before the suffix
	while (i >= 0 && isWhiteSpace(line.charCodeAt(i))) {
		i--;
	}
	return i < 0;
}

export type Patch = { filePath: string; find: Lines; replace: Lines };
export type Section = { marker: Marker | undefined; content: string[] };

export interface PatchEditReplyProcessor {
	getFirstParagraph(text: string): string;
	process(replyText: string, documentText: string, documentUri?: URI, defaultInsertionLine?: number): PatchEditReplyProcessorResult;
}

export type PatchEditReplyProcessorResult = {
	readonly edits: TextEdit[];
	readonly otherSections: Section[];
	readonly appliedPatches: Patch[];
	readonly otherPatches: Patch[];
	readonly invalidPatches: Patch[];
	readonly contentBefore: Lines;
	readonly contentAfter: Lines;
	readonly annotations: OutcomeAnnotation[];
};

export function getReferencedFiles(replyText: string): string[] {
	const result = new Set<string>();
	for (const section of iterateSections(iterateLines(replyText))) {
		if (section.marker === Marker.FILEPATH) {
			result.add(section.content.join('\n').trim());
		}
	}

	return [...result];
}

export function getPatchEditReplyProcessor(promptPathRepresentationService: IPromptPathRepresentationService): PatchEditReplyProcessor {
	return {
		getFirstParagraph(text: string): string {
			const result = [];
			for (const line of iterateLines(text)) {
				if (line.length === 0 || line.startsWith(MARKER_PREFIX)) {
					break;
				}
				result.push(line);
			}
			return result.join('\n');
		},
		process(replyText: string, documentText: string, documentUri?: URI, defaultInsertionLine: number = 0): PatchEditReplyProcessorResult {
			let original, filePath;
			const annotations: OutcomeAnnotation[] = [];
			const otherSections: Section[] = [];
			let patches: Patch[] = [];
			const edits: TextEdit[] = [];
			const invalidPatches: Patch[] = [];
			const otherPatches: Patch[] = [];
			const filePaths = new Set<string>();
			let contentBefore: string[] = [];
			let contentAfter: string[] = [];
			loop: for (const section of iterateSections(iterateLines(replyText))) {
				switch (section.marker) {
					case undefined:
						contentBefore = section.content;
						break;
					case Marker.FILEPATH:
						filePath = section.content.join('\n').trim();
						break;
					case Marker.FIND:
						original = section.content;
						break;
					case Marker.REPLACE: {
						if (section.content && original && filePath) {
							patches.push({ filePath, find: original, replace: section.content });
							filePaths.add(filePath);
						}
						break;
					}
					case Marker.COMPLETE:
						contentAfter = section.content;
						break loop;
					default:
						otherSections.push(section);
						break;
				}
			}
			if (patches.length === 0) {
				annotations.push({ message: 'No patch sections found', label: OutcomeAnnotationLabel.NO_PATCH, severity: 'error' });
				return { edits, contentAfter, contentBefore, appliedPatches: [], otherSections, invalidPatches, otherPatches, annotations };
			}
			if (documentUri) {
				const documentFilePath = promptPathRepresentationService.getFilePath(documentUri);
				if (!filePaths.has(documentFilePath)) {
					annotations.push({ message: `No patch for input document: ${documentFilePath}, patches for ${[...filePaths.keys()].join(', ')}`, label: OutcomeAnnotationLabel.OTHER_FILE, severity: 'warning' });
				}
				if (filePaths.size > 1) {
					annotations.push({ message: `Multiple files modified: ${[...filePaths.keys()].join(', ')}`, label: OutcomeAnnotationLabel.MULTI_FILE, severity: 'warning' });
				}
				const patchesForDocument = [];
				for (const patch of patches) {
					if (patch.filePath !== documentFilePath) {
						otherPatches.push(patch);
					} else {
						patchesForDocument.push(patch);
					}
				}
				patches = patchesForDocument;
			}

			if (patches.length !== 0) {
				const documentLines = Lines.fromString(documentText);
				for (const patch of patches) {
					if (equals(patch.find, patch.replace)) {
						annotations.push({ message: `Patch is a no-op`, label: OutcomeAnnotationLabel.INVALID_PATCH_NOOP, severity: 'error' });
						invalidPatches.push(patch);
						continue;
					}
					if (patch.find.length <= 1) {
						annotations.push({ message: `Small patch: ${Math.min(patch.find.length)}`, label: OutcomeAnnotationLabel.INVALID_PATCH_SMALL, severity: 'warning' });
					}

					const res = findEdit(documentLines, getCodeBlock(patch.find), getCodeBlock(patch.replace), defaultInsertionLine);
					if (res instanceof LinesEdit) {
						const success = addEditIfDisjoint(edits, res.toTextEdit());
						if (!success) {
							annotations.push({ message: `Overlapping edits`, label: OutcomeAnnotationLabel.INVALID_EDIT_OVERLAP, severity: 'error' });
							invalidPatches.push(patch);
						}
					} else {
						annotations.push(res);
						invalidPatches.push(patch);
					}
				}
			}
			return { edits, appliedPatches: patches, otherSections, invalidPatches, otherPatches, annotations, contentBefore, contentAfter };
		}

	};
}

function addEditIfDisjoint(edits: TextEdit[], edit: TextEdit): boolean {
	for (let i = 0; i < edits.length; i++) {
		const existingEdit = edits[i];
		if (edit.range.end.isBeforeOrEqual(existingEdit.range.start)) {
			edits.splice(i, 0, edit);
			return true;
		}
		if (edit.range.start.isBefore(existingEdit.range.end)) {
			// intersecting
			return false;
		}
	}
	edits.push(edit);
	return true;
}


export function getCodeBlock(content: Lines): Lines {
	const result = [];
	let inCodeBlock: string | undefined;
	const codeBlockRegex = /^`{3,}/; // Regex to match 3 or more backticks at the beginning of the line
	for (const line of content) {
		const match = line.match(codeBlockRegex);
		if (match) {
			if (inCodeBlock) {
				if (match[0] === inCodeBlock) {
					return result;
				} else {
					result.push(line);
				}
			} else {
				inCodeBlock = match[0];
			}
		} else if (inCodeBlock) {
			result.push(line);
		}
	}
	return content;
}

export async function* iterateSectionsForResponse(lines: AsyncIterable<IResponsePart>): AsyncIterable<Section> {

	let currentMarker: Marker | undefined = undefined;
	let currentContent: string[] = [];

	const textStream = AsyncIterableObject.map(lines, part => part.delta.text);
	const reader = new PartialAsyncTextReader(textStream[Symbol.asyncIterator]());

	while (!reader.endOfStream) {
		const line = await reader.readLineIncludingLF();
		let marker: Marker | undefined;
		if (line.startsWith(MARKER_PREFIX)) {
			if (line.startsWith(Marker.FILEPATH)) {
				marker = Marker.FILEPATH;
			} else if (line.startsWith(Marker.FIND)) {
				marker = Marker.FIND;
			} else if (line.startsWith(Marker.REPLACE)) {
				marker = Marker.REPLACE;
			} else if (line.startsWith(Marker.COMPLETE)) {
				marker = Marker.COMPLETE;
			} else {
				marker = removeTrailingLF(line);
			}
			yield { marker: currentMarker, content: currentContent };
			currentContent = [removeTrailingLF(line.substring(marker.length))];
			currentMarker = marker;
			continue;
		}
		currentContent.push(removeTrailingLF(line));
	}

	yield { marker: currentMarker, content: currentContent };

	function removeTrailingLF(str: string): string {
		if (str.endsWith('\n')) {
			return str.slice(0, -1);
		}
		return str;
	}
}

function* iterateSections(lines: Iterable<string>): Iterable<Section> {
	let currentMarker: Marker | undefined = undefined;
	let currentContent: string[] = [];

	for (const line of lines) {
		let marker: Marker | undefined;
		if (line.startsWith(MARKER_PREFIX)) {
			if (line.startsWith(Marker.FILEPATH)) {
				marker = Marker.FILEPATH;
			} else if (line.startsWith(Marker.FIND)) {
				marker = Marker.FIND;
			} else if (line.startsWith(Marker.REPLACE)) {
				marker = Marker.REPLACE;
			} else if (line.startsWith(Marker.COMPLETE)) {
				marker = Marker.COMPLETE;
			} else {
				marker = line;
			}
			yield { marker: currentMarker, content: currentContent };
			currentContent = [line.substring(marker.length)];
			currentMarker = marker;
			continue;
		}
		currentContent.push(line);
	}

	yield { marker: currentMarker, content: currentContent };
}

function* iterateLines(input: string): Iterable<string> {
	let start = 0, end = 0;
	while (end < input.length) {
		const ch = input.charCodeAt(end);
		if (ch === CharCode.CarriageReturn || ch === CharCode.LineFeed) {
			yield input.substring(start, end);
			end++;
			if (ch === CharCode.CarriageReturn && input.charCodeAt(end) === CharCode.LineFeed) {
				end++;
			}
			start = end;
		} else {
			end++;
		}
	}
	if (start < input.length) {
		yield input.substring(start);
	}
}
