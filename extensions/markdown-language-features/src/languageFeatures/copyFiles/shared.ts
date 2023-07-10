/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as vscode from 'vscode';
import * as URI from 'vscode-uri';
import { Schemes } from '../../util/schemes';
import { NewFilePathGenerator } from './copyFiles';
import { coalesce } from '../../util/arrays';
import { getDocumentDir } from '../../util/document';

enum MediaKind {
	Image,
	Video,
	Audio,
}

const externalUriSchemes = [
	'http',
	'https',
];

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

export const mediaMimes = new Set([
	'image/bmp',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp',
	'video/mp4',
	'video/ogg',
	'audio/mpeg',
	'audio/aac',
	'audio/x-wav',
]);

export async function getMarkdownLink(document: vscode.TextDocument, ranges: readonly vscode.Range[], urlList: string, token: vscode.CancellationToken): Promise<{ additionalEdits: vscode.WorkspaceEdit; label: string } | undefined> {
	if (ranges.length === 0) {
		return;
	}
	const enabled = vscode.workspace.getConfiguration('markdown', document).get<'always' | 'smart' | 'never'>('editor.pasteUrlAsFormattedLink.enabled', 'always');

	const edits: vscode.SnippetTextEdit[] = [];
	let placeHolderValue: number = ranges.length;
	let label: string = '';
	let smartPaste: boolean = false;
	for (let i = 0; i < ranges.length; i++) {
		if (enabled === 'smart') {
			const inMarkdownLink = checkPaste(document, ranges, /\[([^\]]*)\]\(([^)]*)\)/g, i);
			const inFencedCode = checkPaste(document, ranges, /^```[\s\S]*?```$/gm, i);
			const inFencedMath = checkPaste(document, ranges, /^\$\$[\s\S]*?\$\$$/gm, i);
			smartPaste = (inMarkdownLink || inFencedCode || inFencedMath);
		}

		const snippet = await tryGetUriListSnippet(document, urlList, token, document.getText(ranges[i]), placeHolderValue, smartPaste);
		if (!snippet) {
			return;
		}

		smartPaste = false;
		placeHolderValue--;
		edits.push(new vscode.SnippetTextEdit(ranges[i], snippet.snippet));
		label = snippet.label;
	}

	const additionalEdits = new vscode.WorkspaceEdit();
	additionalEdits.set(document.uri, edits);

	return { additionalEdits, label };
}

function checkPaste(document: vscode.TextDocument, ranges: readonly vscode.Range[], regex: RegExp, index: number): boolean {
	const rangeStartOffset = document.offsetAt(ranges[index].start);
	const rangeEndOffset = document.offsetAt(ranges[index].end);
	const matches = [...document.getText().matchAll(regex)];
	for (const match of matches) {
		if (match.index !== undefined && rangeStartOffset > match.index && rangeEndOffset < match.index + match[0].length) {
			return true;
		}
	}

	return false;
}

export async function tryGetUriListSnippet(document: vscode.TextDocument, urlList: String, token: vscode.CancellationToken, title = '', placeHolderValue = 0, smartPaste = false): Promise<{ snippet: vscode.SnippetString; label: string } | undefined> {
	if (token.isCancellationRequested) {
		return undefined;
	}

	const uris: vscode.Uri[] = [];
	for (const resource of urlList.split(/\r?\n/g)) {
		try {
			uris.push(vscode.Uri.parse(resource));
		} catch {
			// noop
		}
	}

	return createUriListSnippet(document, uris, title, placeHolderValue, smartPaste);
}

interface UriListSnippetOptions {
	readonly placeholderText?: string;

	readonly placeholderStartIndex?: number;

	/**
	 * Should the snippet be for an image link or video?
	 *
	 * If `undefined`, tries to infer this from the uri.
	 */
	readonly insertAsMedia?: boolean;

	readonly separator?: string;
}

export function createUriListSnippet(
	document: vscode.TextDocument,
	uris: readonly vscode.Uri[],
	title = '',
	placeholderValue = 0,
	smartPaste = false,
	options?: UriListSnippetOptions,
): { snippet: vscode.SnippetString; label: string } | undefined {
	if (!uris.length) {
		return;
	}

	const dir = getDocumentDir(document);

	const snippet = new vscode.SnippetString();

	let insertedLinkCount = 0;
	let insertedImageCount = 0;
	let insertedAudioVideoCount = 0;

	uris.forEach((uri, i) => {
		const mdPath = getMdPath(dir, uri);

		const ext = URI.Utils.extname(uri).toLowerCase().replace('.', '');
		const insertAsMedia = typeof options?.insertAsMedia === 'undefined' ? mediaFileExtensions.has(ext) : !!options.insertAsMedia;
		const insertAsVideo = mediaFileExtensions.get(ext) === MediaKind.Video;
		const insertAsAudio = mediaFileExtensions.get(ext) === MediaKind.Audio;

		if (insertAsVideo) {
			insertedAudioVideoCount++;
			snippet.appendText(`<video src="${escapeHtmlAttribute(mdPath)}" controls title="`);
			snippet.appendPlaceholder(escapeBrackets(title) || 'Title', placeholderValue);
			snippet.appendText('"></video>');
		} else if (insertAsAudio) {
			insertedAudioVideoCount++;
			snippet.appendText(`<audio src="${escapeHtmlAttribute(mdPath)}" controls title="`);
			snippet.appendPlaceholder(escapeBrackets(title) || 'Title', placeholderValue);
			snippet.appendText('"></audio>');
		} else {
			if (insertAsMedia) {
				insertedImageCount++;
				snippet.appendText('![');
				const placeholderText = escapeBrackets(title) || options?.placeholderText || 'Alt text';
				const placeholderIndex = typeof options?.placeholderStartIndex !== 'undefined' ? options?.placeholderStartIndex + i : (placeholderValue === 0 ? undefined : placeholderValue);
				snippet.appendPlaceholder(placeholderText, placeholderIndex);
				snippet.appendText(`](${escapeMarkdownLinkPath(mdPath)})`);
			} else {
				insertedLinkCount++;
				if (smartPaste) {
					if (externalUriSchemes.includes(uri.scheme)) {
						snippet.appendText(uri.toString(true));
					} else {
						snippet.appendText(escapeMarkdownLinkPath(mdPath));
					}
				} else {
					snippet.appendText('[');
					snippet.appendPlaceholder(escapeBrackets(title) || 'Title', placeholderValue);
					if (externalUriSchemes.includes(uri.scheme)) {
						const uriString = uri.toString(true);
						snippet.appendText(`](${uriString})`);
					} else {
						snippet.appendText(`](${escapeMarkdownLinkPath(mdPath)})`);
					}
				}
			}
		}

		if (i < uris.length - 1 && uris.length > 1) {
			snippet.appendText(options?.separator ?? ' ');
		}
	});

	let label: string;
	if (insertedAudioVideoCount > 0) {
		if (insertedLinkCount > 0) {
			label = vscode.l10n.t('Insert Markdown Media and Links');
		} else {
			label = vscode.l10n.t('Insert Markdown Media');
		}
	} else if (insertedImageCount > 0 && insertedLinkCount > 0) {
		label = vscode.l10n.t('Insert Markdown Images and Links');
	} else if (insertedImageCount > 0) {
		label = insertedImageCount > 1
			? vscode.l10n.t('Insert Markdown Images')
			: vscode.l10n.t('Insert Markdown Image');
	} else {
		label = insertedLinkCount > 1
			? vscode.l10n.t('Insert Markdown Links')
			: vscode.l10n.t('Insert Markdown Link');
	}

	return { snippet, label };
}

/**
 * Create a new edit from the image files in a data transfer.
 *
 * This tries copying files outside of the workspace into the workspace.
 */
export async function createEditForMediaFiles(
	document: vscode.TextDocument,
	dataTransfer: vscode.DataTransfer,
	token: vscode.CancellationToken
): Promise<{ snippet: vscode.SnippetString; label: string; additionalEdits: vscode.WorkspaceEdit } | undefined> {
	if (document.uri.scheme === Schemes.untitled) {
		return;
	}

	interface FileEntry {
		readonly uri: vscode.Uri;
		readonly newFile?: { readonly contents: vscode.DataTransferFile; readonly overwrite: boolean };
	}

	const pathGenerator = new NewFilePathGenerator();
	const fileEntries = coalesce(await Promise.all(Array.from(dataTransfer, async ([mime, item]): Promise<FileEntry | undefined> => {
		if (!mediaMimes.has(mime)) {
			return;
		}

		const file = item?.asFile();
		if (!file) {
			return;
		}

		if (file.uri) {
			// If the file is already in a workspace, we don't want to create a copy of it
			const workspaceFolder = vscode.workspace.getWorkspaceFolder(file.uri);
			if (workspaceFolder) {
				return { uri: file.uri };
			}
		}

		const newFile = await pathGenerator.getNewFilePath(document, file, token);
		if (!newFile) {
			return;
		}
		return { uri: newFile.uri, newFile: { contents: file, overwrite: newFile.overwrite } };
	})));
	if (!fileEntries.length) {
		return;
	}

	const workspaceEdit = new vscode.WorkspaceEdit();
	for (const entry of fileEntries) {
		if (entry.newFile) {
			workspaceEdit.createFile(entry.uri, {
				contents: entry.newFile.contents,
				overwrite: entry.newFile.overwrite,
			});
		}
	}

	const snippet = createUriListSnippet(document, fileEntries.map(entry => entry.uri));
	if (!snippet) {
		return;
	}

	return {
		snippet: snippet.snippet,
		label: snippet.label,
		additionalEdits: workspaceEdit,
	};
}

function getMdPath(dir: vscode.Uri | undefined, file: vscode.Uri) {
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

	return file.toString(false);
}

function escapeHtmlAttribute(attr: string): string {
	return encodeURI(attr).replaceAll('"', '&quot;');
}

function escapeMarkdownLinkPath(mdPath: string): string {
	if (needsBracketLink(mdPath)) {
		return '<' + mdPath.replaceAll('<', '\\<').replaceAll('>', '\\>') + '>';
	}

	return encodeURI(mdPath);
}

function escapeBrackets(value: string): string {
	value = value.replace(/[\[\]]/g, '\\$&');
	return value;
}

function needsBracketLink(mdPath: string) {
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

