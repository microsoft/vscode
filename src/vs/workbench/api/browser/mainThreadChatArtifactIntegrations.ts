/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CancellationTokenSource } from '../../../base/common/cancellation.js';
import { structuralEquals } from '../../../base/common/equals.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, observableValue } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { ArtifactAction, ArtifactAuthenticationRequiredError, ArtifactAutomationOption, ArtifactDetails, ArtifactRun, getArtifactRunInitiator, IArtifactAutomationContext, IArtifactBindingContext, IArtifactDetailsModel, IArtifactIntegrationBinding } from '../../../platform/artifactIntegrations/common/artifactIntegration.js';
import { IArtifactIntegrationRegistry } from '../../../platform/artifactIntegrations/common/artifactIntegrationRegistry.js';
import { isArtifactIntegrationDescription, isArtifactIntegrationLabel, parseArtifactJsonValue } from '../../../platform/artifactIntegrations/common/artifactIntegrationValidation.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { ChatArtifactActionContextDto, ChatArtifactActionDto, ChatArtifactAutomationRequestDto, ChatArtifactAutomationSnapshotDto, ChatArtifactIntegrationStateDto, ChatArtifactRunDto, ExtHostChatArtifactIntegrationsShape, ExtHostContext, MainContext, MainThreadChatArtifactIntegrationsShape } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

@extHostNamedCustomer(MainContext.MainThreadChatArtifactIntegrations)
export class MainThreadChatArtifactIntegrations extends Disposable implements MainThreadChatArtifactIntegrationsShape {
	private readonly proxy: ExtHostChatArtifactIntegrationsShape;
	private readonly providers = this._register(new DisposableMap<number>());
	private readonly providerChanges = new Map<number, Emitter<void>>();
	private readonly resources = this._register(new DisposableMap<number, ExtensionArtifactResource>());
	private readonly details = this._register(new DisposableMap<number, ExtensionArtifactDetails>());
	private readonly automations = this._register(new DisposableMap<number, ExtensionArtifactAutomation>());
	private nextResourceHandle = 0;
	private nextDetailsHandle = 0;
	private nextAutomationHandle = 0;

	constructor(
		context: IExtHostContext,
		@IArtifactIntegrationRegistry private readonly registry: IArtifactIntegrationRegistry,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.proxy = context.getProxy(ExtHostContext.ExtHostChatArtifactIntegrations);
	}

	$registerProvider(handle: number, id: string, label: string, options: readonly ArtifactAutomationOption[], canSignIn: boolean, description?: string): void {
		if (this.providers.has(handle)) {
			throw new Error('Duplicate artifact integration provider handle');
		}
		if (!isArtifactIntegrationLabel(label) || (description !== undefined && !isArtifactIntegrationDescription(description))) {
			throw new Error('Invalid artifact integration provider label or description');
		}
		const store = new DisposableStore();
		this.providers.set(handle, store);
		const changes = store.add(new Emitter<void>());
		this.providerChanges.set(handle, changes);
		store.add(toDisposable(() => this.providerChanges.delete(handle)));
		try {
			store.add(this.registry.register({
				id, label, ...(description ? { description } : {}), automationOptions: options, onDidChange: changes.event,
				match: async (resource, token) => {
					const result = await this.proxy.$match(handle, resource, token);
					if (result?.kind === 'authenticationRequired') {
						throw new ArtifactAuthenticationRequiredError(result.reason, result.main);
					}
					return result?.kind === 'matched' ? { resource: URI.revive(result.resource), key: result.key, credentialScope: result.credentialScope } : undefined;
				},
				...(canSignIn ? {
					// The extension signs in with its own account access; matching then runs again with the new session.
					signIn: async (resource: URI, token: CancellationToken) => {
						let reported = false;
						const listener = changes.event(() => reported = true);
						try {
							await this.proxy.$signIn(handle, resource, token);
						} finally {
							listener.dispose();
						}
						// Rematch once, unless the extension already reported the change.
						if (!reported) {
							changes.fire();
						}
					},
				} : {}),
				createResource: async (match, _context, token) => {
					const resourceHandle = this.nextResourceHandle++;
					const resource = new ExtensionArtifactResource(this.proxy, resourceHandle, (detailsId, canLoadMore, owner) => {
						const detailsHandle = this.nextDetailsHandle++;
						const details = new ExtensionArtifactDetails(this.proxy, resourceHandle, detailsHandle, detailsId, canLoadMore, () => {
							this.details.deleteAndLeak(detailsHandle);
							owner.deleteAndLeak(detailsHandle);
						});
						this.details.set(detailsHandle, details);
						owner.set(detailsHandle, details);
						return details;
					}, () => {
						for (const [handle, automation] of this.automations) {
							if (automation.resourceHandle === resourceHandle) {
								this.automations.deleteAndDispose(handle);
							}
						}
						this.resources.deleteAndLeak(resourceHandle);
						this.proxy.$disposeIntegration(resourceHandle);
					});
					this.resources.set(resourceHandle, resource);
					try {
						const result = await this.proxy.$createIntegration(handle, resourceHandle, match.resource, token);
						if (token.isCancellationRequested || store.isDisposed || resource.isDisposed) {
							throw new CancellationError();
						}
						resource.initialize(result.actions, result.state, result.initialDetails);
						return resource;
					} catch (error) {
						resource.dispose();
						throw error;
					}
				},
				createBinding: (resource, context) => resource.createBinding((automationContext, failed) => {
					const handle = this.nextAutomationHandle++;
					const automation = new ExtensionArtifactAutomation(this.proxy, resource.handle, handle, context, automationContext,
						() => this.automations.deleteAndLeak(handle));
					this.automations.set(handle, automation);
					automation.activate(error => {
						this.logService.error('[ArtifactIntegrations] Extension automation activation failed', error);
						failed(toErrorMessage(error));
					});
					return automation;
				}),
			}, id));
		} catch (error) {
			this.providers.deleteAndDispose(handle);
			throw error;
		}
	}

	$unregisterProvider(handle: number): void {
		this.providers.deleteAndDispose(handle);
	}

	$onDidChangeProvider(handle: number): void {
		this.providerChanges.get(handle)?.fire();
	}

	$onDidChangeIntegration(handle: number, state: ChatArtifactIntegrationStateDto): void {
		this.resources.get(handle)?.acceptState(state);
	}

	$onDidChangeDetails(handle: number, details: ArtifactDetails): void {
		this.details.get(handle)?.accept(details);
	}

	async $runAutomation(handle: number, request: ChatArtifactAutomationRequestDto): Promise<ChatArtifactRunDto> {
		return toRunDto(await this.requireAutomation(handle).context.runAutomation({
			...request, input: request.input === undefined ? undefined : parseArtifactJsonValue(request.input),
		}));
	}

	async $writeAutomationState(handle: number, expectedRevision: number, value: string): Promise<ChatArtifactAutomationSnapshotDto> {
		if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
			throw new Error('Invalid artifact automation checkpoint');
		}
		const automation = this.requireAutomation(handle);
		await automation.binding.state.write(expectedRevision, parseArtifactJsonValue(value));
		this.requireAutomation(handle);
		return automation.publish();
	}

	$reconcileAutomationRun(handle: number, runId: string): Promise<void> {
		return this.requireAutomation(handle).context.reconcileRun(runId);
	}

	$disableAutomation(handle: number, optionId: string, expectedRevision: number, reason: string): Promise<void> {
		return this.requireAutomation(handle).context.disableAutomation(optionId, expectedRevision, reason);
	}

	private requireAutomation(handle: number): ExtensionArtifactAutomation {
		const automation = this.automations.get(handle);
		if (!automation) {
			throw new CancellationError();
		}
		return automation;
	}
}

function toRunDto(run: ArtifactRun): ChatArtifactRunDto {
	const { id, actionId, source, state, reason, createdAt, updatedAt, optionId, generation, occurrenceKey, dispatched, indeterminate } = run;
	return { id, actionId, source, state, reason, createdAt, updatedAt, optionId, generation, occurrenceKey, dispatched, indeterminate };
}

function toActionContextDto(run: ArtifactRun): ChatArtifactActionContextDto {
	return {
		runId: run.id, source: run.source, optionId: run.optionId, input: JSON.stringify(run.input),
		initiator: getArtifactRunInitiator(run),
	};
}

class ExtensionArtifactAutomation extends Disposable {
	private readonly cancellation = this._register(new CancellationTokenSource());
	private revision = 0;
	private published: ChatArtifactAutomationSnapshotDto | undefined;

	constructor(
		private readonly proxy: ExtHostChatArtifactIntegrationsShape,
		readonly resourceHandle: number,
		private readonly handle: number,
		readonly binding: IArtifactBindingContext,
		readonly context: IArtifactAutomationContext,
		release: () => void,
	) {
		super();
		this._register(toDisposable(() => {
			release();
			this.proxy.$disposeAutomation(handle);
		}));
	}

	/** The current snapshot, revised only when its contents change, so idempotent requests do not notify the extension. */
	private snapshot(): ChatArtifactAutomationSnapshotDto {
		const { revision, values, generations, enabledAt, disablements } = this.binding.configuration.get();
		const state = this.binding.state.read();
		const contents = {
			configuration: { revision, values, generations, enabledAt: enabledAt ?? {}, disablements },
			state: { revision: state.revision, ...(state.value === undefined ? {} : { value: JSON.stringify(state.value) }) },
			runs: this.context.runs.get().map(toRunDto),
		};
		const previous = this.published;
		if (previous && structuralEquals(contents, { configuration: previous.configuration, state: previous.state, runs: previous.runs })) {
			return previous;
		}
		return this.published = { revision: ++this.revision, ...contents };
	}

	activate(failed: (error: Error) => void): void {
		void this.proxy.$activateAutomation(this.resourceHandle, this.handle, this.snapshot(), this.cancellation.token).catch(error => {
			if (!this._store.isDisposed) {
				failed(error);
			}
		});
		this._register(autorun(reader => {
			this.binding.configuration.read(reader);
			this.context.runs.read(reader);
			this.publish();
		}));
	}

	publish(): ChatArtifactAutomationSnapshotDto {
		const previous = this.published;
		const snapshot = this.snapshot();
		if (snapshot !== previous) {
			this.proxy.$onDidChangeAutomation(this.handle, snapshot);
		}
		return snapshot;
	}

	override dispose(): void {
		this.cancellation.cancel();
		super.dispose();
	}
}

class ExtensionArtifactResource extends Disposable {
	private readonly state = observableValue<ChatArtifactIntegrationStateDto>(this, {
		revision: -1,
		view: { availability: { kind: 'loading' }, sections: [], stateActions: [], generalActions: [], automationAvailability: [] },
	});
	private readonly details = this._register(new DisposableMap<number, ExtensionArtifactDetails>());
	private initialDetails: Readonly<Record<string, { readonly details: ArtifactDetails; readonly canLoadMore: boolean }>> = {};
	private actions: readonly ChatArtifactActionDto[] = [];

	constructor(
		private readonly proxy: ExtHostChatArtifactIntegrationsShape,
		readonly handle: number,
		private readonly createDetails: (detailsId: string, canLoadMore: boolean, owner: DisposableMap<number, ExtensionArtifactDetails>) => ExtensionArtifactDetails,
		release: () => void,
	) {
		super();
		this._register(toDisposable(release));
	}

	get isDisposed(): boolean {
		return this._store.isDisposed;
	}

	initialize(actions: readonly ChatArtifactActionDto[], state: ChatArtifactIntegrationStateDto, initialDetails: Readonly<Record<string, { readonly details: ArtifactDetails; readonly canLoadMore: boolean }>>): void {
		this.actions = actions;
		this.initialDetails = initialDetails;
		this.acceptState(state);
	}

	acceptState(state: ChatArtifactIntegrationStateDto): void {
		if (!this.isDisposed && state.revision > this.state.get().revision) {
			this.state.set(state, undefined);
		}
	}

	createBinding(activate: (context: IArtifactAutomationContext, failed: (reason: string) => void) => ExtensionArtifactAutomation): IArtifactIntegrationBinding {
		const error = observableValue<string | undefined>(this, undefined);
		return {
			view: derived(reader => {
				const view = this.state.read(reader).view;
				const reason = error.read(reader);
				return reason ? { ...view, availability: { kind: 'error', reason } as const } : view;
			}),
			actions: this.actions.map((action): ArtifactAction => action.kind === 'prompt' ? {
				...action, kind: 'prompt',
				prepare: (context, token) => this.proxy.$providePrompt(this.handle, action.id, toActionContextDto(context.run), token),
			} : {
				...action, kind: 'code', executionScope: action.executionScope!,
				...action.canReconcile ? {
					reconcile: (context, token) => this.proxy.$reconcileAction(this.handle, action.id, context.run.id, token),
				} : {},
				prepare: async (context, token) => {
					const invocation = toActionContextDto(context.run);
					const prepared = await this.proxy.$prepareAction(this.handle, action.id, invocation, token);
					return prepared.kind === 'skip' ? prepared : {
						kind: 'ready',
						value: {
							run: async ({ token, runId }) => {
								if (this.isDisposed || token.isCancellationRequested) {
									throw new CancellationError();
								}
								const result = await this.proxy.$runAction(this.handle, action.id, { ...invocation, runId }, token);
								return result ?? { kind: 'completed', summary: localize('extensionArtifactActionCompleted', "{0} completed.", action.label) };
							},
						},
					};
				},
			}),
			acquireDetails: detailsId => {
				const view = this.state.get().view;
				if (view.main?.detailsId !== detailsId && !view.sections.some(section => section.detailsId === detailsId)
					&& !view.lists?.some(list => list.detailsId === detailsId)) {
					throw new Error(localize('extensionArtifactDetailsUnavailable', "The artifact details are no longer available."));
				}
				const initial = this.initialDetails[detailsId];
				const details = this.createDetails(detailsId, initial?.canLoadMore ?? false, this.details);
				details.accept(initial?.details);
				return details;
			},
			activateAutomation: context => activate(context, reason => error.set(reason, undefined)),
			dispose: () => { },
		};
	}
}

class ExtensionArtifactDetails extends Disposable implements IArtifactDetailsModel {
	private readonly value = observableValue<ArtifactDetails>(this, {
		availability: { kind: 'loading' },
		title: '',
		links: [],
		items: [],
		completeness: 'partial',
	});
	readonly details = this.value;
	private initialized = false;
	private canLoadMore = false;

	constructor(
		private readonly proxy: ExtHostChatArtifactIntegrationsShape,
		resourceHandle: number,
		private readonly handle: number,
		detailsId: string,
		canLoadMore: boolean,
		release: () => void,
	) {
		super();
		this.canLoadMore = canLoadMore;
		this._register(toDisposable(release));
		void this.proxy.$acquireDetails(resourceHandle, handle, detailsId).then(result => {
			if (!this._store.isDisposed) {
				this.initialized = true;
				this.canLoadMore = result.canLoadMore;
				this.value.set(result.details, undefined);
			}
		}, error => {
			if (!this._store.isDisposed) {
				this.value.set({
					availability: { kind: 'error', reason: toErrorMessage(error) },
					title: '',
					links: [],
					items: [],
					completeness: 'complete',
				}, undefined);
			}
		});
	}

	accept(details: ArtifactDetails | undefined): void {
		if (!this._store.isDisposed && details) {
			this.value.set(details, undefined);
		}
	}

	get loadMore(): ((token: CancellationToken) => Promise<void>) | undefined {
		if (!this.canLoadMore) {
			return undefined;
		}
		return async token => {
			if (!this.initialized) {
				throw new Error(localize('extensionArtifactDetailsLoading', "Artifact details are still loading."));
			}
			await this.proxy.$loadMoreDetails(this.handle, token);
		};
	}

	override dispose(): void {
		this.proxy.$disposeDetails(this.handle);
		super.dispose();
	}
}
