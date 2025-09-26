/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';

/**
 * Tracks the preference for where the "Delegate to Coding Agent" action should appear:
 * in the main execute toolbar or in the secondary dropdown menu.
 */
export class ChatExecuteMenuContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatExecuteMenu';
	private static readonly STORAGE_KEY = 'chat.delegateToCodingAgentInSecondaryMenu';

	private readonly _delegateToCodingAgentInSecondaryMenuKey: IContextKey<boolean>;

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@IMenuService menuService: IMenuService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		
		this._delegateToCodingAgentInSecondaryMenuKey = ChatContextKeys.delegateToCodingAgentInSecondaryMenu.bindTo(contextKeyService);
		
		// Initialize the context key from storage
		const stored = this.storageService.getBoolean(ChatExecuteMenuContribution.STORAGE_KEY, StorageScope.PROFILE, false);
		this._delegateToCodingAgentInSecondaryMenuKey.set(stored);
	}

	public toggleDelegateToCodingAgentLocation(): void {
		const current = this._delegateToCodingAgentInSecondaryMenuKey.get();
		const newValue = !current;
		this._delegateToCodingAgentInSecondaryMenuKey.set(newValue);
		this.storageService.store(ChatExecuteMenuContribution.STORAGE_KEY, newValue, StorageScope.PROFILE, StorageTarget.USER);
	}

	public static getInstance(accessor: ServicesAccessor): ChatExecuteMenuContribution | undefined {
		// This is a simple way to access the contribution instance
		// In a real implementation, we might need a more sophisticated registry
		return undefined;
	}
}

class ToggleDelegateToCodingAgentLocationAction extends Action2 {
	static readonly ID = 'chat.action.toggleDelegateToCodingAgentLocation';

	constructor() {
		super({
			id: ToggleDelegateToCodingAgentLocationAction.ID,
			title: localize2('actions.chat.toggleDelegateToCodingAgentLocation', "Toggle Delegate to Coding Agent Location"),
			category: CHAT_CATEGORY,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);
		const contextKeyService = accessor.get(IContextKeyService);
		
		const key = ChatContextKeys.delegateToCodingAgentInSecondaryMenu.bindTo(contextKeyService);
		const currentValue = storageService.getBoolean(ChatExecuteMenuContribution.STORAGE_KEY, StorageScope.PROFILE, false);
		const newValue = !currentValue;
		
		key.set(newValue);
		storageService.store(ChatExecuteMenuContribution.STORAGE_KEY, newValue, StorageScope.PROFILE, StorageTarget.USER);
	}
}

// Register the action
registerAction2(ToggleDelegateToCodingAgentLocationAction);