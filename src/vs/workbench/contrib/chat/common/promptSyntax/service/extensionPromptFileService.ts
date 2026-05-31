/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { URI } from '../../../../../../base/common/uri.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IExtensionDescription } from '../../../../../../platform/extensions/common/extensions.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IFilesConfigurationService } from '../../../../../services/filesConfiguration/common/filesConfigurationService.js';
import { getSkillFolderName } from '../config/promptFileLocations.js';
import { ParsedPromptFile, PromptFileParser } from '../promptFileParser.js';
import { PromptFileSource, PromptsType } from '../promptTypes.js';
import {
	CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT,
	IExtensionPromptPath,
	INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT,
	IPromptFileContext,
	IPromptFileResource,
	PROMPT_FILE_PROVIDER_ACTIVATION_EVENT,
	PromptsStorage,
	SKILL_PROVIDER_ACTIVATION_EVENT,
} from './promptsService.js';

/**
 * Event payload emitted by {@link ExtensionPromptFileService.onDidChange}.
 */
export interface IExtensionPromptFilesChangeEvent {
	readonly type: PromptsType;
}

type PromptFileProviderEntry = {
	readonly extension: IExtensionDescription;
	readonly type: PromptsType;
	readonly onDidChangePromptFiles?: Event<void>;
	readonly providePromptFiles: (context: IPromptFileContext, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
};

const ALL_PROMPT_TYPES: readonly PromptsType[] = [
	PromptsType.prompt,
	PromptsType.instructions,
	PromptsType.agent,
	PromptsType.skill,
	PromptsType.hook,
];

/**
 * Owns the registry of prompt files contributed by extensions, both via
 * static contribution points (see {@link registerContributedFile}) and via
 * dynamic providers registered through the proposed extension API (see
 * {@link registerPromptFileProvider}).
 *
 * Exposes a per-type getter ({@link getExtensionPromptFiles}) that merges
 * both sources and applies any `when` clauses, plus a single change event
 * ({@link onDidChange}) carrying the affected {@link PromptsType}.
 */
export class ExtensionPromptFileService extends Disposable {

	/**
	 * Files contributed via extension contribution points, keyed by type then URI.
	 */
	private readonly contributedFiles = {
		[PromptsType.prompt]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.instructions]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.agent]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.skill]: new ResourceMap<Promise<IExtensionPromptPath>>(),
		[PromptsType.hook]: new ResourceMap<Promise<IExtensionPromptPath>>(),
	};

	/**
	 * Providers registered via the proposed extension API.
	 */
	private readonly _promptFileProviders: PromptFileProviderEntry[] = [];

	/**
	 * Context keys referenced by tracked `when` clauses (from contributed
	 * files and provider results). Used to know when to re-evaluate.
	 */
	private readonly _contributedWhenKeys = new Set<string>();
	private readonly _contributedWhenClauses = new Map<string, string>();
	private readonly _providerWhenClauses = new Map<PromptFileProviderEntry, readonly string[]>();

	private readonly _onDidChange = this._register(new Emitter<IExtensionPromptFilesChangeEvent>());
	public readonly onDidChange: Event<IExtensionPromptFilesChangeEvent> = this._onDidChange.event;

	/**
	 * Pending URIs to mark as readonly, flushed on the next microtask.
	 * Batches multiple `registerContributedFile` calls (which happen
	 * synchronously in the extension point handler) into a single
	 * `updateReadonly` call to avoid firing `onDidChangeReadonly` per file.
	 */
	private _pendingReadonlyUris: URI[] = [];
	private _pendingReadonlyFlush = false;

	constructor(
		@ILogService private readonly logger: ILogService,
		@IFileService private readonly fileService: IFileService,
		@IModelService private readonly modelService: IModelService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IFilesConfigurationService private readonly filesConfigService: IFilesConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		this._register(this.contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(this._contributedWhenKeys)) {
				// A tracked context key changed; the visibility of any
				// extension-contributed file may have changed, so notify
				// for every type.
				for (const type of ALL_PROMPT_TYPES) {
					this._onDidChange.fire({ type });
				}
			}
		}));
	}

	/**
	 * Returns the merged list of extension-contributed prompt files for the
	 * given type, filtered by their `when` clause.
	 */
	public async getExtensionPromptFiles(type: PromptsType, token: CancellationToken): Promise<readonly IExtensionPromptPath[]> {
		await this.extensionService.whenInstalledExtensionsRegistered();
		const settledResults = await Promise.allSettled(this.contributedFiles[type].values());
		const contributedFiles = settledResults
			.filter((result): result is PromiseFulfilledResult<IExtensionPromptPath> => result.status === 'fulfilled')
			.map(result => result.value);

		const activationEvent = this._getProviderActivationEvent(type);
		const providerFiles = activationEvent ? await this._listFromProviders(type, activationEvent, token) : [];

		return [...contributedFiles, ...providerFiles].filter(file => {
			if (!file.when) {
				return true;
			}
			const when = ContextKeyExpr.deserialize(file.when);
			if (!when) {
				this.logger.warn(`[getExtensionPromptFiles] Ignoring contributed prompt file with invalid when clause: ${file.when}`);
				return false;
			}
			return this.contextKeyService.contextMatchesRules(when);
		});
	}

	/**
	 * Registers a file contributed via a static contribution point. Returns
	 * a disposable that removes the contribution.
	 */
	public registerContributedFile(type: PromptsType, uri: URI, extension: IExtensionDescription, name?: string, description?: string, when?: string, sessionTypes?: readonly string[]): IDisposable {
		const bucket = this.contributedFiles[type];
		if (bucket.has(uri)) {
			// keep first registration per extension (handler filters duplicates per extension already)
			return Disposable.None;
		}
		const entryPromise = (async () => {
			// For skills, validate that the file follows the required structure
			if (type === PromptsType.skill) {
				try {
					const validated = await this._validateAndSanitizeSkillFile(uri, CancellationToken.None);
					name = validated.name;
					description = validated.description;
				} catch (e) {
					const msg = e instanceof Error ? e.message : String(e);
					this.logger.error(`[registerContributedFile] Extension '${extension.identifier.value}' failed to validate skill file: ${uri}`, msg);
					throw e;
				}
			}

			return { uri, name, description, when, sessionTypes, storage: PromptsStorage.extension, type, extension, source: PromptFileSource.ExtensionContribution } satisfies IExtensionPromptPath;
		})();
		bucket.set(uri, entryPromise);

		this._enqueueReadonlyUpdate(uri);

		if (when) {
			this._contributedWhenClauses.set(`${type}/${uri.toString()}`, when);
			this._updateContributedWhenKeys();
		}

		this._onDidChange.fire({ type });

		return {
			dispose: () => {
				bucket.delete(uri);
				if (when) {
					this._contributedWhenClauses.delete(`${type}/${uri.toString()}`);
					this._updateContributedWhenKeys();
				}
				this._onDidChange.fire({ type });
			}
		};
	}

	/**
	 * Registers a prompt file provider (CustomAgentProvider, InstructionsProvider, or PromptFileProvider).
	 * This is called by the extension host bridge when an extension registers a provider via
	 * vscode.chat.registerCustomAgentProvider(), registerInstructionsProvider(), or
	 * registerPromptFileProvider().
	 */
	public registerPromptFileProvider(extension: IExtensionDescription, type: PromptsType, provider: {
		onDidChangePromptFiles?: Event<void>;
		providePromptFiles: (context: IPromptFileContext, token: CancellationToken) => Promise<IPromptFileResource[] | undefined>;
	}): IDisposable {
		const providerEntry: PromptFileProviderEntry = { extension, type, ...provider };
		this._promptFileProviders.push(providerEntry);

		const disposables = new DisposableStore();

		if (provider.onDidChangePromptFiles) {
			disposables.add(provider.onDidChangePromptFiles(() => {
				this._onDidChange.fire({ type });
			}));
		}

		this._onDidChange.fire({ type });

		disposables.add({
			dispose: () => {
				const index = this._promptFileProviders.findIndex(p => p === providerEntry);
				if (index >= 0) {
					this._promptFileProviders.splice(index, 1);
					this._providerWhenClauses.delete(providerEntry);
					this._updateContributedWhenKeys();
					this._onDidChange.fire({ type });
				}
			}
		});

		return disposables;
	}

	private async _listFromProviders(type: PromptsType, activationEvent: string, token: CancellationToken): Promise<IExtensionPromptPath[]> {
		const result: IExtensionPromptPath[] = [];
		const readonlyUris: URI[] = [];

		// Activate extensions that might provide files for this type
		await this.extensionService.activateByEvent(activationEvent);

		const providers = this._promptFileProviders.filter(p => p.type === type);
		if (providers.length === 0) {
			return result;
		}

		for (const providerEntry of providers) {
			try {
				const files = await providerEntry.providePromptFiles({}, token);
				this._providerWhenClauses.set(providerEntry, files?.flatMap(file => file.when ? [file.when] : []) ?? []);
				this._updateContributedWhenKeys();
				if (!files || token.isCancellationRequested) {
					continue;
				}

				for (const file of files) {
					readonlyUris.push(file.uri);
					result.push({
						uri: file.uri,
						storage: PromptsStorage.extension,
						type,
						extension: providerEntry.extension,
						source: PromptFileSource.ExtensionAPI,
						name: file.name,
						description: file.description,
						when: file.when,
						sessionTypes: file.sessionTypes,
					} satisfies IExtensionPromptPath);
				}
			} catch (e) {
				this.logger.error(`[listFromProviders] Failed to get ${type} files from provider`, e instanceof Error ? e.message : String(e));
			}
		}

		// Mark all collected files as readonly in a single batch to avoid
		// firing onDidChangeReadonly once per file (which causes a cascade
		// of event handlers and can freeze the renderer).
		void this.filesConfigService.updateReadonly(readonlyUris, true);

		return result;
	}

	private _getProviderActivationEvent(type: PromptsType): string | undefined {
		switch (type) {
			case PromptsType.agent:
				return CUSTOM_AGENT_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.instructions:
				return INSTRUCTIONS_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.prompt:
				return PROMPT_FILE_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.skill:
				return SKILL_PROVIDER_ACTIVATION_EVENT;
			case PromptsType.hook:
				return undefined; // hooks don't have extension providers
		}
	}

	private _enqueueReadonlyUpdate(uri: URI): void {
		this._pendingReadonlyUris.push(uri);
		if (!this._pendingReadonlyFlush) {
			this._pendingReadonlyFlush = true;
			queueMicrotask(() => {
				const uris = this._pendingReadonlyUris;
				this._pendingReadonlyUris = [];
				this._pendingReadonlyFlush = false;
				void this.filesConfigService.updateReadonly(uris, true);
			});
		}
	}

	private _updateContributedWhenKeys(): void {
		this._contributedWhenKeys.clear();
		for (const whenClause of this._contributedWhenClauses.values()) {
			const expr = ContextKeyExpr.deserialize(whenClause);
			for (const key of expr?.keys() ?? []) {
				this._contributedWhenKeys.add(key);
			}
		}
		for (const whenClauses of this._providerWhenClauses.values()) {
			for (const whenClause of whenClauses) {
				const expr = ContextKeyExpr.deserialize(whenClause);
				for (const key of expr?.keys() ?? []) {
					this._contributedWhenKeys.add(key);
				}
			}
		}
	}

	// Skill validation

	private async _validateAndSanitizeSkillFile(uri: URI, token: CancellationToken): Promise<{ name: string; description: string | undefined }> {
		const parsedFile = await this._parsePromptFile(uri, token);
		const folderName = getSkillFolderName(uri);

		let name = parsedFile.header?.name;
		if (!name) {
			this.logger.debug(`[validateAndSanitizeSkillFile] Agent skill file missing name attribute, using folder name "${folderName}": ${uri}`);
			name = folderName;
		}

		const description = parsedFile.header?.description;

		// Sanitize the name first (remove XML tags and truncate)
		let sanitizedName = this._truncateAgentSkillName(name, uri);

		// If sanitized name doesn't match folder name, use folder name (consistent with computeSkillDiscoveryInfo)
		if (sanitizedName !== folderName) {
			this.logger.debug(`[validateAndSanitizeSkillFile] Agent skill name "${sanitizedName}" does not match folder name "${folderName}", using folder name: ${uri}`);
			sanitizedName = folderName;
		}

		const sanitizedDescription = description ? this._truncateAgentSkillDescription(description, uri) : undefined;
		return { name: sanitizedName, description: sanitizedDescription };
	}

	private async _parsePromptFile(uri: URI, token: CancellationToken): Promise<ParsedPromptFile> {
		const model = this.modelService.getModel(uri);
		if (model) {
			return new PromptFileParser().parse(uri, model.getValue());
		}
		const fileContent = await this.fileService.readFile(uri);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		return new PromptFileParser().parse(uri, fileContent.value.toString());
	}

	private _sanitizeAgentSkillText(text: string): string {
		// Remove XML tags
		return text.replace(/<[^>]+>/g, '');
	}

	private _truncateAgentSkillName(name: string, uri: URI): string {
		const MAX_NAME_LENGTH = 64;
		const sanitized = this._sanitizeAgentSkillText(name);
		if (sanitized !== name) {
			this.logger.debug(`[findAgentSkills] Agent skill name contains XML tags, removed: ${uri}`);
		}
		if (sanitized.length > MAX_NAME_LENGTH) {
			this.logger.debug(`[findAgentSkills] Agent skill name exceeds ${MAX_NAME_LENGTH} characters, truncated: ${uri}`);
			return sanitized.substring(0, MAX_NAME_LENGTH);
		}
		return sanitized;
	}

	private _truncateAgentSkillDescription(description: string, uri: URI): string {
		const MAX_DESCRIPTION_LENGTH = 1024;
		const sanitized = this._sanitizeAgentSkillText(description);
		if (sanitized !== description) {
			this.logger.debug(`[findAgentSkills] Agent skill description contains XML tags, removed: ${uri}`);
		}
		if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
			this.logger.debug(`[findAgentSkills] Agent skill description exceeds ${MAX_DESCRIPTION_LENGTH} characters, truncated: ${uri}`);
			return sanitized.substring(0, MAX_DESCRIPTION_LENGTH);
		}
		return sanitized;
	}
}
