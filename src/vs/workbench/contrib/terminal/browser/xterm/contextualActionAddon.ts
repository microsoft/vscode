/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { IAction } from 'vs/base/common/actions';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
// Importing types is safe in any layer
// eslint-disable-next-line local/code-import-patterns
import type { IBufferCell, ITerminalAddon, Terminal, IMarker } from 'xterm-headless';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

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
	 * @param callback The callback to trigger when a matching command finished.
	 */
	registerCommandFinishedListener(matcher: string | RegExp, callback: (command: ITerminalCommand) => void): IDisposable;
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

	private _stringCommandListeners: Map<string, ((command: ITerminalCommand) => void)[]> = new Map();
	private _regexpCommandFinishedListeners: { regexp: RegExp; callback: (command: ITerminalCommand) => void }[] = [];

	constructor(@IContextMenuService private readonly _contextMenuService: IContextMenuService) {
		super();
	}
	activate(terminal: Terminal): void {
		this._terminal = terminal;
		this._setupContextAwareListeners(this._terminal);
	}

	public show(): void {
		this._currentQuickFixElement?.click();
	}

	public evaluate(command: ITerminalCommand): void {
		// TODO: This wouldn't handle commands containing escaped spaces correctly
		const newCommand = command.command.split(' ')[0];
		const listeners = this._stringCommandListeners.get(newCommand);
		if (listeners) {
			for (const listener of listeners) {
				listener(command);
			}
		}
		for (const listener of this._regexpCommandFinishedListeners) {
			if (newCommand.match(listener.regexp)) {
				listener.callback(command);
			}
		}
	}
	private _setupContextAwareListeners(terminal: Terminal): void {
		this.registerCommandFinishedListener('gti', e => {
			// Check exitCode is truthy
			console.log('gti run, did you mean git?');
			console.log('ITerminalCommand', e);

			// Search for start of term
			if (!e.marker?.line) {
				return;
			}
			const line = terminal.buffer.active.getLine(e.marker.line);
			if (!line) {
				return;
			}
			const term = 'gti';
			let start = 0;
			let letter = 0;
			let cell: IBufferCell | undefined;
			for (let i = 0; i < line.length; i++) {
				cell = line.getCell(i, cell);
				if (!cell) {
					continue;
				}
				if (cell.getChars() === term[letter]) {
					if (letter === 0) {
						start = i;
					}
					letter++;
					if (letter === term.length) {
						break;
					}
				} else {
					letter = 0;
				}
				// if (line.getCell(start)?.getChars();
			}
			if (letter === term.length) {
				// TODO: pass in action which writes to the terminal the correct term
				console.log(`Found "${term}"! line: ${e.marker.line}, start: ${start}`);
				this._registerContextualDecoration(e.marker, undefined, start, term.length, true);
			}
			// console.log('output', e.getOutput());
		});

		this.registerCommandFinishedListener(/.+/, command => {
			if (command.exitCode) {
				const commandOutput = command.getOutput();
				const match = commandOutput?.match(/.*address already in use \d\.\d.\d\.\d:(\d\d\d\d).*/);
				if (match?.length === 2 && command.endMarker) {
					const actions: IAction[] = [];
					const port = match[1];
					const label = localize("terminal.freePort", "Free port {0}", port);
					actions.push({
						class: undefined, tooltip: label, id: 'terminal.freePort', label, enabled: true,
						run: () => this._onDidRequestFreePort.fire(port)
					});
					this._registerContextualDecoration(command.endMarker, actions);
					this._resolveCallback = () => { this._onDidRequestRerunCommand.fire(command); };
				}
			}
		});
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

	private _registerContextualDecoration(marker: IMarker | undefined, actions?: IAction[], x?: number, width?: number, border?: boolean): void {
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
	//TODO: shouldn't this be private?
	registerCommandFinishedListener(matcher: string | RegExp, callback: (command: ITerminalCommand) => void): IDisposable {
		if (typeof matcher === 'string') {
			const listeners = this._stringCommandListeners.get(matcher) || [];
			listeners.push(callback);
			this._stringCommandListeners.set(matcher, listeners);
		} else {
			this._regexpCommandFinishedListeners.push({ regexp: matcher, callback });
		}

		// TODO: Return disposable
		return null as any;
	}
}
