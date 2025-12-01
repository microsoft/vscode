/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore, IDisposable, IReference, ReferenceCollection } from '../../../../base/common/lifecycle.js';
import { ObservableMap } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatEditingSession } from './chatEditingService.js';
import { ChatModel, IExportableChatData, ISerializableChatData } from './chatModel.js';
import { ChatAgentLocation } from './constants.js';

export interface IStartSessionProps {
	readonly initialData?: IExportableChatData | ISerializableChatData;
	readonly location: ChatAgentLocation;
	readonly sessionResource: URI;
	readonly sessionId?: string;
	readonly canUseTools: boolean;
	readonly transferEditingSession?: IChatEditingSession;
	readonly disableBackgroundKeepAlive?: boolean;
}

export interface ChatModelStoreDelegate {
	createModel: (props: IStartSessionProps) => ChatModel;
	willDisposeModel: (model: ChatModel) => Promise<void>;
}

export class ChatModelStore extends ReferenceCollection<ChatModel> implements IDisposable {
	private readonly _store = new DisposableStore();

	private readonly _models = new ObservableMap<string, ChatModel>();
	private readonly _modelsToDispose = new Set<string>();
	private readonly _pendingDisposals = new Set<Promise<void>>();

	private readonly _onDidDisposeModel = this._store.add(new Emitter<ChatModel>());
	public readonly onDidDisposeModel = this._onDidDisposeModel.event;

	constructor(
		private readonly delegate: ChatModelStoreDelegate,
		@ILogService private readonly logService: ILogService,
	) {
		super();
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

	public acquireExisting(uri: URI): IReference<ChatModel> | undefined {
		const key = this.toKey(uri);
		if (!this._models.has(key)) {
			return undefined;
		}
		return this.acquire(key);
	}

	public acquireOrCreate(props: IStartSessionProps): IReference<ChatModel> {
		return this.acquire(this.toKey(props.sessionResource), props);
	}

	protected createReferencedObject(key: string, props?: IStartSessionProps): ChatModel {
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
		if (model.sessionResource.toString() !== key) {
			throw new Error(`Chat session key mismatch for ${key}`);
		}
		this._models.set(key, model);
		return model;
	}

	protected destroyReferencedObject(key: string, object: ChatModel): void {
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
				this._onDidDisposeModel.fire(object);
				object.dispose();
			}
			this._modelsToDispose.delete(key);
		}
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

	dispose(): void {
		this._store.dispose();
		this._models.forEach(model => model.dispose());
	}
}
