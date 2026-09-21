/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { formatTokenCount } from '../../../../../../../base/common/numbers.js';
import { ThemeIcon } from '../../../../../../../base/common/themables.js';
import { localize } from '../../../../../../../nls.js';
import { ActionListItemKind, IActionListHeaderLink, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction } from '../../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { withChatInputPickerMotion } from '../chatInputPickerActionItem.js';
import { getModelConfigProperty, IModelConfigurationAccess, MODEL_CONFIG_GROUP_CONTEXT, MODEL_CONFIG_GROUP_EFFORT } from './modelPickerModelConfig.js';
import { logModelConfigurationChange } from './modelPickerTelemetry.js';

export interface IModelPickerConfigurationHost {
	readonly getSelectedModel: () => ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly getConfigurationAccess: () => IModelConfigurationAccess;
	readonly isDisabled: () => boolean;
	readonly shouldShowCacheBreakHint: () => boolean;
	readonly getCacheBreakLearnMoreLink: () => IActionListHeaderLink | undefined;
	readonly dismissCacheBreakHint: () => void;
	readonly onDidHide?: () => void;
}

export class ModelPickerConfiguration {
	private _visible = false;
	private _showVersion = 0;

	get isVisible(): boolean {
		return this._visible;
	}

	constructor(
		private readonly _host: IModelPickerConfigurationHost,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	renderButton(button: HTMLElement, compact: boolean, noModelsAvailable: boolean): void {
		const model = this._host.getSelectedModel();
		const effortConfig = this._getConfigProperty(MODEL_CONFIG_GROUP_EFFORT);
		const tokensConfig = this._getConfigProperty(MODEL_CONFIG_GROUP_CONTEXT);
		if (compact || !model || noModelsAvailable || (!effortConfig && !tokensConfig)) {
			button.style.display = 'none';
			return;
		}

		const labelParts: string[] = [];
		const ariaParts: string[] = [];
		if (effortConfig && effortConfig.value !== undefined) {
			const enumIndex = effortConfig.schema.enum?.indexOf(effortConfig.value) ?? -1;
			const effortLabel = enumIndex >= 0 && effortConfig.schema.enumItemLabels?.[enumIndex]
				? effortConfig.schema.enumItemLabels[enumIndex]
				: String(effortConfig.value);
			labelParts.push(effortLabel);
			// The group is generic, so producers name it: Copilot's Auto model uses it
			// for "Optimize for" while regular models use it for thinking effort.
			ariaParts.push(effortConfig.schema.title
				? localize('chat.modelPicker.navigationAriaLabel', "{0}: {1}", effortConfig.schema.title, effortLabel)
				: localize('chat.modelPicker.effortAriaLabel', "Thinking Effort: {0}", effortLabel));
		}
		if (tokensConfig && tokensConfig.value !== undefined) {
			const enumIndex = tokensConfig.schema.enum?.indexOf(tokensConfig.value) ?? -1;
			const tokensLabel = enumIndex >= 0 && tokensConfig.schema.enumItemLabels?.[enumIndex]
				? tokensConfig.schema.enumItemLabels[enumIndex]
				: formatTokenCount(Number(tokensConfig.value));
			labelParts.push(tokensLabel);
			ariaParts.push(localize('chat.modelPicker.tokensAriaLabel', "Context Size: {0}", tokensLabel));
		}

		if (!labelParts.length) {
			// First-party producers always supply a default, but configuration schemas can also come
			// from third-party extensions via the LM API. Fall back to a generic label rather than
			// hiding the button, so the configuration stays reachable.
			const fallbackLabel = effortConfig?.schema.title ?? tokensConfig?.schema.title ?? localize('chat.modelPicker.configureLabel', "Configure");
			labelParts.push(fallbackLabel);
			ariaParts.push(fallbackLabel);
		}

		dom.reset(button, dom.$('span.chat-input-picker-label', undefined, labelParts.join(' ')));
		button.style.display = '';
		button.ariaLabel = ariaParts.join(', ');
	}

	hide(): void {
		if (this._visible) {
			this._actionWidgetService.hide(true);
		}
	}

	show(button: HTMLElement | undefined, focusGroup?: string): boolean {
		if (this._host.isDisabled() || !button || !this._host.getSelectedModel()) {
			return false;
		}

		const items = this._buildItems();
		if (!items.length) {
			return false;
		}

		this.hide();
		const showVersion = ++this._showVersion;
		this._visible = true;
		const previouslyFocusedElement = dom.getActiveElement();
		const delegate = {
			onSelect: async (action: IActionWidgetDropdownAction) => {
				this._actionWidgetService.focusItemById(action.id);
				await action.run();
				if (this._visible && showVersion === this._showVersion) {
					this._actionWidgetService.updateItems(this._buildItems(), action.id);
				}
			},
			onHide: () => {
				if (!this._visible || showVersion !== this._showVersion) {
					return;
				}
				this._visible = false;
				button.setAttribute('aria-expanded', 'false');
				if (dom.isHTMLElement(previouslyFocusedElement) && previouslyFocusedElement.isConnected) {
					previouslyFocusedElement.focus();
				} else if (button.isConnected) {
					button.focus();
				}
				this._host.onDidHide?.();
			}
		};

		button.setAttribute('aria-expanded', 'true');
		const showCacheBreakHint = this._host.shouldShowCacheBreakHint();
		this._actionWidgetService.show(
			'ChatModelConfigPicker',
			false,
			items,
			delegate,
			button,
			undefined,
			[],
			{
				isChecked: element => element.kind === ActionListItemKind.Action ? !!element.item?.checked : undefined,
				getRole: element => element.kind === ActionListItemKind.Action ? 'menuitemradio' as const : 'separator' as const,
				getWidgetRole: () => 'menu' as const,
			},
			withChatInputPickerMotion({
				headerText: showCacheBreakHint ? localize('chat.config.cacheBreakHint', "Changing these options mid-session resets the prompt cache and may increase cost.") : undefined,
				headerIcon: showCacheBreakHint ? Codicon.info : undefined,
				headerLink: showCacheBreakHint ? this._host.getCacheBreakLearnMoreLink() : undefined,
				headerDismiss: showCacheBreakHint ? this._host.dismissCacheBreakHint : undefined,
				reserveSubmenuSpace: false,
			}),
		);

		if (focusGroup) {
			const groupItem = items.find(item => item.kind === ActionListItemKind.Action && item.item?.id?.startsWith(`${focusGroup}.`));
			if (groupItem?.kind === ActionListItemKind.Action && groupItem.item) {
				this._actionWidgetService.focusItemById(groupItem.item.id);
			}
		}
		return true;
	}

	private _getConfigProperty(group: string) {
		return getModelConfigProperty(this._host.getSelectedModel(), this._host.getConfigurationAccess(), group);
	}

	private _buildItems(): IActionListItem<IActionWidgetDropdownAction>[] {
		const model = this._host.getSelectedModel();
		return model ? buildModelConfigurationItems(model, this._host.getConfigurationAccess(), this._telemetryService) : [];
	}
}

export function buildModelConfigurationItems(model: ILanguageModelChatMetadataAndIdentifier, configurationAccess: IModelConfigurationAccess, telemetryService: ITelemetryService): IActionListItem<IActionWidgetDropdownAction>[] {
	const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
	const defaultLabel = localize('models.configDefault', "Default");
	const appendConfigSection = (
		group: string,
		fallbackHeaderLabel: string,
		formatValueLabel: (value: unknown, enumLabel: string | undefined) => string,
	): void => {
		const config = getModelConfigProperty(model, configurationAccess, group);
		if (!config) {
			return;
		}
		const previousValue = String(config.value ?? '');
		const enumValues = config.schema.enum ?? [];
		if (items.length) {
			items.push({ kind: ActionListItemKind.Separator });
		}
		items.push({ kind: ActionListItemKind.Header, label: config.schema.title ?? fallbackHeaderLabel });
		for (let index = 0; index < enumValues.length; index++) {
			const value = enumValues[index];
			const isDefault = value === config.schema.default;
			const displayLabel = formatValueLabel(value, config.schema.enumItemLabels?.[index]);
			const enumDescription = config.schema.enumDescriptions?.[index];
			const ariaDescriptionParts = [
				isDefault ? defaultLabel : undefined,
				enumDescription,
				config.schema.readOnly ? localize('chat.modelPicker.readOnlyOption', "Read-only") : undefined,
			].filter((part): part is string => !!part);
			const checked = config.value === value;
			items.push({
				item: {
					id: `${group}.${value}`,
					enabled: !config.schema.readOnly,
					checked,
					class: undefined,
					tooltip: enumDescription ?? '',
					label: displayLabel,
					run: () => {
						logModelConfigurationChange(telemetryService, model, group, config.key, previousValue, value);
						return configurationAccess.setModelConfiguration(model.identifier, { [config.key]: value });
					}
				},
				kind: ActionListItemKind.Action,
				...(config.schema.readOnly ? { disabled: true } : {}),
				className: 'chat-model-picker-config-option',
				label: displayLabel,
				description: isDefault ? defaultLabel : undefined,
				ariaDescription: ariaDescriptionParts.length ? ariaDescriptionParts.join(', ') : undefined,
				hover: enumDescription ? { content: enumDescription } : undefined,
				group: { title: '', icon: ThemeIcon.fromId(checked ? Codicon.check.id : Codicon.blank.id) },
				hideIcon: false,
			});
		}
	};

	appendConfigSection(
		MODEL_CONFIG_GROUP_EFFORT,
		localize('chat.effort.header', "Thinking Effort"),
		(value, enumLabel) => enumLabel ?? String(value),
	);
	appendConfigSection(
		MODEL_CONFIG_GROUP_CONTEXT,
		localize('chat.tokens.header', "Context Size"),
		(value, enumLabel) => enumLabel ?? formatTokenCount(Number(value)),
	);

	return items;
}
