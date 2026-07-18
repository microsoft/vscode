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
import { TelemetryTrustedValue } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../common/languageModels.js';
import { withChatInputPickerMotion } from '../chatInputPickerActionItem.js';
import { IModelConfigurationAccess } from './modelPickerActionItem.js';

type ChatThinkingEffortChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the thinking effort is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the thinking effort was changed for' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous thinking effort value' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new thinking effort value' };
};

type ChatThinkingEffortChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	fromValue: string;
	toValue: string;
};

type ChatContextSizeChangeClassification = {
	owner: 'lramos15';
	comment: 'Reporting when the context window size is changed';
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The model the context size was changed for' };
	fromValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The previous context size value' };
	toValue: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The new context size value' };
};

type ChatContextSizeChangeEvent = {
	model: string | TelemetryTrustedValue<string>;
	fromValue: string;
	toValue: string;
};

export interface IModelPickerConfigurationHost {
	readonly getSelectedModel: () => ILanguageModelChatMetadataAndIdentifier | undefined;
	readonly getConfigurationAccess: () => IModelConfigurationAccess;
	readonly isDisabled: () => boolean;
	readonly shouldShowCacheBreakHint: () => boolean;
	readonly getCacheBreakLearnMoreLink: () => IActionListHeaderLink | undefined;
	readonly dismissCacheBreakHint: () => void;
}

export class ModelPickerConfiguration {

	constructor(
		private readonly _host: IModelPickerConfigurationHost,
		@IActionWidgetService private readonly _actionWidgetService: IActionWidgetService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) { }

	renderButton(button: HTMLElement, compact: boolean, noModelsAvailable: boolean): void {
		const model = this._host.getSelectedModel();
		const effortConfig = this._getConfigProperty('navigation');
		const tokensConfig = this._getConfigProperty('tokens');
		if (compact || !model || noModelsAvailable || (!effortConfig && !tokensConfig)) {
			button.style.display = 'none';
			return;
		}

		const labelParts: string[] = [];
		const ariaParts: string[] = [];
		if (effortConfig) {
			const enumIndex = effortConfig.schema.enum?.indexOf(effortConfig.value) ?? -1;
			const effortLabel = enumIndex >= 0 && effortConfig.schema.enumItemLabels?.[enumIndex]
				? effortConfig.schema.enumItemLabels[enumIndex]
				: String(effortConfig.value);
			labelParts.push(effortLabel);
			ariaParts.push(localize('chat.modelPicker.effortAriaLabel', "Thinking Effort: {0}", effortLabel));
		}
		if (tokensConfig) {
			const enumIndex = tokensConfig.schema.enum?.indexOf(tokensConfig.value) ?? -1;
			const tokensLabel = enumIndex >= 0 && tokensConfig.schema.enumItemLabels?.[enumIndex]
				? tokensConfig.schema.enumItemLabels[enumIndex]
				: formatTokenCount(Number(tokensConfig.value));
			labelParts.push(tokensLabel);
			ariaParts.push(localize('chat.modelPicker.tokensAriaLabel', "Context Size: {0}", tokensLabel));
		}

		dom.reset(button, dom.$('span.chat-input-picker-label', undefined, labelParts.join(' ')));
		button.style.display = '';
		button.ariaLabel = ariaParts.join(', ');
	}

	show(button: HTMLElement | undefined, focusGroup?: string): void {
		if (this._host.isDisabled() || !button || !this._host.getSelectedModel()) {
			return;
		}

		const items = this._buildItems();
		if (!items.length) {
			return;
		}

		const previouslyFocusedElement = dom.getActiveElement();
		const delegate = {
			onSelect: async (action: IActionWidgetDropdownAction) => {
				this._actionWidgetService.focusItemById(action.id);
				await action.run();
				this._actionWidgetService.updateItems(this._buildItems(), action.id);
			},
			onHide: () => {
				button.setAttribute('aria-expanded', 'false');
				if (dom.isHTMLElement(previouslyFocusedElement)) {
					previouslyFocusedElement.focus();
				}
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
			}),
		);

		if (focusGroup) {
			const groupItem = items.find(item => item.kind === ActionListItemKind.Action && item.item?.id?.startsWith(`${focusGroup}.`));
			if (groupItem?.kind === ActionListItemKind.Action && groupItem.item) {
				this._actionWidgetService.focusItemById(groupItem.item.id);
			}
		}
	}

	private _getConfigProperty(group: string) {
		const model = this._host.getSelectedModel();
		if (!model) {
			return undefined;
		}
		const schema = model.metadata.configurationSchema;
		if (!schema?.properties) {
			return undefined;
		}
		const configurationAccess = this._host.getConfigurationAccess();
		const currentConfig = configurationAccess.getModelConfiguration(model.identifier) ?? {};
		for (const [key, propSchema] of Object.entries(schema.properties)) {
			if (propSchema.group !== group || !propSchema.enum?.length) {
				continue;
			}
			return { key, value: currentConfig[key] ?? propSchema.default, schema: propSchema };
		}
		return undefined;
	}

	private _buildItems(): IActionListItem<IActionWidgetDropdownAction>[] {
		const model = this._host.getSelectedModel();
		if (!model) {
			return [];
		}

		const modelIdentifier = model.identifier;
		const configurationAccess = this._host.getConfigurationAccess();
		const items: IActionListItem<IActionWidgetDropdownAction>[] = [];
		const defaultLabel = localize('models.configDefault', "Default");
		const appendConfigSection = (
			group: string,
			headerLabel: string,
			formatValueLabel: (value: unknown, enumLabel: string | undefined) => string,
			logChange: (value: unknown, previousValue: string) => void,
		): void => {
			const config = this._getConfigProperty(group);
			if (!config) {
				return;
			}
			const previousValue = String(config.value ?? '');
			const enumValues = config.schema.enum ?? [];
			if (items.length) {
				items.push({ kind: ActionListItemKind.Separator });
			}
			items.push({ kind: ActionListItemKind.Header, label: headerLabel });
			for (let index = 0; index < enumValues.length; index++) {
				const value = enumValues[index];
				const isDefault = value === config.schema.default;
				const displayLabel = formatValueLabel(value, config.schema.enumItemLabels?.[index]);
				const enumDescription = config.schema.enumDescriptions?.[index];
				const ariaDescriptionParts = [isDefault ? defaultLabel : undefined, enumDescription].filter((part): part is string => !!part);
				const checked = config.value === value;
				items.push({
					item: {
						id: `${group}.${value}`,
						enabled: true,
						checked,
						class: undefined,
						tooltip: enumDescription ?? '',
						label: displayLabel,
						run: () => {
							logChange(value, previousValue);
							return configurationAccess.setModelConfiguration(modelIdentifier, { [config.key]: value });
						}
					},
					kind: ActionListItemKind.Action,
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
			'navigation',
			localize('chat.effort.header', "Thinking Effort"),
			(value, enumLabel) => enumLabel ?? String(value),
			(value, previousValue) => this._telemetryService.publicLog2<ChatThinkingEffortChangeEvent, ChatThinkingEffortChangeClassification>('chat.thinkingEffortChange', {
				model: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(modelIdentifier) : 'unknown',
				fromValue: previousValue,
				toValue: String(value),
			}),
		);
		appendConfigSection(
			'tokens',
			localize('chat.tokens.header', "Context Size"),
			(value, enumLabel) => enumLabel ?? formatTokenCount(Number(value)),
			(value, previousValue) => this._telemetryService.publicLog2<ChatContextSizeChangeEvent, ChatContextSizeChangeClassification>('chat.contextSizeChange', {
				model: model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(modelIdentifier) : 'unknown',
				fromValue: previousValue,
				toValue: String(value),
			}),
		);

		return items;
	}
}
