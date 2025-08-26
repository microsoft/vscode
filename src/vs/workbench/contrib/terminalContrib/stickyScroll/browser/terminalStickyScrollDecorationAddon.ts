/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDecoration, ITerminalAddon, Terminal as RawXtermTerminal } from '@xterm/xterm';
import * as dom from '../../../../../base/browser/dom.js';
import { IAction, Separator } from '../../../../../base/common/actions.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { localize } from '../../../../../nls.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITerminalCommand } from '../../../../../platform/terminal/common/capabilities/capabilities.js';
import { ICurrentPartialCommand } from '../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { ITerminalInstance, IXtermTerminal } from '../../../terminal/browser/terminal.js';
import { DecorationAddon } from '../../../terminal/browser/xterm/decorationAddon.js';
import { getTerminalDecorationHoverContent, updateLayout } from '../../../terminal/browser/xterm/decorationStyles.js';
import { terminalDecorationError, terminalDecorationIncomplete, terminalDecorationSuccess } from '../../../terminal/browser/terminalIcons.js';

/**
 * Terminal sticky scroll decoration addon - a specialized version of DecorationAddon
 * that handles decorations for the sticky scroll overlay terminal.
 * This addon reuses the main terminal's decoration addon for action generation.
 */
export class TerminalStickyScrollDecorationAddon extends Disposable implements ITerminalAddon {
	private _terminal?: RawXtermTerminal;
	private _currentDecoration?: IDecoration;
	private _mainDecorationAddon?: DecorationAddon;

	constructor(
		private readonly _instance: ITerminalInstance,
		private readonly _xterm: IXtermTerminal,
		@IClipboardService private readonly _clipboardService: IClipboardService,
		@ICommandService private readonly _commandService: ICommandService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IHoverService private readonly _hoverService: IHoverService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IThemeService private readonly _themeService: IThemeService
	) {
		super();
		this._register(toDisposable(() => this._dispose()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(TerminalSettingId.FontSize) || e.affectsConfiguration(TerminalSettingId.LineHeight)) {
				this.refreshLayout();
			}
		}));
		this._register(this._themeService.onDidColorThemeChange(() => this._refreshStyles()));
	}

	activate(terminal: RawXtermTerminal): void {
		this._terminal = terminal;
	}

	/**
	 * Sets the main decoration addon to delegate complex operations to
	 */
	setMainDecorationAddon(addon: DecorationAddon): void {
		this._mainDecorationAddon = addon;
	}

	/**
	 * Registers a command decoration at the top of the sticky scroll
	 */
	registerCommandDecoration(command: ITerminalCommand | ICurrentPartialCommand): void {
		this.clearDecoration();

		if (!this._terminal || !this._shouldShowDecorations()) {
			return;
		}

		// Wait for terminal to be ready
		if (!this._terminal.element) {
			setTimeout(() => this.registerCommandDecoration(command), 10);
			return;
		}

		const marker = this._terminal.registerMarker(0);
		if (!marker) {
			return;
		}

		const decoration = this._terminal.registerDecoration({
			marker,
			overviewRulerOptions: undefined // No overview ruler for sticky scroll
		});

		if (!decoration) {
			return;
		}

		this._currentDecoration = decoration;

		decoration.onRender(element => {
			if (!element.classList.contains('codicon')) {
				// First render
				updateLayout(this._configurationService, element);
				this._updateClasses(element, command);
				this._createInteractivity(element, command);
			}
		});

		// Force immediate render
		this._forceRender();
	}

	/**
	 * Clears the current decoration
	 */
	clearDecoration(): void {
		if (this._currentDecoration) {
			this._currentDecoration.dispose();
			this._currentDecoration = undefined;
		}
	}

	/**
	 * Refreshes the layout of decorations
	 */
	refreshLayout(): void {
		if (this._currentDecoration?.element) {
			updateLayout(this._configurationService, this._currentDecoration.element);
		}
	}

	private _dispose(): void {
		this.clearDecoration();
	}

	private _forceRender(): void {
		if (this._terminal) {
			// Force xterm to render the decoration immediately
			(this._terminal as any).refresh?.(0, 0);
		}
	}

	private _refreshStyles(): void {
		if (this._currentDecoration?.element) {
			// Re-apply classes with updated theme colors
			const element = this._currentDecoration.element;
			const classes = Array.from(element.classList);
			for (const cls of classes) {
				if (cls.startsWith('codicon-')) {
					// Preserve icon classes
					continue;
				}
				element.classList.remove(cls);
			}
			// Re-add base classes (the icon classes are preserved)
			element.classList.add('terminal-command-decoration', 'codicon', 'xterm-decoration');
		}
	}

	private _shouldShowDecorations(): boolean {
		const showDecorations = this._configurationService.getValue(TerminalSettingId.ShellIntegrationDecorationsEnabled);
		return showDecorations === 'both' || showDecorations === 'gutter';
	}

	private _updateClasses(element: HTMLElement, command: ITerminalCommand | ICurrentPartialCommand): void {
		// Clear existing classes
		element.className = '';
		element.classList.add('terminal-command-decoration', 'codicon', 'xterm-decoration');

		const isPartialCommand = !('getOutput' in command);
		const exitCode = !isPartialCommand ? (command as ITerminalCommand).exitCode : undefined;

		if (isPartialCommand || exitCode === undefined) {
			element.classList.add('default-color', 'default');
			element.classList.add(...ThemeIcon.asClassNameArray(terminalDecorationIncomplete));
		} else if (exitCode !== 0) {
			element.classList.add('error');
			element.classList.add(...ThemeIcon.asClassNameArray(terminalDecorationError));
		} else {
			element.classList.add(...ThemeIcon.asClassNameArray(terminalDecorationSuccess));
		}
	}

	private _createInteractivity(element: HTMLElement, command: ITerminalCommand | ICurrentPartialCommand): void {
		// Add hover
		const hoverDisposable = this._createHover(element, command);

		// Add click handler for context menu
		const clickDisposable = dom.addDisposableListener(element, dom.EventType.CLICK, async (e) => {
			e.preventDefault();
			e.stopPropagation();
			await this._showContextMenu(element, command);
		});

		// Add mousedown handler to prevent interference
		const mouseDownDisposable = dom.addDisposableListener(element, dom.EventType.MOUSE_DOWN, (e) => {
			if (e.button === 0) { // Left click
				e.stopPropagation();
			}
		});

		// Clean up when decoration is disposed
		if (this._currentDecoration) {
			this._currentDecoration.onDispose(() => {
				hoverDisposable.dispose();
				clickDisposable.dispose();
				mouseDownDisposable.dispose();
			});
		}
	}

	private _createHover(element: HTMLElement, command: ITerminalCommand | ICurrentPartialCommand): IDisposable {
		const isPartialCommand = !('getOutput' in command);
		if (isPartialCommand) {
			// For partial commands, show a simple status message
			const hoverContent = localize('terminalPromptCommandExecuting', "Command is executing");
			return this._hoverService.setupDelayedHover(element, () => ({
				content: new MarkdownString(hoverContent)
			}));
		} else {
			// For full commands, use the standard hover content
			return this._hoverService.setupDelayedHover(element, () => ({
				content: new MarkdownString(getTerminalDecorationHoverContent(command as ITerminalCommand))
			}));
		}
	}

	private async _showContextMenu(element: HTMLElement, command: ITerminalCommand | ICurrentPartialCommand): Promise<void> {
		const actions = await this._getCommandActions(command);
		this._contextMenuService.showContextMenu({
			getAnchor: () => element,
			getActions: () => actions
		});
	}

	private async _getCommandActions(command: ITerminalCommand | ICurrentPartialCommand): Promise<IAction[]> {
		// If we have a main decoration addon and a full command, delegate to it
		if (this._mainDecorationAddon && 'getOutput' in command) {
			const mainAddonPrivate = this._mainDecorationAddon as any;
			if (mainAddonPrivate._getCommandActions) {
				// Get the full action list from the main addon
				const actions = await mainAddonPrivate._getCommandActions(command);

				// Add sticky-scroll-specific navigation action at the beginning
				const navigateAction: IAction = {
					id: 'terminal.navigateToCommand',
					label: localize('navigateToCommand', "Navigate to Command"),
					tooltip: localize('navigateToCommand', "Navigate to Command"),
					class: undefined,
					enabled: true,
					run: () => {
						if (this._xterm && command) {
							this._xterm.markTracker.revealCommand(command);
							this._instance.focus();
						}
					}
				};

				// Insert navigate action at the beginning
				return [navigateAction, new Separator(), ...actions];
			}
		}

		// Fallback for partial commands or when main addon isn't available
		return this._getBasicCommandActions(command);
	}

	private _getBasicCommandActions(command: ITerminalCommand | ICurrentPartialCommand): IAction[] {
		const actions: IAction[] = [];

		// Navigation action (sticky-scroll specific)
		actions.push({
			id: 'terminal.navigateToCommand',
			label: localize('navigateToCommand', "Navigate to Command"),
			tooltip: localize('navigateToCommand', "Navigate to Command"),
			class: undefined,
			enabled: true,
			run: () => {
				if (this._xterm && command) {
					this._xterm.markTracker.revealCommand(command);
					this._instance.focus();
				}
			}
		});

		const isPartialCommand = !('getOutput' in command);
		if (!isPartialCommand) {
			const fullCommand = command as ITerminalCommand;

			if (fullCommand.command !== '') {
				actions.push(new Separator());

				// Rerun command
				actions.push({
					id: 'terminal.rerunCommand',
					label: localize('terminal.rerunCommand', 'Rerun Command'),
					tooltip: localize('terminal.rerunCommand', 'Rerun Command'),
					class: undefined,
					enabled: true,
					run: async () => {
						if (!fullCommand.isTrusted) {
							const shouldRun = await new Promise<boolean>(r => {
								this._notificationService.prompt(Severity.Info,
									localize('rerun', 'Do you want to run the command: {0}', fullCommand.command),
									[{
										label: localize('yes', 'Yes'),
										run: () => r(true)
									}, {
										label: localize('no', 'No'),
										run: () => r(false)
									}]
								);
							});
							if (!shouldRun) {
								return;
							}
						}
						// Use the same approach as main terminal - send text directly
						this._instance.sendText(fullCommand.command, true, true);
					}
				});

				// The second section is the clipboard section
				actions.push(new Separator());

				// Copy command
				actions.push({
					id: 'terminal.copyCommand',
					label: localize('terminal.copyCommand', 'Copy Command'),
					tooltip: localize('terminal.copyCommand', 'Copy Command'),
					class: undefined,
					enabled: true,
					run: () => this._clipboardService.writeText(fullCommand.command)
				});
			}

			if (fullCommand.hasOutput()) {
				// Copy Command and Output
				actions.push({
					id: 'terminal.copyCommandAndOutput',
					label: localize('terminal.copyCommandAndOutput', 'Copy Command and Output'),
					tooltip: localize('terminal.copyCommandAndOutput', 'Copy Command and Output'),
					class: undefined,
					enabled: true,
					run: () => {
						const output = fullCommand.getOutput();
						if (typeof output === 'string') {
							this._clipboardService.writeText(`${fullCommand.command !== '' ? fullCommand.command + '\n' : ''}${output}`);
						}
					}
				});

				// Copy output
				actions.push({
					id: 'terminal.copyOutput',
					label: localize('terminal.copyOutput', 'Copy Output'),
					tooltip: localize('terminal.copyOutput', 'Copy Output'),
					class: undefined,
					enabled: true,
					run: () => {
						const output = fullCommand.getOutput();
						if (typeof output === 'string') {
							this._clipboardService.writeText(output);
						}
					}
				});

				// Copy Output as HTML
				actions.push({
					id: 'terminal.copyOutputAsHtml',
					label: localize('terminal.copyOutputAsHtml', 'Copy Output as HTML'),
					tooltip: localize('terminal.copyOutputAsHtml', 'Copy Output as HTML'),
					class: undefined,
					enabled: true,
					run: () => {
						// Try to delegate to main decoration addon for HTML functionality
						if (this._mainDecorationAddon) {
							const mainAddonPrivate = this._mainDecorationAddon as any;
							if (mainAddonPrivate._onDidRequestCopyAsHtml) {
								mainAddonPrivate._onDidRequestCopyAsHtml.fire({ command: fullCommand });
								return;
							}
						}
						// Fallback: copy as plain text
						const output = fullCommand.getOutput();
						if (typeof output === 'string') {
							this._clipboardService.writeText(output);
						}
					}
				});
			}

			if (actions.length > 1) {
				actions.push(new Separator());
			}

			// Run Recent Command
			actions.push({
				id: 'workbench.action.terminal.runRecentCommand',
				label: localize('workbench.action.terminal.runRecentCommand', "Run Recent Command"),
				tooltip: localize('workbench.action.terminal.runRecentCommand', "Run Recent Command"),
				class: undefined,
				enabled: true,
				run: () => this._commandService.executeCommand('workbench.action.terminal.runRecentCommand')
			});

			// Go To Recent Directory
			actions.push({
				id: 'workbench.action.terminal.goToRecentDirectory',
				label: localize('workbench.action.terminal.goToRecentDirectory', "Go To Recent Directory"),
				tooltip: localize('workbench.action.terminal.goToRecentDirectory', "Go To Recent Directory"),
				class: undefined,
				enabled: true,
				run: () => this._commandService.executeCommand('workbench.action.terminal.goToRecentDirectory')
			});

			actions.push(new Separator());

			// Learn About Shell Integration
			actions.push({
				id: 'terminal.learnShellIntegration',
				label: localize('terminal.learnShellIntegration', 'Learn About Shell Integration'),
				tooltip: localize('terminal.learnShellIntegration', 'Learn About Shell Integration'),
				class: undefined,
				enabled: true,
				run: () => this._openerService.open('https://code.visualstudio.com/docs/terminal/shell-integration')
			});
		}

		return actions;
	}
}
