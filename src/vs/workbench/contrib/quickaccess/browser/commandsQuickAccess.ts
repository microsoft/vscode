/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { localize } from 'vs/nls';
import { ICommandQuickPick, CommandsHistory } from 'vs/platform/quickinput/browser/commandsQuickAccess';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IMenuService, MenuId, MenuItemAction, SubmenuItemAction, Action2, registerAction2 } from 'vs/platform/actions/common/actions';
// import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
// import { timeout } from 'vs/base/common/async';
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
import { ISemanticSimilarityService } from 'vs/workbench/services/semanticSimilarity/common/semanticSimilarityService';
import { timeout } from 'vs/base/common/async';
import { IInteractiveSessionService } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionService';
import { InteractiveListItemRenderer } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionListRenderer';
import { InteractiveSessionEditorOptions } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionOptions';
import { editorBackground } from 'vs/platform/theme/common/colorRegistry';
import { InteractiveSessionViewModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionViewModel';
import { IInteractiveSessionModel, InteractiveSessionModel } from 'vs/workbench/contrib/interactiveSession/common/interactiveSessionModel';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';

export class CommandsQuickAccessProvider extends AbstractEditorCommandsQuickAccessProvider {
	private static SEMANTIC_SIMILARITY_MAX_PICKS = 3;
	private static SEMANTIC_SIMILARITY_THRESHOLD = 0.8;

	// TODO: bring this back once we have a chosen strategy for FastAndSlowPicks where Fast is also Promise based
	// If extensions are not yet registered, we wait for a little moment to give them
	// a chance to register so that the complete set of commands shows up as result
	// We do not want to delay functionality beyond that time though to keep the commands
	// functional.
	// private readonly extensionRegistrationRace = Promise.race([
	// 	timeout(800),
	// 	this.extensionService.whenInstalledExtensionsRegistered()
	// ]);

	private useSemanticSimilarity = false;

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
		// @IExtensionService private readonly extensionService: IExtensionService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@ICommandService commandService: ICommandService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IDialogService dialogService: IDialogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IProductService private readonly productService: IProductService,
		@ISemanticSimilarityService private readonly semanticSimilarityService: ISemanticSimilarityService,
	) {
		super({
			showAlias: !Language.isDefaultVariant(),
			noResultsPick: {
				label: localize('noCommandResults', "No matching commands"),
				commandId: ''
			},
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
		this.useSemanticSimilarity = config.experimental.useSemanticSimilarity;
	}

	protected getCommandPicks(token: CancellationToken): Array<ICommandQuickPick> {

		// TODO: bring this back once we have a chosen strategy for FastAndSlowPicks where Fast is also Promise based
		// wait for extensions registration or 800ms once
		// await this.extensionRegistrationRace;

		if (token.isCancellationRequested) {
			return [];
		}

		return [
			...this.getCodeEditorCommandPicks(),
			...this.getGlobalCommandPicks()
		].map(c => ({
			...c,
			buttons: [{
				iconClass: ThemeIcon.asClassName(Codicon.gear),
				tooltip: localize('configure keybinding', "Configure Keybinding"),
			}],
			trigger: (): TriggerAction => {
				this.preferencesService.openGlobalKeybindingSettings(false, { query: `@command:${c.commandId}` });
				return TriggerAction.CLOSE_PICKER;
			},
		}));
	}

	protected async getAdditionalCommandPicks(allPicks: ICommandQuickPick[], picksSoFar: ICommandQuickPick[], filter: string, token: CancellationToken): Promise<Array<ICommandQuickPick | IQuickPickSeparator>> {
		if (!this.useSemanticSimilarity || filter === '' || token.isCancellationRequested || !this.semanticSimilarityService.isEnabled()) {
			return [];
		}
		const format = allPicks.map(p => p.commandId);
		let scores: number[];
		try {
			await timeout(800, token);
			scores = await this.semanticSimilarityService.getSimilarityScore(filter, format, token);
		} catch (e) {
			return [];
		}
		const sortedIndices = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
		const setOfPicksSoFar = new Set(picksSoFar.map(p => p.commandId));
		const additionalPicks: Array<ICommandQuickPick | IQuickPickSeparator> = picksSoFar.length && sortedIndices.length
			? [{
				type: 'separator',
				label: localize('semanticSimilarity', "similar commands")
			}]
			: [];

		let numOfSmartPicks = 0;
		for (const i of sortedIndices) {
			const score = scores[i];
			if (score < CommandsQuickAccessProvider.SEMANTIC_SIMILARITY_THRESHOLD || numOfSmartPicks === CommandsQuickAccessProvider.SEMANTIC_SIMILARITY_MAX_PICKS) {
				break;
			}
			const pick = allPicks[i];
			if (!setOfPicksSoFar.has(pick.commandId)) {
				additionalPicks.push(pick);
				numOfSmartPicks++;
			}
		}

		return additionalPicks.length ? additionalPicks : [
			{
				label: localize('askInChat', "Ask '{0}' in chat...", filter),
				commandId: 'workbench.action.quickOpenAsk',
				accept: (keyMods, event) => {
					this.commandService.executeCommand('workbench.action.quickOpenAsk', filter);
				}
			}
		];
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

export class AskMeAction extends Action2 {

	private _previousModel: InteractiveSessionModel | undefined;
	private _previousQuery: string | undefined;
	private _currentTimer: NodeJS.Timeout | undefined;

	constructor() {
		super({
			id: 'workbench.action.quickOpenAsk',
			title: { value: localize('askme', "Ask Me"), original: 'Ask Me' },
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				mac: {
					primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyI
				},
			}
		});
	}

	async run(accessor: ServicesAccessor, query: string): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const interactiveSessionService = accessor.get(IInteractiveSessionService);
		const instantiationService = accessor.get(IInstantiationService);

		clearTimeout(this._currentTimer);
		this._currentTimer = undefined;

		if (query) {
			this._previousModel = undefined;
		}

		const cts = new CancellationTokenSource();
		const model = this._previousModel ?? interactiveSessionService.startSession('copilot', false, cts.token);
		if (!model) {
			return;
		}

		const containerList = dom.$('.interactive-list');
		const containerSession = dom.$('.interactive-session', undefined, containerList);
		containerList.style.position = 'relative';

		const input = quickInputService.createQuickPick();
		input.ignoreFocusOut = true;
		input.description = containerSession;
		input.title = localize('askabot', "Ask Copilot");
		input.placeholder = localize('askabot', "Ask Copilot");
		input.items = [{
			type: 'separator',
			label: localize('askabotasdf', "commands"),
		},
		{
			label: localize('askabotsdfsdf', "Sort Lines"),
		},
		{
			label: localize('askabotsdfsdasdff', "Download everything"),
		},
		];
		input.onDidChangeValue(() => {
			input.activeItems = [];
		});
		input.activeItems = [];
		input.matchOnLabel = false;
		input.buttons = [{
			iconClass: ThemeIcon.asClassName(Codicon.commentDiscussion),
			tooltip: localize('cancel', "Go to chat"),
		}];
		// input.onDidTriggerButton(() => {
		// 	interactiveSessionService.addCompleteRequest(input.value, )
		// });
		input.onDidHide(() => {
			disposables.dispose();
			this._currentTimer = setTimeout(() => {
				this._previousModel?.dispose();
				this._previousModel = undefined;
				this._previousQuery = undefined;
			}, 1000 * 10); // 10 seconds
		});
		input.show();

		let disposables = this.createSession(containerList, containerList.offsetWidth, model, instantiationService);
		input.onDidAccept(async () => {
			disposables.dispose();
			// model?.dispose();
			// model = interactiveSessionService.startSession('copilot', false, cts.token);
			// if (!model) {
			// 	return;
			// }
			this._previousQuery = input.value;
			this._previousModel = model;
			disposables = this.createSession(containerList, containerList.offsetWidth, model, instantiationService);
			await interactiveSessionService.sendRequest(model.sessionId, input.value);
		});

		if (query) {
			input.value = query;
			input.description = containerSession;
			this._previousQuery = query;
			this._previousModel = model;
			await interactiveSessionService.sendRequest(model.sessionId, query);
		} else if (this._previousQuery) {
			input.value = this._previousQuery;
		}
	}

	createSession(container: HTMLElement, offsetWidth: number, model: InteractiveSessionModel, instantiationService: IInstantiationService): IDisposable {
		const disposables = new DisposableStore();
		const viewModel = new InteractiveSessionViewModel(model, instantiationService);
		disposables.add(viewModel);
		const thing = instantiationService.createInstance(InteractiveSessionEditorOptions, 'qp', () => editorBackground, () => editorBackground);
		disposables.add(thing);
		const list = instantiationService.createInstance(
			InteractiveListItemRenderer,
			thing,
			{
				getListLength() {
					return viewModel.getItems().length;
				},
				getSlashCommands() {
					return [];
				},
			}
		);
		disposables.add(list);

		dom.reset(container);
		const template = list.renderTemplate(container);
		list.layout(offsetWidth);
		disposables.add(viewModel.onDidChange(() => {
			if (viewModel.getItems().length % 2 !== 0) {
				return;
			}

			const items = viewModel.getItems();
			const node = {
				element: items[items.length - 1],
				children: [],
				collapsed: false,
				collapsible: false,
				depth: 0,
				filterData: undefined,
				visible: true,
				visibleChildIndex: 0,
				visibleChildrenCount: 1,
			};
			list.disposeElement(node, 0, template);
			list.renderElement(node, 0, template);
		}));

		if (viewModel.getItems().length > 1) {
			const items = viewModel.getItems();
			const node = {
				element: items[items.length - 1],
				children: [],
				collapsed: false,
				collapsible: false,
				depth: 0,
				filterData: undefined,
				visible: true,
				visibleChildIndex: 0,
				visibleChildrenCount: 1,
			};
			list.disposeElement(node, 0, template);
			list.renderElement(node, 0, template);
		}

		return disposables;
	}
}

registerAction2(AskMeAction);

//#endregion
