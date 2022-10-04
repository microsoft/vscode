/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import * as dom from 'vs/base/browser/dom';
import { IAction } from 'vs/base/common/actions';
import { asArray } from 'vs/base/common/arrays';
import { Color } from 'vs/base/common/color';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IColorTheme, ICssStyleCollector, registerThemingParticipant } from 'vs/platform/theme/common/themeService';
import { PANEL_BACKGROUND } from 'vs/workbench/common/theme';
import { AudioCue, IAudioCueService } from 'vs/workbench/contrib/audioCues/browser/audioCueService';
import { ITerminalQuickFixOptions } from 'vs/workbench/contrib/terminal/browser/terminal';
import { DecorationSelector, TerminalDecorationHoverManager, updateLayout } from 'vs/workbench/contrib/terminal/browser/xterm/decorationStyles';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TERMINAL_BACKGROUND_COLOR } from 'vs/workbench/contrib/terminal/common/terminalColorRegistry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IDecoration, Terminal } from 'xterm';
// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { ITerminalAddon } from 'xterm-headless';

export interface ITerminalQuickFix {
	showMenu(): void;
	/**
	 * Registers a listener on onCommandFinished scoped to a particular command or regular
	 * expression and provides a callback to be executed for commands that match.
	 */
	registerCommandFinishedListener(options: ITerminalQuickFixOptions): void;
}

export interface ITerminalQuickFixAddon extends ITerminalQuickFix {
	onDidRequestRerunCommand: Event<{ command: string; addNewLine?: boolean }>;
}

export class TerminalQuickFixAddon extends Disposable implements ITerminalAddon, ITerminalQuickFixAddon {
	private readonly _onDidRequestRerunCommand = new Emitter<{ command: string; addNewLine?: boolean }>();
	readonly onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;

	private _terminal: Terminal | undefined;

	private _currentQuickFixElement: HTMLElement | undefined;

	private _decorationMarkerIds = new Set<number>();

	private _commandListeners: Map<string, ITerminalQuickFixOptions[]> = new Map();

	private _quickFixes: IAction[] | undefined;

	private _decoration: IDecoration | undefined;

	private readonly _terminalDecorationHoverService: TerminalDecorationHoverManager;

	constructor(private readonly _capabilities: ITerminalCapabilityStore,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@IKeybindingService private readonly _keybindingService: IKeybindingService,
		@IOpenerService private readonly _openerService: IOpenerService
	) {
		super();
		const commandDetectionCapability = this._capabilities.get(TerminalCapability.CommandDetection);
		if (commandDetectionCapability) {
			this._registerCommandFinishedHandler();
		} else {
			this._capabilities.onDidAddCapability(c => {
				if (c === TerminalCapability.CommandDetection) {
					this._registerCommandFinishedHandler();
				}
			});
		}
		this._terminalDecorationHoverService = instantiationService.createInstance(TerminalDecorationHoverManager);
	}
	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	showMenu(): void {
		this._currentQuickFixElement?.click();
	}

	registerCommandFinishedListener(options: ITerminalQuickFixOptions): void {
		const matcherKey = options.commandLineMatcher.toString();
		const currentOptions = this._commandListeners.get(matcherKey) || [];
		currentOptions.push(options);
		this._commandListeners.set(matcherKey, currentOptions);
	}

	private _registerCommandFinishedHandler(): void {
		const terminal = this._terminal;
		const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!terminal || !commandDetection) {
			return;
		}
		this._register(commandDetection.onCommandExecuted(() => {
			this._decoration?.dispose();
			this._decoration = undefined;
		}));
		this._register(commandDetection.onCommandFinished(async command => {
			this._decoration?.dispose();
			this._decoration = undefined;
			this._quickFixes = getQuickFixes(command, this._commandListeners, this._openerService, this._onDidRequestRerunCommand);
		}));
		// The buffer is not ready by the time command finish
		// is called. Add the decoration on command start using the actions, if any,
		// from the last command
		this._register(commandDetection.onCommandStarted(() => {
			if (this._quickFixes) {
				this._registerContextualDecoration();
				this._quickFixes = undefined;
			}
		}));
	}

	private _registerContextualDecoration(): void {
		if (!this._terminal) {
			return;
		}
		const marker = this._terminal.registerMarker();
		if (!marker) {
			return;
		}
		const actions = this._quickFixes;
		const decoration = this._terminal.registerDecoration({ marker, layer: 'top' });
		this._decoration = decoration;
		const kb = this._keybindingService.lookupKeybinding(TerminalCommandId.QuickFix);
		const hoverLabel = kb ? localize('terminalQuickFixWithKb', "Show Quick Fixes ({0})", kb.getLabel()) : '';
		decoration?.onRender((e: HTMLElement) => {
			if (!this._decorationMarkerIds.has(decoration.marker.id)) {
				this._currentQuickFixElement = e;
				e.classList.add(DecorationSelector.QuickFix, DecorationSelector.LightBulb, DecorationSelector.Codicon, DecorationSelector.CommandDecoration, DecorationSelector.XtermDecoration);
				updateLayout(this._configurationService, e);
				this._audioCueService.playAudioCue(AudioCue.terminalQuickFix);
				if (actions) {
					this._decorationMarkerIds.add(decoration.marker.id);
					this._register(dom.addDisposableListener(e, dom.EventType.CLICK, () => {
						this._contextMenuService.showContextMenu({ getAnchor: () => e, getActions: () => actions, autoSelectFirstItem: true });
					}));
					this._register(this._terminalDecorationHoverService.createHover(e, undefined, hoverLabel));
				}
			}
		});
	}
}

export function getQuickFixes(
	command: ITerminalCommand,
	actionOptions: Map<string, ITerminalQuickFixOptions[]>,
	openerService: IOpenerService,
	onDidRequestRerunCommand?: Emitter<{ command: string; addNewLine?: boolean }>
): IAction[] | undefined {
	const actions: IAction[] = [];
	const newCommand = command.command;
	for (const options of actionOptions.values()) {
		for (const actionOption of options) {
			if (actionOption.exitStatus !== undefined && actionOption.exitStatus !== (command.exitCode === 0)) {
				continue;
			}
			const commandLineMatch = newCommand.match(actionOption.commandLineMatcher);
			if (!commandLineMatch) {
				continue;
			}
			const outputMatcher = actionOption.outputMatcher;
			let outputMatch;
			if (outputMatcher) {
				outputMatch = command.getOutputMatch(outputMatcher);
			}
			const quickFixes = actionOption.getQuickFixes({ commandLineMatch, outputMatch }, command);
			if (quickFixes) {
				for (const quickFix of asArray(quickFixes)) {
					let action: IAction | undefined;
					if ('type' in quickFix) {
						switch (quickFix.type) {
							case 'command': {
								const label = localize('quickFix.command', 'Run: {0}', quickFix.command);
								action = {
									id: `quickFix.command`,
									label,
									class: undefined,
									enabled: true,
									run: () => {
										onDidRequestRerunCommand?.fire({
											command: quickFix.command,
											addNewLine: quickFix.addNewLine
										});
									},
									tooltip: label,
									command: quickFix.command
								} as IAction;
								break;
							}
							case 'opener': {
								const label = localize('quickFix.opener', 'Open: {0}', quickFix.uri.toString());
								action = {
									id: `quickFix.opener`,
									label,
									class: undefined,
									enabled: true,
									run: () => openerService.open(quickFix.uri),
									tooltip: label,
									uri: quickFix.uri
								} as IAction;
								break;
							}
						}
					} else {
						action = {
							id: quickFix.id,
							label: quickFix.label,
							class: quickFix.class,
							enabled: quickFix.enabled,
							run: () => quickFix.run(),
							tooltip: quickFix.tooltip
						};
					}
					if (action) {
						actions.push(action);
					}
				}
			}
		}
	}
	return actions.length === 0 ? undefined : actions;
}



let foregroundColor: string | Color | undefined;
let backgroundColor: string | Color | undefined;
registerThemingParticipant((theme: IColorTheme, collector: ICssStyleCollector) => {
	foregroundColor = theme.getColor('editorLightBulb.foreground');
	backgroundColor = theme.getColor(TERMINAL_BACKGROUND_COLOR) || theme.getColor(PANEL_BACKGROUND);
	if (foregroundColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.QuickFix} { color: ${foregroundColor.toString()} !important; } `);
	}
	if (backgroundColor) {
		collector.addRule(`.${DecorationSelector.CommandDecoration}.${DecorationSelector.QuickFix} { background-color: ${backgroundColor.toString()}; } `);
	}
});
