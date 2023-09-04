/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { ICommandQuickPick, CommandsHistory } from 'vs/platform/quickinput/browser/commandsQuickAccess';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction, Action2 } from 'vs/platform/actions/common/actions';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { CancellationToken } from 'vs/base/common/cancellation';
import { raceTimeout, timeout } from 'vs/base/common/async';
import { AbstractEditorCommandsQuickAccessProvider } from 'vs/editor/contrib/quickAccess/browser/commandsQuickAccess';
import { IEditor } from 'vs/editor/common/editorCommon';
import { Language } from 'vs/base/common/platform';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { DefaultQuickAccessFilterValue } from 'vs/platform/quickinput/common/quickAccess';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkbenchQuickAccessConfiguration } from 'vs/workbench/browser/quickaccess';
import { Codicon } from 'vs/base/common/codicons';
import { ThemeIcon } from 'vs/base/common/themables';
import { IQuickInputService, IQuickPickSeparator } from 'vs/platform/quickinput/common/quickInput';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { TriggerAction } from 'vs/platform/quickinput/browser/pickerQuickAccess';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { stripIcons } from 'vs/base/common/iconLabels';
import { isFirefox } from 'vs/base/browser/browser';
import { IProductService } from 'vs/platform/product/common/productService';
import { IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ASK_QUICK_QUESTION_ACTION_ID } from 'vs/workbench/contrib/chat/browser/actions/chatQuickInputActions';
import { CommandInformationResult, IAiRelatedInformationService, RelatedInformationType } from 'vs/workbench/services/aiRelatedInformation/common/aiRelatedInformation';

export class CommandsQuickAccessProvider extends AbstractEditorCommandsQuickAccessProvider {

	private static AI_RELATED_INFORMATION_MAX_PICKS = 3;
	private static AI_RELATED_INFORMATION_THRESHOLD = 0.8;
	private static AI_RELATED_INFORMATION_DEBOUNCE = 200;

	// If extensions are not yet registered, we wait for a little moment to give them
	// a chance to register so that the complete set of commands shows up as result
	// We do not want to delay functionality beyond that time though to keep the commands
	// functional.
	private readonly extensionRegistrationRace = raceTimeout(this.extensionService.whenInstalledExtensionsRegistered(), 800);

	private useAiRelatedInfo = false;

	protected get activeTextEditorControl(): IEditor | undefined { return this.editorService.activeTextEditorControl; }

	get defaultFilterValue(): DefaultQuickAccessFilterValue | undefined {
		if (this.configuration.preserveInput) {
			return DefaultQuickAccessFilterValue.LAST;
		}

		return undefined;
	}

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IMenuService private readonly menuService: IMenuService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IDialogService dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IProductService private readonly productService: IProductService,
		@IAiRelatedInformationService private readonly aiRelatedInformationService: IAiRelatedInformationService,
		@IChatService private readonly chatService: IChatService
	) {
		super({
			showAlias: !Language.isDefaultVariant(),
			noResultsPick: () => ({
				label: localize('noCommandResults', "No matching commands"),
				commandId: ''
			}),
		}, instantiationService, keybindingService, commandService, telemetryService, dialogService);

		this._register(configurationService.onDidChangeConfiguration((e) => this.updateOptions(e)));
		this.updateOptions();
	}

	private get configuration() {
		const commandPaletteConfig = this.configurationService.getValue<IWorkbenchQuickAccessConfiguration>().workbench.commandPalette;

		return {
			preserveInput: commandPaletteConfig.preserveInput,
			experimental: commandPaletteConfig.experimental
		};
	}

	private updateOptions(e?: IConfigurationChangeEvent): void {
		if (e && !e.affectsConfiguration('workbench.commandPalette.experimental')) {
			return;
		}

		const config = this.configuration;
		const suggestedCommandIds = config.experimental.suggestCommands && this.productService.commandPaletteSuggestedCommandIds?.length
			? new Set(this.productService.commandPaletteSuggestedCommandIds)
			: undefined;
		this.options.suggestedCommandIds = suggestedCommandIds;
		this.useAiRelatedInfo = config.experimental.enableNaturalLanguageSearch;
	}

	protected async getCommandPicks(token: CancellationToken): Promise<Array<ICommandQuickPick>> {

		// wait for extensions registration or 800ms once
		await this.extensionRegistrationRace;

		if (token.isCancellationRequested) {
			return [];
		}

		return [
			...this.getCodeEditorCommandPicks(),
			...this.getGlobalCommandPicks()
		].map(picks => ({
			...picks,
			buttons: [{
				iconClass: ThemeIcon.asClassName(Codicon.gear),
				tooltip: localize('configure keybinding', "Configure Keybinding"),
			}],
			trigger: (): TriggerAction => {
				this.preferencesService.openGlobalKeybindingSettings(false, { query: `@command:${picks.commandId}` });
				return TriggerAction.CLOSE_PICKER;
			},
		}));
	}

	protected hasAdditionalCommandPicks(filter: string, token: CancellationToken): boolean {
		if (
			!this.useAiRelatedInfo
			|| token.isCancellationRequested
			|| filter === ''
			|| !this.aiRelatedInformationService.isEnabled()
		) {
			return false;
		}

		return true;
	}

	protected async getAdditionalCommandPicks(allPicks: ICommandQuickPick[], picksSoFar: ICommandQuickPick[], filter: string, token: CancellationToken): Promise<Array<ICommandQuickPick | IQuickPickSeparator>> {
		if (!this.hasAdditionalCommandPicks(filter, token)) {
			return [];
		}

		let additionalPicks;

		try {
			// Wait a bit to see if the user is still typing
			await timeout(CommandsQuickAccessProvider.AI_RELATED_INFORMATION_DEBOUNCE, token);
			additionalPicks = await this.getRelatedInformationPicks(allPicks, picksSoFar, filter, token);
		} catch (e) {
			return [];
		}

		if (additionalPicks.length) {
			additionalPicks.unshift({
				type: 'separator',
				label: localize('similarCommands', "similar commands")
			});
		}

		if (picksSoFar.length || additionalPicks.length) {
			additionalPicks.push({
				type: 'separator'
			});
		}

		const info = this.chatService.getProviderInfos()[0];
		if (info) {
			additionalPicks.push({
				label: localize('askXInChat', "Ask {0}: {1}", info.displayName, filter),
				commandId: ASK_QUICK_QUESTION_ACTION_ID,
				args: [filter]
			});
		}

		return additionalPicks;
	}

	private async getRelatedInformationPicks(allPicks: ICommandQuickPick[], picksSoFar: ICommandQuickPick[], filter: string, token: CancellationToken) {
		const relatedInformation = await this.aiRelatedInformationService.getRelatedInformation(
			filter,
			[RelatedInformationType.CommandInformation],
			token
		) as CommandInformationResult[];

		// Sort by weight descending to get the most relevant results first
		relatedInformation.sort((a, b) => b.weight - a.weight);

		const setOfPicksSoFar = new Set(picksSoFar.map(p => p.commandId));
		const additionalPicks = new Array<ICommandQuickPick | IQuickPickSeparator>();

		for (const info of relatedInformation) {
			if (info.weight < CommandsQuickAccessProvider.AI_RELATED_INFORMATION_THRESHOLD || additionalPicks.length === CommandsQuickAccessProvider.AI_RELATED_INFORMATION_MAX_PICKS) {
				break;
			}
			const pick = allPicks.find(p => p.commandId === info.command && !setOfPicksSoFar.has(p.commandId));
			if (pick) {
				additionalPicks.push(pick);
			}
		}

		return additionalPicks;
	}

	private getGlobalCommandPicks(): ICommandQuickPick[] {
		const globalCommandPicks: ICommandQuickPick[] = [];
		const scopedContextKeyService = this.editorService.activeEditorPane?.scopedContextKeyService || this.editorGroupService.activeGroup.scopedContextKeyService;
		const globalCommandsMenu = this.menuService.createMenu(MenuId.CommandPalette, scopedContextKeyService);
		const globalCommandsMenuActions = globalCommandsMenu.getActions()
			.reduce((r, [, actions]) => [...r, ...actions], <Array<MenuItemAction | SubmenuItemAction | string>>[])
			.filter(action => action instanceof MenuItemAction && action.enabled) as MenuItemAction[];

		for (const action of globalCommandsMenuActions) {

			// Label
			let label = (typeof action.item.title === 'string' ? action.item.title : action.item.title.value) || action.item.id;

			// Category
			const category = typeof action.item.category === 'string' ? action.item.category : action.item.category?.value;
			if (category) {
				label = localize('commandWithCategory', "{0}: {1}", category, label);
			}

			// Alias
			const aliasLabel = typeof action.item.title !== 'string' ? action.item.title.original : undefined;
			const aliasCategory = (category && action.item.category && typeof action.item.category !== 'string') ? action.item.category.original : undefined;
			const commandAlias = (aliasLabel && category) ?
				aliasCategory ? `${aliasCategory}: ${aliasLabel}` : `${category}: ${aliasLabel}` :
				aliasLabel;

			globalCommandPicks.push({
				commandId: action.item.id,
				commandAlias,
				label: stripIcons(label)
			});
		}

		// Cleanup
		globalCommandsMenu.dispose();

		return globalCommandPicks;
	}
}

//#region Actions

export class ShowAllCommandsAction extends Action2 {

	static readonly ID = 'workbench.action.showCommands';

	constructor() {
		super({
			id: ShowAllCommandsAction.ID,
			title: { value: localize('showTriggerActions', "Show All Commands"), original: 'Show All Commands' },
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: undefined,
				primary: !isFirefox ? (KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP) : undefined,
				secondary: [KeyCode.F1]
			},
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		accessor.get(IQuickInputService).quickAccess.show(CommandsQuickAccessProvider.PREFIX);
	}
}

export class ClearCommandHistoryAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.clearCommandHistory',
			title: { value: localize('clearCommandHistory', "Clear Command History"), original: 'Clear Command History' },
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const storageService = accessor.get(IStorageService);
		const dialogService = accessor.get(IDialogService);

		const commandHistoryLength = CommandsHistory.getConfiguredCommandHistoryLength(configurationService);
		if (commandHistoryLength > 0) {

			// Ask for confirmation
			const { confirmed } = await dialogService.confirm({
				type: 'warning',
				message: localize('confirmClearMessage', "Do you want to clear the history of recently used commands?"),
				detail: localize('confirmClearDetail', "This action is irreversible!"),
				primaryButton: localize({ key: 'clearButtonLabel', comment: ['&& denotes a mnemonic'] }, "&&Clear")
			});

			if (!confirmed) {
				return;
			}

			CommandsHistory.clearHistory(configurationService, storageService);
		}
	}
}

//#endregion
