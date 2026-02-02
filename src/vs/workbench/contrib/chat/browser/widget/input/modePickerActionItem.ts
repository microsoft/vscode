/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../base/browser/dom.js';
import { renderLabelWithIcons } from '../../../../../../base/browser/ui/iconLabel/iconLabels.js';
import { IAction } from '../../../../../../base/common/actions.js';
import { coalesce } from '../../../../../../base/common/arrays.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { groupBy } from '../../../../../../base/common/collections.js';
import { IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable } from '../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../base/common/themables.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { getFlatActionBarActions } from '../../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, MenuId, MenuItemAction } from '../../../../../../platform/actions/common/actions.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionWidgetDropdownAction, IActionWidgetDropdownActionProvider, IActionWidgetDropdownOptions } from '../../../../../../platform/actionWidget/browser/actionWidgetDropdown.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatMode, IChatMode, IChatModeService } from '../../../common/chatModes.js';
import { isOrganizationPromptFile } from '../../../common/promptSyntax/utils/promptsServiceUtils.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { PromptsStorage } from '../../../common/promptSyntax/service/promptsService.js';
import { getOpenChatActionIdForMode } from '../../actions/chatActions.js';
import { IToggleChatModeArgs, ToggleAgentModeActionId } from '../../actions/chatExecuteActions.js';
import { ChatInputPickerActionViewItem, IChatInputPickerOptions } from './chatInputPickerActionItem.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';

export interface IModePickerDelegate {
	readonly currentMode: IObservable<IChatMode>;
	readonly sessionResource: () => URI | undefined;
	/**
	 * When set, the mode picker will show custom agents whose target matches this value.
	 * Custom agents without a target are always shown in all session types. If no agents match the target, shows a default "Agent" option.
	 */
	readonly customAgentTarget?: () => string | undefined;
}

// TODO: there should be an icon contributed for built-in modes
const builtinDefaultIcon = Codicon.tasklist;

export class ModePickerActionItem extends ChatInputPickerActionViewItem {
	constructor(
		action: MenuItemAction,
		private readonly delegate: IModePickerDelegate,
		pickerOptions: IChatInputPickerOptions,
		@IActionWidgetService actionWidgetService: IActionWidgetService,
		@IChatAgentService chatAgentService: IChatAgentService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IChatModeService chatModeService: IChatModeService,
		@IMenuService private readonly menuService: IMenuService,
		@ICommandService commandService: ICommandService,
		@IProductService private readonly _productService: IProductService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IOpenerService openerService: IOpenerService
	) {
		// Get custom agent target (if filtering is enabled)
		const customAgentTarget = delegate.customAgentTarget?.();

		// Category definitions
		const builtInCategory = { label: localize('built-in', "Built-In"), order: 0 };
		const customCategory = { label: localize('custom', "Custom"), order: 1 };
		const policyDisabledCategory = { label: localize('managedByOrganization', "Managed by your organization"), order: 999, showHeader: true };

		const agentModeDisabledViaPolicy = configurationService.inspect<boolean>(ChatConfiguration.AgentEnabled).policyValue === false;

		const makeAction = (mode: IChatMode, currentMode: IChatMode): IActionWidgetDropdownAction => {
			const isDisabledViaPolicy =
				mode.kind === ChatModeKind.Agent &&
				agentModeDisabledViaPolicy;

			const tooltip = chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip;

			// Add toolbar actions for Agent modes
			const toolbarActions: IAction[] = [];
			if (mode.kind === ChatModeKind.Agent && !isDisabledViaPolicy) {
				if (mode.uri) {
					let label, icon, id;
					if (mode.source?.storage === PromptsStorage.extension) {
						icon = Codicon.eye;
						id = `viewAgent:${mode.id}`;
						label = localize('viewModeConfiguration', "View {0} agent", mode.label.get());
					} else {
						icon = Codicon.edit;
						id = `editAgent:${mode.id}`;
						label = localize('editModeConfiguration', "Edit {0} agent", mode.label.get());
					}

					const modeResource = mode.uri;
					toolbarActions.push({
						id,
						label,
						tooltip: label,
						class: ThemeIcon.asClassName(icon),
						enabled: true,
						run: async () => {
							openerService.open(modeResource.get());
						}
					});
				} else if (!customAgentTarget) {
					const label = localize('configureToolsFor', "Configure tools for {0} agent", mode.label.get());
					toolbarActions.push({
						id: `configureTools:${mode.id}`,
						label,
						tooltip: label,
						class: ThemeIcon.asClassName(Codicon.tools),
						enabled: true,
						run: async () => {
							// Hide the picker before opening the tools configuration
							actionWidgetService.hide();
							// First switch to the mode if not already selected
							if (currentMode.id !== mode.id) {
								await commandService.executeCommand(
									ToggleAgentModeActionId,
									{ modeId: mode.id, sessionResource: this.delegate.sessionResource() } satisfies IToggleChatModeArgs
								);
							}
							// Then open the tools picker
							await commandService.executeCommand('workbench.action.chat.configureTools', pickerOptions.actionContext, { source: 'modePicker' });
						}
					});
				}
			}

			return {
				...action,
				id: getOpenChatActionIdForMode(mode),
				label: mode.label.get(),
				icon: isDisabledViaPolicy ? ThemeIcon.fromId(Codicon.lock.id) : mode.icon.get(),
				class: isDisabledViaPolicy ? 'disabled-by-policy' : undefined,
				enabled: !isDisabledViaPolicy,
				checked: !isDisabledViaPolicy && currentMode.id === mode.id,
				tooltip: '',
				hover: { content: tooltip, position: this.pickerOptions.hoverPosition },
				toolbarActions,
				run: async () => {
					if (isDisabledViaPolicy) {
						return; // Block interaction if disabled by policy
					}
					const result = await commandService.executeCommand(
						ToggleAgentModeActionId,
						{ modeId: mode.id, sessionResource: this.delegate.sessionResource() } satisfies IToggleChatModeArgs
					);
					if (this.element) {
						this.renderLabel(this.element);
					}
					return result;
				},
				category: isDisabledViaPolicy ? policyDisabledCategory : builtInCategory
			};
		};

		const makeActionFromCustomMode = (mode: IChatMode, currentMode: IChatMode): IActionWidgetDropdownAction => {
			return {
				...makeAction(mode, currentMode),
				tooltip: '',
				hover: { content: mode.description.get() ?? chatAgentService.getDefaultAgent(ChatAgentLocation.Chat, mode.kind)?.description ?? action.tooltip, position: this.pickerOptions.hoverPosition },
				icon: mode.icon.get() ?? (isModeConsideredBuiltIn(mode, this._productService) ? builtinDefaultIcon : undefined),
				category: agentModeDisabledViaPolicy ? policyDisabledCategory : customCategory
			};
		};

		const isUserDefinedCustomAgent = (mode: IChatMode): boolean => {
			if (mode.isBuiltin || !mode.source) {
				return false;
			}
			return mode.source.storage === PromptsStorage.local || mode.source.storage === PromptsStorage.user;
		};

		const actionProviderWithCustomAgentTarget: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const modes = chatModeService.getModes();
				const currentMode = delegate.currentMode.get();
				const filteredCustomModes = modes.custom.filter(mode => {
					const target = mode.target?.get();
					return isUserDefinedCustomAgent(mode) && (!target || target === customAgentTarget);
				});
				// Always include the default "Agent" option first
				const checked = currentMode.id === ChatMode.Agent.id;
				const defaultAction = { ...makeAction(ChatMode.Agent, ChatMode.Agent), checked };

				// Add filtered custom modes
				const customActions = filteredCustomModes.map(mode => makeActionFromCustomMode(mode, currentMode));
				return [defaultAction, ...customActions];
			}
		};

		const actionProvider: IActionWidgetDropdownActionProvider = {
			getActions: () => {
				const modes = chatModeService.getModes();
				const currentMode = delegate.currentMode.get();
				const agentMode = modes.builtin.find(mode => mode.id === ChatMode.Agent.id);

				const shouldHideEditMode = configurationService.getValue<boolean>(ChatConfiguration.EditModeHidden) && chatAgentService.hasToolsAgent && currentMode.id !== ChatMode.Edit.id;

				const otherBuiltinModes = modes.builtin.filter(mode => mode.id !== ChatMode.Agent.id && !(shouldHideEditMode && mode.id === ChatMode.Edit.id));
				// Filter out 'implement' mode from the dropdown - it's available for handoffs but not user-selectable
				const customModes = groupBy(
					modes.custom,
					mode => isModeConsideredBuiltIn(mode, this._productService) ? 'builtin' : 'custom');

				const customBuiltinModeActions = customModes.builtin?.map(mode => {
					const action = makeActionFromCustomMode(mode, currentMode);
					action.category = agentModeDisabledViaPolicy ? policyDisabledCategory : builtInCategory;
					return action;
				}) ?? [];
				customBuiltinModeActions.sort((a, b) => a.label.localeCompare(b.label));

				const customModeActions = customModes.custom?.map(mode => makeActionFromCustomMode(mode, currentMode)) ?? [];
				customModeActions.sort((a, b) => a.label.localeCompare(b.label));

				const orderedModes = coalesce([
					agentMode && makeAction(agentMode, currentMode),
					...otherBuiltinModes.map(mode => mode && makeAction(mode, currentMode)),
					...customBuiltinModeActions,
					...customModeActions
				]);
				return orderedModes;
			}
		};

		const modePickerActionWidgetOptions: Omit<IActionWidgetDropdownOptions, 'label' | 'labelRenderer'> = {
			actionProvider: customAgentTarget ? actionProviderWithCustomAgentTarget : actionProvider,
			actionBarActionProvider: {
				getActions: () => this.getModePickerActionBarActions()
			},
			showItemKeybindings: true,
			reporter: { id: 'ChatModePicker', name: 'ChatModePicker', includeOptions: true },
		};

		super(action, modePickerActionWidgetOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);

		// Listen to changes in the current mode and its properties
		this._register(autorun(reader => {
			this.delegate.currentMode.read(reader).label.read(reader); // use the reader so autorun tracks it
			if (this.element) {
				this.renderLabel(this.element);
			}
		}));
	}

	private getModePickerActionBarActions(): IAction[] {
		const menuActions = this.menuService.createMenu(MenuId.ChatModePicker, this.contextKeyService);
		const menuContributions = getFlatActionBarActions(menuActions.getActions({ renderShortTitle: true }));
		menuActions.dispose();

		return menuContributions;
	}

	protected override renderLabel(element: HTMLElement): IDisposable | null {
		this.setAriaLabelAttributes(element);

		const currentMode = this.delegate.currentMode.get();
		const isDefault = currentMode.id === ChatMode.Agent.id;
		const state = currentMode.label.get();
		let icon = currentMode.icon.get();

		// Every built-in mode should have an icon. // TODO: this should be provided by the mode itself
		if (!icon && isModeConsideredBuiltIn(currentMode, this._productService)) {
			icon = builtinDefaultIcon;
		}

		const labelElements = [];
		if (icon) {
			labelElements.push(...renderLabelWithIcons(`$(${icon.id})`));
		}
		if (!isDefault || !icon || !this.pickerOptions.onlyShowIconsForDefaultActions.get()) {
			labelElements.push(dom.$('span.chat-input-picker-label', undefined, state));
		}
		labelElements.push(...renderLabelWithIcons(`$(chevron-down)`));

		dom.reset(element, ...labelElements);
		return null;
	}
}

/**
 * Returns true if the mode is the built-in 'implement' mode from the chat extension.
 * This mode is hidden from the mode picker but available for handoffs.
 */
export function isBuiltinImplementMode(mode: IChatMode, productService: IProductService): boolean {
	if (mode.name.get().toLowerCase() !== 'implement') {
		return false;
	}
	if (mode.source?.storage !== PromptsStorage.extension) {
		return false;
	}
	const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
	return !!chatExtensionId && mode.source.extensionId.value === chatExtensionId;
}

function isModeConsideredBuiltIn(mode: IChatMode, productService: IProductService): boolean {
	if (mode.isBuiltin) {
		return true;
	}
	// Not built-in if not from the built-in chat extension
	if (mode.source?.storage !== PromptsStorage.extension) {
		return false;
	}
	const chatExtensionId = productService.defaultChatAgent?.chatExtensionId;
	if (!chatExtensionId || mode.source.extensionId.value !== chatExtensionId) {
		return false;
	}
	// Organization-provided agents (under /github/ path) are also not considered built-in
	const modeUri = mode.uri?.get();
	if (!modeUri) {
		// If somehow there is no URI, but it's from the built-in chat extension, consider it built-in
		return true;
	}
	return !isOrganizationPromptFile(modeUri, mode.source.extensionId, productService);
}
