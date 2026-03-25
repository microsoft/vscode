/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Emitter } from '../../../../base/common/event.js';
import { toAction } from '../../../../base/common/actions.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatSessionPickerActionItem, IChatSessionPickerDelegate } from '../../../../workbench/contrib/chat/browser/chatSessions/chatSessionPickerActionItem.js';
import { SearchableOptionPickerActionItem } from '../../../../workbench/contrib/chat/browser/chatSessions/searchableOptionPickerActionItem.js';
import { IChatSessionProviderOptionItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionOptionGroup } from './newSession.js';
import { RemoteNewSession } from '../../copilotChatSessions/browser/copilotChatSessionsProvider.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';

/**
 * Self-contained widget that renders extension-driven toolbar pickers
 * for Cloud/Remote sessions. Observes the active session from
 * {@link ISessionsProvidersService} and dynamically creates/destroys
 * picker widgets as option groups change.
 */
export class ExtensionToolbarPickers extends Disposable {

	private _container: HTMLElement | undefined;
	private readonly _pickerWidgets = new Map<string, ChatSessionPickerActionItem | SearchableOptionPickerActionItem>();
	private readonly _pickerDisposables = this._register(new DisposableStore());
	private readonly _optionEmitters = new Map<string, Emitter<IChatSessionProviderOptionItem>>();
	private readonly _optionContextKeys = new Map<string, IContextKey<string>>();
	private readonly _sessionDisposables = this._register(new DisposableStore());

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super();

		// Observe active session and render toolbar pickers when it has option groups
		this._register(autorun(reader => {
			const session = this.sessionsManagementService.activeSession.read(reader);
			this._sessionDisposables.clear();

			if (session) {
				// The session data is directly a RemoteNewSession — access its option groups.
				this._bindToSession();
			} else {
				this._clearPickers();
			}
		}));
	}

	/**
	 * Sets the container element where toolbar pickers will be rendered.
	 */
	setContainer(container: HTMLElement): void {
		this._container = container;
	}

	private _bindToSession(): void {
		// Get the current new session from the provider's internal state
		const providers = this.sessionsProvidersService.getProviders();
		for (const provider of providers) {
			// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
			const currentSession = (provider as any)._currentNewSession;
			if (currentSession instanceof RemoteNewSession) {
				this._renderToolbarPickers(currentSession, true);
				this._sessionDisposables.add(currentSession.onDidChangeOptionGroups(() => {
					this._renderToolbarPickers(currentSession);
				}));
				return;
			}
		}
	}

	private _renderToolbarPickers(session: RemoteNewSession, force?: boolean): void {
		if (!this._container) {
			return;
		}

		const toolbarOptions = session.getOtherOptionGroups();
		const visibleGroups = toolbarOptions.filter(option => {
			const group = option.group;
			return group.items.length > 0 || (group.commands || []).length > 0 || !!group.searchable;
		});

		if (visibleGroups.length === 0) {
			this._clearPickers();
			return;
		}

		if (!force) {
			const allMatch = visibleGroups.length === this._pickerWidgets.size
				&& visibleGroups.every(o => this._pickerWidgets.has(o.group.id));
			if (allMatch) {
				return;
			}
		}

		this._clearPickers();

		for (const option of visibleGroups) {
			this._renderPickerWidget(option, session);
		}
	}

	private _renderPickerWidget(option: ISessionOptionGroup, session: RemoteNewSession): void {
		const { group: optionGroup, value: initialItem } = option;

		if (initialItem) {
			this._updateOptionContextKey(optionGroup.id, initialItem.id);
		}

		const initialState = { group: optionGroup, item: initialItem };
		const emitter = this._getOrCreateOptionEmitter(optionGroup.id);
		const itemDelegate: IChatSessionPickerDelegate = {
			getCurrentOption: () => session.getOptionValue(optionGroup.id) ?? initialItem,
			onDidChangeOption: emitter.event,
			setOption: (item: IChatSessionProviderOptionItem) => {
				this._updateOptionContextKey(optionGroup.id, item.id);
				emitter.fire(item);
				session.setOptionValue(optionGroup.id, item);
			},
			getOptionGroup: () => {
				const modelOpt = session.getModelOptionGroup();
				if (modelOpt?.group.id === optionGroup.id) {
					return modelOpt.group;
				}
				return session.getOtherOptionGroups().find(o => o.group.id === optionGroup.id)?.group;
			},
			getSessionResource: () => session.resource,
		};

		const action = toAction({ id: optionGroup.id, label: optionGroup.name, run: () => { } });
		const widget = this.instantiationService.createInstance(
			optionGroup.searchable ? SearchableOptionPickerActionItem : ChatSessionPickerActionItem,
			action, initialState, itemDelegate, undefined
		);

		this._pickerDisposables.add(widget);
		this._pickerWidgets.set(optionGroup.id, widget);

		const slot = dom.append(this._container!, dom.$('.sessions-chat-picker-slot'));
		widget.render(slot);
	}

	private _updateOptionContextKey(optionGroupId: string, optionItemId: string): void {
		let contextKey = this._optionContextKeys.get(optionGroupId);
		if (!contextKey) {
			const rawKey = new RawContextKey<string>(`chatSessionOption.${optionGroupId}`, '');
			contextKey = rawKey.bindTo(this.contextKeyService);
			this._optionContextKeys.set(optionGroupId, contextKey);
		}
		contextKey.set(optionItemId.trim());
	}

	private _getOrCreateOptionEmitter(optionGroupId: string): Emitter<IChatSessionProviderOptionItem> {
		let emitter = this._optionEmitters.get(optionGroupId);
		if (!emitter) {
			emitter = new Emitter<IChatSessionProviderOptionItem>();
			this._optionEmitters.set(optionGroupId, emitter);
			this._pickerDisposables.add(emitter);
		}
		return emitter;
	}

	private _clearPickers(): void {
		this._pickerDisposables.clear();
		this._pickerWidgets.clear();
		this._optionEmitters.clear();
		if (this._container) {
			dom.clearNode(this._container);
		}
	}
}
