/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IActionWidgetService } from '../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListDelegate, IActionListItem } from '../../../../platform/actionWidget/browser/actionList.js';
import { renderIcon } from '../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IChatSessionProviderOptionItem } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { RemoteNewSession } from './newSession.js';

const FILTER_THRESHOLD = 10;

interface IModelItem {
	readonly id: string;
	readonly name: string;
	readonly description?: string;
}

/**
 * A self-contained widget for selecting a model in cloud sessions.
 * Reads the model option group from the {@link RemoteNewSession} and
 * renders an action list dropdown with the available models.
 */
export class CloudModelPicker extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<IChatSessionProviderOptionItem>());
	readonly onDidChange: Event<IChatSessionProviderOptionItem> = this._onDidChange.event;

	private _triggerElement: HTMLElement | undefined;
	private _slotElement: HTMLElement | undefined;
	private readonly _renderDisposables = this._register(new DisposableStore());
	private readonly _sessionDisposables = this._register(new DisposableStore());

	private _session: RemoteNewSession | undefined;
	private _selectedModel: IModelItem | undefined;
	private _models: IModelItem[] = [];

	get selectedModel(): IModelItem | undefined {
		return this._selectedModel;
	}

	constructor(
		@IActionWidgetService private readonly actionWidgetService: IActionWidgetService,
	) {
		super();
	}

	/**
	 * Sets the remote session and loads the available models from it.
	 */
	setSession(session: RemoteNewSession): void {
		this._session = session;
		this._sessionDisposables.clear();
		this._loadModels(session);

		// Sync selected model to the new session
		if (this._selectedModel) {
			session.setModelId(this._selectedModel.id);
			session.setOptionValue('models', { id: this._selectedModel.id, name: this._selectedModel.name });
		}

		// Re-load models when option groups change
		this._sessionDisposables.add(session.onDidChangeOptionGroups(() => {
			this._loadModels(session);
		}));
	}

	/**
	 * Renders the model picker trigger button into the given container.
	 */
	render(container: HTMLElement): HTMLElement {
		this._renderDisposables.clear();

		const slot = dom.append(container, dom.$('.sessions-chat-picker-slot'));
		this._slotElement = slot;
		this._renderDisposables.add({ dispose: () => slot.remove() });

		const trigger = dom.append(slot, dom.$('a.action-label'));
		trigger.tabIndex = 0;
		trigger.role = 'button';
		this._triggerElement = trigger;

		this._updateTriggerLabel();

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
			dom.EventHelper.stop(e, true);
			this._showPicker();
		}));

		this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));

		return slot;
	}

	/**
	 * Shows or hides the picker.
	 */
	setVisible(visible: boolean): void {
		if (this._slotElement) {
			this._slotElement.style.display = visible ? '' : 'none';
		}
	}

	private _loadModels(session: RemoteNewSession): void {
		const modelOption = session.getModelOptionGroup();
		if (modelOption?.group.items.length) {
			this._models = modelOption.group.items.map(item => ({
				id: item.id,
				name: item.name,
				description: item.description,
			}));

			// Select the session's current value, or the default, or the first
			if (!this._selectedModel || !this._models.some(m => m.id === this._selectedModel!.id)) {
				const value = modelOption.value;
				this._selectedModel = value
					? { id: value.id, name: value.name, description: value.description }
					: this._models[0];
			}
		} else {
			this._models = [];
		}
		this._updateTriggerLabel();
	}

	private _showPicker(): void {
		if (!this._triggerElement || this.actionWidgetService.isVisible || this._models.length === 0) {
			return;
		}

		const items = this._buildItems();
		const showFilter = items.filter(i => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;

		const triggerElement = this._triggerElement;
		const delegate: IActionListDelegate<IModelItem> = {
			onSelect: (item) => {
				this.actionWidgetService.hide();
				this._selectModel(item);
			},
			onHide: () => { triggerElement.focus(); },
		};

		this.actionWidgetService.show<IModelItem>(
			'remoteModelPicker',
			false,
			items,
			delegate,
			this._triggerElement,
			undefined,
			[],
			{
				getAriaLabel: (item) => item.label ?? '',
				getWidgetAriaLabel: () => localize('modelPicker.ariaLabel', "Model Picker"),
			},
			showFilter ? { showFilter: true, filterPlaceholder: localize('modelPicker.filter', "Filter models...") } : undefined,
		);
	}

	private _buildItems(): IActionListItem<IModelItem>[] {
		return this._models.map(model => ({
			kind: ActionListItemKind.Action,
			label: model.name,
			group: { title: '', icon: this._selectedModel?.id === model.id ? Codicon.check : Codicon.blank },
			item: model,
		}));
	}

	private _selectModel(item: IModelItem): void {
		this._selectedModel = item;
		this._updateTriggerLabel();

		if (this._session) {
			this._session.setModelId(item.id);
			this._session.setOptionValue('models', { id: item.id, name: item.name });
		}
		this._onDidChange.fire({ id: item.id, name: item.name, description: item.description });
	}

	private _updateTriggerLabel(): void {
		if (!this._triggerElement) {
			return;
		}

		dom.clearNode(this._triggerElement);
		const label = this._selectedModel?.name ?? localize('modelPicker.auto', "Auto");

		const labelSpan = dom.append(this._triggerElement, dom.$('span.sessions-chat-dropdown-label'));
		labelSpan.textContent = label;
		dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));

		this._slotElement?.classList.toggle('disabled', this._models.length === 0);
	}
}
