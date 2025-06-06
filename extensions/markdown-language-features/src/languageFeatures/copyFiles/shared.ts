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
import { mediaFileExtensions, MediaKind } from '../../util/mimes';

/** Base kind for any sort of markdown link, including both path and media links */
export const baseLinkEditKind = vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'link');

/** Kind for normal markdown links, i.e. `[text](path/to/file.md)` */
export const linkEditKind = baseLinkEditKind.append('uri');

export const imageEditKind = baseLinkEditKind.append('image');
export const audioEditKind = baseLinkEditKind.append('audio');
export const videoEditKind = baseLinkEditKind.append('video');

export function getSnippetLabelAndKind(counter: { readonly insertedAudioCount: number; readonly insertedVideoCount: number; readonly insertedImageCount: number; readonly insertedLinkCount: number }): {
	label: string;
	kind: vscode.DocumentDropOrPasteEditKind;
} {
	if (counter.insertedVideoCount > 0 || counter.insertedAudioCount > 0) {
		// Any media plus links
		if (counter.insertedLinkCount > 0) {
			return {
				label: vscode.l10n.t('Insert Markdown Media and Links'),
				kind: baseLinkEditKind,
			};
		}

		// Any media plus images
		if (counter.insertedImageCount > 0) {
			return {
				label: vscode.l10n.t('Insert Markdown Media and Images'),
				kind: baseLinkEditKind,
			};
		}

		// Audio only
		if (counter.insertedAudioCount > 0 && !counter.insertedVideoCount) {
			return {
				label: vscode.l10n.t('Insert Markdown Audio'),
				kind: audioEditKind,
			};
		}

		// Video only
		if (counter.insertedVideoCount > 0 && !counter.insertedAudioCount) {
			return {
				label: vscode.l10n.t('Insert Markdown Video'),
				kind: videoEditKind,
			};
		}

		// Mix of audio and video
		return {
			label: vscode.l10n.t('Insert Markdown Media'),
			kind: baseLinkEditKind,
		};
	} else if (counter.insertedImageCount > 0) {
		// Mix of images and links
		if (counter.insertedLinkCount > 0) {
			return {
				label: vscode.l10n.t('Insert Markdown Images and Links'),
				kind: baseLinkEditKind,
			};
		}

		// Just images
		return {
			label: counter.insertedImageCount > 1
				? vscode.l10n.t('Insert Markdown Images')
				: vscode.l10n.t('Insert Markdown Image'),
			kind: imageEditKind,
		};
	} else {
		return {
			label: counter.insertedLinkCount > 1
				? vscode.l10n.t('Insert Markdown Links')
				: vscode.l10n.t('Insert Markdown Link'),
			kind: linkEditKind,
		};
	}
}

export function createInsertUriListEdit(
	document: ITextDocument,
	ranges: readonly vscode.Range[],
	urlList: UriList,
	options?: UriListSnippetOptions,
): { edits: vscode.SnippetTextEdit[]; label: string; kind: vscode.DocumentDropOrPasteEditKind } | undefined {
	if (!ranges.length || !urlList.entries.length) {
		return;
	}

	const edits: vscode.SnippetTextEdit[] = [];

	let insertedLinkCount = 0;
	let insertedImageCount = 0;
	let insertedAudioCount = 0;
	let insertedVideoCount = 0;

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
		insertedAudioCount += snippet.insertedAudioCount;
		insertedVideoCount += snippet.insertedVideoCount;

		placeHolderStartIndex += urlList.entries.length;

		edits.push(new vscode.SnippetTextEdit(range, snippet.snippet));
	}

	const { label, kind } = getSnippetLabelAndKind({ insertedAudioCount, insertedVideoCount, insertedImageCount, insertedLinkCount });
	return { edits, label, kind };
}

interface UriListSnippetOptions {
	readonly placeholderText?: string;

	readonly placeholderStartIndex?: number;

	/**
	 * Hints how links should be inserted, e.g. as normal markdown link or as an image.
	 *
	 * By default this is inferred from the uri. If you use `media`, we will insert the resource as an image, video, or audio.
	 */
	readonly linkKindHint?: vscode.DocumentDropOrPasteEditKind | 'media';

	readonly separator?: string;

	/**
	 * Prevents uris from being made relative to the document.
	 *
	 * This is mostly useful for `file:` uris.
	 */
	readonly preserveAbsoluteUris?: boolean;
}


export interface UriSnippet {
	readonly snippet: vscode.SnippetString;
	readonly insertedLinkCount: number;
	readonly insertedImageCount: number;
	readonly insertedVideoCount: number;
	readonly insertedAudioCount: number;
}

export function createUriListSnippet(
	document: vscode.Uri,
	uris: ReadonlyArray<{
		readonly uri: vscode.Uri;
		readonly str?: string;
		readonly kind?: MediaKind;
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
	let insertedAudioCount = 0;
	let insertedVideoCount = 0;

	const snippet = new vscode.SnippetString();
	let placeholderIndex = options?.placeholderStartIndex ?? 1;

	uris.forEach((uri, i) => {
		const mdPath = (!options?.preserveAbsoluteUris ? getRelativeMdPath(documentDir, uri.uri) : undefined) ?? uri.str ?? uri.uri.toString();

		const desiredKind = getDesiredLinkKind(uri.uri, uri.kind, options);

		if (desiredKind === DesiredLinkKind.Link) {
			insertedLinkCount++;
			snippet.appendText('[');
			snippet.appendPlaceholder(escapeBrackets(options?.placeholderText ?? 'text'), placeholderIndex);
			snippet.appendText(`](${escapeMarkdownLinkPath(mdPath)})`);
		} else {
			const insertAsVideo = desiredKind === DesiredLinkKind.Video;
			const insertAsAudio = desiredKind === DesiredLinkKind.Audio;
			if (insertAsVideo || insertAsAudio) {
				if (insertAsVideo) {
					insertedVideoCount++;
				} else {
					insertedAudioCount++;
				}
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
		}

		if (i < uris.length - 1 && uris.length > 1) {
			snippet.appendText(options?.separator ?? ' ');
		}
	});

	return { snippet, insertedAudioCount, insertedVideoCount, insertedImageCount, insertedLinkCount };
}

enum DesiredLinkKind {
	Link,
	Image,
	Video,
	Audio,
}

function getDesiredLinkKind(uri: vscode.Uri, uriFileKind: MediaKind | undefined, options: UriListSnippetOptions | undefined): DesiredLinkKind {
	if (options?.linkKindHint instanceof vscode.DocumentDropOrPasteEditKind) {
		if (linkEditKind.contains(options.linkKindHint)) {
			return DesiredLinkKind.Link;
		} else if (imageEditKind.contains(options.linkKindHint)) {
			return DesiredLinkKind.Image;
		} else if (audioEditKind.contains(options.linkKindHint)) {
			return DesiredLinkKind.Audio;
		} else if (videoEditKind.contains(options.linkKindHint)) {
			return DesiredLinkKind.Video;
		}
	}

	if (typeof uriFileKind !== 'undefined') {
		switch (uriFileKind) {
			case MediaKind.Video: return DesiredLinkKind.Video;
			case MediaKind.Audio: return DesiredLinkKind.Audio;
			case MediaKind.Image: return DesiredLinkKind.Image;
		}
	}

	const normalizedExt = URI.Utils.extname(uri).toLowerCase().replace('.', '');
	if (options?.linkKindHint === 'media' || mediaFileExtensions.has(normalizedExt)) {
		switch (mediaFileExtensions.get(normalizedExt)) {
			case MediaKind.Video: return DesiredLinkKind.Video;
			case MediaKind.Audio: return DesiredLinkKind.Audio;
			default: return DesiredLinkKind.Image;
		}
	}

	return DesiredLinkKind.Link;
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
	readonly kind: vscode.DocumentDropOrPasteEditKind;
	readonly label: string;
	readonly additionalEdits: vscode.WorkspaceEdit;
	readonly yieldTo: vscode.DocumentDropOrPasteEditKind[];
}
