/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { getActiveWindow } from '../../../../../../base/browser/dom.js';
import { BaseActionViewItem } from '../../../../../../base/browser/ui/actionbar/actionViewItems.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable, autorun } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ActionListItemKind, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../common/languageModels.js';
import { IChatInputPickerOptions } from './chatInputPickerActionItem.js';

export interface IModelConfigPickerDelegate {
readonly currentModel: IObservable<ILanguageModelChatMetadataAndIdentifier | undefined>;
}

/**
 * Picker widget for a single model configuration property.
 * Shows the current value as a label and opens a dropdown to change it.
 */
class ModelConfigurationPicker extends Disposable {

private readonly _onDidChange = this._register(new Emitter<void>());
readonly onDidChange = this._onDidChange.event;

readonly domNode: HTMLElement;

constructor(
private readonly _key: string,
private readonly _propSchema: any,
private readonly _getModelId: () => string | undefined,
private readonly _getAnchorElement: () => HTMLElement,
private readonly _languageModelsService: ILanguageModelsService,
private readonly _actionWidgetService: IActionWidgetService,
) {
super();

this.domNode = dom.$('a.action-label');
this.domNode.tabIndex = 0;
this.domNode.setAttribute('role', 'button');
this.domNode.setAttribute('aria-haspopup', 'true');

this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_DOWN, (e) => {
if (e.button !== 0) {
return;
}
dom.EventHelper.stop(e, true);
this._showPicker();
}));

this._register(dom.addDisposableListener(this.domNode, dom.EventType.KEY_DOWN, (e) => {
if (e.key === 'Enter' || e.key === ' ') {
dom.EventHelper.stop(e, true);
this._showPicker();
}
}));

this.updateLabel();
}

updateLabel(): void {
const modelId = this._getModelId();
const currentConfig = modelId ? this._languageModelsService.getModelConfiguration(modelId) ?? {} : {};
const value = currentConfig[this._key] ?? this._propSchema.default;

const enumIndex = this._propSchema.enum?.indexOf(value) ?? -1;
const displayValue = (enumIndex >= 0 && this._propSchema.enumItemLabels?.[enumIndex]) ?? String(value ?? '');

const domChildren: (HTMLElement | string)[] = [];
domChildren.push(dom.$('span.chat-input-picker-label', undefined, displayValue));
domChildren.push(...renderLabelWithIcons('$(chevron-down)'));
dom.reset(this.domNode, ...domChildren);

this.domNode.ariaLabel = displayValue;
}

private _showPicker(): void {
const modelId = this._getModelId();
if (!modelId) {
return;
}

const currentConfig = this._languageModelsService.getModelConfiguration(modelId) ?? {};
const currentValue = currentConfig[this._key] ?? this._propSchema.default;
const title = (typeof this._propSchema.title === 'string' ? this._propSchema.title : undefined)
?? this._key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (s: string) => s.toUpperCase());

if (!this._propSchema.enum || !Array.isArray(this._propSchema.enum)) {
return;
}

const items: IActionListItem<IAction>[] = [];

// Header
items.push({
kind: ActionListItemKind.Header,
group: { title },
});

// Enum values as actions with descriptions
const enumItemLabels = this._propSchema.enumItemLabels;
const enumDescriptions = this._propSchema.enumDescriptions;
for (let i = 0; i < this._propSchema.enum.length; i++) {
const value = this._propSchema.enum[i];
const itemLabel = enumItemLabels?.[i] ?? String(value);
const isDefault = value === this._propSchema.default;
const displayLabel = isDefault ? localize('models.enumDefault', "{0} (default)", itemLabel) : itemLabel;
const description = enumDescriptions?.[i];

items.push({
item: {
id: 'configureModel.' + this._key + '.' + value,
label: displayLabel,
class: undefined,
enabled: true,
tooltip: '',
checked: currentValue === value,
run: () => this._languageModelsService.setModelConfiguration(modelId, { [this._key]: value })
},
kind: ActionListItemKind.Action,
label: displayLabel,
description,
group: { title: '', icon: ThemeIcon.fromId(currentValue === value ? Codicon.check.id : Codicon.blank.id) },
hideIcon: false,
});
}

this._actionWidgetService.show('modelConfigPicker', false, items, {
onSelect: (action: IAction) => {
action.run();
this._onDidChange.fire();
},
onHide: () => { },
}, this._getAnchorElement(), undefined);
}
}

/**
 * Action view item that shows configuration pickers for model properties
 * with `group: 'navigation'`.
 */
export class ModelConfigPickerActionItem extends BaseActionViewItem {

private _container: HTMLElement | undefined;
private _pickers: ModelConfigurationPicker[] = [];

constructor(
action: IAction,
private readonly delegate: IModelConfigPickerDelegate,
private readonly pickerOptions: IChatInputPickerOptions,
@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
) {
super(undefined, action);

this._register(autorun(reader => {
delegate.currentModel.read(reader);
this._rebuild();
}));
this._register(this._languageModelsService.onDidChangeLanguageModelVendors(() => {
this._rebuild();
}));
}

override render(container: HTMLElement): void {
this._container = container;
this._container.classList.add('chat-input-picker-item');
this._rebuild();
}

private _rebuild(): void {
if (!this._container) {
return;
}

// Dispose old pickers
for (const picker of this._pickers) {
picker.dispose();
}
this._pickers = [];
dom.clearNode(this._container);
this._container.classList.add('chat-input-picker-item');

const model = this.delegate.currentModel.get();
if (!model) {
this._container.style.display = 'none';
return;
}

const schema = model.metadata.configurationSchema;
if (!schema?.properties) {
this._container.style.display = 'none';
return;
}

let hasNavProps = false;

for (const [key, propSchema] of Object.entries(schema.properties)) {
if (typeof propSchema === 'boolean' || propSchema.group !== 'navigation') {
continue;
}
hasNavProps = true;

const picker = new ModelConfigurationPicker(
key,
propSchema,
() => this.delegate.currentModel.get()?.identifier,
() => this._getAnchorElement(),
this._languageModelsService,
this._actionWidgetService,
);

this._register(picker.onDidChange(() => {
for (const p of this._pickers) {
p.updateLabel();
}
}));

this._pickers.push(picker);
this._container.appendChild(picker.domNode);
}

this._container.style.display = hasNavProps ? '' : 'none';
}

private _getAnchorElement(): HTMLElement {
if (this._container && getActiveWindow().document.contains(this._container)) {
return this._container;
}
return this.pickerOptions.getOverflowAnchor?.() ?? this._container!;
}
}
