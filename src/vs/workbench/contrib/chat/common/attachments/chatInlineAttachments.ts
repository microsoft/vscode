/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as marked from '../../../../../base/common/marked/marked.js';
import { basename } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IPosition, Position } from '../../../../../editor/common/core/position.js';
import { IRange, Range } from '../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../editor/common/core/ranges/offsetRange.js';
import { PositionOffsetTransformer } from '../../../../../editor/common/core/text/positionToOffset.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ChatRequestDynamicVariablePart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatVariableLeader, IParsedChatRequest, IParsedChatRequestPart } from '../requestParser/chatParserTypes.js';
import { IChatRequestVariableEntry, isAgentHostCompletionVariableEntry, isPastedTextArtifact } from './chatVariableEntries.js';
import { IDynamicVariable } from './chatVariables.js';

/**
 * The character that stands for an inline attachment pill in the chat input.
 * A pill occupies exactly one character of the input text, so moving the
 * cursor, selecting, and deleting treat it like any other character.
 */
export const INLINE_ATTACHMENT_ANCHOR = '\uFFFC';

/**
 * The prefix of the text that stands for an attachment that has no text of its
 * own, such as a dropped file or a pasted image. It matches the text that
 * mentioning an attachment with `#` inserts.
 */
export const INLINE_ATTACHMENT_REFERENCE_PREFIX = 'attachment:';

/** The prefix of the id of an attachment for a GitHub issue or pull request, which the link to it follows. */
export const GITHUB_CONTEXT_ATTACHMENT_ID_PREFIX = 'github-context:';

/**
 * The text that mentions an attachment in the prompt, such as
 * `#attachment:index.ts`. A reference cannot span lines, so line breaks in the
 * name, as of a multi-line terminal command, become spaces.
 */
export function getAttachmentMention(name: string, leader: string = chatVariableLeader): string {
	return `${leader}${INLINE_ATTACHMENT_REFERENCE_PREFIX}${name.replace(/\r\n|\r|\n/g, ' ')}`;
}

/** An inline attachment pill in the chat input. */
export interface IInlineAttachmentAnchor {
	/** The offset of the pill's {@link INLINE_ATTACHMENT_ANCHOR} in the input. */
	readonly offset: number;
	/** The text the pill stands for in the prompt, such as `#file:index.ts`. */
	readonly text: string;
	/** The reference to {@link text}, if any. Its range is ignored. */
	readonly reference?: IDynamicVariable;
	/**
	 * What the prompt sent to the model says in place of the pill, see
	 * {@link getAttachmentPromptText}. It is the {@link IDynamicVariable.promptText}
	 * of the pill's reference, and is unset for the prompt that is persisted.
	 */
	readonly promptText?: string;
}

/**
 * The prompt that a chat input with inline attachment pills represents: the
 * input with every pill replaced by the text it stands for, exactly as if that
 * text had been typed. The prompt is what is submitted and persisted, so its
 * consumers never encounter an {@link INLINE_ATTACHMENT_ANCHOR}.
 */
export interface IInlineAttachmentProjection {
	/** The prompt text. */
	readonly text: string;
	/** The input's references followed by the pills' references, with ranges in {@link text}. */
	readonly references: readonly IDynamicVariable[];
	/** The text that replaces each anchor in the input, in order, to turn the input into the prompt. */
	readonly replacements: readonly { readonly inputOffset: number; readonly text: string }[];
	/** Maps an offset in the input to the prompt. Offsets on either side of a pill map to either side of its text. */
	toPromptOffset(inputOffset: number): number;
	/** Maps a range in the input to the prompt. */
	toPromptRange(inputRange: IRange): Range;
	/** Maps a range in the prompt back to the input. A range that ends inside a pill's text covers the pill. */
	toInputRange(promptRange: IRange): Range;
}

interface IProjectedAnchor {
	/** The offset of the anchor in the input. */
	readonly inputOffset: number;
	/** The offset in the prompt where the anchor's replacement starts. */
	readonly promptOffset: number;
	/** The anchor's replacement, empty for an anchor without a pill. */
	readonly replacement: string;
	/** The range of the pill's text within the prompt. */
	readonly textStart: number;
	readonly anchor: IInlineAttachmentAnchor | undefined;
}

/**
 * Projects a chat input with inline attachment pills onto the prompt it
 * represents. A pill's text is separated from adjacent text with a space so it
 * parses as its own token. An {@link INLINE_ATTACHMENT_ANCHOR} without a pill
 * is dropped from the prompt.
 *
 * @returns `undefined` when the input contains no anchor, in which case the
 * input already is the prompt.
 */
export function projectInlineAttachments(input: string, anchors: readonly IInlineAttachmentAnchor[], references: readonly IDynamicVariable[]): IInlineAttachmentProjection | undefined {
	if (!input.includes(INLINE_ATTACHMENT_ANCHOR)) {
		return undefined;
	}

	const anchorsByOffset = new Map<number, IInlineAttachmentAnchor>();
	for (const anchor of anchors) {
		if (input.charAt(anchor.offset) === INLINE_ATTACHMENT_ANCHOR && !anchorsByOffset.has(anchor.offset)) {
			anchorsByOffset.set(anchor.offset, anchor);
		}
	}

	const projected: IProjectedAnchor[] = [];
	let text = '';
	let copiedUntil = 0;
	for (let offset = input.indexOf(INLINE_ATTACHMENT_ANCHOR); offset !== -1; offset = input.indexOf(INLINE_ATTACHMENT_ANCHOR, offset + 1)) {
		text += input.slice(copiedUntil, offset);
		copiedUntil = offset + 1;

		const anchor = anchorsByOffset.get(offset);
		const promptOffset = text.length;
		if (!anchor) {
			projected.push({ inputOffset: offset, promptOffset, replacement: '', textStart: promptOffset, anchor: undefined });
			continue;
		}

		const leading = text.length > 0 && !isWhitespace(text.charAt(text.length - 1)) ? ' ' : '';
		const next = nextPromptCharacter(input, offset + 1, anchorsByOffset);
		const trailing = next !== undefined && next !== INLINE_ATTACHMENT_ANCHOR && !isWhitespace(next) ? ' ' : '';
		const replacement = leading + anchor.text + trailing;
		text += replacement;
		projected.push({ inputOffset: offset, promptOffset, replacement, textStart: promptOffset + leading.length, anchor });
	}
	text += input.slice(copiedUntil);

	const toPromptOffset = (inputOffset: number): number => {
		let delta = 0;
		for (const item of projected) {
			if (item.inputOffset >= inputOffset) {
				break;
			}
			delta += item.replacement.length - 1;
		}
		return inputOffset + delta;
	};

	const toInputOffset = (promptOffset: number, bias: 'start' | 'end'): number => {
		let delta = 0;
		for (const item of projected) {
			if (promptOffset <= item.promptOffset) {
				break;
			}
			if (promptOffset < item.promptOffset + item.replacement.length) {
				return bias === 'start' ? item.inputOffset : item.inputOffset + 1;
			}
			delta += item.replacement.length - 1;
		}
		return promptOffset - delta;
	};

	const inputPositions = new PositionOffsetTransformer(input);
	const promptPositions = new PositionOffsetTransformer(text);

	const toPromptRange = (inputRange: IRange): Range => Range.fromPositions(
		promptPositions.getPosition(toPromptOffset(inputPositions.getOffset(new Position(inputRange.startLineNumber, inputRange.startColumn)))),
		promptPositions.getPosition(toPromptOffset(inputPositions.getOffset(new Position(inputRange.endLineNumber, inputRange.endColumn)))),
	);

	const toInputRange = (promptRange: IRange): Range => Range.fromPositions(
		inputPositions.getPosition(toInputOffset(promptPositions.getOffset(new Position(promptRange.startLineNumber, promptRange.startColumn)), 'start')),
		inputPositions.getPosition(toInputOffset(promptPositions.getOffset(new Position(promptRange.endLineNumber, promptRange.endColumn)), 'end')),
	);

	const projectedReferences: IDynamicVariable[] = references.map(reference => ({ ...reference, range: toPromptRange(reference.range) }));
	for (const item of projected) {
		if (item.anchor?.reference) {
			projectedReferences.push({
				...item.anchor.reference,
				// A pill's reference may have been restored from a prompt sent to the model, which the persisted prompt does not say.
				promptText: item.anchor.promptText,
				range: Range.fromPositions(promptPositions.getPosition(item.textStart), promptPositions.getPosition(item.textStart + item.anchor.text.length)),
			});
		}
	}

	return {
		text,
		references: projectedReferences,
		replacements: projected.map(item => ({ inputOffset: item.inputOffset, text: item.replacement })),
		toPromptOffset,
		toPromptRange,
		toInputRange,
	};
}

function isWhitespace(character: string): boolean {
	return /\s/.test(character);
}

/** Makes a range relative to `origin`, as when the text that starts at `origin` is copied. */
export function toRelativeRange(range: IRange, origin: IPosition): Range {
	const toRelative = (lineNumber: number, column: number) => new Position(lineNumber - origin.lineNumber + 1, lineNumber === origin.lineNumber ? column - origin.column + 1 : column);
	return Range.fromPositions(toRelative(range.startLineNumber, range.startColumn), toRelative(range.endLineNumber, range.endColumn));
}

/** Makes a range made relative by {@link toRelativeRange} absolute again, as when copied text is pasted at `origin`. */
export function fromRelativeRange(range: IRange, origin: IPosition): Range {
	const fromRelative = (lineNumber: number, column: number) => new Position(lineNumber + origin.lineNumber - 1, lineNumber === 1 ? column + origin.column - 1 : column);
	return Range.fromPositions(fromRelative(range.startLineNumber, range.startColumn), fromRelative(range.endLineNumber, range.endColumn));
}

/** Whether an attachment can be shown as a pill inline with the prompt. */
export function canShowAttachmentInline(attachment: IChatRequestVariableEntry): boolean {
	// Agent host completions, such as skills, are shown as decorations of their text.
	return !isAgentHostCompletionVariableEntry(attachment);
}

/**
 * What the prompt sent to the model says in place of the pill of an attachment:
 * the attachment's name and, when it has one, its location, as a Markdown link
 * such as `[index.ts](file:///src/index.ts)`. The attachment itself is attached
 * to the request once, however many pills mention it.
 */
export function getAttachmentPromptText(attachment: IChatRequestVariableEntry): string {
	const name = getAttachmentLabel(attachment).replace(/\r\n|\r|\n/g, ' ');
	const location = getAttachmentLocation(attachment);
	return location ? `[${name.replace(/[\\[\]]/g, '\\$&')}](${location})` : name;
}

/** The name of an attachment, as its pill shows it. */
export function getAttachmentLabel(attachment: IChatRequestVariableEntry): string {
	// A file that a completion referenced is named after the reference, such as `file:index.ts`.
	const uri = attachment.kind === 'file' || attachment.kind === 'directory' || attachment.kind === 'promptFile' ? IChatRequestVariableEntry.toUri(attachment) : undefined;
	if (uri) {
		return basename(uri);
	}
	// The full name of a dropped image is its path.
	return attachment.kind === 'image' ? attachment.name : attachment.fullName ?? attachment.name;
}

/** Where what an attachment stands for is, such as the URI of a file, or the link of a pull request. */
function getAttachmentLocation(attachment: IChatRequestVariableEntry): string | undefined {
	if (attachment.id.startsWith(GITHUB_CONTEXT_ATTACHMENT_ID_PREFIX)) {
		return attachment.id.slice(GITHUB_CONTEXT_ATTACHMENT_ID_PREFIX.length);
	}
	const withRange = (uri: URI, range: IRange | undefined) => {
		const fragment = range ? (range.startLineNumber === range.endLineNumber ? `L${range.startLineNumber}` : `L${range.startLineNumber}-L${range.endLineNumber}`) : '';
		return (fragment ? uri.with({ fragment }) : uri).toString();
	};
	switch (attachment.kind) {
		case 'paste':
			return attachment.copiedFrom && withRange(attachment.copiedFrom.uri, attachment.copiedFrom.range);
		case 'terminalCommand':
			return attachment.resource.toString();
		case 'string':
			return (attachment.resourceUri ?? attachment.uri).toString();
		case 'transcriptContext':
			return attachment.uri.toString();
		case 'diagnostic':
			return attachment.filterUri && withRange(attachment.filterUri, attachment.filterRange);
	}
	if (URI.isUri(attachment.value)) {
		return attachment.value.toString();
	}
	if (isLocation(attachment.value)) {
		return withRange(attachment.value.uri, attachment.value.range);
	}
	// An image dropped from a file refers to the file.
	const reference = attachment.references?.[0]?.reference;
	return URI.isUri(reference) ? reference.toString() : undefined;
}

/**
 * Whether an attachment without a pill gets one inserted into the prompt when
 * inline attachments are enabled. An attachment with a range is derived from
 * text in the prompt, which is what becomes its pill.
 */
export function isInlineAttachmentCandidate(attachment: IChatRequestVariableEntry): boolean {
	return !attachment.range && canShowAttachmentInline(attachment);
}

/**
 * Whether the pill of an attachment opens something when it is activated, such
 * as a file, a folder, a commit, or the Problems view. This matches the pills
 * shown above the prompt: tools only have a hover, and context items, such as
 * pull requests, open only when their provider gives them a command.
 */
export function canOpenAttachment(attachment: IChatRequestVariableEntry): boolean {
	switch (attachment.kind) {
		case 'tool':
		case 'toolset':
			return false;
		case 'terminalCommand':
		case 'element':
		case 'scmHistoryItem':
		case 'diagnostic':
		case 'debugEvents':
		case 'chatReference':
		case 'transcriptContext':
			return true;
		case 'paste':
			return !!attachment.copiedFrom || isPastedTextArtifact(attachment);
		case 'promptText':
			return !!attachment.settingId;
		case 'string':
			return !!attachment.commandId;
		default:
			return !!IChatRequestVariableEntry.toUri(attachment);
	}
}

/**
 * The attachments of a submitted request that are shown as pills inline with
 * its text, by the index of the part of the request that stands for them.
 * Parts that stand for no attachment are left out, as are parts in code, where
 * Markdown renders them as text.
 *
 * @param text The text of the request, which tells where its code is.
 */
export function getInlineRequestAttachments(parts: readonly IParsedChatRequestPart[], variables: readonly IChatRequestVariableEntry[], text?: string): Map<number, IChatRequestVariableEntry> {
	const result = new Map<number, IChatRequestVariableEntry>();
	const codeRanges = text ? getMarkdownCodeRanges(text) : [];
	parts.forEach((part, index) => {
		if (codeRanges.some(range => range.intersects(OffsetRange.fromTo(part.range.start, part.range.endExclusive)))) {
			return;
		}
		let attachment: IChatRequestVariableEntry | undefined;
		if (part instanceof ChatRequestDynamicVariablePart) {
			// A reference to an attachment carries no data of its own.
			attachment = variables.find(variable => variable.id === part.id) ?? (part.isAttachmentReference ? undefined : part.toVariableEntry());
		} else if (part instanceof ChatRequestToolPart || part instanceof ChatRequestToolSetPart) {
			const entry = part.toVariableEntry();
			attachment = variables.find(variable => variable.id === entry.id) ?? entry;
		}
		if (attachment && canShowAttachmentInline(attachment)) {
			result.set(index, attachment);
		}
	});
	return result;
}

/**
 * Recovers the mentions of a request's attachments from its text, for a
 * request whose history kept its text and attachments but not its references,
 * as an agent host's history does, which keeps the prompt sent to the model.
 * A mention of an attachment that is outside code becomes a reference to the
 * attachment again: what the prompt says in its place, see
 * {@link getAttachmentPromptText}, its mention by name, see
 * {@link getAttachmentMention}, the reference that a completion inserts for a
 * file or folder, or the link of a GitHub issue or pull request. Mentions of
 * attachments that share a name are bound to them in order.
 */
export function recoverAttachmentMentions(message: IParsedChatRequest, variables: readonly IChatRequestVariableEntry[]): IParsedChatRequest {
	const referencedIds = new Set<string>();
	for (const part of message.parts) {
		if (part instanceof ChatRequestDynamicVariablePart) {
			referencedIds.add(part.id);
		}
	}
	const byMention = new Map<string, IChatRequestVariableEntry[]>();
	const links = new Set<string>();
	for (const variable of variables) {
		if (referencedIds.has(variable.id) || !variable.name || !canShowAttachmentInline(variable)) {
			continue;
		}
		const mentions = new Set([getAttachmentPromptText(variable), getAttachmentMention(variable.name)]);
		if (variable.kind === 'file' || variable.kind === 'directory') {
			mentions.add(`${chatVariableLeader}file:${variable.name}`).add(`${chatVariableLeader}${variable.name}`);
		}
		if (variable.id.startsWith(GITHUB_CONTEXT_ATTACHMENT_ID_PREFIX)) {
			const link = variable.id.slice(GITHUB_CONTEXT_ATTACHMENT_ID_PREFIX.length);
			mentions.add(link);
			links.add(link);
		}
		for (const mention of mentions) {
			byMention.set(mention, [...byMention.get(mention) ?? [], variable]);
		}
	}
	if (!byMention.size || !message.parts.some(part => part instanceof ChatRequestTextPart)) {
		return message;
	}

	const isWordCharacter = (character: string) => /[\p{L}\p{N}_-]/u.test(character);
	const codeRanges = getMarkdownCodeRanges(message.text);
	const positions = new PositionOffsetTransformer(message.text);
	const toRange = (start: number, end: number) => Range.fromPositions(positions.getPosition(start), positions.getPosition(end));
	const occurrences = new Map<string, number>();
	const parts: IParsedChatRequestPart[] = [];
	for (const part of message.parts) {
		if (!(part instanceof ChatRequestTextPart)) {
			parts.push(part);
			continue;
		}

		// A longer mention, such as that of `a.tsx`, is not taken for a shorter one that it starts with, such as that of `a.ts`.
		const matches: { start: number; end: number; mention: string }[] = [];
		for (const mention of byMention.keys()) {
			for (let start = message.text.indexOf(mention, part.range.start); start !== -1 && start + mention.length <= part.range.endExclusive; start = message.text.indexOf(mention, start + 1)) {
				let end = start + mention.length;
				if (links.has(mention)) {
					// A link goes on to the end of what was pasted, as for the link of a pull request's files.
					while (end < part.range.endExclusive && !/\s/.test(message.text.charAt(end))) {
						end++;
					}
				} else if (isWordCharacter(message.text.charAt(end)) || (isWordCharacter(mention.charAt(0)) && isWordCharacter(message.text.charAt(start - 1)))) {
					// The name of an attachment without a location is only a mention when it is not part of a longer word.
					continue;
				}
				if (!codeRanges.some(range => range.intersects(new OffsetRange(start, end)))) {
					matches.push({ start, end, mention });
				}
			}
		}
		matches.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

		let copiedUntil = part.range.start;
		for (const { start, end, mention } of matches) {
			if (start < copiedUntil) {
				continue;
			}
			const candidates = byMention.get(mention)!;
			const occurrence = occurrences.get(mention) ?? 0;
			occurrences.set(mention, occurrence + 1);
			const variable = candidates[Math.min(occurrence, candidates.length - 1)];
			if (start > copiedUntil) {
				parts.push(new ChatRequestTextPart(new OffsetRange(copiedUntil, start), toRange(copiedUntil, start), message.text.slice(copiedUntil, start)));
			}
			const text = message.text.slice(start, end);
			parts.push(new ChatRequestDynamicVariablePart(new OffsetRange(start, end), toRange(start, end), text, variable.id, variable.modelDescription, variable.value, variable.fullName, variable.icon, undefined, undefined, undefined, true));
			copiedUntil = end;
		}
		if (copiedUntil === part.range.start) {
			parts.push(part);
		} else if (copiedUntil < part.range.endExclusive) {
			parts.push(new ChatRequestTextPart(new OffsetRange(copiedUntil, part.range.endExclusive), toRange(copiedUntil, part.range.endExclusive), message.text.slice(copiedUntil, part.range.endExclusive)));
		}
	}
	return { text: message.text, parts };
}


/**
 * The ranges of a prompt that Markdown renders as code: code blocks and code
 * spans, in which a mention renders as its text rather than as a pill.
 */
export function getMarkdownCodeRanges(text: string): OffsetRange[] {
	// The lexer normalizes line breaks, so its offsets are mapped back to those of the text.
	const normalized = text.replace(/\r\n?/g, '\n');
	const ranges: OffsetRange[] = [];
	const visit = (tokens: readonly marked.Token[], within: OffsetRange) => {
		let cursor = within.start;
		for (const token of tokens) {
			const range = token.raw ? findTokenText(normalized, token.raw, new OffsetRange(cursor, within.endExclusive)) : undefined;
			if (!range) {
				continue;
			}
			cursor = range.endExclusive;
			if (token.type === 'code' || token.type === 'codespan') {
				ranges.push(range);
				continue;
			}
			const children = (token as marked.Tokens.Generic).tokens;
			if (Array.isArray(children)) {
				visit(children, range);
			}
			if (token.type === 'list') {
				visit((token as marked.Tokens.List).items, range);
			}
		}
	};
	visit(marked.lexer(normalized), new OffsetRange(0, normalized.length));
	if (normalized.length === text.length) {
		return ranges;
	}
	const toOriginal: number[] = [];
	for (let i = 0; i < text.length; i++) {
		toOriginal.push(i);
		if (text.charAt(i) === '\r' && text.charAt(i + 1) === '\n') {
			i++;
		}
	}
	toOriginal.push(text.length);
	return ranges.map(range => new OffsetRange(toOriginal[range.start], toOriginal[range.endExclusive]));
}

/**
 * Where a token's text is in the text that was lexed. Block quotes and lists
 * strip their markers and indentation from the lines of the tokens that they
 * contain, so the lines of those tokens are found one after another instead.
 */
function findTokenText(text: string, raw: string, within: OffsetRange): OffsetRange | undefined {
	const index = text.indexOf(raw, within.start);
	if (index !== -1 && index + raw.length <= within.endExclusive) {
		return new OffsetRange(index, index + raw.length);
	}
	let start: number | undefined;
	let end = within.start;
	for (const line of raw.split('\n')) {
		if (!line.trim()) {
			continue;
		}
		const lineIndex = text.indexOf(line, end);
		if (lineIndex === -1 || lineIndex + line.length > within.endExclusive) {
			return undefined;
		}
		start ??= lineIndex;
		end = lineIndex + line.length;
	}
	return start === undefined ? undefined : new OffsetRange(start, end);
}

/** The character that follows `offset` in the prompt, skipping anchors that are dropped from it. */
function nextPromptCharacter(input: string, offset: number, anchorsByOffset: ReadonlyMap<number, IInlineAttachmentAnchor>): string | undefined {
	for (let i = offset; i < input.length; i++) {
		const character = input.charAt(i);
		if (character !== INLINE_ATTACHMENT_ANCHOR || anchorsByOffset.has(i)) {
			return character;
		}
	}
	return undefined;
}
