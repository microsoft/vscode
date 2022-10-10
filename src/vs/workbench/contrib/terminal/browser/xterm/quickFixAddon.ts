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


const quickFixSelectors = [DecorationSelector.QuickFix, DecorationSelector.LightBulb, DecorationSelector.Codicon, DecorationSelector.CommandDecoration, DecorationSelector.XtermDecoration];
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
			this._registerCommandHandlers();
		} else {
			this._capabilities.onDidAddCapability(c => {
				if (c === TerminalCapability.CommandDetection) {
					this._registerCommandHandlers();
				}
			});
		}
		this._terminalDecorationHoverService = instantiationService.createInstance(TerminalDecorationHoverManager);
	}

	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	showMenu(): void {
		this._decoration?.element?.click();
	}

	registerCommandFinishedListener(options: ITerminalQuickFixOptions): void {
		const matcherKey = options.commandLineMatcher.toString();
		const currentOptions = this._commandListeners.get(matcherKey) || [];
		currentOptions.push(options);
		this._commandListeners.set(matcherKey, currentOptions);
	}

	private _registerCommandHandlers(): void {
		const terminal = this._terminal;
		const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!terminal || !commandDetection) {
			return;
		}
		this._register(commandDetection.onCommandFinished(command => this._resolveQuickFixes(command)));
		// The buffer is not ready by the time command finish
		// is called. Add the decoration on command start if there are corresponding quick fixes
		this._register(commandDetection.onCommandStarted(() => {
			this._registerQuickFixDecoration();
			this._quickFixes = undefined;
		}));
	}

	/**
	 * Resolves quick fixes, if any, based on the
	 * @param command & its output
	 */
	private _resolveQuickFixes(command: ITerminalCommand): void {
		if (command.command !== '') {
			this._disposeQuickFix();
		}
		const result = getQuickFixesForCommand(command, this._commandListeners, this._openerService, this._onDidRequestRerunCommand);
		if (!result) {
			return;
		}
		const { fixes, onDidRunQuickFix } = result;
		this._quickFixes = fixes;
		onDidRunQuickFix(() => this._disposeQuickFix());
	}

	private _disposeQuickFix(): void {
		this._decoration?.dispose();
		this._decoration = undefined;
		this._quickFixes = undefined;
	}

	/**
	 * Registers a decoration with the quick fixes
	 */
	private _registerQuickFixDecoration(): void {
		if (!this._terminal) {
			return;
		}
		if (!this._quickFixes) {
			return;
		}
		const marker = this._terminal.registerMarker();
		if (!marker) {
			return;
		}
		const decoration = this._terminal.registerDecoration({ marker, layer: 'top' });
		if (!decoration) {
			return;
		}
		this._decoration = decoration;
		const kb = this._keybindingService.lookupKeybinding(TerminalCommandId.QuickFix);
		const hoverLabel = kb ? localize('terminalQuickFixWithKb', "Show Quick Fixes ({0})", kb.getLabel()) : '';
		const fixes = this._quickFixes;
		if (!fixes) {
			decoration.dispose();
			return;
		}
		decoration?.onRender((e: HTMLElement) => {
			if (e.classList.contains(DecorationSelector.QuickFix)) {
				return;
			}
			e.classList.add(...quickFixSelectors);
			updateLayout(this._configurationService, e);
			this._audioCueService.playAudioCue(AudioCue.terminalQuickFix);
			this._register(dom.addDisposableListener(e, dom.EventType.CLICK, () => {
				this._contextMenuService.showContextMenu({ getAnchor: () => e, getActions: () => fixes, autoSelectFirstItem: true });
			}));
			this._register(this._terminalDecorationHoverService.createHover(e, undefined, hoverLabel));
		});
	}
}

export function getQuickFixesForCommand(
	command: ITerminalCommand,
	quickFixOptions: Map<string, ITerminalQuickFixOptions[]>,
	openerService: IOpenerService,
	onDidRequestRerunCommand?: Emitter<{ command: string; addNewLine?: boolean }>
): { fixes: IAction[]; onDidRunQuickFix: Event<void> } | undefined {
	const onDidRunQuickFixEmitter = new Emitter<void>();
	const onDidRunQuickFix = onDidRunQuickFixEmitter.event;
	const fixes: IAction[] = [];
	const newCommand = command.command;
	for (const options of quickFixOptions.values()) {
		for (const option of options) {
			if (option.exitStatus !== undefined && option.exitStatus !== (command.exitCode === 0)) {
				continue;
			}
			const commandLineMatch = newCommand.match(option.commandLineMatcher);
			if (!commandLineMatch) {
				continue;
			}
			const outputMatcher = option.outputMatcher;
			let outputMatch;
			if (outputMatcher) {
				outputMatch = command.getOutputMatch(outputMatcher);
			}
			const quickFixes = option.getQuickFixes({ commandLineMatch, outputMatch }, command);
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
									run: () => {
										openerService.open(quickFix.uri);
										// since no command gets run here, need to
										// clear the decoration and quick fix
										onDidRunQuickFixEmitter.fire();
									},
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
						fixes.push(action);
					}
				}
			}
		}
	}
	return fixes.length > 0 ? { fixes, onDidRunQuickFix } : undefined;
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
