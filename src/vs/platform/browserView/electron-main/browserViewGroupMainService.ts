/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IBrowserViewGroupService, IBrowserViewGroupViewEvent } from '../common/browserViewGroup.js';
import { BrowserViewGroup } from './browserViewGroup.js';

export const IBrowserViewGroupMainService = createDecorator<IBrowserViewGroupMainService>('browserViewGroupMainService');

export interface IBrowserViewGroupMainService extends IBrowserViewGroupService {
	readonly _serviceBrand: undefined;
}

/**
 * Main-process service that manages {@link BrowserViewGroup} instances.
 *
 * Implements {@link IBrowserViewGroupService} so it can be surfaced to
 * the workbench/shared process via {@link ProxyChannel}.
 */
export class BrowserViewGroupMainService extends Disposable implements IBrowserViewGroupMainService {
	declare readonly _serviceBrand: undefined;

	private readonly groups = this._register(new DisposableMap<string, BrowserViewGroup>());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();
	}

	async createGroup(): Promise<string> {
		const id = generateUuid();
		const group = this.instantiationService.createInstance(BrowserViewGroup, id);
		this.groups.set(id, group);

		// Auto-cleanup when the group disposes itself
		Event.once(group.onDidDestroy)(() => {
			this.groups.deleteAndLeak(id);
		});

		return id;
	}

	async destroyGroup(groupId: string): Promise<void> {
		this.groups.deleteAndDispose(groupId);
	}

	async addViewToGroup(groupId: string, viewId: string): Promise<void> {
		return this._getGroup(groupId).addView(viewId);
	}

	async removeViewFromGroup(groupId: string, viewId: string): Promise<void> {
		return this._getGroup(groupId).removeView(viewId);
	}

	async getDebugWebSocketEndpoint(groupId: string): Promise<string> {
		return this._getGroup(groupId).getDebugWebSocketEndpoint();
	}

	onDynamicDidAddView(groupId: string): Event<IBrowserViewGroupViewEvent> {
		return this._getGroup(groupId).onDidAddView;
	}

	onDynamicDidRemoveView(groupId: string): Event<IBrowserViewGroupViewEvent> {
		return this._getGroup(groupId).onDidRemoveView;
	}

	onDynamicDidDestroy(groupId: string): Event<void> {
		return this._getGroup(groupId).onDidDestroy;
	}

	/**
	 * Get a group or throw if not found.
	 */
	private _getGroup(groupId: string): BrowserViewGroup {
		const group = this.groups.get(groupId);
		if (!group) {
			throw new Error(`Browser view group ${groupId} not found`);
		}
		return group;
	}
}

