/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { localize } from '../../../../../../nls.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { ChatConfiguration, ChatPermissionLevel } from '../../../common/constants.js';
import { MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../../../base/common/severity.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { URI } from '../../../../../../base/common/uri.js';

// Track whether warnings have been shown this VS Code session
const shownWarnings = new Set<ChatPermissionLevel>();

function hasShownElevatedWarning(level: ChatPermissionLevel): boolean {
	if (shownWarnings.has(level)) {
		return true;
	}
	// Autopilot is stricter than AutoApprove, so confirming Autopilot
	// implies the user already accepted the AutoApprove risks.
	if (level === ChatPermissionLevel.AutoApprove && shownWarnings.has(ChatPermissionLevel.Autopilot)) {
		return true;
	}
	return false;
}

export interface IPermissionPickerDelegate {
	readonly currentPermissionLevel: IObservable<ChatPermissionLevel>;
	readonly setPermissionLevel: (level: ChatPermissionLevel) => void;
}

export class PermissionPickerActionItem extends ChatInputPickerActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly delegate: IPermissionPickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService openerService: IOpenerService,
	) {
		const isAutoApprovePolicyRestricted = () => configurationService.inspect<boolean>(ChatConfiguration.GlobalAutoApprove).policyValue === false;
		const isAutopilotEnabled = () => configurationService.getValue<boolean>(ChatConfiguration.AutopilotEnabled) !== false;
		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const currentLevel = delegate.currentPermissionLevel.get();
				const policyRestricted = isAutoApprovePolicyRestricted();
				const actions: IActionWidgetDropdownAction[] = [
					{
						...action,
						id: 'chat.permissions.default',
						label: localize('permissions.default', "Default Approvals"),
						description: localize('permissions.default.subtext', "Copilot uses your configured settings"),
						icon: ThemeIcon.fromId(Codicon.shield.id),
						checked: currentLevel === ChatPermissionLevel.Default,
						tooltip: '',
						hover: {
							content: localize('permissions.default.description', "Use configured approval settings"),
							position: pickerOptions.hoverPosition
						},
						run: async () => {
							delegate.setPermissionLevel(ChatPermissionLevel.Default);
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					} satisfies IActionWidgetDropdownAction,
					{
						...action,
						id: 'chat.permissions.autoApprove',
						label: localize('permissions.autoApprove', "Bypass Approvals"),
						description: localize('permissions.autoApprove.subtext', "All tool calls are auto-approved"),
						icon: ThemeIcon.fromId(Codicon.warning.id),
						checked: currentLevel === ChatPermissionLevel.AutoApprove,
						enabled: !policyRestricted,
						tooltip: policyRestricted ? localize('permissions.autoApprove.policyDisabled', "Disabled by enterprise policy") : '',
						hover: {
							content: policyRestricted
								? localize('permissions.autoApprove.policyDescription', "Disabled by enterprise policy")
								: localize('permissions.autoApprove.description', "Auto-approve all tool calls and retry on errors"),
							position: pickerOptions.hoverPosition
						},
						run: async () => {
							if (!hasShownElevatedWarning(ChatPermissionLevel.AutoApprove)) {
								const result = await this.dialogService.prompt({
									type: Severity.Warning,
									message: localize('permissions.autoApprove.warning.title', "Enable Bypass Approvals?"),
									buttons: [
										{
											label: localize('permissions.autoApprove.warning.confirm', "Enable"),
											run: () => true
										},
										{
											label: localize('permissions.autoApprove.warning.cancel', "Cancel"),
											run: () => false
										},
									],
									custom: {
										icon: Codicon.warning,
										markdownDetails: [{
											markdown: new MarkdownString(localize('permissions.autoApprove.warning.detail', "Bypass Approvals will auto-approve all tool calls without asking for confirmation. This includes file edits, terminal commands, and external tool calls.")),
										}],
									},
								});
								if (result.result !== true) {
									return;
								}
								shownWarnings.add(ChatPermissionLevel.AutoApprove);
							}
							delegate.setPermissionLevel(ChatPermissionLevel.AutoApprove);
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					} satisfies IActionWidgetDropdownAction,
				];
				if (isAutopilotEnabled()) {
					actions.push({
						...action,
						id: 'chat.permissions.autopilot',
						label: localize('permissions.autopilot', "Autopilot (Preview)"),
						description: localize('permissions.autopilot.subtext', "Autonomously iterates from start to finish"),
						icon: ThemeIcon.fromId(Codicon.rocket.id),
						checked: currentLevel === ChatPermissionLevel.Autopilot,
						enabled: !policyRestricted,
						tooltip: policyRestricted ? localize('permissions.autopilot.policyDisabled', "Disabled by enterprise policy") : '',
						hover: {
							content: policyRestricted
								? localize('permissions.autopilot.policyDescription', "Disabled by enterprise policy")
								: localize('permissions.autopilot.description', "Auto-approve all tool calls and continue until the task is done"),
							position: pickerOptions.hoverPosition
						},
						run: async () => {
							if (!hasShownElevatedWarning(ChatPermissionLevel.Autopilot)) {
								const result = await this.dialogService.prompt({
									type: Severity.Warning,
									message: localize('permissions.autopilot.warning.title', "Enable Autopilot?"),
									buttons: [
										{
											label: localize('permissions.autopilot.warning.confirm', "Enable"),
											run: () => true
										},
										{
											label: localize('permissions.autopilot.warning.cancel', "Cancel"),
											run: () => false
										},
									],
									custom: {
										icon: Codicon.rocket,
										markdownDetails: [{
											markdown: new MarkdownString(localize('permissions.autopilot.warning.detail', "Autopilot will auto-approve all tool calls and continue working autonomously until the task is complete. This includes terminal commands, file edits, and external tool calls. The agent will make decisions on your behalf without asking for confirmation.\n\nYou can stop the agent at any time by clicking the stop button. This applies to the current session only.")),
										}],
									},
								});
								if (result.result !== true) {
									return;
								}
								shownWarnings.add(ChatPermissionLevel.Autopilot);
							}
							delegate.setPermissionLevel(ChatPermissionLevel.Autopilot);
							if (this.element) {
								this.renderLabel(this.element);
							}
						},
					} satisfies IActionWidgetDropdownAction);
				}
				return actions;
			}
		};

		super(action, {
			actionProvider,
			actionBarActions: [{
				id: 'chat.permissions.learnMore',
				label: localize('permissions.learnMore', "Learn More about Permissions"),
				tooltip: localize('permissions.learnMore', "Learn More about Permissions"),
				class: undefined,
				enabled: true,
				run: async () => {
					await openerService.open(URI.parse('https://code.visualstudio.com/docs/copilot/agents/agent-tools#_permission-levels'));
				}
			}],
			reporter: { id: 'ChatPermissionPicker', name: 'ChatPermissionPicker', includeOptions: true },
			listOptions: { descriptionBelow: true, minWidth: 255 },
		}, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);

		const level = this.delegate.currentPermissionLevel.get();
		let icon: ThemeIcon;
		let label: string;
		switch (level) {
			case ChatPermissionLevel.Autopilot:
				icon = Codicon.rocket;
				label = localize('permissions.autopilot.label', "Autopilot (Preview)");
				break;
			case ChatPermissionLevel.AutoApprove:
				icon = Codicon.warning;
				label = localize('permissions.autoApprove.label', "Bypass Approvals");
				break;
			default:
				icon = Codicon.shield;
				label = localize('permissions.default.label', "Default Approvals");
				break;
		}

		const labelElements = [];
		labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
		labelElements.push(dom.$('span.chat-input-picker-label', undefined, label));
		labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...labelElements);
		element.classList.toggle('warning', level === ChatPermissionLevel.Autopilot);
		element.classList.toggle('info', level === ChatPermissionLevel.AutoApprove);
		return null;
	}

	public refresh(): void {
		if (this.element) {
			this.renderLabel(this.element);
		}
	}
}
