/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IMenuService, MenuId, IMenuChangeEvent } from '../../../../platform/actions/common/actions.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatContextKeys } from '../common/chatContextKeys.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../nls.js';
import { CHAT_CATEGORY } from './actions/chatActions.js';
import { CreateRemoteAgentJobAction } from './actions/chatExecuteActions.js';

/**
 * Tracks whether the "Delegate to Coding Agent" action is hidden via VS Code's menu hiding mechanism
 * and updates a context key to control its visibility in the secondary dropdown menu.
 */
export class ChatExecuteMenuContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatExecuteMenu';
	public static readonly STORAGE_KEY = 'chat.delegateToCodingAgentInSecondaryMenu';

	private readonly _delegateToCodingAgentInSecondaryMenuKey: IContextKey<boolean>;

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IMenuService private readonly menuService: IMenuService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();
		
		this._delegateToCodingAgentInSecondaryMenuKey = ChatContextKeys.delegateToCodingAgentInSecondaryMenu.bindTo(contextKeyService);
		
		// Initialize the context key from storage or default to false
		const stored = this.storageService.getBoolean(ChatExecuteMenuContribution.STORAGE_KEY, StorageScope.PROFILE, false);
		this._delegateToCodingAgentInSecondaryMenuKey.set(stored);

		// Monitor menu changes to detect when the action is hidden/shown
		this.setupHiddenStateMonitoring();
	}

	private setupHiddenStateMonitoring(): void {
		// Create a menu to monitor hidden states
		const menu = this.menuService.createMenu(MenuId.ChatExecute, this.contextKeyService);
		this._register(menu);

		// Check initial state
		this.checkHiddenState();

		// Monitor menu changes
		this._register(menu.onDidChange((e: IMenuChangeEvent) => {
			// Check if this change might affect the hidden state
			this.checkHiddenState();
		}));
	}

	private checkHiddenState(): void {
		const menu = this.menuService.createMenu(MenuId.ChatExecute, this.contextKeyService);
		try {
			const actions = menu.getActions();
			let isHidden = false;

			// Look for the action in the menu
			for (const [, items] of actions) {
				for (const item of items) {
					if (item.id === CreateRemoteAgentJobAction.ID) {
						// Check if the action has hideActions and if it's hidden
						if (this.hasHideActions(item) && typeof item.hideActions.isHidden === 'boolean') {
							isHidden = item.hideActions.isHidden;
						}
						break;
					}
				}
			}

			// Update the context key if the state changed
			const currentValue = this._delegateToCodingAgentInSecondaryMenuKey.get();
			if (isHidden !== currentValue) {
				this._delegateToCodingAgentInSecondaryMenuKey.set(isHidden);
				this.storageService.store(ChatExecuteMenuContribution.STORAGE_KEY, isHidden, StorageScope.PROFILE, StorageTarget.USER);
			}
		} catch (error) {
			// Log specific errors related to menu state checking for debugging
			console.debug('[ChatExecuteMenuContribution] Error checking hidden state:', error);
		} finally {
			menu.dispose();
		}
	}

	private hasHideActions(item: any): item is { hideActions: { isHidden: boolean } } {
		return 'hideActions' in item && item.hideActions && typeof item.hideActions === 'object';
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