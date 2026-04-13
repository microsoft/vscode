/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-ignore
import { TerminalProfile, window, ThemeColor, Pseudoterminal, EventEmitter, TerminalDimensions, CancellationToken, commands, ExtensionContext, Disposable } from "vscode";

// // Nodepod API client that communicates with the core via commands
// class NodepodAPI {
// 	static async fsStat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number; mtime: number }> {
// 		return commands.executeCommand('nodepod.fs.stat', path);
// 	}

// 	static async fsReadFile(path: string, encoding?: string): Promise<string | number[]> {
// 		return commands.executeCommand('nodepod.fs.readFile', path, encoding);
// 	}

// 	static async fsWriteFile(path: string, content: number[] | string): Promise<void> {
// 		return commands.executeCommand('nodepod.fs.writeFile', path, content);
// 	}

// 	static async fsMkdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
// 		return commands.executeCommand('nodepod.fs.mkdir', path, opts);
// 	}

// 	static async fsReaddir(path: string): Promise<string[]> {
// 		return commands.executeCommand('nodepod.fs.readdir', path);
// 	}

// 	static async fsExists(path: string): Promise<boolean> {
// 		return commands.executeCommand('nodepod.fs.exists', path);
// 	}

// 	static async fsUnlink(path: string): Promise<void> {
// 		return commands.executeCommand('nodepod.fs.unlink', path);
// 	}

// 	static async fsRmdir(path: string, opts?: { recursive?: boolean }): Promise<void> {
// 		return commands.executeCommand('nodepod.fs.rmdir', path, opts);
// 	}

// 	static async fsRename(from: string, to: string): Promise<void> {
// 		return commands.executeCommand('nodepod.fs.rename', from, to);
// 	}

// 	static async createTerminal(options?: { name?: string; cwd?: string }): Promise<NodepodTerminal> {
// 		const terminalId = await commands.executeCommand<string>('nodepod.terminal.create', options);
// 		return new NodepodTerminal(terminalId);
// 	}
// }

// class NodepodTerminal {
// 	private _disposables: Disposable[] = [];
// 	private _writeEmitter = new EventEmitter<string>();
// 	private _closeEmitter = new EventEmitter<void | number>();

// 	onDidWrite = this._writeEmitter.event;
// 	onDidClose = this._closeEmitter.event;

// 	constructor(public readonly id: string) { }

// 	async sendInput(data: string): Promise<void> {
// 		return commands.executeCommand('nodepod.terminal.sendInput', this.id, data);
// 	}

// 	async resize(cols: number, rows: number): Promise<void> {
// 		return commands.executeCommand('nodepod.terminal.resize', this.id, cols, rows);
// 	}

// 	async kill(): Promise<void> {
// 		return commands.executeCommand('nodepod.terminal.kill', this.id);
// 	}

// 	dispose(): void {
// 		this._disposables.forEach(d => d.dispose());
// 		this._disposables = [];
// 	}
// }

//@ts-ignore
export function activate(context: ExtensionContext) {
	// const terminalProvider = window.registerTerminalProfileProvider('nodepod.terminal', {
	// 	provideTerminalProfile(_token: CancellationToken): TerminalProfile {
	// 		return new TerminalProfile({
	// 			name: 'Nodepod',
	// 			pty: new NodepodPseudoterminal(),
	// 			iconPath: new ThemeColor('terminal.ansiGreen'),
	// 		});
	// 	}
	// });

	// const openCommand = commands.registerCommand('nodepod.openTerminal', () => {
	// 	window.createTerminal({ name: 'Nodepod', pty: new NodepodPseudoterminal() });
	// 	// createTerminal doesn't auto-show, so reveal it:
	// 	window.terminals.at(-1)?.show();
	// });

	// context.subscriptions.push(terminalProvider, openCommand);
}

// class NodepodPseudoterminal implements Pseudoterminal {
// 	private writeEmitter = new EventEmitter<string>();
// 	private closeEmitter = new EventEmitter<void | number>();

// 	onDidWrite = this.writeEmitter.event;
// 	onDidClose = this.closeEmitter.event;

// 	private nodepodTerminal: NodepodTerminal | undefined;
// 	private _disposables: Disposable[] = [];

// 	//@ts-ignore
// 	async open(initialDimensions: TerminalDimensions | undefined): Promise<void> {
// 		try {
// 			// Create the Nodepod terminal via the command API
// 			this.nodepodTerminal = await NodepodAPI.createTerminal({
// 				name: 'Nodepod',
// 				cwd: '/nodepod',
// 			});

// 			// Forward data from nodepod terminal to VS Code terminal
// 			this._disposables.push(
// 				this.nodepodTerminal.onDidWrite(data => {
// 					this.writeEmitter.fire(data);
// 				})
// 			);

// 			this._disposables.push(
// 				this.nodepodTerminal.onDidClose(exitCode => {
// 					this.closeEmitter.fire(exitCode);
// 				})
// 			);

// 			// Write initial message (Nodepod will write its own prompt after)
// 			this.writeEmitter.fire('\x1b[32mNodepod Terminal\x1b[0m\r\n');
// 			this.writeEmitter.fire('\x1b[90mJavaScript runtime environment\x1b[0m\r\n');
// 		} catch (error) {
// 			this.writeEmitter.fire(`\x1b[31mError: Failed to create Nodepod terminal\x1b[0m\r\n`);
// 			this.writeEmitter.fire(`\x1b[31m${String(error)}\x1b[0m\r\n`);
// 		}
// 	}

// 	close(): void {
// 		if (this.nodepodTerminal) {
// 			this.nodepodTerminal.kill();
// 			this.nodepodTerminal.dispose();
// 			this.nodepodTerminal = undefined;
// 		}
// 		this._disposables.forEach(d => d.dispose());
// 		this._disposables = [];
// 	}

// 	handleInput(data: string): void {
// 		if (this.nodepodTerminal) {
// 			this.nodepodTerminal.sendInput(data);
// 		}
// 	}

// 	setDimensions(dimensions: TerminalDimensions): void {
// 		if (this.nodepodTerminal && dimensions) {
// 			this.nodepodTerminal.resize(dimensions.columns, dimensions.rows);
// 		}
// 	}
// }
