/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { CancellationError } from '../../../base/common/errors.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { deepClone } from '../../../base/common/objects.js';
import { hasKey } from '../../../base/common/types.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ArtifactAutomationOption, ArtifactDetails, ArtifactIcon, ArtifactPreparation, ArtifactPrompt, ArtifactReconciliation } from '../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { isArtifactIntegrationDescription, isArtifactIntegrationLabel, isArtifactJsonValue, parseArtifactJsonValue, validateArtifactOptions } from '../../../platform/artifactIntegrations/common/artifactIntegrationValidation.js';
import { hasValidArtifactPresentationReferences, isArtifactContributionView, isArtifactDetails, isArtifactIcon } from '../../../platform/artifactIntegrations/common/artifactPresentationValidation.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ChatArtifactActionContextDto, ChatArtifactActionDto, ChatArtifactActionResultDto, ChatArtifactAutomationSnapshotDto, ChatArtifactIntegrationStateDto, ChatArtifactResourceMatchDto, ExtHostChatArtifactIntegrationsShape, IMainContext, MainContext, MainThreadChatArtifactIntegrationsShape } from './extHost.protocol.js';

interface IntegrationEntry {
	readonly providerHandle: number;
	readonly integration: vscode.ChatArtifactIntegration;
	readonly actions: ReadonlyMap<string, vscode.ChatArtifactAction>;
	readonly options: readonly ArtifactAutomationOption[];
	readonly store: DisposableStore;
	revision: number;
}

export class ExtHostChatArtifactIntegrations extends Disposable implements ExtHostChatArtifactIntegrationsShape {
	private readonly proxy: MainThreadChatArtifactIntegrationsShape;
	private readonly providers = new Map<number, vscode.ChatArtifactIntegrationProvider>();
	private readonly providerIds = new Set<string>();
	private readonly providerOptions = new Map<number, readonly ArtifactAutomationOption[]>();
	private readonly registrations = this._register(new DisposableMap<number>());
	private readonly integrations = new Map<number, IntegrationEntry>();
	private readonly details = this._register(new DisposableMap<number, vscode.ChatArtifactDetailsModel>());
	private readonly detailsListeners = this._register(new DisposableMap<number>());
	private readonly detailsOwners = new Map<number, number>();
	private readonly automations = this._register(new DisposableMap<number, ExtHostArtifactAutomation>());
	private nextHandle = 0;

	constructor(mainContext: IMainContext, private readonly logService: ILogService) {
		super();
		this.proxy = mainContext.getProxy(MainContext.MainThreadChatArtifactIntegrations);
	}

	registerProvider(extension: IExtensionDescription, id: string, provider: vscode.ChatArtifactIntegrationProvider): vscode.Disposable {
		const key = `extension.${ExtensionIdentifier.toKey(extension.identifier)}.${id}`;
		if (typeof id !== 'string' || !id.trim() || this.providerIds.has(key) || !isArtifactIntegrationLabel(provider.label)
			|| (provider.description !== undefined && !isArtifactIntegrationDescription(provider.description))
			|| (provider.groupLabel !== undefined && !isArtifactIntegrationLabel(provider.groupLabel))
			|| typeof provider.match !== 'function' || typeof provider.createArtifactIntegration !== 'function') {
			throw new Error(`Invalid or duplicate artifact integration provider: ${id}`);
		}
		const options = deepClone(provider.automationOptions ?? []);
		validateArtifactOptions(options);
		const handle = this.nextHandle++;
		const store = new DisposableStore();
		this.registrations.set(handle, store);
		this.providers.set(handle, provider);
		this.providerOptions.set(handle, options);
		this.providerIds.add(key);
		store.add(toDisposable(() => {
			this.providers.delete(handle);
			this.providerOptions.delete(handle);
			this.providerIds.delete(key);
			for (const [id, entry] of this.integrations) {
				if (entry.providerHandle === handle) {
					this.$disposeIntegration(id);
				}
			}
			this.proxy.$unregisterProvider(handle);
		}));
		this.proxy.$registerProvider(handle, key, {
			label: provider.label,
			...(provider.description !== undefined ? { description: provider.description } : {}),
			...(provider.groupLabel !== undefined ? { groupLabel: provider.groupLabel } : {}),
			automationOptions: options,
			canSignIn: typeof provider.signIn === 'function',
		});
		if (provider.onDidChange) {
			store.add(provider.onDidChange(() => this.proxy.$onDidChangeProvider(handle)));
		}
		return toDisposable(() => this.registrations.deleteAndDispose(handle));
	}

	async $match(handle: number, resource: UriComponents, token: CancellationToken): Promise<ChatArtifactResourceMatchDto | undefined> {
		const provider = this.requireProvider(handle);
		const result = await provider.match(URI.revive(resource), token);
		if (token.isCancellationRequested || this.providers.get(handle) !== provider) {
			throw new CancellationError();
		}
		if (result === undefined || result === null) {
			return undefined;
		}
		if (result.kind === 'authenticationRequired') {
			if (typeof result.reason !== 'string' || !result.reason.trim()) {
				throw new Error('Artifact authentication requirement must include a reason');
			}
			return { kind: 'authenticationRequired', reason: result.reason, main: convertPresentation(result.main) };
		}
		if (result.kind !== 'matched' || !(result.resource instanceof URI) || typeof result.key !== 'string' || !result.key.trim()
			|| typeof result.credentialScope !== 'string' || !result.credentialScope.trim()) {
			throw new Error('Artifact integration match must include a resource, key, and credential scope');
		}
		return { kind: 'matched', resource: result.resource, key: result.key, credentialScope: result.credentialScope };
	}

	async $signIn(handle: number, resource: UriComponents, token: CancellationToken): Promise<void> {
		const provider = this.requireProvider(handle);
		if (typeof provider.signIn !== 'function') {
			throw new Error('Artifact integration provider does not support signing in');
		}
		await provider.signIn(URI.revive(resource), token);
		if (token.isCancellationRequested || this.providers.get(handle) !== provider) {
			throw new CancellationError();
		}
	}

	async $createIntegration(providerHandle: number, handle: number, resource: UriComponents, token: CancellationToken) {
		const provider = this.requireProvider(providerHandle);
		const integration = await provider.createArtifactIntegration(URI.revive(resource), token);
		if (!integration) {
			throw new Error('Artifact integration provider did not create a matched resource observation');
		}
		const store = new DisposableStore();
		store.add(integration);
		try {
			if (token.isCancellationRequested || this.providers.get(providerHandle) !== provider || this.integrations.has(handle)) {
				throw new CancellationError();
			}
			const actions = new Map<string, vscode.ChatArtifactAction>();
			const descriptors: ChatArtifactActionDto[] = integration.actions.map(action => {
				if (!action.id?.trim() || !action.label?.trim() || actions.has(action.id)
					|| (action.consentVersion !== undefined && typeof action.consentVersion !== 'string')
					|| (action.kind === 'prompt' ? typeof action.providePrompt !== 'function'
						: (action.kind !== undefined && action.kind !== 'code') || typeof action.prepare !== 'function' || typeof action.run !== 'function'
						|| (action.executionScope !== 'resource' && action.executionScope !== 'resourceAndWorkspace')
						|| (action.reconcile !== undefined && typeof action.reconcile !== 'function'))) {
					throw new Error('Invalid or duplicate artifact action');
				}
				const icon = convertIcon(action.icon);
				actions.set(action.id, action);
				return {
					id: action.id, label: action.label, iconId: icon.id, kind: action.kind ?? 'code', consentVersion: action.consentVersion,
					canReconcile: action.kind !== 'prompt' && !!action.reconcile,
					executionScope: action.kind === 'prompt' ? undefined : action.executionScope,
				};
			});
			const options = this.providerOptions.get(providerHandle)!;
			if (options.length && (typeof integration.activateAutomation !== 'function' || options.some(option => option.actionIds.some(id => !actions.has(id))))) {
				throw new Error('Artifact automation requires an activation callback and registered actions');
			}
			const entry: IntegrationEntry = { providerHandle, integration, actions, options, store, revision: 0 };
			this.integrations.set(handle, entry);
			store.add(toDisposable(() => {
				this.integrations.delete(handle);
				for (const [detailsHandle, owner] of this.detailsOwners) {
					if (owner === handle) {
						this.$disposeDetails(detailsHandle);
					}
				}
				for (const [id, automation] of this.automations) {
					if (automation.resourceHandle === handle) {
						this.automations.deleteAndDispose(id);
					}
				}
			}));
			store.add(integration.onDidChange(() => this.publishState(handle, entry)));
			const state = convertState(integration.state, actions, options, entry.revision);
			const initialDetails: Record<string, { readonly details: ArtifactDetails; readonly canLoadMore: boolean }> = {};
			for (const detailsId of new Set([
				...state.view.main ? [state.view.main.detailsId] : [],
				...state.view.sections.map(section => section.detailsId),
				...state.view.lists?.map(list => list.detailsId) ?? [],
			])) {
				const model = integration.acquireDetails(detailsId);
				try {
					initialDetails[detailsId] = {
						details: convertDetails(model.details, actions, options, integration.state.availability),
						canLoadMore: !!model.loadMore,
					};
				} finally {
					model.dispose();
				}
			}
			return { actions: descriptors, state, initialDetails };
		} catch (error) {
			store.dispose();
			throw error;
		}
	}

	$disposeIntegration(handle: number): void {
		this.integrations.get(handle)?.store.dispose();
	}

	async $acquireDetails(resourceHandle: number, detailsHandle: number, detailsId: string): Promise<{ readonly details: ArtifactDetails; readonly canLoadMore: boolean }> {
		const entry = this.integrations.get(resourceHandle);
		if (!entry || this.details.has(detailsHandle) || !detailsId.trim()) {
			throw new CancellationError();
		}
		const model = entry.integration.acquireDetails(detailsId);
		this.details.set(detailsHandle, model);
		this.detailsOwners.set(detailsHandle, resourceHandle);
		try {
			const convert = () => convertDetails(model.details, entry.actions, entry.options, entry.integration.state.availability);
			this.detailsListeners.set(detailsHandle, model.onDidChange(() => {
				try {
					this.proxy.$onDidChangeDetails(detailsHandle, convert());
				} catch (error) {
					this.logService.error('[ArtifactIntegrations] Invalid extension details', error);
				}
			}));
			return { details: convert(), canLoadMore: !!model.loadMore };
		} catch (error) {
			this.details.deleteAndDispose(detailsHandle);
			this.detailsListeners.deleteAndDispose(detailsHandle);
			this.detailsOwners.delete(detailsHandle);
			throw error;
		}
	}

	async $loadMoreDetails(detailsHandle: number, token: CancellationToken): Promise<void> {
		const model = this.details.get(detailsHandle);
		if (!model?.loadMore) {
			throw new Error('Artifact details cannot load another page');
		}
		await model.loadMore(token);
	}

	$disposeDetails(detailsHandle: number): void {
		this.detailsOwners.delete(detailsHandle);
		this.detailsListeners.deleteAndDispose(detailsHandle);
		this.details.deleteAndDispose(detailsHandle);
	}

	private requireAction(handle: number, actionId: string, context: ChatArtifactActionContextDto, token: CancellationToken) {
		const entry = this.integrations.get(handle);
		if (!entry || token.isCancellationRequested) {
			throw new CancellationError();
		}

		if (!context.runId?.trim() || (context.source !== 'manual' && context.source !== 'automation')
			|| !['user', 'agent', 'automation'].includes(context.initiator) || (context.initiator === 'automation') !== (context.source === 'automation')) {
			throw new Error('Invalid artifact action context');
		}
		const state = convertState(entry.integration.state, entry.actions, entry.options, entry.revision);
		const availability = [...state.view.stateActions, ...state.view.generalActions].find(action => action.id === actionId);
		const action = entry.actions.get(actionId);
		const automatic = context.source === 'automation'
			&& entry.options.some(option => option.id === context.optionId && option.actionIds.includes(actionId))
			&& state.view.automationAvailability.some(option => option.id === context.optionId && option.available);
		if (state.view.availability.kind !== 'available' || !action || !(context.source === 'manual' ? availability?.enabled : automatic)) {
			throw new Error(availability?.disabledReason ?? 'Artifact action is no longer available');
		}
		return { entry, action, invocation: { ...context, input: context.input === undefined ? undefined : parseArtifactJsonValue(context.input) } };
	}

	async $prepareAction(handle: number, actionId: string, context: ChatArtifactActionContextDto, token: CancellationToken): Promise<{ readonly kind: 'ready' } | { readonly kind: 'skip'; readonly reason: string }> {
		const { entry, action, invocation } = this.requireAction(handle, actionId, context, token);
		if (action.kind === 'prompt') {
			throw new Error('A prompt action cannot prepare a code execution');
		}
		const result = await action.prepare(invocation, token);
		if (token.isCancellationRequested || this.integrations.get(handle) !== entry) {
			throw new CancellationError();
		}
		this.requireAction(handle, actionId, context, token);
		if (result?.kind === 'ready') {
			return { kind: 'ready' };
		}
		if (result?.kind === 'skipped' && typeof result.reason === 'string' && result.reason.trim()) {
			return { kind: 'skip', reason: result.reason };
		}
		throw new Error('Artifact action preparation must return ready or an explicit skipped reason');
	}

	async $runAction(handle: number, actionId: string, context: ChatArtifactActionContextDto, token: CancellationToken): Promise<ChatArtifactActionResultDto | undefined> {
		const { entry, action, invocation } = this.requireAction(handle, actionId, context, token);
		if (action.kind === 'prompt') {
			throw new Error('A prompt action must be prepared, not executed in the extension host');
		}
		try {
			const result = await action.run(invocation, token);
			if (result === undefined || result === null) {
				return undefined;
			}
			if (result.kind === 'completed' && typeof result.summary === 'string' && result.summary.trim()) {
				return { kind: 'completed', summary: result.summary };
			}
			if (result.kind === 'skipped' && typeof result.reason === 'string' && result.reason.trim()) {
				return { kind: 'skipped', reason: result.reason };
			}
			throw new Error('Invalid artifact action result');
		} finally {
			if (this.integrations.get(handle) === entry) {
				this.publishState(handle, entry);
			}
		}

	}

	async $providePrompt(handle: number, actionId: string, context: ChatArtifactActionContextDto, token: CancellationToken): Promise<ArtifactPreparation<ArtifactPrompt>> {
		const { entry, action, invocation } = this.requireAction(handle, actionId, context, token);
		if (action.kind !== 'prompt') {
			throw new Error('A resource action cannot prepare a chat prompt');
		}
		const result = await action.providePrompt(invocation, token);
		if (token.isCancellationRequested || this.integrations.get(handle) !== entry) {
			throw new CancellationError();
		}
		this.requireAction(handle, actionId, context, token);
		if (result && hasKey(result, { text: true }) && typeof result.text === 'string' && result.text.trim()) {
			return { kind: 'ready', value: { text: result.text } };
		}
		if (result && hasKey(result, { kind: true }) && result.kind === 'skipped' && typeof result.reason === 'string' && result.reason.trim()) {
			return { kind: 'skip', reason: result.reason };
		}
		throw new Error('An artifact prompt action must provide nonempty text or an explicit skipped reason');
	}

	async $reconcileAction(handle: number, actionId: string, runId: string, token: CancellationToken): Promise<ArtifactReconciliation> {
		const entry = this.integrations.get(handle);
		if (!entry || token.isCancellationRequested) {
			throw new CancellationError();
		}
		const action = entry.actions.get(actionId);
		const result = action?.kind !== 'prompt' ? await action?.reconcile?.(runId, token) : undefined;
		if (result?.kind === 'notExecuted') {
			return { kind: 'notExecuted' };
		}
		if (result?.kind === 'completed' && typeof result.summary === 'string' && result.summary.trim()) {
			return { kind: 'completed', summary: result.summary };
		}
		if (result?.kind === 'indeterminate' && typeof result.reason === 'string' && result.reason.trim()) {
			return { kind: 'indeterminate', reason: result.reason };
		}
		throw new Error('Invalid artifact action reconciliation');
	}

	async $activateAutomation(resourceHandle: number, handle: number, snapshot: ChatArtifactAutomationSnapshotDto, token: CancellationToken): Promise<void> {
		const entry = this.integrations.get(resourceHandle);
		if (!entry || token.isCancellationRequested) {
			throw new CancellationError();
		}
		if (this.automations.has(handle) || !entry.integration.activateAutomation) {
			throw new Error('Invalid artifact automation activation');
		}
		const automation = new ExtHostArtifactAutomation(this.proxy, resourceHandle, handle, snapshot, token);
		this.automations.set(handle, automation);
		try {
			const lifetime = await entry.integration.activateAutomation(automation, automation.token);
			if (!lifetime || typeof lifetime.dispose !== 'function') {
				throw new Error('Artifact automation activation must return a disposable');
			}
			automation.attach(lifetime);
			if (automation.isDisposed || this.integrations.get(resourceHandle) !== entry) {
				throw new CancellationError();
			}
		} catch (error) {
			this.automations.deleteAndDispose(handle);
			throw error;
		}
	}

	$onDidChangeAutomation(handle: number, snapshot: ChatArtifactAutomationSnapshotDto): void {
		this.automations.get(handle)?.accept(snapshot);
	}

	$disposeAutomation(handle: number): void {
		this.automations.deleteAndDispose(handle);
	}

	private publishState(handle: number, entry: IntegrationEntry): void {
		if (entry.store.isDisposed) {
			return;
		}
		entry.revision++;
		let state: ChatArtifactIntegrationStateDto;
		try {
			state = convertState(entry.integration.state, entry.actions, entry.options, entry.revision);
		} catch (error) {
			this.logService.error('[ArtifactIntegrations] Invalid extension state', error);
			state = {
				revision: entry.revision,
				view: { availability: { kind: 'error', reason: toErrorMessage(error) }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
			};
		}
		this.proxy.$onDidChangeIntegration(handle, state);
	}

	private requireProvider(handle: number): vscode.ChatArtifactIntegrationProvider {
		const provider = this.providers.get(handle);
		if (!provider) {
			throw new CancellationError();
		}
		return provider;
	}
}

class ExtHostArtifactAutomation extends Disposable implements vscode.ChatArtifactAutomationContext {
	private readonly changed = this._register(new Emitter<void>());
	readonly onDidChange = this.changed.event;
	private readonly cancellation: CancellationTokenSource;
	private snapshot: ChatArtifactAutomationSnapshotDto;

	constructor(
		private readonly proxy: MainThreadChatArtifactIntegrationsShape,
		readonly resourceHandle: number,
		private readonly handle: number,
		snapshot: ChatArtifactAutomationSnapshotDto,
		token: CancellationToken,
	) {
		super();
		this.snapshot = deepClone(snapshot);
		this.cancellation = this._register(new CancellationTokenSource(token));
	}

	get token(): CancellationToken { return this.cancellation.token; }
	get isDisposed(): boolean { return this._store.isDisposed || this.token.isCancellationRequested; }
	get configuration(): vscode.ChatArtifactAutomationConfiguration { return deepClone(this.snapshot.configuration); }
	get runs(): readonly vscode.ChatArtifactRun[] { return deepClone(this.snapshot.runs); }

	readonly state: vscode.ChatArtifactAutomationState = {
		read: () => ({
			revision: this.snapshot.state.revision,
			...(this.snapshot.state.value === undefined ? {} : { value: parseArtifactJsonValue(this.snapshot.state.value) }),
		}),
		write: async (expectedRevision, value) => {
			this.assertActive();
			if (!isArtifactJsonValue(value)) {
				throw new Error('Artifact automation state must contain JSON data');
			}
			this.accept(await this.proxy.$writeAutomationState(this.handle, expectedRevision, JSON.stringify(value)));
		},
	};

	attach(lifetime: vscode.Disposable): void {
		if (this.isDisposed) {
			lifetime.dispose();
		} else {
			this._register(lifetime);
		}
	}

	accept(snapshot: ChatArtifactAutomationSnapshotDto): void {
		if (!this.isDisposed && snapshot.revision > this.snapshot.revision) {
			this.snapshot = deepClone(snapshot);
			this.changed.fire();
		}
	}

	async runAutomation(request: vscode.ChatArtifactAutomationRequest): Promise<vscode.ChatArtifactRun> {
		this.assertActive();
		if (!request.optionId?.trim() || !request.actionId?.trim() || !request.occurrenceKey?.trim() || !request.reason?.trim()
			|| !Number.isSafeInteger(request.configurationRevision) || request.configurationRevision < 0
			|| (request.retryOf !== undefined && (typeof request.retryOf !== 'string' || !request.retryOf.trim()))
			|| (request.input !== undefined && !isArtifactJsonValue(request.input))) {
			throw new Error('Invalid artifact automation request');
		}
		return deepClone(await this.proxy.$runAutomation(this.handle, { ...request, input: JSON.stringify(request.input) }));
	}

	async reconcileRun(runId: string): Promise<void> {
		this.assertActive();
		await this.proxy.$reconcileAutomationRun(this.handle, runId);
	}

	async disableAutomation(optionId: string, expectedRevision: number, reason: string): Promise<void> {
		this.assertActive();
		await this.proxy.$disableAutomation(this.handle, optionId, expectedRevision, reason);
	}

	private assertActive(): void {
		if (this.isDisposed) {
			throw new CancellationError();
		}
	}

	override dispose(): void {
		this.cancellation.cancel();
		super.dispose();
	}
}

function convertIcon(icon: vscode.ThemeIcon): ArtifactIcon {
	const result = { id: icon?.id, colorId: icon?.color?.id };
	if (!isArtifactIcon(result)) {
		throw new Error('Invalid artifact theme icon');
	}
	return result;
}

function convertPresentation(value: vscode.ChatArtifactPresentation) {
	const result = { label: value?.label, description: value?.description, icon: convertIcon(value?.icon), detailsId: value?.detailsId };
	if (typeof result.label !== 'string' || !result.label.trim() || typeof result.detailsId !== 'string' || !result.detailsId.trim()) {
		throw new Error('Invalid artifact presentation');
	}
	return result;
}

function convertDetails(
	value: vscode.ChatArtifactDetails,
	actions: ReadonlyMap<string, vscode.ChatArtifactAction>,
	options: readonly ArtifactAutomationOption[],
	fallbackAvailability: vscode.ChatArtifactAvailability | undefined,
): ArtifactDetails {
	const result: ArtifactDetails = {
		title: value.title, description: value.description, descriptionFormat: value.descriptionFormat, availability: value.availability ?? fallbackAvailability ?? { kind: 'available' },
		facts: value.facts?.map(fact => ({ ...fact })),
		links: [
			...(value.actions ?? []).map(actionId => ({ kind: 'action' as const, actionId })),
			...(value.automations ?? []).map(optionId => ({ kind: 'automation' as const, optionId })),
		],
		items: (value.items ?? []).map(item => ({ id: item.id, icon: convertIcon(item.icon), label: item.label, description: item.description, resource: item.resource.toString() })),
		completeness: value.completeness ?? 'complete',
	};
	if (!isArtifactDetails(result) || value.actions?.some(id => !actions.has(id))
		|| value.automations?.some(id => !options.some(option => option.id === id))) {
		throw new Error('Invalid artifact integration details');
	}
	return result;
}

function convertState(state: vscode.ChatArtifactIntegrationState, actions: ReadonlyMap<string, vscode.ChatArtifactAction>, options: readonly ArtifactAutomationOption[], revision: number): ChatArtifactIntegrationStateDto {
	const part = (value: vscode.ChatArtifactPresentation) => convertPresentation(value);
	const view = {
		availability: state.availability ?? { kind: 'available' as const },
		main: state.main ? part(state.main) : undefined,
		...(state.group ? { group: { icon: convertIcon(state.group.icon), priority: state.group.priority } } : {}),
		sections: (state.sections ?? []).map(section => ({ ...part(section), id: section.id })),
		lists: state.lists?.map(list => ({
			id: list.id, label: list.label, detailsId: list.detailsId,
			...(list.icon === undefined ? {} : { icon: convertIcon(list.icon) }),
		})),
		stateActions: (state.stateActions ?? []).map(action => ({ ...action })),
		generalActions: (state.generalActions ?? []).map(action => ({ ...action })),
		automationAvailability: (state.automationAvailability ?? []).map(option => option.enablement ? { ...option, enablement: { ...option.enablement } } : { ...option }),
	};
	if (!isArtifactContributionView(view)) {
		throw new Error('Invalid artifact integration presentation');
	}
	if (!hasValidArtifactPresentationReferences(view, new Set(actions.keys()), new Set(options.map(option => option.id)))) {
		throw new Error('Artifact presentation references an unknown action or automation option');
	}
	return { revision, view };
}
