/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, ISettableObservable, observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { CoreDataChannel, IDataChannelEvent, IDataChannelService, ILinkPresentation, ILinkPresentationProvider, ILinkPresentationProviderRegistration, ILinkPresentationRule, ILinkPresentationService, ILinkPresentationWatcher, LinkPresentationKind, parseLinkPresentation } from '../../../../platform/dataChannel/common/dataChannel.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';

const cachedPresentationLimit = 100;
const cachedPresentationStorageKey = 'linkPresentation.cache.v1';
const watcherReleaseDelay = 5_000;
const uriPatternLengthLimit = 1_024;

export interface ILinkPresentationProviderContribution {
	readonly id: string;
	readonly uriPattern: string;
	readonly kind: LinkPresentationKind;
	readonly enablement?: string;
}

interface IDeclaredLinkPresentationProvider extends ILinkPresentationProviderContribution {
	readonly extensionId: string;
	readonly regexp: RegExp;
}

interface IRegisteredExtensionLinkPresentationProvider {
	readonly extensionId: string;
	readonly provider: ILinkPresentationProvider;
}

interface ICoreLinkPresentationProvider {
	readonly registration: ILinkPresentationProviderRegistration;
	readonly regexp: RegExp;
	readonly provider: ILinkPresentationProvider;
}

interface ISelectedLinkPresentationProvider {
	readonly id: string;
	readonly regexp: RegExp;
	readonly kind: LinkPresentationKind;
	readonly enablement?: string;
	readonly coreProvider?: ILinkPresentationProvider;
	readonly extensionId?: string;
}

interface ICachedLinkPresentation {
	readonly providerId: string;
	readonly presentation: ILinkPresentation;
}

export const linkPresentationProviderKinds: LinkPresentationKind[] = [
	'resource',
	'issue',
	'pullRequest',
	'commit',
	'file',
	'folder',
	'session',
	'chat',
	'repository',
	'branch',
];

const linkPresentationProviderExtensionPoint = ExtensionsRegistry.registerExtensionPoint<ILinkPresentationProviderContribution[]>({
	extensionPoint: 'linkPresentationProviders',
	jsonSchema: {
		description: localize('linkPresentationProviderExtensionPoint', "Contributes link presentation providers selected by URI regular expressions."),
		type: 'array',
		items: {
			type: 'object',
			additionalProperties: false,
			required: ['id', 'uriPattern', 'kind'],
			properties: {
				id: {
					type: 'string',
					description: localize('linkPresentationProvider.id', "Unique identifier used to register this link presentation provider."),
				},
				uriPattern: {
					type: 'string',
					description: localize('linkPresentationProvider.uriPattern', "Anchored regular expression matched against the canonical URI string before the extension is activated."),
				},
				kind: {
					type: 'string',
					enum: linkPresentationProviderKinds,
					description: localize('linkPresentationProvider.kind', "The semantic kind produced by this provider."),
				},
				enablement: {
					type: 'string',
					description: localize('linkPresentationProvider.enablement', "Configuration key that must be enabled before this provider is selected."),
				},
			},
		},
	},
	activationEventsGenerator: function* (providers) {
		for (const provider of providers) {
			if (provider.id) {
				yield `onLinkPresentation:${provider.id}`;
			}
		}
	},
});

export class DataChannelService extends Disposable implements IDataChannelService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidSendData = this._register(new Emitter<IDataChannelEvent>());
	readonly onDidSendData = this._onDidSendData.event;

	getDataChannel<T>(channelId: string): CoreDataChannel<T> {
		return new CoreDataChannelImpl<T>(channelId, this._onDidSendData);
	}
}

class CoreDataChannelImpl<T> implements CoreDataChannel<T> {
	constructor(
		private readonly channelId: string,
		private readonly _onDidSendData: Emitter<IDataChannelEvent>
	) { }

	sendData(data: T): void {
		this._onDidSendData.fire({
			channelId: this.channelId,
			data
		});
	}
}

export class LinkPresentationService extends Disposable implements ILinkPresentationService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeLinkPresentationRules = this._register(new Emitter<void>());
	readonly onDidChangeLinkPresentationRules = this._onDidChangeLinkPresentationRules.event;
	private readonly _coreProviders = new Map<string, ICoreLinkPresentationProvider>();
	private readonly _declaredExtensionProviders = new Map<string, IDeclaredLinkPresentationProvider>();
	private readonly _registeredExtensionProviders = new Map<string, IRegisteredExtensionLinkPresentationProvider>();
	private readonly _entries = this._register(new DisposableMap<string, SharedLinkPresentationEntry>());
	private readonly _cache = new Map<string, ICachedLinkPresentation>();

	get linkPresentationRules(): readonly ILinkPresentationRule[] {
		return [
			...Array.from(this._coreProviders.values())
				.filter(provider => this._isProviderEnabled(provider.registration.kind, provider.registration.enablement))
				.map(provider => ({ id: provider.registration.id, uriPattern: provider.regexp, kind: provider.registration.kind })),
			...Array.from(this._declaredExtensionProviders.values())
				.filter(provider => this._isProviderEnabled(provider.kind, provider.enablement))
				.map(provider => ({ id: provider.id, uriPattern: provider.regexp, kind: provider.kind })),
		].map(rule => ({ ...rule, uriPattern: normalizeUriPattern(rule.uriPattern) }));
	}

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._restoreCache();
		this._register(linkPresentationProviderExtensionPoint.setHandler(extensions => {
			this._declaredExtensionProviders.clear();
			for (const extension of extensions) {
				for (const contribution of extension.value) {
					const regexp = readUriPattern(contribution.uriPattern);
					if (!contribution.id || !regexp) {
						extension.collector.error(localize(
							'linkPresentationProvider.invalidPattern',
							"Link presentation provider '{0}' must use a valid anchored URI regular expression of at most {1} characters.",
							contribution.id,
							uriPatternLengthLimit,
						));
						continue;
					}
					if (this._coreProviders.has(contribution.id)) {
						extension.collector.error(localize(
							'linkPresentationProvider.coreDuplicateId',
							"Link presentation provider identifier '{0}' is already registered by the core.",
							contribution.id,
						));
						continue;
					}
					if (this._declaredExtensionProviders.has(contribution.id)) {
						extension.collector.error(localize(
							'linkPresentationProvider.duplicateId',
							"Link presentation provider identifier '{0}' is already contributed.",
							contribution.id,
						));
						continue;
					}
					this._declaredExtensionProviders.set(contribution.id, {
						...contribution,
						extensionId: extension.description.identifier.value,
						regexp,
					});
				}
			}
			this._refreshEntries();
			this._onDidChangeLinkPresentationRules.fire();
		}));
		this._register(this._configurationService.onDidChangeConfiguration(event => {
			const enablements = [
				...Array.from(this._coreProviders.values(), provider => provider.registration.enablement),
				...Array.from(this._declaredExtensionProviders.values(), provider => provider.enablement),
			];
			if (enablements.some(enablement => enablement && event.affectsConfiguration(enablement))) {
				this._refreshEntries();
				this._onDidChangeLinkPresentationRules.fire();
			}
		}));
	}

	registerLinkPresentationProvider(registration: ILinkPresentationProviderRegistration, provider: ILinkPresentationProvider): IDisposable {
		if (this._coreProviders.has(registration.id) || this._declaredExtensionProviders.has(registration.id)) {
			throw new Error(`Link presentation provider '${registration.id}' is already registered.`);
		}
		const value: ICoreLinkPresentationProvider = {
			registration,
			regexp: normalizeUriPattern(registration.uriPattern),
			provider,
		};
		this._coreProviders.set(registration.id, value);
		this._refreshEntries();
		this._onDidChangeLinkPresentationRules.fire();
		return toDisposable(() => {
			if (this._coreProviders.get(registration.id) === value) {
				this._coreProviders.delete(registration.id);
				this._refreshEntries();
				this._onDidChangeLinkPresentationRules.fire();
			}
		});
	}

	registerExtensionLinkPresentationProvider(extensionId: string, providerId: string, provider: ILinkPresentationProvider): IDisposable {
		const declaration = this._declaredExtensionProviders.get(providerId);
		if (!declaration) {
			throw new Error(`Link presentation provider '${providerId}' is not declared in the extension manifest.`);
		}
		if (!ExtensionIdentifier.equals(declaration.extensionId, extensionId)) {
			throw new Error(`Link presentation provider '${providerId}' was declared by extension '${declaration.extensionId}', not '${extensionId}'.`);
		}
		if (this._registeredExtensionProviders.has(providerId)) {
			throw new Error(`Link presentation provider '${providerId}' is already registered.`);
		}

		const registration = { extensionId, provider };
		this._registeredExtensionProviders.set(providerId, registration);
		return toDisposable(() => {
			if (this._registeredExtensionProviders.get(providerId) === registration) {
				this._registeredExtensionProviders.delete(providerId);
				this._refreshEntries(providerId);
			}
		});
	}

	declareExtensionLinkPresentationProvider(extensionId: string, contribution: ILinkPresentationProviderContribution): IDisposable {
		if (this._declaredExtensionProviders.has(contribution.id) || this._coreProviders.has(contribution.id)) {
			throw new Error(`Link presentation provider '${contribution.id}' is already declared.`);
		}
		const regexp = readUriPattern(contribution.uriPattern);
		if (!regexp) {
			throw new Error(`Link presentation provider '${contribution.id}' has an invalid URI pattern.`);
		}
		const declaration: IDeclaredLinkPresentationProvider = { ...contribution, extensionId, regexp };
		this._declaredExtensionProviders.set(contribution.id, declaration);
		this._refreshEntries();
		this._onDidChangeLinkPresentationRules.fire();
		return toDisposable(() => {
			if (this._declaredExtensionProviders.get(contribution.id) === declaration) {
				this._declaredExtensionProviders.delete(contribution.id);
				this._refreshEntries();
				this._onDidChangeLinkPresentationRules.fire();
			}
		});
	}

	getLinkPresentationRule(resource: URI): ILinkPresentationRule | undefined {
		const provider = this._selectProvider(resource);
		return provider ? { id: provider.id, uriPattern: provider.regexp, kind: provider.kind } : undefined;
	}

	createLinkPresentationWatcher(providerId: string, resource: URI): ILinkPresentationWatcher | undefined {
		const provider = this._selectProvider(resource, providerId);
		if (!provider) {
			return undefined;
		}

		const key = canonicalizeResource(providerId, resource);
		let entry = this._entries.get(key);
		if (!entry) {
			entry = new SharedLinkPresentationEntry(providerId, resource, () => {
				if (this._entries.get(key) === entry) {
					this._entries.deleteAndDispose(key);
				}
			});
			this._entries.set(key, entry);
			this._refreshEntry(entry);
		}
		return entry.acquire();
	}

	private _refreshEntries(forceProviderId?: string): void {
		for (const entry of this._entries.values()) {
			const selectedProviderId = this._selectProvider(entry.resource, entry.ruleId)?.id;
			if (selectedProviderId !== entry.providerId || forceProviderId === entry.providerId) {
				this._refreshEntry(entry);
			}
		}
	}

	private _refreshEntry(entry: SharedLinkPresentationEntry): void {
		const generation = entry.reset();
		const provider = this._selectProvider(entry.resource, entry.ruleId);
		entry.providerId = provider?.id;
		if (!provider) {
			entry.setPresentation(undefined);
			return;
		}

		const cached = this._getCachedPresentation(entry.key, provider.id, provider.kind);
		entry.setPresentation(cached ? { ...cached, isLoading: true } : undefined);
		if (provider.coreProvider) {
			try {
				this._attachProviderWatcher(entry, provider, provider.coreProvider.createLinkPresentationWatcher(entry.resource), generation);
			} catch (error) {
				this._handleProviderError(entry, generation, provider.kind, error);
			}
			return;
		}
		void this._activateExtensionProvider(entry, provider, generation);
	}

	private async _activateExtensionProvider(entry: SharedLinkPresentationEntry, provider: ISelectedLinkPresentationProvider, generation: number): Promise<void> {
		try {
			await this._extensionService.activateByEvent(`onLinkPresentation:${provider.id}`);
			const registration = this._registeredExtensionProviders.get(provider.id);
			if (!registration || !provider.extensionId || !ExtensionIdentifier.equals(registration.extensionId, provider.extensionId)) {
				throw new Error(`Extension '${provider.extensionId}' did not register link presentation provider '${provider.id}'.`);
			}
			this._attachProviderWatcher(entry, provider, registration.provider.createLinkPresentationWatcher(entry.resource), generation);
		} catch (error) {
			this._handleProviderError(entry, generation, provider.kind, error);
		}
	}

	private _attachProviderWatcher(entry: SharedLinkPresentationEntry, provider: ISelectedLinkPresentationProvider, watcher: ILinkPresentationWatcher, generation: number): void {
		if (!entry.isCurrent(generation)) {
			watcher.dispose();
			return;
		}
		const store = new DisposableStore();
		store.add(watcher);
		store.add(autorun(reader => {
			const presentation = watcher.presentation.read(reader);
			if (presentation && entry.isCurrent(generation) && entry.providerId) {
				if (presentation.kind !== provider.kind) {
					entry.setPresentation(undefined);
					if (this._cache.delete(entry.key)) {
						this._persistCache();
					}
					this._handleProviderError(
						entry,
						generation,
						provider.kind,
						new Error(`Link presentation provider '${provider.id}' produced kind '${presentation.kind}', but registered kind '${provider.kind}'.`),
					);
					return;
				}
				entry.setPresentation(presentation);
				this._cachePresentation(entry.key, entry.providerId, presentation);
			}
		}));
		entry.attach(store, generation);
	}

	private _handleProviderError(entry: SharedLinkPresentationEntry, generation: number, kind: LinkPresentationKind, error: unknown): void {
		if (!entry.isCurrent(generation)) {
			return;
		}
		this._logService.error(`Failed to create a link presentation watcher for '${entry.resource.toString(true)}'.`, error);
		if (!entry.presentation.get()) {
			entry.setPresentation({
				kind,
				status: { kind: 'error', label: localize('linkPresentation.unavailable', "Not available") },
				tooltip: localize('linkPresentation.unavailableTooltip', "The link presentation provider failed to load."),
				ariaLabel: localize('linkPresentation.unavailableAriaLabel', "Link presentation is not available"),
			});
		}
	}

	private _selectProvider(resource: URI, providerId?: string): ISelectedLinkPresentationProvider | undefined {
		const value = resource.toString(true);
		for (const candidate of this._coreProviders.values()) {
			if (providerId !== undefined && candidate.registration.id !== providerId) {
				continue;
			}
			if (this._isProviderEnabled(candidate.registration.kind, candidate.registration.enablement) && matchesUriPattern(candidate.regexp, value)) {
				return {
					id: candidate.registration.id,
					regexp: candidate.regexp,
					kind: candidate.registration.kind,
					enablement: candidate.registration.enablement,
					coreProvider: candidate.provider,
				};
			}
		}
		for (const candidate of this._declaredExtensionProviders.values()) {
			if (providerId !== undefined && candidate.id !== providerId) {
				continue;
			}
			if (this._isProviderEnabled(candidate.kind, candidate.enablement) && matchesUriPattern(candidate.regexp, value)) {
				return {
					id: candidate.id,
					regexp: candidate.regexp,
					kind: candidate.kind,
					enablement: candidate.enablement,
					extensionId: candidate.extensionId,
				};
			}
		}
		return undefined;
	}

	private _isEnabled(enablement: string | undefined): boolean {
		return !enablement || this._configurationService.getValue<boolean>(enablement) === true;
	}

	private _isProviderEnabled(kind: LinkPresentationKind, enablement: string | undefined): boolean {
		// File presentations are temporarily disabled until they have a dedicated setting.
		return kind !== 'file' && this._isEnabled(enablement);
	}

	private _getCachedPresentation(key: string, providerId: string, kind: LinkPresentationKind): ILinkPresentation | undefined {
		const cached = this._cache.get(key);
		if (!cached || cached.providerId !== providerId) {
			return undefined;
		}
		if (cached.presentation.kind !== kind) {
			this._cache.delete(key);
			this._persistCache();
			return undefined;
		}
		this._cache.delete(key);
		this._cache.set(key, cached);
		return cached.presentation;
	}

	private _cachePresentation(key: string, providerId: string, presentation: ILinkPresentation): void {
		this._cache.delete(key);
		this._cache.set(key, { providerId, presentation: { ...presentation, isLoading: undefined } });
		while (this._cache.size > cachedPresentationLimit) {
			const oldest = this._cache.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			this._cache.delete(oldest);
		}
		this._persistCache();
	}

	private _restoreCache(): void {
		const stored = this._storageService.get(cachedPresentationStorageKey, StorageScope.PROFILE);
		if (!stored) {
			return;
		}
		try {
			const value: unknown = JSON.parse(stored);
			if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.entries)) {
				throw new Error('Invalid persisted link presentation cache.');
			}
			for (const entry of value.entries.slice(-cachedPresentationLimit)) {
				if (!isRecord(entry) || typeof entry.key !== 'string' || typeof entry.providerId !== 'string') {
					throw new Error('Invalid persisted link presentation cache entry.');
				}
				this._cache.set(entry.key, {
					providerId: entry.providerId,
					presentation: { ...parseLinkPresentation(entry.presentation), isLoading: undefined },
				});
			}
		} catch (error) {
			this._logService.error('Failed to restore the link presentation cache.', error);
			this._cache.clear();
		}
	}

	private _persistCache(): void {
		this._storageService.store(cachedPresentationStorageKey, JSON.stringify({
			version: 1,
			entries: Array.from(this._cache, ([key, entry]) => ({ key, ...entry })),
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

class SharedLinkPresentationEntry extends Disposable {
	readonly key: string;
	readonly presentation: ISettableObservable<ILinkPresentation | undefined>;
	readonly resource: URI;
	readonly ruleId: string;
	providerId: string | undefined;

	private readonly _source = this._register(new MutableDisposable<DisposableStore>());
	private readonly _releaseTimer = this._register(new MutableDisposable<IDisposable>());
	private readonly _onDidBecomeUnused: () => void;
	private _generation = 0;
	private _references = 0;

	constructor(ruleId: string, resource: URI, onDidBecomeUnused: () => void) {
		super();
		this.ruleId = ruleId;
		this.resource = resource;
		this.key = canonicalizeResource(ruleId, resource);
		this._onDidBecomeUnused = onDidBecomeUnused;
		this.presentation = observableValue(`linkPresentation:${this.key}`, undefined);
	}

	acquire(): ILinkPresentationWatcher {
		this._releaseTimer.clear();
		this._references++;
		let disposed = false;
		return {
			presentation: this.presentation,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				this._references--;
				if (this._references === 0 && !this._store.isDisposed) {
					this._releaseTimer.value = disposableTimeout(this._onDidBecomeUnused, watcherReleaseDelay);
				}
			},
		};
	}

	reset(): number {
		this._source.clear();
		return ++this._generation;
	}

	isCurrent(generation: number): boolean {
		return !this._store.isDisposed && generation === this._generation;
	}

	attach(source: DisposableStore, generation: number): void {
		if (!this.isCurrent(generation)) {
			source.dispose();
			return;
		}
		this._source.value = source;
	}

	setPresentation(presentation: ILinkPresentation | undefined): void {
		this.presentation.set(presentation, undefined);
	}
}

function canonicalizeResource(providerId: string, resource: URI): string {
	return `${providerId}\0${resource.toString(true)}`;
}

function readUriPattern(source: string): RegExp | undefined {
	if (source.length > uriPatternLengthLimit || !source.startsWith('^') || !source.endsWith('$')) {
		return undefined;
	}
	try {
		return new RegExp(source, 'i');
	} catch {
		return undefined;
	}
}

function normalizeUriPattern(pattern: RegExp): RegExp {
	const flags = pattern.flags.replace(/[gy]/g, '');
	return new RegExp(pattern.source, flags);
}

function matchesUriPattern(pattern: RegExp, value: string): boolean {
	pattern.lastIndex = 0;
	return pattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

registerSingleton(IDataChannelService, DataChannelService, InstantiationType.Delayed);
registerSingleton(ILinkPresentationService, LinkPresentationService, InstantiationType.Delayed);
