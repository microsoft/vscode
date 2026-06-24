/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { Diff, IGitDiffService } from '../../../platform/git/common/gitDiffService';
import { IGitService, RepoContext } from '../../../platform/git/common/gitService';
import { Change } from '../../../platform/git/vscode/git';
import { Copilot } from '../../../platform/inlineCompletions/common/api';
import { ILanguageContextProviderService, ProviderTarget } from '../../../platform/languageContextProvider/common/languageContextProviderService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { Disposable, DisposableStore, IDisposable } from '../../../util/vs/base/common/lifecycle';

export class ScmContextProviderContribution extends Disposable {

	private readonly _resolver: ScmContextResolver;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ILanguageContextProviderService private readonly _languageContextProviderService: ILanguageContextProviderService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IGitService private readonly _gitService: IGitService,
		@IGitDiffService private readonly _gitDiffService: IGitDiffService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService
	) {
		super();

		this._resolver = new ScmContextResolver(
			this._configurationService,
			this._gitService,
			this._gitDiffService,
			this._logService
		);

		this._register(this.registerContextProvider());
		this._register(this._registerCacheInvalidation());
	}

	private registerContextProvider(): IDisposable {
		const disposables = new DisposableStore();

		try {
			const provider: Copilot.ContextProvider<Copilot.SupportedContextItem> = {
				id: 'scm-context-provider',
				selector: { scheme: 'vscode-scm' }, // TODO: Verify if this is the correct document selector for SCM
				resolver: this._resolver
			};
			disposables.add(this._languageContextProviderService.registerContextProvider(provider, [ProviderTarget.Completions]));
		} catch (error) {
			this._logService.error('Error registering SCM context provider:', error);
		}

		return disposables;
	}

	private _registerCacheInvalidation(): IDisposable {
		const disposables = new DisposableStore();

		const resourcesToConsider = this._gitService.activeRepository.map(repository => {
			if (!repository) {
				return new Set<string>();
			}

			const workingTreeChanges = repository.changes?.workingTree.map(change => change.uri.toString()) ?? [];
			return new Set(workingTreeChanges);
		});

		// Invalidate cache when workspace file documents change
		disposables.add(this._workspaceService.onDidChangeTextDocument(e => {
			if (resourcesToConsider.get().has(e.document.uri.toString())) {
				this._resolver.invalidateCache();
			}
		}));

		return disposables;
	}
}

interface CachedDiffs {
	readonly cacheKey: string;
	readonly diffs: Diff[];
}

class ScmContextResolver implements Copilot.ContextResolver<Copilot.SupportedContextItem> {

	private _cachedDiffs: CachedDiffs | undefined;

	constructor(
		private readonly _configurationService: IConfigurationService,
		private readonly _gitService: IGitService,
		private readonly _gitDiffService: IGitDiffService,
		private readonly _logService: ILogService
	) { }

	invalidateCache(): void {
		if (this._cachedDiffs !== undefined) {
			this._cachedDiffs = undefined;
			this._logService.trace('[ScmContextResolver] Cache invalidated');
		}
	}

	async *resolve(request: Copilot.ResolveRequest, token: CancellationToken): AsyncIterable<Copilot.SupportedContextItem> {
		// Get git configuration values that affect commit message formatting
		const inputValidationLength = this._configurationService.getNonExtensionConfig<number>('git.inputValidationLength') ?? 72;
		const inputValidationSubjectLength = this._configurationService.getNonExtensionConfig<number>('git.inputValidationSubjectLength') ?? 50;

		// Build commit message guidelines based on configuration
		const guidelines: string[] = [
			'This is a git commit message input field.',
			'The commit message should accurately describe the changes being committed in less than a sentence.',
			'Only provide a completion if you are confident you understand the intent of the user\'s commit based on the staged changes.',
			'Write in natural human language, not code or technical syntax.',
			'Use imperative mood (e.g., "Add feature" not "Added feature").',
			`Keep the first line (subject) under ${inputValidationSubjectLength} characters.`,
			`Keep all lines under ${inputValidationLength} characters.`,
			'If the changes are unclear or ambiguous, do not complete the commit message.'
		];

		yield {
			name: 'Commit message guidelines',
			value: guidelines.join(' '),
			importance: 100
		};

		// Get staged changes diffs - one context item per file
		const diffs = await this._getStagedChangesDiffs(token);
		for (const diff of diffs) {
			yield {
				uri: diff.uri.toString(),
				value: diff.diff,
				importance: 50
			};
		}
	}

	private async _getStagedChangesDiffs(token: CancellationToken): Promise<Diff[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		try {
			await this._gitService.initialize();

			const repository = this._gitService.activeRepository.get();
			if (!repository) {
				this._logService.trace('[ScmContextResolver] No active repository found');
				return [];
			}

			const changes = repository.changes;
			if (!changes) {
				this._logService.trace('[ScmContextResolver] No changes available');
				return [];
			}

			// Get staged changes (index changes), or fall back to working tree changes if nothing is staged
			const changedFiles: Change[] = changes.indexChanges.length > 0
				? changes.indexChanges
				: [...changes.workingTree, ...changes.untrackedChanges];

			if (changedFiles.length === 0) {
				this._logService.trace('[ScmContextResolver] No changed files found');
				return [];
			}

			// Generate cache key based on the current changed files
			const cacheKey = this._generateCacheKey(changedFiles, repository);

			// Return cached diffs if the cache key matches
			if (this._cachedDiffs && this._cachedDiffs.cacheKey === cacheKey) {
				this._logService.trace('[ScmContextResolver] Returning cached diffs');
				return this._cachedDiffs.diffs;
			}

			const diffs = await this._gitDiffService.getChangeDiffs(repository.rootUri, changedFiles);
			this._logService.trace(`[ScmContextResolver] Retrieved ${diffs.length} diffs`);

			// Cache the diffs
			this._cachedDiffs = { cacheKey, diffs };

			return diffs;
		} catch (error) {
			this._logService.error('[ScmContextResolver] Error getting staged changes diffs:', error);
			return [];
		}
	}

	private _generateCacheKey(changedFiles: Change[], repository: RepoContext): string {
		// Create a cache key based on the changed file URIs and their status
		const fileKeys = changedFiles
			.map(change => `${change.uri.toString()}:${change.status}`)
			.sort()
			.join('|');
		return `${repository.rootUri.toString()}:${fileKeys}`;
	}
}