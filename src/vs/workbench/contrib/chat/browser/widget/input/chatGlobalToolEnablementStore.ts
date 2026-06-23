/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ObservableMemento, observableMemento } from '../../../../../../platform/observable/common/observableMemento.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { ToolEnablementStates } from './chatSelectedTools.js';

export const IChatGlobalToolEnablementStore = createDecorator<IChatGlobalToolEnablementStore>('chatGlobalToolEnablementStore');

/**
 * Process-wide shared store for the profile-scoped tool/tool-set enablement
 * state that classic chat's tool picker and the Chat Customizations "Tools"
 * section both read/write.
 *
 * Splitting this out (versus letting {@link ChatSelectedTools} own its own
 * memento) means a write from the Customizations Tools section is observed
 * by every active `ChatSelectedTools` instance — and vice versa — without
 * relying on cross-instance storage-event propagation.
 */
export interface IChatGlobalToolEnablementStore {
	readonly _serviceBrand: undefined;

	/** Profile-wide enablement; default is enabled when a tool / tool-set id is absent from the map. */
	readonly state: IObservable<ToolEnablementStates>;

	/** Replace the entire enablement snapshot. */
	setState(next: ToolEnablementStates): void;

	/** Toggle a single tool-set entry. `enabled=true` removes the explicit override, restoring the enabled default. */
	setToolSetEnabled(toolSetId: string, enabled: boolean): void;
}

export class ChatGlobalToolEnablementStore extends Disposable implements IChatGlobalToolEnablementStore {
	declare readonly _serviceBrand: undefined;

	private readonly _state: ObservableMemento<ToolEnablementStates>;

	constructor(
		@IStorageService storageService: IStorageService,
	) {
		super();
		const memento = observableMemento<ToolEnablementStates>({
			key: 'chat/selectedTools',
			defaultValue: { toolSets: new Map(), tools: new Map() },
			fromStorage: ToolEnablementStates.fromStorage,
			toStorage: ToolEnablementStates.toStorage,
		});
		this._state = this._register(memento(StorageScope.PROFILE, StorageTarget.MACHINE, storageService));
	}

	get state(): IObservable<ToolEnablementStates> {
		return this._state;
	}

	setState(next: ToolEnablementStates): void {
		this._state.set(next, undefined);
	}

	setToolSetEnabled(toolSetId: string, enabled: boolean): void {
		const current = this._state.get();
		const toolSets = new Map(current.toolSets);
		// Default is enabled; only persist explicit `false` to keep storage compact.
		if (enabled) {
			if (!toolSets.has(toolSetId)) {
				return;
			}
			toolSets.delete(toolSetId);
		} else {
			if (toolSets.get(toolSetId) === false) {
				return;
			}
			toolSets.set(toolSetId, false);
		}
		this._state.set({ toolSets, tools: current.tools }, undefined);
	}
}

registerSingleton(IChatGlobalToolEnablementStore, ChatGlobalToolEnablementStore, InstantiationType.Delayed);
