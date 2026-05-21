/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { hasDriveLetter } from '../../../util/vs/base/common/extpath';
import { Schemas } from '../../../util/vs/base/common/network';
import * as path from '../../../util/vs/base/common/path';
import { isWindows } from '../../../util/vs/base/common/platform';
import * as resources from '../../../util/vs/base/common/resources';
import { isUriComponents } from '../../../util/vs/base/common/uri';
import { Uri } from '../../../vscodeTypes';
import { coalesceParts, LinkifiedPart, LinkifiedText, LinkifyLocationAnchor } from './linkifiedText';
import { IContributedLinkifier, LinkifierContext } from './linkifyService';
import { IStatCache } from './statCache';

// Create a single regex which runs different regexp parts in a big `|` expression.
const pathMatchRe = new RegExp(
	[
		// Inline code paths (exclude code-like characters $, {, }, that are common in code but rare in filenames)
		/(?<!\[)`(?<inlineCodePath>[^`\s${}]+)`(?!\])/.source,

		// File paths rendered as plain text (exclude code-like characters)
		/(?<![\[`()<])(?<plainTextPath>[^\s`*${}()]+\.[^\s`*${}()]+)(?![\]`])/.source
	].join('|'),
	'gu');

/**
 * Linkifies file paths in responses. This includes:
 *
 * ```
 * `file.md`
 * foo.ts
 * ```
 */
export class FilePathLinkifier implements IContributedLinkifier {

	constructor(
		private readonly workspaceService: IWorkspaceService,
		private readonly statCache: IStatCache,
	) { }

	async linkify(text: string, context: LinkifierContext, token: CancellationToken): Promise<LinkifiedText> {
		const parts: Array<Promise<LinkifiedPart> | LinkifiedPart> = [];

		let endLastMatch = 0;
		for (const match of text.matchAll(pathMatchRe)) {
			const prefix = text.slice(endLastMatch, match.index);
			if (prefix) {
				parts.push(prefix);
			}

			const matched = match[0];

			const pathText = match.groups?.['inlineCodePath'] ?? match.groups?.['plainTextPath'] ?? '';

			parts.push(this.resolvePathText(pathText, context)
				.then(uri => {
					if (uri) {
						return new LinkifyLocationAnchor(uri);
					}
					return matched;
				}));

			endLastMatch = match.index + matched.length;
		}

		const suffix = text.slice(endLastMatch);
		if (suffix) {
			parts.push(suffix);
		}

		return { parts: coalesceParts(await Promise.all(parts)) };
	}

	private async resolvePathText(pathText: string, context: LinkifierContext): Promise<Uri | undefined> {
		const includeDirectorySlash = pathText.endsWith('/');
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();

		// Don't linkify very short paths such as '/' or special paths such as '../'
		if (pathText.length < 2 || ['../', '..\\', '/.', './', '\\.', '..'].includes(pathText)) {
			return;
		}

		if (pathText.startsWith('/') || (isWindows && (pathText.startsWith('\\') || hasDriveLetter(pathText)))) {
			try {
				const uri = await this.statAndNormalizeUri(Uri.file(pathText.startsWith('/') ? path.posix.normalize(pathText) : path.normalize(pathText)), includeDirectorySlash);
				if (uri) {
					if (path.posix.normalize(uri.path) === '/') {
						return undefined;
					}

					return uri;
				}
			} catch {
				// noop
			}
		}

		// Handle paths that look like uris
		const scheme = pathText.match(/^([a-z]+):/i)?.[1];
		if (scheme) {
			try {
				const uri = Uri.parse(pathText);
				if (uri.scheme === Schemas.file || workspaceFolders.some(folder => folder.scheme === uri.scheme && folder.authority === uri.authority)) {
					const statedUri = await this.statAndNormalizeUri(uri, includeDirectorySlash);
					if (statedUri) {
						return statedUri;
					}
				}
			} catch {
				// Noop, parsing error
			}
			return;
		}

		const result = await this.resolveInWorkspaceFolders(workspaceFolders, pathText, includeDirectorySlash);
		if (result) {
			return result;
		}

		// Then fallback to checking references based on filename.
		// Only do this for simple filenames without directory components - if the user
		// specified a path like `./node_modules/cli.js`, we shouldn't match a reference
		// with a completely different path just because the basename matches.
		// Also skip if text contains code-like characters that are rarely in real filenames.
		if (!pathText.includes('/') && !pathText.includes('\\') && !/[${}()]/.test(pathText)) {
			const name = path.basename(pathText);
			const refUri = context.references
				.map(ref => {
					if ('variableName' in ref.anchor) {
						return isUriComponents(ref.anchor.value) ? ref.anchor.value : ref.anchor.value?.uri;
					}
					return isUriComponents(ref.anchor) ? ref.anchor : ref.anchor.uri;
				})
				.filter((item): item is Uri => !!item)
				.find(refUri => resources.basename(refUri) === name);

			return refUri;
		}

		return undefined;
	}

	private async resolveInWorkspaceFolders(workspaceFolders: readonly Uri[], pathText: string, includeDirectorySlash: boolean): Promise<Uri | undefined> {
		const candidates = workspaceFolders.map(folder => Uri.joinPath(folder, pathText));
		const results = await Promise.all(candidates.map(uri => this.statAndNormalizeUri(uri, includeDirectorySlash)));
		return results.find((r): r is Uri => r !== undefined);
	}

	private async statAndNormalizeUri(uri: Uri, includeDirectorySlash: boolean): Promise<Uri | undefined> {
		try {
			const stat = await this.statCache.stat(uri);
			if (!stat) {
				return undefined;
			}
			if (stat.type === FileType.Directory) {
				if (includeDirectorySlash) {
					return uri.path.endsWith('/') ? uri : uri.with({ path: `${uri.path}/` });
				}

				if (uri.path.endsWith('/') && uri.path !== '/') {
					return uri.with({ path: uri.path.slice(0, -1) });
				}
				return uri;
			}

			return uri;
		} catch {
			return undefined;
		}
	}
}
