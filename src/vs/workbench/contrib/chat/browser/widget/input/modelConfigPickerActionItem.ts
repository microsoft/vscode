/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { getActiveWindow } from '../../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction, SubmenuAction } from '../../../../../../base/common/actions.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';

export interface IModelConfigPickerDelegate {
	readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined>;
}

/**
 * Action view item that shows a dropdown picker for model configuration properties
 * with `group: 'navigation'` (e.g., "Thinking Effort").
 */
export class ModelConfigPickerActionItem extends BaseActionViewItem {

	private _domNode: HTMLElement | undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	constructor(
		action: IAction,
		private readonly delegate: IModelConfigPickerDelegate,
		private readonly pickerOptions: IChatInputPickerOptions,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
	) {
		super(undefined, action);

		// Update label when model or config changes
		this._register(autorun(reader => {
			delegate.currentModel.read(reader);
			this._updateLabel();
		}));
		this._register(this._languageModelsService.onDidChangeLanguageModelVendors(() => {
			this._updateLabel();
		}));
	}

	override render(container: HTMLElement): void {
		container.classList.add('chat-input-picker-item');
		this._domNode = dom.append(container, dom.$('a.action-label'));
		this._domNode.tabIndex = 0;
		this._domNode.setAttribute('role', 'button');
		this._domNode.setAttribute('aria-haspopup', 'true');
		this.element = this._domNode;

		this._register(dom.addDisposableListener(this._domNode, dom.EventType.MOUSE_DOWN, (e) => {
			if (e.button !== 0) {
				return;
			}
			dom.EventHelper.stop(e, true);
			this._showPicker();
		}));

		this._register(dom.addDisposableListener(this._domNode, dom.EventType.KEY_DOWN, (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				dom.EventHelper.stop(e, true);
				this._showPicker();
			}
		}));

		this._updateLabel();
	}

	private _getNavigationProperties(): { key: string; schema: any; currentValue: unknown }[] {
		const model = this.delegate.currentModel.get();
		if (!model) {
			return [];
		}
		const schema = model.metadata.configurationSchema;
		if (!schema?.properties) {
			return [];
		}

		const currentConfig = this._languageModelsService.getModelConfiguration(model.identifier) ?? {};
		const result: { key: string; schema: any; currentValue: unknown }[] = [];

		for (const [key, propSchema] of Object.entries(schema.properties)) {
			if (typeof propSchema === 'boolean' || propSchema.group !== 'navigation') {
				continue;
			}
			const value = currentConfig[key] ?? propSchema.default;
			result.push({ key, schema: propSchema, currentValue: value });
		}

		return result;
	}

	private _updateLabel(): void {
		if (!this._domNode) {
			return;
		}

		const navProps = this._getNavigationProperties();
		const model = this.delegate.currentModel.get();
		const hasActions = model ? this._languageModelsService.getModelConfigurationActions(model.identifier).length > 0 : false;
		const disabled = navProps.length === 0 || !hasActions;

		if (navProps.length === 0) {
			this._domNode.style.display = 'none';
			return;
		}

		this._domNode.style.display = '';
		this._domNode.classList.toggle('disabled', disabled);
		this._domNode.setAttribute('aria-disabled', String(disabled));

		const parts: string[] = [];
		for (const prop of navProps) {
			if (prop.currentValue !== undefined) {
				const enumIndex = prop.schema.enum?.indexOf(prop.currentValue) ?? -1;
				const displayValue = (enumIndex >= 0 && prop.schema.enumItemLabels?.[enumIndex]) ?? String(prop.currentValue);
				parts.push(displayValue);
			}
		}

		const label = parts.join(' · ') || '';
		const domChildren: (HTMLElement | string)[] = [];
		domChildren.push(dom.$('span.chat-input-picker-label', undefined, label));
		domChildren.push(...renderLabelWithIcons(`$(chevron-down)`));
		dom.reset(this._domNode, ...domChildren);

		this._domNode.ariaLabel = label;
	}

	private _showPicker(): void {
		if (this._domNode?.classList.contains('disabled')) {
			return;
		}
		const model = this.delegate.currentModel.get();
		if (!model) {
			return;
		}

		const anchorElement = this._getAnchorElement();
		const actions = this._languageModelsService.getModelConfigurationActions(model.identifier);
		if (actions.length === 0) {
			return;
		}

		// Build action list items from the submenu actions
		const items: IActionListItem<IAction>[] = [];
		for (const action of actions) {
			if (action instanceof SubmenuAction) {
				// Add header with the group label (e.g., "Thinking Effort")
				items.push({
					kind: ActionListItemKind.Header,
					group: { title: action.label },
				});
				for (const child of action.actions) {
					items.push({
						item: child,
						kind: ActionListItemKind.Action,
						label: child.label,
						group: { title: '', icon: child.checked ? { id: 'check' } : { id: 'blank' } },
						hideIcon: false,
					});
				}
			}
		}

		this._actionWidgetService.show('modelConfigPicker', false, items, {
			onSelect: (action: IAction) => {
				action.run();
				this._onDidChange.fire();
			},
			onHide: () => { },
		}, anchorElement, undefined);
	}

	private _getAnchorElement(): HTMLElement {
		if (this._domNode && getActiveWindow().document.contains(this._domNode)) {
			return this._domNode;
		}
		return this.pickerOptions.getOverflowAnchor?.() ?? this._domNode!;
	}
}
