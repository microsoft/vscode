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

type ResolvedMatchOptions = { actions: IAction[] | undefined; offset?: number } | undefined;

export interface IContextualAction {
	/**
	 * Shows the quick fix menu
	 */
	showQuickFixMenu(): void;

	/**
	 * Triggers the related callback or throws an error
	 */
	resolveFreePortRequest(): void;

	/**
	 * Registers a listener on onCommandFinished scoped to a particular command or regular
	 * expression and provides a callback to be executed for commands that match.
	 */
	registerCommandFinishedListener(options: ITerminalContextualActionOptions): void;
}

export interface IContextualActionAdddon extends IContextualAction {
	onDidRequestRerunCommand: Event<ITerminalCommand>;
	onDidRequestFreePort: Event<string>;
}

export class ContextualActionAddon extends Disposable implements ITerminalAddon, IContextualActionAdddon {
	private readonly _onDidRequestRerunCommand = new Emitter<ITerminalCommand>();
	readonly onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;
	private readonly _onDidRequestFreePort = new Emitter<string>();
	readonly onDidRequestFreePort = this._onDidRequestFreePort.event;

	private _resolveCallback: Function | undefined;

	private _terminal: Terminal | undefined;

	private _currentQuickFixElement: HTMLElement | undefined;

	private _decorationMarkerIds = new Set<string>();

	private _commandListeners: Map<string, ITerminalContextualActionOptions> = new Map();

	private _optionsToApply: ResolvedMatchOptions;

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
		if (options.commandLineMatcher) {
			this._commandListeners.set(options.commandLineMatcher.toString(), options);
		}
	}

	resolveFreePortRequest(): void {
		if (this._resolveCallback) {
			this._resolveCallback();
			this._resolveCallback = undefined;
		}
	}

	private _registerCommandFinishedHandler(): void {
		const terminal = this._terminal;
		const commandDetection = this._capabilities.get(TerminalCapability.CommandDetection);
		if (!terminal || !commandDetection) {
			return;
		}
		this._register(commandDetection.onCommandFinished(async command => {
			this._optionsToApply = this._getMatchOptions(command);
		}));
		// The buffer is not ready by the time command finish
		// is called. Add the decoration on command start using the actions, if any,
		// from the last command
		this._register(commandDetection.onCommandStarted(() => {
			if (this._optionsToApply) {
				this._registerContextualDecoration();
				this._optionsToApply = undefined;
			}
		}));
	}

	private _registerContextualDecoration(): void {
		const marker = this._terminal?.registerMarker(this._optionsToApply?.offset);
		const actions = this._optionsToApply?.actions;
		if (this._terminal && 'registerDecoration' in this._terminal) {
			const d = (this._terminal as any).registerDecoration({
				marker,
				actions,
				layer: 'top'
			});
			d.onRender((e: HTMLElement) => {
				if (!this._decorationMarkerIds.has(d.marker.id)) {
					this._currentQuickFixElement = e;
					e.classList.add(DecorationSelector.QuickFix, DecorationSelector.Codicon, DecorationSelector.CommandDecoration, DecorationSelector.XtermDecoration);
					e.style.color = '#ffcc00';
					updateLayout(this._configurationService, e);
					if (actions) {
						this._decorationMarkerIds.add(d.marker.id);
						dom.addDisposableListener(e, dom.EventType.CLICK, () => {
							this._contextMenuService.showContextMenu({ getAnchor: () => e, getActions: () => actions });
							this._contextMenuService.onDidHideContextMenu(() => d.dispose());
						});
					}
				}
			});
		}
	}

	private _getMatchOptions(command: ITerminalCommand): ResolvedMatchOptions {
		// TODO: This wouldn't handle commands containing escaped spaces correctly
		const newCommand = command.command;
		for (const options of this._commandListeners.values()) {
			if (options.nonZeroExitCode && command.exitCode === 0) {
				continue;
			}
			const commandLineMatch = newCommand.match(options.commandLineMatcher);
			if (!commandLineMatch) {
				continue;
			}
			const outputMatch = options.outputRegex ? command.getOutput()?.match(options.outputRegex.lineMatcher) : null;
			const actions = options.callback({ commandLineMatch, outputMatch }, command);
			if (actions) {
				return { actions, offset: options.outputRegex?.offset };
			}
		}
		return undefined;
	}
}
