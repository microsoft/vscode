/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDecoration, ITerminalAddon, Terminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { IAction, Separator } from '../../../../../base/common/actions.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { localize } from '../../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { CommandInvalidationReason, ICommandDetectionCapability, IMarkProperties, ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { TerminalSettingId, type IDecorationAddon } from '../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { terminalDecorationMark } from '../terminalIcons.js';
import { DecorationSelector, getTerminalCommandDecorationState, getTerminalDecorationHoverContent, updateLayout } from './decorationStyles.js';
import { TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR, TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR } from '../../common/terminalColorRegistry.js';
import { ILifecycleService } from '../../../../services/lifecycle/common/lifecycle.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { IChatContextPickService } from '../../../chat/browser/attachments/chatContextPickService.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TerminalContext } from '../../../chat/browser/actions/chatContext.js';
import { getTerminalUri, parseTerminalUri } from '../terminalUri.js';
import { URI } from '../../../../../base/common/uri.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { isString } from '../../../../../base/common/types.js';

interface IDisposableDecoration { decoration: IDecoration; disposables: IDisposable[]; command?: ITerminalCommand; markProperties?: IMarkProperties }

export class DecorationAddon extends Disposable implements ITerminalAddon, IDecorationAddon {
	protected _terminal: Terminal | undefined;
	private _capabilityDisposables: DisposableMap<TerminalCapability> = this._register(new DisposableMap());
	private _decorations: Map<number, IDisposableDecoration> = new Map();
	private _placeholderDecoration: IDecoration | undefined;
	private _showGutterDecorations?: boolean;
	private _showOverviewRulerDecorations?: boolean;
	private readonly _registeredMenuItems: Map<ITerminalCommand, IAction[]> = new Map();

	private readonly _onDidRequestRunCommand = this._register(new Emitter<{ command: ITerminalCommand; noNewLine?: boolean }>());
	readonly onDidRequestRunCommand = this._onDidRequestRunCommand.event;
	private readonly _onDidRequestCopyAsHtml = this._register(new Emitter<{ command: ITerminalCommand }>());
	readonly onDidRequestCopyAsHtml = this._onDidRequestCopyAsHtml.event;

	constructor(
		private readonly _resource: URI | undefined,
		private readonly _capabilities: ITerminalCapabilityStore,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IThemeService private readonly _themeService: IThemeService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IQuickInputService private readonly _quickInputService: IQuickInputService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@ICommandService private readonly _commandService: ICommandService,
		@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IHoverService private readonly _hoverService: IHoverService,
		@IChatContextPickService private readonly _contextPickService: IChatContextPickService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();
		this._register(toDisposable(() => this._dispose()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.FontSize) || e.affectsConfiguration(TerminalSettingId.LineHeight)) {
				this.refreshLayouts();
			} else if (e.affectsConfiguration('workbench.colorCustomizations')) {
				this._refreshStyles(true);
			} else if (e.affectsConfiguration(TerminalSettingId.ShellIntegrationDecorationsEnabled)) {
				this._removeCapabilityDisposables(TerminalCapability.CommandDetection);
				this._updateDecorationVisibility();
			}
		}));
		this._register(this._themeService.onDidColorThemeChange(() => this._refreshStyles(true)));
		this._updateDecorationVisibility();
		this._register(this._capabilities.onDidAddCapability(c => this._createCapabilityDisposables(c.id)));
		this._register(this._capabilities.onDidRemoveCapability(c => this._removeCapabilityDisposables(c.id)));
		this._register(lifecycleService.onWillShutdown(() => this._disposeAllDecorations()));
	}

	private _createCapabilityDisposables(c: TerminalCapability): void {
		const capability = this._capabilities.get(c);
		if (!capability || this._capabilityDisposables.has(c)) {
			return;
		}
		const store = new DisposableStore();
		switch (capability.type) {
			case TerminalCapability.BufferMarkDetection:
				store.add(capability.onMarkAdded(mark => this.registerMarkDecoration(mark)));
				break;
			case TerminalCapability.CommandDetection: {
				const disposables = this._getCommandDetectionListeners(capability);
				for (const d of disposables) {
					store.add(d);
				}
				break;
			}
		}
		this._capabilityDisposables.set(c, store);
	}

	private _removeCapabilityDisposables(c: TerminalCapability): void {
		this._capabilityDisposables.deleteAndDispose(c);
	}

	registerMarkDecoration(mark: IMarkProperties): IDecoration | undefined {
		if (!this._terminal || (!this._showGutterDecorations && !this._showOverviewRulerDecorations)) {
			return undefined;
		}
		if (mark.hidden) {
			return undefined;
		}
		return this.registerCommandDecoration(undefined, undefined, mark);
	}

	private _updateDecorationVisibility(): void {
		const showDecorations = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
		this._showGutterDecorations = (showDecorations === 'both' || showDecorations === 'gutter');
		this._showOverviewRulerDecorations = (showDecorations === 'both' || showDecorations === 'overviewRuler');
		this._disposeAllDecorations();
		if (this._showGutterDecorations || this._showOverviewRulerDecorations) {
			this._attachToCommandCapability();
			this._updateGutterDecorationVisibility();
		}
		const currentCommand = this._capabilities.get(TerminalCapability.CommandDetection)?.executingCommandObject;
		if (currentCommand) {
			this.registerCommandDecoration(currentCommand, true);
		}
	}

	private _disposeAllDecorations(): void {
		this._placeholderDecoration?.dispose();
		for (const value of this._decorations.values()) {
			value.decoration.dispose();
			dispose(value.disposables);
		}
	}

	private _updateGutterDecorationVisibility(): void {
		// eslint-disable-next-line no-restricted-syntax
		const commandDecorationElements = this._terminal?.element?.querySelectorAll(DecorationSelector.CommandDecoration);
		if (commandDecorationElements) {
			for (const commandDecorationElement of commandDecorationElements) {
				this._updateCommandDecorationVisibility(commandDecorationElement);
			}
		}
	}

	private _updateCommandDecorationVisibility(commandDecorationElement: Element): void {
		if (this._showGutterDecorations) {
			commandDecorationElement.classList.remove(DecorationSelector.Hide);
		} else {
			commandDecorationElement.classList.add(DecorationSelector.Hide);
		}
	}

	public refreshLayouts(): void {
		updateLayout(this._configurationService, this._placeholderDecoration?.element);
		for (const decoration of this._decorations) {
			updateLayout(this._configurationService, decoration[1].decoration.element);
		}
	}

	private _refreshStyles(refreshOverviewRulerColors?: boolean): void {
		if (refreshOverviewRulerColors) {
			for (const decoration of this._decorations.values()) {
				const color = this._getDecorationCssColor(decoration.command)?.toString() ?? '';
				if (decoration.decoration.options?.overviewRulerOptions) {
					decoration.decoration.options.overviewRulerOptions.color = color;
				} else if (decoration.decoration.options) {
					decoration.decoration.options.overviewRulerOptions = { color };
				}
			}
		}
		this._updateClasses(this._placeholderDecoration?.element);
		for (const decoration of this._decorations.values()) {
			this._updateClasses(decoration.decoration.element, decoration.command, decoration.markProperties);
		}
	}

	private _dispose(): void {
		for (const disposable of this._capabilityDisposables.values()) {
			dispose(disposable);
		}
		this.clearDecorations();
	}

	private _clearPlaceholder(): void {
		this._placeholderDecoration?.dispose();
		this._placeholderDecoration = undefined;
	}

	public clearDecorations(): void {
		this._placeholderDecoration?.marker.dispose();
		this._clearPlaceholder();
		this._disposeAllDecorations();
		this._decorations.clear();
	}

	private _attachToCommandCapability(): void {
		if (this._capabilities.has(TerminalCapability.CommandDetection)) {
			const capability = this._capabilities.get(TerminalCapability.CommandDetection)!;
			const disposables = this._getCommandDetectionListeners(capability);
			const store = new DisposableStore();
			for (const d of disposables) {
				store.add(d);
			}
			this._capabilityDisposables.set(TerminalCapability.CommandDetection, store);
		}
	}

	private _getCommandDetectionListeners(capability: ICommandDetectionCapability): IDisposable[] {
		this._removeCapabilityDisposables(TerminalCapability.CommandDetection);

		const commandDetectionListeners = [];
		// Command started
		if (capability.executingCommandObject?.marker) {
			this.registerCommandDecoration(capability.executingCommandObject, true);
		}
		commandDetectionListeners.push(capability.onCommandStarted(command => this.registerCommandDecoration(command, true)));
		// Command finished
		for (const command of capability.commands) {
			this.registerCommandDecoration(command);
		}
		commandDetectionListeners.push(capability.onCommandFinished(command => {
			const buffer = this._terminal?.buffer?.active;
			const marker = command.promptStartMarker;

			// Edge case: Handle case where tsc watch commands clears buffer, but decoration of that tsc command re-appears
			const shouldRegisterDecoration = (
				command.exitCode === undefined ||
				// Only register decoration if the cursor is at or below the promptStart marker.
				(buffer && marker && buffer.baseY + buffer.cursorY >= marker.line)
			);

			if (shouldRegisterDecoration) {
				this.registerCommandDecoration(command);
			}

			if (command.exitCode) {
				this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandFailed);
			} else {
				this._accessibilitySignalService.playSignal(AccessibilitySignal.terminalCommandSucceeded);
			}
		}));
		// Command invalidated
		commandDetectionListeners.push(capability.onCommandInvalidated(commands => {
			for (const command of commands) {
				const id = command.marker?.id;
				if (id) {
					const match = this._decorations.get(id);
					if (match) {
						match.decoration.dispose();
						dispose(match.disposables);
					}
				}
			}
		}));
		// Current command invalidated
		commandDetectionListeners.push(capability.onCurrentCommandInvalidated((request) => {
			if (request.reason === CommandInvalidationReason.NoProblemsReported) {
				const lastDecoration = Array.from(this._decorations.entries())[this._decorations.size - 1];
				lastDecoration?.[1].decoration.dispose();
			} else if (request.reason === CommandInvalidationReason.Windows) {
				this._clearPlaceholder();
			}
		}));
		return commandDetectionListeners;
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._attachToCommandCapability();
	}

	registerCommandDecoration(command?: ITerminalCommand, beforeCommandExecution?: boolean, markProperties?: IMarkProperties): IDecoration | undefined {
		if (!this._terminal || (beforeCommandExecution && !command) || (!this._showGutterDecorations && !this._showOverviewRulerDecorations)) {
			return undefined;
		}
		const marker = command?.marker || markProperties?.marker;
		if (!marker) {
			throw new Error(`cannot add a decoration for a command ${JSON.stringify(command)} with no marker`);
		}
		this._clearPlaceholder();
		const color = this._getDecorationCssColor(command)?.toString() ?? '';
		const decoration = this._terminal.registerDecoration({
			marker,
			overviewRulerOptions: this._showOverviewRulerDecorations ? (beforeCommandExecution
				? { color, position: 'left' }
				: { color, position: command?.exitCode ? 'right' : 'left' }) : undefined
		});
		if (!decoration) {
			return undefined;
		}
		if (beforeCommandExecution) {
			this._placeholderDecoration = decoration;
		}
		decoration.onRender(element => {
			if (element.classList.contains(DecorationSelector.OverviewRuler)) {
				return;
			}
			if (!this._decorations.get(decoration.marker.id)) {
				decoration.onDispose(() => this._decorations.delete(decoration.marker.id));
				this._decorations.set(decoration.marker.id,
					{
						decoration,
						disposables: this._createDisposables(element, command, markProperties),
						command,
						markProperties: command?.markProperties || markProperties
					});
			}
			if (!element.classList.contains(DecorationSelector.Codicon) || command?.marker?.line === 0) {
				// first render or buffer was cleared
				updateLayout(this._configurationService, element);
				this._updateClasses(element, command, command?.markProperties || markProperties);
			}
		});
		return decoration;
	}

	registerMenuItems(command: ITerminalCommand, items: IAction[]): IDisposable {
		const existingItems = this._registeredMenuItems.get(command);
		if (existingItems) {
			existingItems.push(...items);
		} else {
			this._registeredMenuItems.set(command, [...items]);
		}
		return toDisposable(() => {
			const commandItems = this._registeredMenuItems.get(command);
			if (commandItems) {
				for (const item of items.values()) {
					const index = commandItems.indexOf(item);
					if (index !== -1) {
						commandItems.splice(index, 1);
					}
				}
			}
		});
	}

	private _createDisposables(element: HTMLElement, command?: ITerminalCommand, markProperties?: IMarkProperties): IDisposable[] {
		if (command?.exitCode === undefined && !command?.markProperties) {
			return [];
		} else if (command?.markProperties || markProperties) {
			return [this._createHover(element, command || markProperties, markProperties?.hoverMessage)];
		}
		return [...this._createContextMenu(element, command), this._createHover(element, command)];
	}

	private _createHover(element: HTMLElement, command: ITerminalCommand | undefined, hoverMessage?: string) {
		return this._hoverService.setupDelayedHover(element, () => ({
			content: new MarkdownString(getTerminalDecorationHoverContent(command, hoverMessage, true))
		}));
	}

	private _updateClasses(element?: HTMLElement, command?: ITerminalCommand, markProperties?: IMarkProperties): void {
		if (!element) {
			return;
		}
		for (const classes of element.classList) {
			element.classList.remove(classes);
		}
		element.classList.add(DecorationSelector.CommandDecoration, DecorationSelector.Codicon, DecorationSelector.XtermDecoration);

		if (markProperties) {
			element.classList.add(DecorationSelector.DefaultColor, ...ThemeIcon.asClassNameArray(terminalDecorationMark));
			if (!markProperties.hoverMessage) {
				//disable the mouse pointer
				element.classList.add(DecorationSelector.Default);
			}
		} else {
			// command decoration
			const state = getTerminalCommandDecorationState(command);
			this._updateCommandDecorationVisibility(element);
			for (const className of state.classNames) {
				element.classList.add(className);
			}
			element.classList.add(...ThemeIcon.asClassNameArray(state.icon));
		}
		element.removeAttribute('title');
		element.removeAttribute('aria-label');
	}

	private _createContextMenu(element: HTMLElement, command: ITerminalCommand): IDisposable[] {
		// When the xterm Decoration gets disposed of, its element gets removed from the dom
		// along with its listeners
		return [
			dom.addDisposableListener(element, dom.EventType.MOUSE_DOWN, async (e) => {
				e.stopImmediatePropagation();
			}),
			dom.addDisposableListener(element, dom.EventType.CLICK, async (e) => {
				e.stopImmediatePropagation();
				const actions = await this._getCommandActions(command);
				this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => actions });
			}),
			dom.addDisposableListener(element, dom.EventType.CONTEXT_MENU, async (e) => {
				e.stopImmediatePropagation();
				const chatActions = await this._getCommandActions(command);
				const actions = this._getContextMenuActions();
				this._contextMenuService.showContextMenu({ getAnchor: () => element, getActions: () => [...actions, ...chatActions] });
			}),
		];
	}
	private _getContextMenuActions(): IAction[] {
		const label = localize('workbench.action.terminal.toggleVisibility', "Toggle Visibility");
		return [
			{
				class: undefined, tooltip: label, id: 'terminal.toggleVisibility', label, enabled: true,
				run: async () => {
					this._showToggleVisibilityQuickPick();
				}
			}
		];
	}

	private async _getCommandActions(command: ITerminalCommand): Promise<IAction[]> {

		const actions: IAction[] = [];
		const registeredMenuItems = this._registeredMenuItems.get(command);
		if (registeredMenuItems?.length) {
			actions.push(...registeredMenuItems, new Separator());
		}

		const attachToChatAction = this._createAttachToChatAction(command);
		if (attachToChatAction) {
			actions.push(attachToChatAction, new Separator());
		}

		if (command.command !== '') {
			const labelRun = localize("terminal.rerunCommand", 'Rerun Command');
			actions.push({
				class: undefined, tooltip: labelRun, id: 'terminal.rerunCommand', label: labelRun, enabled: true,
				run: async () => {
					if (command.command === '') {
						return;
					}
					if (!command.isTrusted) {
						const shouldRun = await new Promise<boolean>(r => {
							this._notificationService.prompt(Severity.Info, localize('rerun', 'Do you want to run the command: {0}', command.command), [{
								label: localize('yes', 'Yes'),
								run: () => r(true)
							}, {
								label: localize('no', 'No'),
								run: () => r(false)
							}]);
						});
						if (!shouldRun) {
							return;
						}
					}
					this._onDidRequestRunCommand.fire({ command });
				}
			});
			// The second section is the clipboard section
			actions.push(new Separator());
			const labelCopy = localize("terminal.copyCommand", 'Copy Command');
			actions.push({
				class: undefined, tooltip: labelCopy, id: 'terminal.copyCommand', label: labelCopy, enabled: true,
				run: () => this._clipboardService.writeText(command.command)
			});
		}
		if (command.hasOutput()) {
			const labelCopyCommandAndOutput = localize("terminal.copyCommandAndOutput", 'Copy Command and Output');
			actions.push({
				class: undefined, tooltip: labelCopyCommandAndOutput, id: 'terminal.copyCommandAndOutput', label: labelCopyCommandAndOutput, enabled: true,
				run: () => {
					const output = command.getOutput();
					if (isString(output)) {
						this._clipboardService.writeText(`${command.command !== '' ? command.command + '\n' : ''}${output}`);
					}
				}
			});
			const labelText = localize("terminal.copyOutput", 'Copy Output');
			actions.push({
				class: undefined, tooltip: labelText, id: 'terminal.copyOutput', label: labelText, enabled: true,
				run: () => {
					const text = command.getOutput();
					if (isString(text)) {
						this._clipboardService.writeText(text);
					}
				}
			});
			const labelHtml = localize("terminal.copyOutputAsHtml", 'Copy Output as HTML');
			actions.push({
				class: undefined, tooltip: labelHtml, id: 'terminal.copyOutputAsHtml', label: labelHtml, enabled: true,
				run: () => this._onDidRequestCopyAsHtml.fire({ command })
			});
		}
		if (actions.length > 0) {
			actions.push(new Separator());
		}
		const labelRunRecent = localize('workbench.action.terminal.runRecentCommand', "Run Recent Command");
		actions.push({
			class: undefined, tooltip: labelRunRecent, id: 'workbench.action.terminal.runRecentCommand', label: labelRunRecent, enabled: true,
			run: () => this._commandService.executeCommand('workbench.action.terminal.runRecentCommand')
		});
		const labelGoToRecent = localize('workbench.action.terminal.goToRecentDirectory', "Go To Recent Directory");
		actions.push({
			class: undefined, tooltip: labelRunRecent, id: 'workbench.action.terminal.goToRecentDirectory', label: labelGoToRecent, enabled: true,
			run: () => this._commandService.executeCommand('workbench.action.terminal.goToRecentDirectory')
		});

		actions.push(new Separator());

		const labelAbout = localize("terminal.learnShellIntegration", 'Learn About Shell Integration');
		actions.push({
			class: undefined, tooltip: labelAbout, id: 'terminal.learnShellIntegration', label: labelAbout, enabled: true,
			run: () => this._openerService.open('https://code.visualstudio.com/docs/terminal/shell-integration')
		});
		return actions;
	}

	private _createAttachToChatAction(command: ITerminalCommand): IAction | undefined {
		const chatIsEnabled = this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat).some(w => w.attachmentCapabilities.supportsTerminalAttachments);
		if (!chatIsEnabled) {
			return undefined;
		}
		const labelAttachToChat = localize("terminal.attachToChat", 'Attach To Chat');
		return {
			class: undefined, tooltip: labelAttachToChat, id: 'terminal.attachToChat', label: labelAttachToChat, enabled: true,
			run: async () => {
				let widget = this._chatWidgetService.lastFocusedWidget ?? this._chatWidgetService.getWidgetsByLocations(ChatAgentLocation.Chat)?.find(w => w.attachmentCapabilities.supportsTerminalAttachments);

				// If no widget found (e.g., after window reload when chat hasn't been focused), open chat view
				if (!widget) {
					widget = await this._chatWidgetService.revealWidget();
				}

				if (!widget) {
					return;
				}

				let terminalContext: TerminalContext | undefined;
				if (this._resource) {
					const parsedUri = parseTerminalUri(this._resource);
					terminalContext = this._instantiationService.createInstance(TerminalContext, getTerminalUri(parsedUri.workspaceId, parsedUri.instanceId!, undefined, command.id));
				}

				if (terminalContext && widget.attachmentCapabilities.supportsTerminalAttachments) {
					try {
						const attachment = await terminalContext.asAttachment(widget);
						if (attachment) {
							widget.attachmentModel.addContext(attachment);
							widget.focusInput();
							return;
						}
					} catch (err) {
					}
					this._store.add(this._contextPickService.registerChatContextItem(terminalContext));
				}
			}
		};
	}

	private _showToggleVisibilityQuickPick() {
		const quickPick = this._register(this._quickInputService.createQuickPick());
		quickPick.hideInput = true;
		quickPick.hideCheckAll = true;
		quickPick.canSelectMany = true;
		quickPick.title = localize('toggleVisibility', 'Toggle visibility');
		const configValue = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
		const gutterIcon: IQuickPickItem = {
			label: localize('gutter', 'Gutter command decorations'),
			picked: configValue !== 'never' && configValue !== 'overviewRuler'
		};
		const overviewRulerIcon: IQuickPickItem = {
			label: localize('overviewRuler', 'Overview ruler command decorations'),
			picked: configValue !== 'never' && configValue !== 'gutter'
		};
		quickPick.items = [gutterIcon, overviewRulerIcon];
		const selectedItems: IQuickPickItem[] = [];
		if (configValue !== 'never') {
			if (configValue !== 'gutter') {
				selectedItems.push(gutterIcon);
			}
			if (configValue !== 'overviewRuler') {
				selectedItems.push(overviewRulerIcon);
			}
		}
		quickPick.selectedItems = selectedItems;
		this._register(quickPick.onDidChangeSelection(async e => {
			let newValue: 'both' | 'gutter' | 'overviewRuler' | 'never' = 'never';
			if (e.includes(gutterIcon)) {
				if (e.includes(overviewRulerIcon)) {
					newValue = 'both';
				} else {
					newValue = 'gutter';
				}
			} else if (e.includes(overviewRulerIcon)) {
				newValue = 'overviewRuler';
			}
			await this._configurationService.updateValue(TerminalSettingId.ShellIntegrationDecorationsEnabled, newValue);
		}));
		quickPick.ok = false;
		quickPick.show();
	}

	private _getDecorationCssColor(command?: ITerminalCommand): string | undefined {
		let colorId: string;
		if (command?.exitCode === undefined) {
			colorId = TERMINAL_COMMAND_DECORATION_DEFAULT_BACKGROUND_COLOR;
		} else {
			colorId = command.exitCode ? TERMINAL_COMMAND_DECORATION_ERROR_BACKGROUND_COLOR : TERMINAL_COMMAND_DECORATION_SUCCESS_BACKGROUND_COLOR;
		}
		return this._themeService.getColorTheme().getColor(colorId)?.toString();
	}
}
