/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatQuestion, ChatResponseClearToPreviousToolInvocationReason, ChatResponsePart, ChatResponseStream, ChatVulnerability, ThinkingDelta, Uri } from 'vscode';

import { createFilepathRegexp, mdCodeBlockLangToLanguageId } from '../../../util/common/markdown';
import { CharCode } from '../../../util/vs/base/common/charCode';
import { isFalsyOrWhitespace, splitLinesIncludeSeparators } from '../../../util/vs/base/common/strings';

import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { ChatResponseCodeblockUriPart, ChatResponseMarkdownPart, ChatResponseMarkdownWithVulnerabilitiesPart, MarkdownString } from '../../../vscodeTypes';
import { CodeBlock } from '../../prompt/common/conversation';

export type CodeBlockWithResource = { readonly code: string; readonly language?: string; readonly resource: Uri; readonly markdownBeforeBlock?: string };

export class CodeBlocksMetadata {
	constructor(
		readonly codeBlocks: readonly CodeBlock[]
	) { }
}

export function isCodeBlockWithResource(codeBlock: CodeBlock): codeBlock is CodeBlockWithResource {
	return codeBlock.resource !== undefined;
}

/**
 * Proxy of a {@linkcode ChatResponseStream} that processes all code blocks in the markdown.
 * Filepaths are removed from the Markdown, resolved and reported as codeblockUri
 */
export class CodeBlockTrackingChatResponseStream implements ChatResponseStream {

	private readonly _codeBlockProcessor;
	private readonly _codeBlocks: CodeBlock[] = [];

	constructor(
		private readonly _wrapped: ChatResponseStream,
		codeblocksRepresentEdits: boolean | undefined,
		@IPromptPathRepresentationService _promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		let uriReportedForIndex = -1;
		this._codeBlockProcessor = new CodeBlockProcessor(
			path => {
				return _promptPathRepresentationService.resolveFilePath(path);
			},
			(text: MarkdownString, codeBlockInfo: CodeBlockInfo | undefined, vulnerabilities: ChatVulnerability[] | undefined) => {
				if (vulnerabilities) {
					this._wrapped.markdownWithVulnerabilities(text, vulnerabilities);
				} else {
					this._wrapped.markdown(text);
				}
				if (codeBlockInfo && codeBlockInfo.resource && codeBlockInfo.index !== uriReportedForIndex) {
					this._wrapped.codeblockUri(codeBlockInfo.resource, codeblocksRepresentEdits);
					uriReportedForIndex = codeBlockInfo.index;
				}
			},
			codeblock => {
				this._codeBlocks.push(codeblock);
			}
		);
	}

	clearToPreviousToolInvocation(reason: ChatResponseClearToPreviousToolInvocationReason): void {
		this._codeBlockProcessor.flush();
		this._wrapped.clearToPreviousToolInvocation(reason);
		this._codeBlocks.length = 0;
	}

	markdown(value: string | MarkdownString): void {
		this._codeBlockProcessor.processMarkdown(value);
	}

	markdownWithVulnerabilities(value: string | MarkdownString, vulnerabilities: ChatVulnerability[]): void {
		this._codeBlockProcessor.processMarkdown(value, vulnerabilities);
	}

	thinkingProgress(thinkingDelta: ThinkingDelta): void {
		this._codeBlockProcessor.flush();
		this._wrapped.thinkingProgress(thinkingDelta);
	}

	codeblockUri(uri: Uri): void {
		this._codeBlockProcessor.processCodeblockUri(uri);
	}

	push(part: ChatResponsePart): void {
		if (part instanceof ChatResponseMarkdownPart) {
			this._codeBlockProcessor.processMarkdown(part.value, undefined);
		} else if (part instanceof ChatResponseMarkdownWithVulnerabilitiesPart) {
			this._codeBlockProcessor.processMarkdown(part.value, part.vulnerabilities);
		} else if (part instanceof ChatResponseCodeblockUriPart) {
			this._codeBlockProcessor.processCodeblockUri(part.value);
		} else {
			this._codeBlockProcessor.flush();
			this._wrapped.push(part);
		}
	}

	finish(): CodeBlocksMetadata {
		this._codeBlockProcessor.flush();
		return new CodeBlocksMetadata(this._codeBlocks);
	}

	private forward(fc: CallableFunction) {
		return (...args: any[]) => {
			this._codeBlockProcessor.flush();
			return fc(...args);
		};
	}

	/**
	 * If you are adding a new ChatResponseStream type, please make sure to either:
	 * - Update the date on the vscode engine version in package.json to a date when the API will be available in VS Code (sufficient if it's a purely additive/backwards-compatible change)
	 * - Or bump the proposed API version (required if the change is not backwards compatible (changes the shape of an existing API))
	 * to ensure that this extension version only runs in versions of VS Code that contain the necessary API support.
	 */

	button = this.forward(this._wrapped.button.bind(this._wrapped));
	filetree = this.forward(this._wrapped.filetree.bind(this._wrapped));
	progress = this._wrapped.progress.bind(this._wrapped);
	reference = this.forward(this._wrapped.reference.bind(this._wrapped));
	textEdit = this.forward(this._wrapped.textEdit.bind(this._wrapped));
	notebookEdit = this.forward(this._wrapped.notebookEdit.bind(this._wrapped));
	workspaceEdit = this.forward(this._wrapped.workspaceEdit?.bind(this._wrapped) || (() => { }));
	confirmation = this.forward(this._wrapped.confirmation.bind(this._wrapped));
	warning = this.forward(this._wrapped.warning.bind(this._wrapped));
	hookProgress = this.forward(this._wrapped.hookProgress.bind(this._wrapped));
	reference2 = this.forward(this._wrapped.reference2.bind(this._wrapped));
	codeCitation = this.forward(this._wrapped.codeCitation.bind(this._wrapped));
	anchor = this.forward(this._wrapped.anchor.bind(this._wrapped));
	externalEdit = this.forward(this._wrapped.externalEdit.bind(this._wrapped));
	beginToolInvocation = this.forward(this._wrapped.beginToolInvocation.bind(this._wrapped));
	updateToolInvocation = this.forward(this._wrapped.updateToolInvocation.bind(this._wrapped));
	usage = this.forward(this._wrapped.usage.bind(this._wrapped));

	questionCarousel(questions: ChatQuestion[], allowSkip?: boolean): Thenable<Record<string, unknown> | undefined> {
		this._codeBlockProcessor.flush();
		return this._wrapped.questionCarousel(questions, allowSkip);
	}
}


const fenceLanguageRegex = /^(`{3,}|~{3,})(\w*)/;

enum State {
	OutsideCodeBlock,
	LineAfterFence,
	LineAfterFilePath,
	InCodeBlock,
}

export interface CodeBlockInfo {
	readonly language?: string;
	readonly resource?: Uri;
	readonly index: number;
}

export interface LineProcessor {
	matchesLineStart(linePart: string, inCodeBlock: boolean): boolean;
	process(line: MarkdownString, inCodeBlock: boolean): MarkdownString;
}

/**
 * The CodeBlockProcessor processes a sequence of markdown text parts and looks for code blocks that it contains.
 * - Code block filepaths are removed from the Markdown, and reported as codeblockUri
 * - All complete code blocks are also reported as {@linkcode CodeBlock} objects
 * - An optional line processor can be used to replace the content of a full line
 */
export class CodeBlockProcessor {

	private _lastIncompleteLine: MarkdownString | undefined;
	private _canEmitIncompleteLine: boolean = false;
	private _currentBlock: {
		readonly info: {
			readonly language?: string;
			resource?: Uri;
			readonly index: number;
		};
		readonly fence: string;
		readonly vulnerabilities?: ChatVulnerability[];
		readonly firstLine: MarkdownString;
	} | undefined;
	private readonly _code: string[] = [];
	private readonly _markdownBeforeBlock: string[] = [];
	private _nestingLevel: number = 0;
	private _index = 0;
	private _state: State = State.OutsideCodeBlock;

	constructor(
		private readonly _resolveCodeblockPath: (path: string) => Uri | undefined,
		private readonly _emitMarkdown: (markdown: MarkdownString, codeBlockInfo: CodeBlockInfo | undefined, vulnerabilities?: ChatVulnerability[]) => void,
		private readonly _emitCodeblock: (codeblock: CodeBlock) => void,
		private readonly _lineProcessor?: LineProcessor,
	) {
	}

	processMarkdown(markdown: string | MarkdownString, vulnerabilities?: ChatVulnerability[]): void {
		const text = typeof markdown === 'string' ? markdown : markdown.value;
		if (text.length === 0) {
			return;
		}

		const lines = splitLinesIncludeSeparators(text).map(line => toMarkdownString(line, markdown));
		if (lines.length > 0) {
			if (this._lastIncompleteLine) {
				lines[0] = appendMarkdownString(this._lastIncompleteLine, lines[0]);
			}
			this._lastIncompleteLine = !endsWithLineDelimiter(lines[lines.length - 1].value) ? lines.pop() : undefined;
			if (this._lastIncompleteLine?.value === '') {
				this._lastIncompleteLine = undefined;
			}
		}

		let i = 0;
		if (i < lines.length && this._canEmitIncompleteLine) {
			this._processLinePart(lines[0], vulnerabilities);
			i++;
		}
		for (; i < lines.length; i++) {
			this._processLine(lines[i], vulnerabilities);
		}

		if (this._lastIncompleteLine && !this._requiresFullLine(this._lastIncompleteLine)) {
			this._processLinePart(this._lastIncompleteLine, vulnerabilities);
			this._lastIncompleteLine = undefined;
			this._canEmitIncompleteLine = true;
		} else {
			this._canEmitIncompleteLine = false;
		}
	}

	private _requiresFullLine(markdown: MarkdownString) {
		if (this._state === State.OutsideCodeBlock || this._state === State.InCodeBlock) {
			return mightBeFence(markdown.value) || this._lineProcessor?.matchesLineStart(markdown.value, this._state === State.InCodeBlock);
		}
		return true;
	}

	private _processLinePart(incompleteLine: MarkdownString, vulnerabilities?: ChatVulnerability[]) {
		if (this._currentBlock) {
			this._code.push(incompleteLine.value);
			this._emitMarkdown(incompleteLine, this._currentBlock.info, vulnerabilities);
		} else {
			this._markdownBeforeBlock.push(incompleteLine.value);
			this._emitMarkdown(incompleteLine, undefined, vulnerabilities);
		}
	}

	/**
	 * Called when there is already a known code block URI for the currently processed code block
	 * @param uri
	 */
	processCodeblockUri(uri: Uri): void {
		if (this._currentBlock && !this._currentBlock.info.resource) {
			this._currentBlock.info.resource = uri;
		}
	}

	/**
	 * Processes a line of markdown.
	 * @param line The line to process. The line includes the line delimiters, unless it is the last line of the document.
	 * @param vulnerabilities Optional set of vulnerabilities to associate with the line.
	 */
	private _processLine(line: MarkdownString, vulnerabilities?: ChatVulnerability[]): void {
		if (this._state === State.LineAfterFence) {
			const codeBlock = this._currentBlock!; // must be set in that state
			const filePath = getFilePath(line.value, codeBlock.info.language);
			if (filePath) {
				if (!codeBlock.info.resource) {
					codeBlock.info.resource = this._resolveCodeblockPath(filePath);
				}
				this._state = State.LineAfterFilePath;
				this._emitMarkdown(codeBlock.firstLine, codeBlock.info, codeBlock.vulnerabilities);
				return;
			} else {
				this._state = State.InCodeBlock;
				this._emitMarkdown(codeBlock.firstLine, codeBlock.info, codeBlock.vulnerabilities);
				// this was a normal line, not a file path. Continue handling the line
			}
		} else if (this._state === State.LineAfterFilePath) {
			this._state = State.InCodeBlock;
			if (isFalsyOrWhitespace(line.value)) {
				return; // filter the empty line after the file path
			}
		}

		const fenceLanguageIdMatch = line.value.match(fenceLanguageRegex);
		if (fenceLanguageIdMatch) {
			if (!this._currentBlock) {
				// we are not in a code block. Open the block
				this._nestingLevel = 1;
				this._currentBlock = {
					info: {
						index: this._index++,
						language: fenceLanguageIdMatch[2],
						resource: undefined,
					},
					fence: fenceLanguageIdMatch[1],
					firstLine: line,
					vulnerabilities,
				};
				this._state = State.LineAfterFence;
				// wait emitting markdown before we have seen the next line
				return;
			}
			if (fenceLanguageIdMatch[1] === this._currentBlock.fence) {
				if (fenceLanguageIdMatch[2]) {
					this._nestingLevel++;
				} else if (this._nestingLevel > 1) {
					this._nestingLevel--;
				} else {
					// the fence matches the opening fence. It does not have a language id, and the nesting level is 1. -> Close the code block
					this._emitMarkdown(line, this._currentBlock.info, vulnerabilities);
					this._emitCodeblock({ code: this._code.join(''), resource: this._currentBlock.info.resource, language: this._currentBlock.info.language, markdownBeforeBlock: this._markdownBeforeBlock.join('') });
					this._code.length = 0;
					this._markdownBeforeBlock.length = 0;
					this._currentBlock = undefined;
					this._nestingLevel = 0;
					this._state = State.OutsideCodeBlock;
					return;
				}
			}
		}

		if (this._lineProcessor?.matchesLineStart(line.value, this._state === State.InCodeBlock)) {
			line = this._lineProcessor.process(line, this._state === State.InCodeBlock);
		}

		// the current line is not opening or closing a code block
		if (this._currentBlock) {
			this._code.push(line.value);
			this._emitMarkdown(line, this._currentBlock.info, vulnerabilities);
		} else {
			this._markdownBeforeBlock.push(line.value);
			this._emitMarkdown(line, undefined, vulnerabilities);
		}

	}


	flush(): void {
		if (this._lastIncompleteLine) {
			this._processLine(this._lastIncompleteLine);
			this._lastIncompleteLine = undefined;
		}
		if (this._state === State.LineAfterFence && this._currentBlock) {
			this._emitMarkdown(this._currentBlock.firstLine, this._currentBlock.info, this._currentBlock.vulnerabilities);
		}
	}
}

function getFilePath(line: string, mdLanguage: string | undefined) {
	const languageId = mdLanguage ? mdCodeBlockLangToLanguageId(mdLanguage) : mdLanguage;
	return createFilepathRegexp(languageId).exec(line)?.[1];
}

function endsWithLineDelimiter(line: string) {
	return [CharCode.LineFeed, CharCode.CarriageReturn].includes(line.charCodeAt(line.length - 1));
}

function toMarkdownString(text: string, template: MarkdownString | string): MarkdownString {
	const markdownString = new MarkdownString(text);
	if (typeof template === 'object') {
		markdownString.isTrusted = template.isTrusted;
		markdownString.supportThemeIcons = template.supportThemeIcons;
		markdownString.baseUri = template.baseUri;
		markdownString.supportHtml = template.supportHtml;
	}
	return markdownString;
}

function appendMarkdownString(target: MarkdownString, value: MarkdownString): MarkdownString {
	const markdownString = new MarkdownString(target.value + value.value);
	markdownString.isTrusted = target.isTrusted || value.isTrusted;
	markdownString.supportThemeIcons = target.supportThemeIcons || value.supportThemeIcons;
	markdownString.supportHtml = target.supportHtml || value.supportHtml;
	markdownString.baseUri = target.baseUri || value.baseUri;
	return markdownString;
}

function mightBeFence(line: string) {
	const len = line.length;
	if (len > 0) {
		const ch1 = line.charCodeAt(0);
		if (ch1 !== CharCode.BackTick && ch1 !== CharCode.Tilde) {
			return false;
		}
		if ((len > 1 && line.charCodeAt(1) !== ch1) || (len > 2 && line.charCodeAt(2) !== ch1)) {
			return false;
		}
	}
	return true;
}