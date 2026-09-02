/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeMarkdownLinkLabel } from '../../../base/common/htmlContent.js';
import { basename } from '../../../base/common/resources.js';
import { splitLines } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import type { StringOrMarkdown } from './state/protocol/state.js';

export type ToolPathResolver = (path: string) => string;

const identityPathResolver: ToolPathResolver = path => path;

/**
 * Minimum interval between streamed tool-call display updates
 */
export const STREAMING_TOOL_DISPLAY_INTERVAL_MS = 100;

/** Flattens a display message so equal updates can be suppressed. */
export function streamingToolDisplayText(message: StringOrMarkdown): string {
	return typeof message === 'string' ? message : message.markdown;
}

export function formatGenericToolInput(input: Record<string, unknown> | undefined, rawFallback?: string): string | undefined {
	if (!input) {
		return rawFallback;
	}
	try {
		return JSON.stringify(input, null, 2);
	} catch {
		return rawFallback;
	}
}

function markdown(value: string): StringOrMarkdown {
	return { markdown: value };
}

function formatPath(path: unknown, resolvePath: ToolPathResolver): string | undefined {
	if (typeof path !== 'string' || !path) {
		return undefined;
	}
	const uri = URI.file(resolvePath(path));
	return `[${escapeMarkdownLinkLabel(basename(uri))}](${uri})`;
}

export function streamingToolTextLineCount(value: unknown): number | undefined {
	return typeof value === 'string' ? splitLines(value).length : undefined;
}

export function getStreamingEditMessage(
	path: unknown,
	lineCount: number | undefined,
	resolvePath: ToolPathResolver = identityPathResolver,
): StringOrMarkdown {
	const file = formatPath(path, resolvePath);
	if (lineCount !== undefined) {
		if (file) {
			return lineCount === 1
				? markdown(localize('toolStream.editOneLineInFile', "Editing 1 line in {0}", file))
				: markdown(localize('toolStream.editLinesInFile', "Editing {0} lines in {1}", lineCount, file));
		}
		return lineCount === 1
			? localize('toolStream.editOneLine', "Editing 1 line")
			: localize('toolStream.editLines', "Editing {0} lines", lineCount);
	}
	return file
		? markdown(localize('toolStream.editFile', "Editing {0}", file))
		: localize('toolStream.edit', "Editing file");
}

export function getStreamingReplaceMessage(
	path: unknown,
	oldLineCount: number | undefined,
	newLineCount: number | undefined,
	resolvePath: ToolPathResolver = identityPathResolver,
): StringOrMarkdown {
	const file = formatPath(path, resolvePath);
	if (oldLineCount !== undefined && newLineCount !== undefined) {
		if (file) {
			if (oldLineCount === 1 && newLineCount === 1) {
				return markdown(localize('toolStream.replaceOneLineWithOneLineInFile', "Replacing 1 line with 1 line in {0}", file));
			}
			if (oldLineCount === 1) {
				return markdown(localize('toolStream.replaceOneLineWithLinesInFile', "Replacing 1 line with {0} lines in {1}", newLineCount, file));
			}
			if (newLineCount === 1) {
				return markdown(localize('toolStream.replaceLinesWithOneLineInFile', "Replacing {0} lines with 1 line in {1}", oldLineCount, file));
			}
			return markdown(localize('toolStream.replaceLinesWithLinesInFile', "Replacing {0} lines with {1} lines in {2}", oldLineCount, newLineCount, file));
		}
		if (oldLineCount === 1 && newLineCount === 1) {
			return localize('toolStream.replaceOneLineWithOneLine', "Replacing 1 line with 1 line");
		}
		if (oldLineCount === 1) {
			return localize('toolStream.replaceOneLineWithLines', "Replacing 1 line with {0} lines", newLineCount);
		}
		if (newLineCount === 1) {
			return localize('toolStream.replaceLinesWithOneLine', "Replacing {0} lines with 1 line", oldLineCount);
		}
		return localize('toolStream.replaceLinesWithLines', "Replacing {0} lines with {1} lines", oldLineCount, newLineCount);
	}
	if (oldLineCount !== undefined) {
		if (file) {
			return oldLineCount === 1
				? markdown(localize('toolStream.replaceOneLineInFile', "Replacing 1 line in {0}", file))
				: markdown(localize('toolStream.replaceLinesInFile', "Replacing {0} lines in {1}", oldLineCount, file));
		}
		return oldLineCount === 1
			? localize('toolStream.replaceOneLine', "Replacing 1 line")
			: localize('toolStream.replaceLines', "Replacing {0} lines", oldLineCount);
	}
	return getStreamingEditMessage(path, undefined, resolvePath);
}

export function getStreamingCreateMessage(
	path: unknown,
	lineCount: number | undefined,
	resolvePath: ToolPathResolver = identityPathResolver,
): StringOrMarkdown {
	const file = formatPath(path, resolvePath);
	if (lineCount !== undefined) {
		if (file) {
			return lineCount === 1
				? markdown(localize('toolStream.createOneLineInFile', "Creating {0} (1 line)", file))
				: markdown(localize('toolStream.createLinesInFile', "Creating {0} ({1} lines)", file, lineCount));
		}
		return lineCount === 1
			? localize('toolStream.createOneLine', "Creating file (1 line)")
			: localize('toolStream.createLines', "Creating file ({0} lines)", lineCount);
	}
	return file
		? markdown(localize('toolStream.createFile', "Creating {0}", file))
		: localize('toolStream.create', "Creating file");
}

export function getStreamingInsertMessage(
	path: unknown,
	lineCount: number | undefined,
	resolvePath: ToolPathResolver = identityPathResolver,
): StringOrMarkdown {
	const file = formatPath(path, resolvePath);
	if (lineCount !== undefined) {
		if (file) {
			return lineCount === 1
				? markdown(localize('toolStream.insertOneLineInFile', "Inserting 1 line in {0}", file))
				: markdown(localize('toolStream.insertLinesInFile', "Inserting {0} lines in {1}", lineCount, file));
		}
		return lineCount === 1
			? localize('toolStream.insertOneLine', "Inserting 1 line")
			: localize('toolStream.insertLines', "Inserting {0} lines", lineCount);
	}
	return file
		? markdown(localize('toolStream.insertInFile', "Inserting text in {0}", file))
		: localize('toolStream.insert', "Inserting text");
}

export function getStreamingPatchMessage(
	paths: readonly string[],
	lineCount: number | undefined,
	resolvePath: ToolPathResolver = identityPathResolver,
): StringOrMarkdown {
	const fileList = paths.map(path => formatPath(path, resolvePath)).filter(path => path !== undefined).join(', ') || undefined;
	if (lineCount !== undefined) {
		if (fileList) {
			return lineCount === 1
				? markdown(localize('toolStream.patchOneLineInFiles', "Generating patch (1 line) in {0}", fileList))
				: markdown(localize('toolStream.patchLinesInFiles', "Generating patch ({0} lines) in {1}", lineCount, fileList));
		}
		return lineCount === 1
			? localize('toolStream.patchOneLine', "Generating patch (1 line)")
			: localize('toolStream.patchLines', "Generating patch ({0} lines)", lineCount);
	}
	return fileList
		? markdown(localize('toolStream.patchFiles', "Generating patch in {0}", fileList))
		: localize('toolStream.patch', "Generating patch");
}
