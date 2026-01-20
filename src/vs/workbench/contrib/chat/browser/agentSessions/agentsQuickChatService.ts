/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { AgentsQuickChat, IAgentsQuickChatOpenOptions } from './agentsQuickChat.js';

// Re-export for convenience
export { IAgentsQuickChatOpenOptions };

/**
 * Service for managing the AgentsQuickChat overlay.
 * This provides a unified quick-access overlay for agent sessions
 * with hybrid input that supports natural language queries and
 * Quick Access prefixes (>, @, #, etc.).
 */
export interface IAgentsQuickChatService {
	readonly _serviceBrand: undefined;

	/** Whether the quick chat overlay is currently visible */
	readonly isVisible: boolean;

	/** Fires when visibility changes */
	readonly onDidChangeVisibility: Event<boolean>;

	/** Open the quick chat overlay */
	open(options?: IAgentsQuickChatOpenOptions): void;

	/** Close the quick chat overlay */
	close(): void;

	/** Toggle the quick chat overlay */
	toggle(options?: IAgentsQuickChatOpenOptions): void;

	/** Focus the input box (if already open) */
	focus(): void;
}

export const IAgentsQuickChatService = createDecorator<IAgentsQuickChatService>('agentsQuickChatService');

export class AgentsQuickChatService extends Disposable implements IAgentsQuickChatService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeVisibility = this._register(new Emitter<boolean>());
	readonly onDidChangeVisibility = this._onDidChangeVisibility.event;

	private readonly _quickChatRef = this._register(new MutableDisposable<AgentsQuickChat>());
	private readonly _quickChatDisposables = this._register(new DisposableStore());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	get isVisible(): boolean {
		return this._quickChatRef.value?.isVisible ?? false;
	}

	open(options?: IAgentsQuickChatOpenOptions): void {
		console.log('[AgentsQuickChat] service.open called', { isVisible: this.isVisible, options });

		// If already visible, just focus and optionally set value
		if (this._quickChatRef.value?.isVisible) {
			if (options?.query && !options.preserveValue) {
				this._quickChatRef.value.setValue(options.query);
			}
			this._quickChatRef.value.focus();
			return;
		}

		// Create new quick chat instance if needed
		if (!this._quickChatRef.value) {
			console.log('[AgentsQuickChat] Creating new instance');
			this._quickChatDisposables.clear();
			const quickChat = this.instantiationService.createInstance(AgentsQuickChat);
			this._quickChatRef.value = quickChat;
			this._quickChatDisposables.add(quickChat.onDidChangeVisibility((visible: boolean) => {
				console.log('[AgentsQuickChat] visibility changed:', visible);
				this._onDidChangeVisibility.fire(visible);
			}));
		}

		// Show the overlay
		console.log('[AgentsQuickChat] Calling show()');
		this._quickChatRef.value.show(options);
	}

	close(): void {
		this._quickChatRef.value?.hide();
	}

	toggle(options?: IAgentsQuickChatOpenOptions): void {
		console.log('[AgentsQuickChat] toggle called', { isVisible: this.isVisible, hasQuery: !!options?.query });
		if (this.isVisible && !options?.query) {
			console.log('[AgentsQuickChat] Closing because already visible');
			this.close();
		} else {
			console.log('[AgentsQuickChat] Opening');
			this.open(options);
		}
	}

	focus(): void {
		this._quickChatRef.value?.focus();
	}
}
