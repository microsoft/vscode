/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionContext, window, Pseudoterminal, EventEmitter, TerminalDimensions, CancellationToken, ProviderResult, TerminalProfile, ThemeColor } from 'vscode';

// Nodepod SDK types
interface TerminalOptions {
	Terminal: any;
	FitAddon?: any;
	WebglAddon?: any;
	theme?: any;
	fontSize?: number;
	fontFamily?: string;
	prompt?: (cwd: string) => string;
}

interface NodepodTerminal {
	setCwd(cwd: string): void;
	input(text: string): void;
	write(text: string): void;
	writeln(text: string): void;
	setTheme(theme: any): void;
	clear(): void;
	getCwd(): string;
	readonly xterm: any;
}

interface NodepodAPI {
	createTerminal(opts: TerminalOptions): NodepodTerminal;
}

declare global {
	interface Window {
		nodepod?: NodepodAPI;
	}
}

export function activate(context: ExtensionContext) {
	// Register the terminal profile provider for nodepod
	const terminalProvider = window.registerTerminalProfileProvider('nodepod.terminal', {
		// @ts-ignore
		provideTerminalProfile(token: CancellationToken): ProviderResult<TerminalProfile> {
			const pty = new NodepodPseudoterminal();
			return new TerminalProfile({
				name: 'Nodepod',
				pty,
				iconPath: new ThemeColor('terminal.ansiGreen'),
			});
		}
	});

	context.subscriptions.push(terminalProvider);
}

/**
 * A Pseudoterminal implementation that bridges VS Code's terminal to Nodepod.
 *
 * Uses Nodepod's createTerminal() API with a headless xterm mock that forwards
 * all I/O directly to VS Code's terminal without any DOM elements.
 */
class NodepodPseudoterminal implements Pseudoterminal {
	private writeEmitter = new EventEmitter<string>();
	private closeEmitter = new EventEmitter<void | number>();

	onDidWrite = this.writeEmitter.event;
	onDidClose = this.closeEmitter.event;

	// @ts-ignore
	private nodepodTerminal: NodepodTerminal | undefined;
	private inputHandler: ((data: string) => void) | undefined;

	// @ts-ignore
	open(initialDimensions: TerminalDimensions | undefined): void {
		if (!(window as any).nodepod) {
			this.writeEmitter.fire('\x1b[31mError: Nodepod SDK not loaded\x1b[0m\r\n');
			this.writeEmitter.fire('Please ensure Nodepod is initialized.\r\n');
			return;
		}

		// Create the Nodepod terminal with our headless xterm mock
		this.nodepodTerminal = (window as any).nodepod.createTerminal({
			Terminal: this.createHeadlessXterm(),
		});

		// Write initial message (Nodepod will write its own prompt after)
		this.writeEmitter.fire('\x1b[32mNodepod Terminal\x1b[0m\r\n');
		this.writeEmitter.fire('\x1b[90mJavaScript runtime environment\x1b[0m\r\n');
	}

	close(): void {
		this.nodepodTerminal = undefined;
		this.inputHandler = undefined;
	}

	handleInput(data: string): void {
		if (this.inputHandler) {
			this.inputHandler(data);
		}
	}

	// @ts-ignore
	setDimensions(dimensions: TerminalDimensions): void {
		// Update xterm dimensions if needed
	}

	/**
	 * Creates a headless xterm class that forwards all writes to VS Code's terminal
	 * and captures input handlers to forward VS Code input.
	 */
	private createHeadlessXterm(): new (options: any) => any {
		const writeEmitter = this.writeEmitter;
		const self = this;

		return class HeadlessXterm {
			cols = 80;
			rows = 24;
			options: any = {};
			element: undefined;
			textarea: undefined;

			// @ts-ignore
			private _onDataHandler: ((data: string) => void) | undefined;
			private _disposables: { dispose: () => void }[] = [];

			constructor(opts: any) {
				this.options = { ...opts };
			}

			// Called by NodepodTerminal.attach() - no-op since we're headless
			// @ts-ignore
			open(container: any): void {
				// No DOM needed
			}

			dispose(): void {
				this._disposables.forEach(d => d.dispose());
				this._disposables = [];
			}

			write(data: string | Uint8Array, callback?: () => void): void {
				if (typeof data === 'string') {
					writeEmitter.fire(data);
				} else {
					const decoder = new TextDecoder();
					writeEmitter.fire(decoder.decode(data));
				}
				callback?.();
			}

			writeln(data: string, callback?: () => void): void {
				this.write(data + '\r\n', callback);
			}

			clear(): void {
				writeEmitter.fire('\x1b[2J\x1b[3J\x1b[;H');
			}

			// Input handling - store the handler so VS Code can forward input
			onData(handler: (data: string) => void): { dispose: () => void } {
				this._onDataHandler = handler;
				self.inputHandler = handler;

				const disposable = {
					dispose: () => {
						if (self.inputHandler === handler) {
							self.inputHandler = undefined;
						}
					}
				};
				this._disposables.push(disposable);
				return disposable;
			}

			// @ts-ignore
			onKey(handler: any): { dispose: () => void } {
				return { dispose: () => { } };
			}

			// @ts-ignore
			onResize(handler: any): { dispose: () => void } {
				return { dispose: () => { } };
			}

			// @ts-ignore
			loadAddon(addon: any): void {
				// No-op: addons not needed in headless mode
			}

			focus(): void { }
			blur(): void { }
			resize(cols: number, rows: number): void {
				this.cols = cols;
				this.rows = rows;
			}

			// Buffer access (minimal implementation)
			get buffer(): any {
				return {
					normal: {
						cursorY: 0,
						cursorX: 0,
						viewportY: 0,
						baseY: 0,
						length: 0,
						getLine: () => undefined
					}
				};
			}

			get selection(): string { return ''; }
			selectAll(): void { }
			deselect(): void { }
			hasSelection(): boolean { return false; }
			getSelection(): string { return ''; }
			clearSelection(): void { }
			// @ts-ignore
			scrollLines(amount: number): void { }
			// @ts-ignore
			scrollPages(pageCount: number): void { }
			scrollToTop(): void { }
			// @ts-ignore
			scrollToBottom(): void { }
			// @ts-ignore
			scrollToLine(line: number): void { }
			// @ts-ignore
			reset(): void { }
			// @ts-ignore
			refresh(start: number, end: number): void { }
		};
	}
}
