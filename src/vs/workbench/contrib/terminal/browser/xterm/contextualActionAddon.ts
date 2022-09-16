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
import type { ITerminalAddon, Terminal, IMarker } from 'xterm-headless';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ITerminalContextualActionOptions } from 'vs/workbench/contrib/terminal/browser/terminal';
import { DecorationSelector, updateLayout } from 'vs/workbench/contrib/terminal/browser/xterm/decorationStyles';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export interface IContextualAction {
	/**
	 * Shows the quick fix menu
	 */
	show(): void;

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

	public show(): void {
		this._currentQuickFixElement?.click();
	}

	private _registerCommandFinishedHandler(): void {
		// TODO:takes awhile for the output to come through, so need to wait for that to happen but this is flaky and depends upon how large the
		// output is
		this._register(this._capabilities.get(TerminalCapability.CommandDetection)!.onCommandFinished(async command => await setTimeout(() => this._evaluate(command), 300)));
	}

	private _evaluate(command: ITerminalCommand): void {
		// TODO: This wouldn't handle commands containing escaped spaces correctly
		const newCommand = command.command;
		for (const options of this._commandListeners.values()) {
			if (options.nonZeroExitCode && command.exitCode === 0) {
				continue;
			}
			const commandLine = newCommand.match(options.commandLineMatcher) || null;
			const output = options.outputRegex ? command.getOutput()?.match(options.outputRegex.lineMatcher) : null;
			if (commandLine !== null) {
				options.callback({ commandLine, output }, command);
			}
		}
	}

	resolveFreePortRequest(): void {
		if (this._resolveCallback) {
			this._resolveCallback();
			this._resolveCallback = undefined;
		}
	}

	registerContextualDecoration(marker: IMarker | undefined, actions?: IAction[], x?: number, width?: number, border?: boolean): void {
		if (this._terminal && 'registerDecoration' in this._terminal) {
			const d = (this._terminal as any).registerDecoration({
				marker,
				x,
				width,
				layer: 'top',
				actions
			});
			d.onRender((e: HTMLElement) => {
				if (!this._decorationMarkerIds.has(d.marker.id)) {
					this._currentQuickFixElement = e;
					e.style.border = border ? '1px solid #f00' : '';
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
	registerCommandFinishedListener(options: ITerminalContextualActionOptions): void {
		if (options.commandLineMatcher) {
			this._commandListeners.set(options.commandLineMatcher.toString(), options);
		}
	}
}
