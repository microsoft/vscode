/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { getWorkspaceFileDisplayPath, IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { normalizePath as normalizeUriPath } from '../../../util/vs/base/common/resources';
import { Location, Position, Range, Uri } from '../../../vscodeTypes';
import { coalesceParts, LinkifiedPart, LinkifiedText, LinkifyLocationAnchor } from './linkifiedText';
import { IContributedLinkifier, LinkifierContext } from './linkifyService';
import { IStatCache } from './statCache';

// Matches markdown links where the text is a path and optional #L anchor is present
// Example: [src/file.ts](src/file.ts#L10-12) or [src/file.ts](src/file.ts)
const modelLinkRe = /\[(?<text>[^\]\n]+)\]\((?<target>[^\s)]+)\)/gu;

export class ModelFilePathLinkifier implements IContributedLinkifier {
	constructor(
		private readonly workspaceService: IWorkspaceService,
		private readonly statCache: IStatCache,
	) { }

	async linkify(text: string, context: LinkifierContext, token: CancellationToken): Promise<LinkifiedText | undefined> {
		let lastIndex = 0;
		const parts: Array<LinkifiedPart | Promise<LinkifiedPart>> = [];
		const workspaceFolders = this.workspaceService.getWorkspaceFolders();

		for (const match of text.matchAll(modelLinkRe)) {
			const original = match[0];
			const prefix = text.slice(lastIndex, match.index);
			if (prefix) {
				parts.push(prefix);
			}
			lastIndex = match.index + original.length;

			const parsed = this.parseModelLinkMatch(match);
			if (!parsed) {
				parts.push(original);
				continue;
			}

			if (!this.canLinkify(parsed, workspaceFolders)) {
				parts.push(original);
				continue;
			}

			// Push promise to resolve in parallel with other matches
			// Pass originalTargetPath to preserve platform-specific separators (e.g., c:/path vs c:\path) before Uri.file() conversion
			parts.push(this.resolveTarget(parsed.targetPath, parsed.originalTargetPath, workspaceFolders, parsed.preserveDirectorySlash, token).then(resolved => {
				if (!resolved) {
					return original;
				}

				const basePath = getWorkspaceFileDisplayPath(this.workspaceService, resolved);
				const anchorRange = this.parseAnchor(parsed.anchor);
				if (parsed.anchor && !anchorRange) {
					return original;
				}

				if (anchorRange) {
					const { range, startLine, endLine } = anchorRange;
					const displayPath = endLine && startLine !== endLine
						? `${basePath}#L${startLine}-L${endLine}`
						: `${basePath}#L${startLine}`;
					return new LinkifyLocationAnchor(new Location(resolved, range), displayPath);
				}

				return new LinkifyLocationAnchor(resolved, basePath);
			}));
		}

		const suffix = text.slice(lastIndex);
		if (suffix) {
			parts.push(suffix);
		}

		if (!parts.length) {
			return undefined;
		}

		return { parts: coalesceParts(await Promise.all(parts)) };
	}

	private parseModelLinkMatch(match: RegExpMatchArray): { readonly text: string; readonly targetPath: string; readonly anchor: string | undefined; readonly preserveDirectorySlash: boolean; readonly originalTargetPath: string } | undefined {
		const rawText = match.groups?.['text'];
		const rawTarget = match.groups?.['target'];
		if (!rawText || !rawTarget) {
			return undefined;
		}

		const hashIndex = rawTarget.indexOf('#');
		const baseTarget = hashIndex === -1 ? rawTarget : rawTarget.slice(0, hashIndex);
		const anchor = hashIndex === -1 ? undefined : rawTarget.slice(hashIndex + 1);

		let decodedBase = baseTarget;
		try {
			decodedBase = decodeURIComponent(baseTarget);
		} catch {
			// noop
		}

		const preserveDirectorySlash = decodedBase.endsWith('/') && decodedBase.length > 1;
		const normalizedTarget = this.normalizeSlashes(decodedBase);
		const normalizedText = this.normalizeLinkText(rawText);
		return { text: normalizedText, targetPath: normalizedTarget, anchor, preserveDirectorySlash, originalTargetPath: decodedBase };
	}

	private normalizeSlashes(value: string): string {
		// Collapse one or more backslashes into a single forward slash so mixed separators normalize consistently.
		return value.replace(/\\+/g, '/');
	}

	private normalizeLinkText(rawText: string): string {
		let text = this.normalizeSlashes(rawText);
		// Remove a leading or trailing backtick that sometimes wraps the visible link label.
		text = text.replace(/^`|`$/g, '');

		// Look for a trailing #L anchor segment so it can be stripped before we compare names.
		const anchorMatch = /^(.+?)(#L\d+(?:-\d+)?)$/.exec(text);
		return anchorMatch ? anchorMatch[1] : text;
	}

	private canLinkify(parsed: { readonly text: string; readonly targetPath: string; readonly anchor: string | undefined }, workspaceFolders: readonly Uri[]): boolean {
		const { text, targetPath, anchor } = parsed;
		const textMatchesBase = targetPath === text;
		const textIsFilename = !text.includes('/') && targetPath.endsWith(`/${text}`);

		// Allow descriptive text with anchor, but if text looks like a filename (has extension),
		// it must match the target's filename to prevent linking to wrong files
		let descriptiveWithAnchor = false;
		if (anchor) {
			const textLooksLikeFilename = /\.\w+$/.test(text);
			if (textLooksLikeFilename) {
				// Text looks like a filename/path - require it ends with target's basename
				const targetBasename = targetPath.split('/').pop() ?? '';
				const textBasename = text.split('/').pop() ?? '';
				descriptiveWithAnchor = textBasename === targetBasename;
			} else {
				// Text is truly descriptive (e.g., "widget initialization") - allow it
				descriptiveWithAnchor = true;
			}
		}

		return Boolean(workspaceFolders.length) && (textMatchesBase || textIsFilename || descriptiveWithAnchor);
	}

	private async resolveTarget(targetPath: string, originalTargetPath: string, workspaceFolders: readonly Uri[], preserveDirectorySlash: boolean, token: CancellationToken): Promise<Uri | undefined> {
		if (!workspaceFolders.length) {
			return undefined;
		}

		if (token.isCancellationRequested) {
			return undefined;
		}

		if (this.isAbsolutePath(targetPath)) {
			// Choose URI construction strategy based on workspace folder schemes.
			// For local (file:) workspaces we keep using Uri.file; for remote schemes we attempt
			// to project the absolute path into the remote scheme preserving the folder URI's authority.
			const normalizedAbs = targetPath.replace(/\\/g, '/');

			// Build candidate URIs for all workspace folders, then stat them in parallel.
			const candidates: Uri[] = [];
			for (const folderUri of workspaceFolders) {
				if (folderUri.scheme === 'file') {
					const absoluteFileUri = this.tryCreateFileUri(originalTargetPath);
					if (absoluteFileUri && this.isEqualOrParent(absoluteFileUri, folderUri)) {
						candidates.push(absoluteFileUri);
					}
				} else {
					// Remote / virtual workspace: attempt to map the absolute path into the same scheme.
					const folderPath = folderUri.path.replace(/\\/g, '/');
					const prefix = folderPath.endsWith('/') ? folderPath : folderPath + '/';
					if (normalizedAbs.startsWith(prefix)) {
						candidates.push(folderUri.with({ path: normalizedAbs }));
					}
				}
			}

			if (candidates.length) {
				const results = await Promise.all(candidates.map(c => this.tryStat(c, preserveDirectorySlash, token)));
				const found = results.find((r): r is Uri => r !== undefined);
				if (found) {
					return found;
				}
			}
			return undefined;
		}

		const segments = targetPath.split('/').filter(Boolean);
		const candidates = workspaceFolders.map(folderUri => Uri.joinPath(folderUri, ...segments));
		const results = await Promise.all(candidates.map(c => this.tryStat(c, preserveDirectorySlash, token)));
		const found = results.find((r): r is Uri => r !== undefined);
		if (found) {
			return found;
		}

		return undefined;
	}

	private tryCreateFileUri(path: string): Uri | undefined {
		try {
			return Uri.file(path);
		} catch {
			return undefined;
		}
	}


	private isEqualOrParent(target: Uri, folder: Uri): boolean {
		const targetPath = normalizeUriPath(target).path;
		const folderPath = normalizeUriPath(folder).path;
		return targetPath === folderPath || targetPath.startsWith(folderPath.endsWith('/') ? folderPath : `${folderPath}/`);
	}

	private parseAnchor(anchor: string | undefined): { readonly range: Range; readonly startLine: string; readonly endLine: string | undefined } | undefined {
		// Parse supported anchor formats: L123, L123-456, L123-L456, 123, 123-456
		if (!anchor) {
			return undefined;
		}
		const match = /^L?(\d+)(?:-L?(\d+))?$/.exec(anchor);
		if (!match) {
			return undefined;
		}

		const startLine = match[1];
		const endLineRaw = match[2];
		const normalizedEndLine = endLineRaw === startLine ? undefined : endLineRaw;
		const start = parseInt(startLine, 10) - 1;
		const end = parseInt(normalizedEndLine ?? startLine, 10) - 1;
		if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || end < start) {
			return undefined;
		}

		return {
			range: new Range(new Position(start, 0), new Position(end, 0)),
			startLine,
			endLine: normalizedEndLine,
		};
	}

	private isAbsolutePath(path: string): boolean {
		// Treat drive-letter prefixes (e.g. C:) or leading slashes as absolute paths.
		return /^[a-z]:/i.test(path) || path.startsWith('/');
	}

	private async tryStat(uri: Uri, preserveDirectorySlash: boolean, token: CancellationToken): Promise<Uri | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}
		try {
			const stat = await this.statCache.stat(uri);
			if (!stat) {
				return undefined;
			}
			if (stat.type === FileType.Directory) {
				const isRoot = uri.path === '/';
				const hasTrailingSlash = uri.path.endsWith('/');
				const shouldHaveTrailingSlash = preserveDirectorySlash && !isRoot;

				if (shouldHaveTrailingSlash && !hasTrailingSlash) {
					return uri.with({ path: `${uri.path}/` });
				}
				if (!shouldHaveTrailingSlash && hasTrailingSlash) {
					return uri.with({ path: uri.path.slice(0, -1) });
				}
			}
			return uri;
		} catch {
			return undefined;
		}
	}
}
