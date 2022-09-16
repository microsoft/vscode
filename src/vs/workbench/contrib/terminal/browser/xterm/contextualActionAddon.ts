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

export interface IContextualAction {
	/**
	 * Shows the quick fix menu
	 */
	show(): void;

	/**
	 * Accepts a freed port and triggers the related callback or throws an error
	 */
	resolveFreePortRequest(error?: Error): void;

	/**
	 * Registers a listener on onCommandFinished scoped to a particular command or regular
	 * expression.
	 * will fire the listener for commands that match.
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

	constructor(private readonly _capabilities: ITerminalCapabilityStore, @IContextMenuService private readonly _contextMenuService: IContextMenuService) {
		super();
		this._capabilities.get(TerminalCapability.CommandDetection)?.onCommandFinished(command => this._evaluate(command));
		this._capabilities.onDidAddCapability(c => {
			if (c === TerminalCapability.CommandDetection) {
				this._capabilities.get(TerminalCapability.CommandDetection)?.onCommandFinished(command => this._evaluate(command));
			}
		});
	}
	activate(terminal: Terminal): void {
		this._terminal = terminal;
	}

	public show(): void {
		this._currentQuickFixElement?.click();
	}

	private _evaluate(command: ITerminalCommand): void {
		// TODO: This wouldn't handle commands containing escaped spaces correctly
		const newCommand = command.command.split(' ')[0];
		for (const options of this._commandListeners.values()) {
			const commandLineMatch = newCommand.match(options.commandLineMatcher) || null;
			const outputMatch = options.outputMatcher ? command.getOutput()?.match(options.outputMatcher.lineMatcher) : null;
			if (commandLineMatch !== null) {
				options.callback(commandLineMatch, outputMatch, command);
			}
		}
	}

	resolveFreePortRequest(error?: Error): void {
		if (error) {
			throw error;
		}
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
					const inner = document.createElement('div');
					inner.classList.add('codicon-light-bulb', 'codicon', 'terminal-command-decoration', 'xterm-decoration');
					inner.style.position = 'absolute';
					inner.style.bottom = '100%';
					inner.style.left = '0';
					inner.style.color = '#ffcc00';
					e.appendChild(inner);
					if (actions) {
						this._decorationMarkerIds.add(d.marker.id);
						dom.addDisposableListener(e, dom.EventType.CLICK, () => {
							this._contextMenuService.showContextMenu({ getAnchor: () => e, getActions: () => actions });
							// TODO: delete the decoration when context menu closes
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
