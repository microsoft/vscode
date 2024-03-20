/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as URI from 'vscode-uri';
import { ITextDocument } from '../../types/textDocument';
import { getDocumentDir } from '../../util/document';
import { Schemes } from '../../util/schemes';
import { UriList } from '../../util/uriList';
import { resolveSnippet } from './snippets';

enum MediaKind {
	Image,
	Video,
	Audio,
}

export const mediaFileExtensions = new Map<string, MediaKind>([
	// Images
	['bmp', MediaKind.Image],
	['gif', MediaKind.Image],
	['ico', MediaKind.Image],
	['jpe', MediaKind.Image],
	['jpeg', MediaKind.Image],
	['jpg', MediaKind.Image],
	['png', MediaKind.Image],
	['psd', MediaKind.Image],
	['svg', MediaKind.Image],
	['tga', MediaKind.Image],
	['tif', MediaKind.Image],
	['tiff', MediaKind.Image],
	['webp', MediaKind.Image],

	// Videos
	['ogg', MediaKind.Video],
	['mp4', MediaKind.Video],

	// Audio Files
	['mp3', MediaKind.Audio],
	['aac', MediaKind.Audio],
	['wav', MediaKind.Audio],
]);

export function getSnippetLabel(counter: { insertedAudioVideoCount: number; insertedImageCount: number; insertedLinkCount: number }) {
	if (counter.insertedAudioVideoCount > 0) {
		if (counter.insertedLinkCount > 0) {
			return vscode.l10n.t('Insert Markdown Media and Links');
		} else {
			return vscode.l10n.t('Insert Markdown Media');
		}
	} else if (counter.insertedImageCount > 0 && counter.insertedLinkCount > 0) {
		return vscode.l10n.t('Insert Markdown Images and Links');
	} else if (counter.insertedImageCount > 0) {
		return counter.insertedImageCount > 1
			? vscode.l10n.t('Insert Markdown Images')
			: vscode.l10n.t('Insert Markdown Image');
	} else {
		return counter.insertedLinkCount > 1
			? vscode.l10n.t('Insert Markdown Links')
			: vscode.l10n.t('Insert Markdown Link');
	}
}

export function createInsertUriListEdit(
	document: ITextDocument,
	ranges: readonly vscode.Range[],
	urlList: UriList,
	options?: UriListSnippetOptions,
): { edits: vscode.SnippetTextEdit[]; label: string } | undefined {
	if (!ranges.length || !urlList.entries.length) {
		return;
	}


	const edits: vscode.SnippetTextEdit[] = [];

	let insertedLinkCount = 0;
	let insertedImageCount = 0;
	let insertedAudioVideoCount = 0;

	// Use 1 for all empty ranges but give non-empty range unique indices starting after 1
	let placeHolderStartIndex = 1 + urlList.entries.length;

	// Sort ranges by start position
	const orderedRanges = [...ranges].sort((a, b) => a.start.compareTo(b.start));
	const allRangesAreEmpty = orderedRanges.every(range => range.isEmpty);

	for (const range of orderedRanges) {
		const snippet = createUriListSnippet(document.uri, urlList.entries, {
			placeholderText: range.isEmpty ? undefined : document.getText(range),
			placeholderStartIndex: allRangesAreEmpty ? 1 : placeHolderStartIndex,
			...options,
		});
		if (!snippet) {
			continue;
		}

		insertedLinkCount += snippet.insertedLinkCount;
		insertedImageCount += snippet.insertedImageCount;
		insertedAudioVideoCount += snippet.insertedAudioVideoCount;

		placeHolderStartIndex += urlList.entries.length;

		edits.push(new vscode.SnippetTextEdit(range, snippet.snippet));
	}

	const label = getSnippetLabel({ insertedAudioVideoCount, insertedImageCount, insertedLinkCount });
	return { edits, label };
}

interface UriListSnippetOptions {
	readonly placeholderText?: string;

	readonly placeholderStartIndex?: number;

	/**
	 * Controls if a media link (`![](...)`) is inserted instead of a normal markdown link.
	 *
	 * By default tries to infer this from the uri.
	 */
	readonly insertAsMedia?: boolean;

	readonly separator?: string;

	/**
	 * Prevents uris from being made relative to the document.
	 *
	 * This is mostly useful for `file:` uris.
	 */
	readonly preserveAbsoluteUris?: boolean;
}


interface UriSnippet {
	snippet: vscode.SnippetString;
	insertedLinkCount: number;
	insertedImageCount: number;
	insertedAudioVideoCount: number;
}

export function createUriListSnippet(
	document: vscode.Uri,
	uris: ReadonlyArray<{
		readonly uri: vscode.Uri;
		readonly str?: string;
	}>,
	options?: UriListSnippetOptions,
): UriSnippet | undefined {
	if (!uris.length) {
		return;
	}

	const documentDir = getDocumentDir(document);
	const config = vscode.workspace.getConfiguration('markdown', document);
	const title = options?.placeholderText || 'Title';

	let insertedLinkCount = 0;
	let insertedImageCount = 0;
	let insertedAudioVideoCount = 0;

	const snippet = new vscode.SnippetString();
	let placeholderIndex = options?.placeholderStartIndex ?? 1;

	uris.forEach((uri, i) => {
		const mdPath = (!options?.preserveAbsoluteUris ? getRelativeMdPath(documentDir, uri.uri) : undefined) ?? uri.str ?? uri.uri.toString();

		const ext = URI.Utils.extname(uri.uri).toLowerCase().replace('.', '');
		const insertAsMedia = options?.insertAsMedia || (typeof options?.insertAsMedia === 'undefined' && mediaFileExtensions.has(ext));

		if (insertAsMedia) {
			const insertAsVideo = mediaFileExtensions.get(ext) === MediaKind.Video;
			const insertAsAudio = mediaFileExtensions.get(ext) === MediaKind.Audio;
			if (insertAsVideo || insertAsAudio) {
				insertedAudioVideoCount++;
				const mediaSnippet = insertAsVideo
					? config.get<string>('editor.filePaste.videoSnippet', '<video controls src="${src}" title="${title}"></video>')
					: config.get<string>('editor.filePaste.audioSnippet', '<audio controls src="${src}" title="${title}"></audio>');
				snippet.value += resolveSnippet(mediaSnippet, new Map<string, string>([
					['src', mdPath],
					['title', `\${${placeholderIndex++}:${title}}`],
				]));
			} else {
				insertedImageCount++;
				snippet.appendText('![');
				const placeholderText = escapeBrackets(options?.placeholderText || 'alt text');
				snippet.appendPlaceholder(placeholderText, placeholderIndex);
				snippet.appendText(`](${escapeMarkdownLinkPath(mdPath)})`);
			}
		} else {
			insertedLinkCount++;
			snippet.appendText('[');
			snippet.appendPlaceholder(escapeBrackets(options?.placeholderText ?? 'text'), placeholderIndex);
			snippet.appendText(`](${escapeMarkdownLinkPath(mdPath)})`);
		}

		if (i < uris.length - 1 && uris.length > 1) {
			snippet.appendText(options?.separator ?? ' ');
		}
	});

	return { snippet, insertedAudioVideoCount, insertedImageCount, insertedLinkCount };
}


function getRelativeMdPath(dir: vscode.Uri | undefined, file: vscode.Uri): string | undefined {
	if (dir && dir.scheme === file.scheme && dir.authority === file.authority) {
		if (file.scheme === Schemes.file) {
			// On windows, we must use the native `path.relative` to generate the relative path
			// so that drive-letters are resolved cast insensitively. However we then want to
			// convert back to a posix path to insert in to the document.
			const relativePath = path.relative(dir.fsPath, file.fsPath);
			return path.posix.normalize(relativePath.split(path.sep).join(path.posix.sep));
		}

		return path.posix.relative(dir.path, file.path);
	}
	return undefined;
}

function escapeMarkdownLinkPath(mdPath: string): string {
	if (needsBracketLink(mdPath)) {
		return '<' + mdPath.replaceAll('<', '\\<').replaceAll('>', '\\>') + '>';
	}

	return mdPath;
}

function escapeBrackets(value: string): string {
	value = value.replace(/[\[\]]/g, '\\$&'); // CodeQL [SM02383] The Markdown is fully sanitized after being rendered.
	return value;
}

function needsBracketLink(mdPath: string): boolean {
	// Links with whitespace or control characters must be enclosed in brackets
	if (mdPath.startsWith('<') || /\s|[\u007F\u0000-\u001f]/.test(mdPath)) {
		return true;
	}

	// Check if the link has mis-matched parens
	if (!/[\(\)]/.test(mdPath)) {
		return false;
	}

	let previousChar = '';
	let nestingCount = 0;
	for (const char of mdPath) {
		if (char === '(' && previousChar !== '\\') {
			nestingCount++;
		} else if (char === ')' && previousChar !== '\\') {
			nestingCount--;
		}

		if (nestingCount < 0) {
			return true;
		}
		previousChar = char;
	}

	return nestingCount > 0;
}

export interface DropOrPasteEdit {
	readonly snippet: vscode.SnippetString;
	readonly label: string;
	readonly additionalEdits: vscode.WorkspaceEdit;
	readonly yieldTo: vscode.DocumentPasteEditKind[];
}
