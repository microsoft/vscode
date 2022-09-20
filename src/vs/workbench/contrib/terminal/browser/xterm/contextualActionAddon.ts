/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IAction } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITerminalCapabilityStore, ITerminalCommand, TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { ITerminalAddon, Terminal } from 'xterm-headless';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalContextualActionOptions } from 'vs/workbench/contrib/terminal/browser/terminal';
import { DecorationSelector, updateLayout } from 'vs/workbench/contrib/terminal/browser/xterm/decorationStyles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export type MatchActions = IAction[] | undefined;

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
	onDidRequestRerunCommand: Event<ITerminalCommand>;
}

export class ContextualActionAddon extends Disposable implements ITerminalAddon, IContextualActionAdddon {
	private readonly _onDidRequestRerunCommand = new Emitter<ITerminalCommand>();
	readonly onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;

	private _terminal: Terminal | undefined;

	private _currentQuickFixElement: HTMLElement | undefined;

	private _decorationMarkerIds = new Set<string>();

	private _commandListeners: Map<string, ITerminalContextualActionOptions[]> = new Map();

	private _matchActions: MatchActions | undefined;

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
		this._register(commandDetection.onCommandFinished(async command => {
			this._matchActions = getMatchOptions(command, this._commandListeners);
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
		const marker = this._terminal?.registerMarker();
		const actions = this._matchActions;
		if (this._terminal && 'registerDecoration' in this._terminal) {
			const decoration = (this._terminal as any).registerDecoration({ marker, actions, layer: 'top' });
			decoration.onRender((e: HTMLElement) => {
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
}

export function getMatchOptions(command: ITerminalCommand, actionOptions: Map<string, ITerminalContextualActionOptions[]>): MatchActions {
	const matchActions: IAction[] = [];
	const newCommand = command.command;
	for (const options of actionOptions.values()) {
		for (const actionOption of options) {
			if (actionOption.exitCode !== undefined && command.exitCode !== actionOption.exitCode) {
				continue;
			}
			const commandLineMatch = newCommand.match(actionOption.commandLineMatcher);
			if (!commandLineMatch) {
				continue;
			}
			const outputMatcher = actionOption.outputMatcher;
			let outputMatch;
			if (outputMatcher) {
				outputMatch = command.getOutput(outputMatcher);
			}
			const actions = actionOption.getActions({ commandLineMatch, outputMatch: typeof outputMatch !== 'string' ? outputMatch : undefined }, command);
			if (actions) {
				matchActions.push(...actions);
			}
		}
	}
	return matchActions.length === 0 ? undefined : matchActions;
}
