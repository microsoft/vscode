/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ChunkScorer } from './scorer';
import { SourceFile, collectChunks, rankCandidates, searchLimits } from './search';

export interface SearchBackend {
	readonly name: string;
	readonly notice: string;
	readonly score: ChunkScorer;
}

export function isSearchAllowed(): boolean {
	return vscode.workspace.isTrusted
		&& !vscode.workspace.getConfiguration('chat').get<boolean>('disableAIFeatures', false)
		&& vscode.workspace.getConfiguration('search').get<string>('searchView.semanticSearchBehavior') === 'manual';
}

export class JevSearchProvider implements vscode.AITextSearchProvider, vscode.Disposable {
	private request: vscode.CancellationTokenSource | undefined;

	constructor(
		private readonly backend: SearchBackend,
		private readonly output: vscode.LogOutputChannel,
	) { }

	get name(): string {
		return this.backend.name;
	}

	cancel(): void {
		this.request?.cancel();
	}

	dispose(): void {
		this.cancel();
	}

	async provideAITextSearchResults(
		query: string,
		options: vscode.TextSearchProviderOptions,
		progress: vscode.Progress<vscode.TextSearchResult2>,
		token: vscode.CancellationToken,
	): Promise<vscode.TextSearchComplete2> {
		this.cancel();
		const request = new vscode.CancellationTokenSource();
		this.request = request;
		const controller = new AbortController();
		const subscriptions = vscode.Disposable.from(
			request,
			token.onCancellationRequested(() => request.cancel()),
			request.token.onCancellationRequested(() => controller.abort()),
		);
		if (token.isCancellationRequested) {
			request.cancel();
		}

		try {
			controller.signal.throwIfAborted();
			if (!isSearchAllowed()) {
				throw new Error('The demo requires a trusted workspace, enabled AI features, and manual semantic search.');
			}
			const started = Date.now();
			const collected = await collectChunks(this.files(options, request.token, controller.signal), options.maxFileSize, controller.signal);
			const ranked = await rankCandidates(query, collected.chunks, this.backend.score, Math.min(options.maxResults, searchLimits.results), controller.signal);
			controller.signal.throwIfAborted();
			for (const { candidate } of ranked.matches) {
				const lines = candidate.text.split('\n').slice(0, options.previewOptions.matchLines)
					.map(line => line.slice(0, options.previewOptions.charsPerLine));
				if (!lines.length) {
					throw new Error('Search previews must allow at least one line.');
				}
				progress.report(new vscode.TextSearchMatch2(candidate.resource, [{
					sourceRange: new vscode.Range(candidate.startLine, 0, candidate.endLine, candidate.endCharacter),
					previewRange: new vscode.Range(0, 0, lines.length - 1, lines[lines.length - 1].length),
				}], lines.join('\n')));
			}

			const limitHit = collected.limitHit || ranked.limitHit;
			this.output.info(`${this.name}: ${collected.files} files, ${collected.chunks.length} chunks, ${ranked.matches.length} results, ${Date.now() - started}ms. Limit hit: ${limitHit}.`);
			return {
				limitHit,
				message: [{
					text: this.backend.notice,
					type: vscode.TextSearchCompleteMessageType.Information,
				}, {
					text: vscode.l10n.t("Examined {0} files and scored {1} chunks; skipped {2} binary, non-file, or oversized entries.", collected.files, collected.chunks.length, collected.skipped),
					type: vscode.TextSearchCompleteMessageType.Information,
				}, ...(limitHit ? [{
					text: vscode.l10n.t("PoC limits were reached. Results may be incomplete; narrow Files to Include or use the bundled sample workspace."),
					type: vscode.TextSearchCompleteMessageType.Warning,
				}] : [])],
			};
		} catch (error) {
			if (controller.signal.aborted) {
				throw new vscode.CancellationError();
			}
			this.output.error(error instanceof Error ? error : String(error));
			throw new Error(vscode.l10n.t("Jev Search PoC failed. See the Jev Search PoC output channel for details."));
		} finally {
			subscriptions.dispose();
			if (this.request === request) {
				this.request = undefined;
			}
		}
	}

	private async *files(options: vscode.TextSearchProviderOptions, token: vscode.CancellationToken, signal: AbortSignal): AsyncIterable<SourceFile<vscode.Uri>> {
		const seen = new Set<string>();
		for (const folder of options.folderOptions) {
			signal.throwIfAborted();
			if (folder.folder.scheme !== 'file') {
				throw new Error('The PoC only supports file-scheme workspace folders.');
			}
			const uris = await vscode.workspace.findFiles2(
				(folder.includes.length ? folder.includes : ['**/*']).map(pattern => new vscode.RelativePattern(folder.folder, pattern)),
				{
					exclude: folder.excludes.map(pattern => typeof pattern === 'string' ? new vscode.RelativePattern(folder.folder, pattern) : pattern),
					useExcludeSettings: vscode.ExcludeSettingOptions.None,
					useIgnoreFiles: folder.useIgnoreFiles,
					followSymlinks: folder.followSymlinks,
					maxResults: searchLimits.files - seen.size + 1,
				},
				token,
			);
			for (const uri of uris.sort((a, b) => a.toString().localeCompare(b.toString()))) {
				signal.throwIfAborted();
				if (seen.has(uri.toString())) {
					continue;
				}
				seen.add(uri.toString());
				const stat = await vscode.workspace.fs.stat(uri);
				signal.throwIfAborted();
				yield {
					resource: uri,
					size: stat.size,
					isFile: !!(stat.type & vscode.FileType.File),
					readText: async () => (await vscode.workspace.openTextDocument(uri)).getText(),
				};
			}
		}
	}
}
