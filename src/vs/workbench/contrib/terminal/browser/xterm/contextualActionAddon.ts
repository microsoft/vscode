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
import type { IBufferCell, IMarker, ITerminalAddon, Terminal } from 'xterm-headless';
import * as cp from 'child_process';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import * as dom from 'vs/base/browser/dom';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

interface IContextualActionAdddon {
	/**
	 * Registers a listener on onCommandFinished scoped to a particular command or regular
	 * expression.
	 * will fire the listener for commands that match.
	 * @param callback The callback to trigger when a matching command finished.
	 */
	registerCommandFinishedListener(matcher: string | RegExp, callback: (command: ITerminalCommand) => void): IDisposable;
	onDidRequestRerunCommand: Event<ITerminalCommand>;

	/**
	 * Shows the quick fix menu
	 */
	show(): void;
}

export class ContextualActionAddon extends Disposable implements ITerminalAddon, IContextualActionAdddon {
	private readonly _onDidRequestRerunCommand = new Emitter<ITerminalCommand>();
	readonly onDidRequestRerunCommand = this._onDidRequestRerunCommand.event;

	private _terminal: Terminal | undefined;

	private _currentQuickFixElement: HTMLElement | undefined;

	private _decorationMarkerIds = new Map<string, HTMLElement>();

	private _stringCommandListeners: Map<string, ((command: ITerminalCommand) => void)[]> = new Map();
	private _regexpCommandFinishedListeners: { regexp: RegExp; callback: (command: ITerminalCommand) => void }[] = [];

	constructor(@IContextMenuService private readonly _contextMenuService: IContextMenuService,
		@INotificationService private readonly _notificationService: INotificationService) {
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
			const output = command.getOutput();
			//TODO: support this for tasks
			//TODO: narrow this down more
			// if (command.exitCode === 1) {
			// TODO: add other possible regexps
			const match = output?.match(/.*address already in use \d\.\d.\d\.\d:(\d\d\d\d).*/);
			if (match && match.length === 2 && command.endMarker) {
				console.log(`address in use for port ${match[1]}`);
				const actions: IAction[] = [];
				const labelRun = localize("terminal.freePort", "Free port {0}", match[1]);
				actions.push({
					class: undefined, tooltip: labelRun, id: 'terminal.freePort', label: labelRun, enabled: true,
					run: async () => {
						const procs = await new Promise<string>((resolve, reject) => {
							cp.exec(`lsof -nP -iTCP -sTCP:LISTEN | grep ${match[1]}`, {}, (err, stdout) => {
								if (err) {
									return reject('Problem occurred when listing active processes');
								}
								resolve(stdout);
							});
						});
						const procLines = procs.split('\n');
						if (procLines.length >= 1) {
							const regex = /\s+(\d+)\s+/;
							const matches = procLines[0].match(regex);
							if (matches && matches.length > 1) {
								console.log('found pid', matches[1]);
								await new Promise<string>((resolve, reject) => {
									cp.exec(`kill ${matches[1]}`, {}, (err, stdout) => {
										if (err) {
											console.log('error', err);
											this._notificationService.notify({ message: `Could not kill process w id: ${matches[1]} for port ${match[1]}`, severity: Severity.Warning });
											return reject(`Problem occurred when killing the process w id: ${matches[1]}`);
										}
										//TODO: notify success
										this._notificationService.notify({ message: `Killed process w ID: ${matches[1]} to free port ${match[1]}`, severity: Severity.Info });
										console.log(`killed process ${matches[1]}`);
										resolve(stdout);
									});
								});
								this._onDidRequestRerunCommand.fire(command);
							}
						}
					}
				});

				this._registerContextualDecoration(command.endMarker, actions);
			}
			// }
		});
	}

	private _registerContextualDecoration(marker: IMarker, actions?: IAction[], x?: number, width?: number, border?: boolean): void {
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
						this._decorationMarkerIds.set(d.marker.id, e);
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
