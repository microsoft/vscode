/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IReference, ReferenceCollection } from '../../../../../base/common/lifecycle.js';
import { ObservableMap } from '../../../../../base/common/observable.js';
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
	private readonly _modelsToDispose = new Set<string>();
	private readonly _pendingDisposals = new Set<Promise<void>>();
	private readonly _modelCreateOwners = new Map<string, string>();
	private readonly _referenceOwners = new Map<string, Map<number, string>>();
	private _referenceOwnerIds = 0;

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
		const key = this.toKey(uri);
		if (!this._models.has(key)) {
			return undefined;
		}

		return this.wrapReference(key, this._refCollection.acquire(key, undefined, debugOwner), debugOwner);
	}

	public acquireOrCreate(props: IStartSessionProps, debugOwner?: string): IReference<ChatModel> {
		const key = this.toKey(props.sessionResource);
		return this.wrapReference(key, this._refCollection.acquire(key, props, debugOwner), debugOwner);
	}

	public getReferenceDebugSnapshot(): IChatModelReferenceDebugSnapshot {
		const models = Array.from(this._models.values())
			.map(model => {
				const key = this.toKey(model.sessionResource);
				const owners = this._referenceOwners.get(key) ?? new Map();
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
					createdBy: this._modelCreateOwners.get(key) ?? 'unknown',
					initialLocation: model.initialLocation,
					isImported: !!model.isImported,
					willKeepAlive: model.willKeepAlive,
					hasPendingEdits: !!model.editingSession?.entries.get().some(entry => entry.state.get() === ModifiedFileEntryState.Modified),
					pendingDisposal: this._modelsToDispose.has(key),
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

	private createReferencedObject(key: string, props?: IStartSessionProps, debugOwner?: string): ChatModel {
		this._modelsToDispose.delete(key);
		const existingModel = this._models.get(key);
		if (existingModel) {
			return existingModel;
		}

		if (!props) {
			throw new Error(`No start session props provided for chat session ${key}`);
		}

		this.logService.trace(`Creating chat session ${key}`);
		const model = this.delegate.createModel(props);
		this._modelCreateOwners.set(key, debugOwner ?? 'unspecified');
		if (model.sessionResource.toString() !== key) {
			throw new Error(`Chat session key mismatch for ${key}`);
		}
		this._models.set(key, model);
		this._onDidCreateModel.fire(model);
		return model;
	}

	private destroyReferencedObject(key: string, object: ChatModel): void {
		this._modelsToDispose.add(key);
		const promise = this.doDestroyReferencedObject(key, object);
		this._pendingDisposals.add(promise);
		promise.finally(() => {
			this._pendingDisposals.delete(promise);
		});
	}

	private async doDestroyReferencedObject(key: string, object: ChatModel): Promise<void> {
		try {
			await this.delegate.willDisposeModel(object);
		} catch (error) {
			this.logService.error(error);
		} finally {
			if (this._modelsToDispose.has(key)) {
				this.logService.trace(`Disposing chat session ${key}`);
				this._models.delete(key);
				this._modelCreateOwners.delete(key);
				this._referenceOwners.delete(key);
				this._onDidDisposeModel.fire(object);
				object.dispose();
			}
			this._modelsToDispose.delete(key);
		}
	}

	private wrapReference(key: string, reference: IReference<ChatModel>, debugOwner?: string): IReference<ChatModel> {
		const ownerId = ++this._referenceOwnerIds;
		let ownerEntries = this._referenceOwners.get(key);
		if (!ownerEntries) {
			ownerEntries = new Map();
			this._referenceOwners.set(key, ownerEntries);
		}
		ownerEntries.set(ownerId, debugOwner ?? 'unspecified');

		let isDisposed = false;
		return {
			object: reference.object,
			dispose: () => {
				if (isDisposed) {
					return;
				}

				isDisposed = true;
				const owners = this._referenceOwners.get(key);
				owners?.delete(ownerId);
				if (owners?.size === 0) {
					this._referenceOwners.delete(key);
				}
				reference.dispose();
			}
		};
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
		this._models.forEach(model => model.dispose());
	}
}
