/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Button } from '../../../../../../../base/browser/ui/button/button.js';
import { isCancellationError } from '../../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { KeyCode } from '../../../../../../../base/common/keyCodes.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListWidget, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { defaultButtonStyles } from '../../../../../../../platform/theme/browser/defaultStyles.js';
import { IUpdateService } from '../../../../../../../platform/update/common/update.js';
import { IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../common/languageModels.js';
import { IModelPickerDelegate } from './modelPickerActionItem.js';
import { buildModelConfigurationItems } from './modelPickerConfiguration.js';
import { buildModelPickerItems, getModelPickerAccessibilityProvider, getModelPickerControlModels, ModelPickerSection } from './modelPickerItems.js';
import { logModelChange } from './modelPickerTelemetry.js';
import './media/modelPickerInlineWidget.css';

/** Embeds the shared model and configuration lists without opening another context view. */
export class ModelPickerInlineWidget extends Disposable {
	private readonly _onDidChangeSelection = this._register(new Emitter<ILanguageModelChatMetadataAndIdentifier>());
	readonly onDidChangeSelection = this._onDidChangeSelection.event;
	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;
	private readonly _view = this._register(new MutableDisposable<DisposableStore>());
	private _selectedModel: ILanguageModelChatMetadataAndIdentifier | undefined;
	private _list: ActionListWidget<IActionWidgetDropdownAction> | undefined;

	constructor(
		private readonly _delegate: IModelPickerDelegate,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IChatEntitlementService private readonly _entitlementService: IChatEntitlementService,
		@IProductService private readonly _productService: IProductService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@IHoverService private readonly _hoverService: IHoverService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
	}

	setSelectedModel(model: ILanguageModelChatMetadataAndIdentifier | undefined): void {
		this._selectedModel = model;
	}

	show(container: HTMLElement, title: string, configurationGroup?: string): void {
		this.hide();
		const store = new DisposableStore();
		this._view.value = store;
		const root = dom.append(container, dom.$('.chat-model-picker-inline'));
		root.setAttribute('role', 'group');
		root.ariaLabel = title;
		store.add(toDisposable(() => root.remove()));
		const header = dom.append(root, dom.$('.chat-model-picker-inline-header'));
		dom.append(header, dom.$('span')).textContent = title;
		const closeLabel = localize('chat.modelPicker.closeChoices', "Close Choices");
		const close = store.add(new Button(header, { ...defaultButtonStyles, secondary: true, supportIcons: true }));
		close.label = '$(close)';
		close.element.ariaLabel = closeLabel;
		store.add(this._hoverService.setupDelayedHover(close.element, { content: closeLabel }));
		store.add(close.onDidClick(() => this.hide()));
		const itemDisposables = store.add(new DisposableStore());
		const createItems = () => {
			const items = this._createItems(configurationGroup);
			itemDisposables.clear();
			for (const disposable of new Set(items.flatMap(item => item.hover?.disposable ? [item.hover.disposable] : []))) {
				itemDisposables.add(disposable);
			}
			return items;
		};
		const items = createItems();
		let busy = false;
		const list = store.add(this._instantiationService.createInstance(
			ActionListWidget<IActionWidgetDropdownAction>,
			'InlineModelPicker',
			false,
			items,
			{
				onHide: () => this.hide(),
				onSelect: async action => {
					if (busy) {
						return;
					}
					busy = true;
					root.ariaBusy = 'true';
					try {
						await action.run();
						if (this._view.value === store) {
							this.hide();
						}
					} catch (error) {
						if (!isCancellationError(error)) {
							this._logService.error('Failed to select a model option', error);
							this._notificationService.error(error instanceof Error ? error : String(error));
						}
					} finally {
						busy = false;
						if (this._view.value === store) {
							root.ariaBusy = 'false';
							list.updateItems(createItems());
						}
					}
				},
			},
			{ ...getModelPickerAccessibilityProvider(!configurationGroup), getWidgetAriaLabel: () => title },
			{
				showFilter: !configurationGroup,
				filterPlaceholder: localize('chat.modelPicker.search', "Search models"),
				focusFilterOnOpen: true,
				filterAsCombobox: !configurationGroup,
				collapsedByDefault: new Set([ModelPickerSection.Other]),
				initialFocusItemId: configurationGroup ? items.find(item => item.item?.checked && item.item.id.startsWith(`${configurationGroup}.`))?.item?.id : undefined,
				reserveSubmenuSpace: false,
				hideDefaultKeybindingTooltip: true,
			},
		));
		this._list = list;
		if (list.filterContainer) {
			root.appendChild(list.filterContainer);
		}
		root.appendChild(list.domNode);
		const layout = () => list.layout(Math.min(list.computeListHeight(), 168), root.clientWidth);
		store.add(list.onDidRequestLayout(layout));
		store.add(Event.any(this._languageModelsService.onDidChangeLanguageModels, this._delegate.modelConfiguration?.onDidChange ?? Event.None)(() => {
			list.updateItems(createItems());
			layout();
		}));
		store.add(dom.addStandardDisposableListener(root, 'keydown', event => {
			if (event.browserEvent.isComposing || event.keyCode === KeyCode.KEY_IN_COMPOSITION) {
				return;
			}
			if (event.keyCode === KeyCode.Escape) {
				dom.EventHelper.stop(event, true);
				this.hide();
				return;
			}
			if (dom.isHTMLElement(event.target) && (dom.isEditableElement(event.target) || event.target.closest('button, a'))) {
				return;
			}
			if (event.keyCode === KeyCode.UpArrow || event.keyCode === KeyCode.DownArrow || event.keyCode === KeyCode.Enter) {
				dom.EventHelper.stop(event, true);
				if (event.keyCode === KeyCode.UpArrow) {
					list.focusPrevious();
				} else if (event.keyCode === KeyCode.DownArrow) {
					list.focusNext();
				} else {
					list.acceptSelected();
				}
			}
		}));
		const observer = store.add(new dom.DisposableResizeObserver('ModelPickerInlineWidget', layout, dom.getWindow(container)));
		store.add(observer.observe(root, { box: 'border-box' }));
		layout();
		this.focus();
	}

	focus(): void {
		this._list?.focus();
	}

	private _createItems(configurationGroup: string | undefined): IActionListItem<IActionWidgetDropdownAction>[] {
		if (configurationGroup) {
			if (!this._selectedModel || !this._delegate.modelConfiguration) {
				throw new Error(localize('chat.modelPicker.configurationUnavailable', "The model configuration is unavailable."));
			}
			return buildModelConfigurationItems(this._selectedModel, this._delegate.modelConfiguration, this._telemetryService);
		}
		const models = this._delegate.getModels();
		const presentation = this._delegate.getPresentationOptions();
		return buildModelPickerItems({
			models,
			selectedModelId: this._selectedModel?.identifier,
			recentModelIds: this._languageModelsService.getRecentlyUsedModelIds(),
			pinnedModelIds: this._languageModelsService.getPinnedModelIds(),
			controlModels: getModelPickerControlModels(this._languageModelsService.getModelsControlManifest(), this._entitlementService.entitlement, models),
			currentVSCodeVersion: this._productService.version,
			updateStateType: this._updateService.state.type,
			manageSettingsUrl: undefined,
			manageModelsAction: undefined,
			chatEntitlementService: this._entitlementService,
			languageModelsService: this._languageModelsService,
			openerService: undefined,
			presentation: {
				...presentation,
				restrictedMode: false,
				setupRequired: false,
				showManageModelsInSetupRequired: false,
				isUBB: !!this._entitlementService.quotas.usageBasedBilling,
			},
			actions: {
				onSelect: model => {
					logModelChange(this._telemetryService, this._selectedModel, model, this._delegate.getChatSessionId?.());
					this._selectedModel = model;
					this._onDidChangeSelection.fire(model);
				},
				onTogglePin: undefined,
				onConfigure: undefined,
				onRequestTrust: undefined,
				onRequestSetup: undefined,
			},
		});
	}

	hide(): void {
		this._list = undefined;
		if (this._view.value) {
			this._view.clear();
			this._onDidClose.fire();
		}
	}

	override dispose(): void {
		this.hide();
		super.dispose();
	}
}
