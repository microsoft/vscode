/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IReference, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { IObservable, ObservableMap } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatAgentLocation } from '../constants.js';
import { IChatEditingSession, ModifiedFileEntryState } from '../editing/chatEditingService.js';
import { ChatModel, ISerializableChatModelInputState, ISerializedChatDataReference } from './chatModel.js';

export interface IStartSessionProps {
	readonly initialData?: ISerializedChatDataReference;
	readonly location: ChatAgentLocation;
	readonly sessionResource: URI;
	readonly canUseTools: boolean;
	readonly transferEditingSession?: IChatEditingSession;
	readonly disableBackgroundKeepAlive?: boolean;
	readonly inputState?: ISerializableChatModelInputState;
	readonly isReadOnly?: IObservable<boolean>;
}

export interface ChatModelStoreDelegate {
	createModel: (props: IStartSessionProps) => ChatModel;
	willDisposeModel: (model: ChatModel) => Promise<void>;
}

export interface IChatModelReferenceDebugHolder {
	readonly holder: string;
	readonly count: number;
}

export interface IChatModelReferenceDebugInfo {
	readonly sessionResource: URI;
	readonly title: string;
	readonly createdBy: string;
	readonly initialLocation: ChatAgentLocation;
	readonly isImported: boolean;
	readonly willKeepAlive: boolean;
	readonly hasPendingEdits: boolean;
	readonly pendingDisposal: boolean;
	readonly referenceCount: number;
	readonly holders: readonly IChatModelReferenceDebugHolder[];
}

export interface IChatModelReferenceDebugSnapshot {
	readonly totalModels: number;
	readonly totalReferences: number;
	readonly models: readonly IChatModelReferenceDebugInfo[];
}

export class ChatModelStore extends Disposable {
	private readonly _refCollection: ReferenceCollection<ChatModel>;

	private readonly _models = new ObservableMap<string, ChatModel>();
	private readonly _modelsByGeneration = new Map<string, ChatModel>();
	private readonly _currentGenerationKeys = new Map<string, string>();
	private readonly _resourceKeysByGeneration = new Map<string, string>();
	private readonly _invalidatedGenerationKeys = new Set<string>();
	private readonly _modelsToDispose = new Set<string>();
	private readonly _pendingDisposals = new Set<Promise<void>>();
	private readonly _modelCreateOwners = new Map<string, string>();
	private readonly _referenceOwners = new Map<string, Map<number, string>>();
	private _referenceOwnerIds = 0;
	private _generation = 0;

	private readonly _onDidDisposeModel = this._register(new Emitter<ChatModel>());
	public readonly onDidDisposeModel = this._onDidDisposeModel.event;

	private readonly _onDidCreateModel = this._register(new Emitter<ChatModel>());
	public readonly onDidCreateModel = this._onDidCreateModel.event;

	constructor(
		private readonly delegate: ChatModelStoreDelegate,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		const self = this;
		this._refCollection = new class extends ReferenceCollection<ChatModel> {
			protected createReferencedObject(key: string, props?: IStartSessionProps, debugOwner?: string): ChatModel {
				return self.createReferencedObject(key, props, debugOwner);
			}
			protected destroyReferencedObject(key: string, object: ChatModel): void {
				return self.destroyReferencedObject(key, object);
			}
		}();
	}

	public get observable() {
		return this._models.observable;
	}

	public values(): Iterable<ChatModel> {
		return this._models.values();
	}

	/**
	 * Get a ChatModel directly without acquiring a reference.
	 */
	public get(uri: URI): ChatModel | undefined {
		return this._models.get(this.toKey(uri));
	}

	public has(uri: URI): boolean {
		return this._models.has(this.toKey(uri));
	}

	public acquireExisting(uri: URI, debugOwner?: string): IReference<ChatModel> | undefined {
		const resourceKey = this.toKey(uri);
		if (!this._models.has(resourceKey)) {
			return undefined;
		}

		const generationKey = this._currentGenerationKeys.get(resourceKey);
		if (!generationKey) {
			throw new Error(`No current generation for chat session ${resourceKey}`);
		}
		return this.wrapReference(generationKey, this._refCollection.acquire(generationKey, undefined, debugOwner), debugOwner);
	}

	public acquireOrCreate(props: IStartSessionProps, debugOwner?: string): IReference<ChatModel> {
		const resourceKey = this.toKey(props.sessionResource);
		const generationKey = this.getOrCreateGenerationKey(resourceKey);
		return this.wrapReference(generationKey, this._refCollection.acquire(generationKey, props, debugOwner), debugOwner);
	}

	/**
	 * Prevent future acquisitions from returning the current model while allowing
	 * existing references to release it through the normal reference lifecycle.
	 */
	public invalidate(uri: URI): boolean {
		const resourceKey = this.toKey(uri);
		const generationKey = this._currentGenerationKeys.get(resourceKey);
		if (!generationKey) {
			return false;
		}

		this._currentGenerationKeys.delete(resourceKey);
		this._invalidatedGenerationKeys.add(generationKey);
		this._models.delete(resourceKey);
		return true;
	}

	public getReferenceDebugSnapshot(): IChatModelReferenceDebugSnapshot {
		const models = Array.from(this._modelsByGeneration.entries())
			.map(([generationKey, model]) => {
				const owners = this._referenceOwners.get(generationKey) ?? new Map();
				const countsByOwner = new Map<string, number>();
				for (const owner of owners.values()) {
					countsByOwner.set(owner, (countsByOwner.get(owner) ?? 0) + 1);
				}

				const holders = Array.from(countsByOwner.entries())
					.map(([holder, count]) => ({ holder, count }))
					.sort((a, b) => b.count - a.count || a.holder.localeCompare(b.holder));

				return {
					sessionResource: model.sessionResource,
					title: model.title,
					createdBy: this._modelCreateOwners.get(generationKey) ?? 'unknown',
					initialLocation: model.initialLocation,
					isImported: !!model.isImported,
					willKeepAlive: model.willKeepAlive,
					hasPendingEdits: !!model.editingSession?.entries.get().some(entry => entry.state.get() === ModifiedFileEntryState.Modified),
					pendingDisposal: this._modelsToDispose.has(generationKey),
					referenceCount: owners.size,
					holders,
				} satisfies IChatModelReferenceDebugInfo;
			})
			.sort((a, b) => b.referenceCount - a.referenceCount || Number(b.hasPendingEdits) - Number(a.hasPendingEdits) || a.sessionResource.toString().localeCompare(b.sessionResource.toString()));

		return {
			totalModels: models.length,
			totalReferences: models.reduce((total, model) => total + model.referenceCount, 0),
			models,
		};
	}

	private createReferencedObject(generationKey: string, props?: IStartSessionProps, debugOwner?: string): ChatModel {
		this._modelsToDispose.delete(generationKey);
		const resourceKey = this.getResourceKey(generationKey);
		const existingModel = this._currentGenerationKeys.get(resourceKey) === generationKey
			? this._models.get(resourceKey)
			: undefined;
		if (existingModel) {
			return existingModel;
		}

		if (!props) {
			throw new Error(`No start session props provided for chat session ${resourceKey}`);
		}

		this.logService.trace(`Creating chat session ${resourceKey}`);
		const model = this.delegate.createModel(props);
		this._modelCreateOwners.set(generationKey, debugOwner ?? 'unspecified');
		if (model.sessionResource.toString() !== resourceKey) {
			throw new Error(`Chat session key mismatch for ${resourceKey}`);
		}
		this._modelsByGeneration.set(generationKey, model);
		this._models.set(resourceKey, model);
		this._onDidCreateModel.fire(model);
		return model;
	}

	private destroyReferencedObject(generationKey: string, object: ChatModel): void {
		this._modelsToDispose.add(generationKey);
		const promise = this.doDestroyReferencedObject(generationKey, object);
		this._pendingDisposals.add(promise);
		promise.finally(() => {
			this._pendingDisposals.delete(promise);
		});
	}

	private async doDestroyReferencedObject(generationKey: string, object: ChatModel): Promise<void> {
		try {
			if (!this._invalidatedGenerationKeys.has(generationKey)) {
				await this.delegate.willDisposeModel(object);
			}
		} catch (error) {
			this.logService.error(error);
		} finally {
			if (this._modelsToDispose.has(generationKey)) {
				const resourceKey = this.getResourceKey(generationKey);
				this.logService.trace(`Disposing chat session ${resourceKey}`);
				const isCurrentGeneration = this._currentGenerationKeys.get(resourceKey) === generationKey;
				if (isCurrentGeneration) {
					this._models.delete(resourceKey);
					this._currentGenerationKeys.delete(resourceKey);
				}
				if (isCurrentGeneration || !this._currentGenerationKeys.has(resourceKey)) {
					this._onDidDisposeModel.fire(object);
				}
				this._modelsByGeneration.delete(generationKey);
				this._modelCreateOwners.delete(generationKey);
				this._referenceOwners.delete(generationKey);
				this._resourceKeysByGeneration.delete(generationKey);
				this._invalidatedGenerationKeys.delete(generationKey);
				object.dispose();
			}
			this._modelsToDispose.delete(generationKey);
		}
	}

	private wrapReference(generationKey: string, reference: IReference<ChatModel>, debugOwner?: string): IReference<ChatModel> {
		const ownerId = ++this._referenceOwnerIds;
		let ownerEntries = this._referenceOwners.get(generationKey);
		if (!ownerEntries) {
			ownerEntries = new Map();
			this._referenceOwners.set(generationKey, ownerEntries);
		}
		ownerEntries.set(ownerId, debugOwner ?? 'unspecified');

		let isDisposed = false;
		const wrapped: IReference<ChatModel> = {
			object: reference.object,
			dispose: () => {
				if (isDisposed) {
					return;
				}

				isDisposed = true;
				const owners = this._referenceOwners.get(generationKey);
				owners?.delete(ownerId);
				if (owners?.size === 0) {
					this._referenceOwners.delete(generationKey);
				}
				reference.dispose();

				// Break the reference from this wrapper to the ChatModel so that
				// stale holders of this IChatModelReference cannot retain the model.
				(wrapped as { object: ChatModel | null }).object = null;
			}
		};
		return wrapped;
	}

	private getOrCreateGenerationKey(resourceKey: string): string {
		let generationKey = this._currentGenerationKeys.get(resourceKey);
		if (!generationKey) {
			generationKey = `${++this._generation}:${resourceKey}`;
			this._currentGenerationKeys.set(resourceKey, generationKey);
			this._resourceKeysByGeneration.set(generationKey, resourceKey);
		}
		return generationKey;
	}

	private getResourceKey(generationKey: string): string {
		const resourceKey = this._resourceKeysByGeneration.get(generationKey);
		if (!resourceKey) {
			throw new Error(`No chat session resource for generation ${generationKey}`);
		}
		return resourceKey;
	}

	/**
	 * For test use only
	 */
	async waitForModelDisposals(): Promise<void> {
		await Promise.all(this._pendingDisposals);
	}

	private toKey(uri: URI): string {
		return uri.toString();
	}

	override dispose(): void {
		super.dispose();
		this._modelsByGeneration.forEach(model => model.dispose());
	}
}
