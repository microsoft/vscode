/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { ITerminalAddon } from 'xterm-headless';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ICommandAction, ITerminalContextualActionOptions } from 'vs/workbench/contrib/terminal/browser/terminal';
import { DecorationSelector, updateLayout } from 'vs/workbench/contrib/terminal/browser/xterm/decorationStyles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Terminal, IDecoration } from 'xterm';
import { IAction } from 'vs/base/common/actions';

export interface IContextualAction {
	/**
	 * Shows the quick fix menu
	 */
	showQuickFixMenu(): void;

	/**
	 * Registers a listener on onCommandFinished scoped to a particular command or regular
	 * expression and provides a callback to be executed for commands that match.
	 */
	registerCommandFinishedListener(options: ITerminalContextualActionOptions): void;
}

export interface IContextualActionAdddon extends IContextualAction {
	onDidRequestRerunCommand: Event<{ command: string; addNewLine?: boolean }>;
}

export class ContextualActionAddon extends Disposable implements ITerminalAddon, IContextualActionAdddon {
	private readonly _onDidRequestRerunCommand = new Emitter<{ command: string; addNewLine?: boolean }>();
	readonly onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;

	private _terminal: Terminal | undefined;

	private _currentQuickFixElement: HTMLElement | undefined;

	private _decorationMarkerIds = new Set<number>();

	private _commandListeners: Map<string, ITerminalContextualActionOptions[]> = new Map();

	private _matchActions: ICommandAction[] | undefined;

	private _decoration: IDecoration | undefined;

	constructor(private readonly _capabilities: ITerminalCapabilityStore,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@IConfigurationService private readonly _configurationService: IConfigurationService) {
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
	}
	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	showQuickFixMenu(): void {
		this._currentQuickFixElement?.click();
	}

	registerCommandFinishedListener(options: ITerminalContextualActionOptions): void {
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
			this._matchActions = getMatchActions(command, this._commandListeners, this._onDidRequestRerunCommand);
		}));
		// The buffer is not ready by the time command finish
		// is called. Add the decoration on command start using the actions, if any,
		// from the last command
		this._register(commandDetection.onCommandStarted(() => {
			if (this._matchActions) {
				this._registerContextualDecoration();
				this._matchActions = undefined;
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
		const actions = this._matchActions;
		const decoration = this._terminal.registerDecoration({ marker, layer: 'top' });
		this._decoration = decoration;
		decoration?.onRender((e: HTMLElement) => {
			if (!this._decorationMarkerIds.has(decoration.marker.id)) {
				this._currentQuickFixElement = e;
				e.classList.add(DecorationSelector.QuickFix, DecorationSelector.Codicon, DecorationSelector.CommandDecoration, DecorationSelector.XtermDecoration);
				e.style.color = '#ffcc00';
				updateLayout(this._configurationService, e);
				if (actions) {
					this._decorationMarkerIds.add(decoration.marker.id);
					dom.addDisposableListener(e, dom.EventType.CLICK, () => {
						this._contextMenuService.showContextMenu({ getAnchor: () => e, getActions: () => actions });
						this._contextMenuService.onDidHideContextMenu(() => decoration.dispose());
					});
				}
			}
		});
	}
}

export function getMatchActions(command: ITerminalCommand, actionOptions: Map<string, ITerminalContextualActionOptions[]>, onDidRequestRerunCommand?: Emitter<{ command: string; addNewLine?: boolean }>): IAction[] | undefined {
	const matchActions: IAction[] = [];
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
			const actions = actionOption.getActions({ commandLineMatch, outputMatch }, command);
			if (!actions) {
				return matchActions.length === 0 ? undefined : matchActions;
			}
			for (const a of actions) {
				matchActions.push({
					id: a.id,
					label: a.label,
					class: a.class,
					enabled: a.enabled,
					run: async () => {
						await a.run();
						if (a.commandToRunInTerminal) {
							onDidRequestRerunCommand?.fire({ command: a.commandToRunInTerminal, addNewLine: a.addNewLine });
						}
					},
					tooltip: a.tooltip
				});
			}
		}
	}
	return matchActions.length === 0 ? undefined : matchActions;
}
