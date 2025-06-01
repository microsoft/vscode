/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ITerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { clearMultipleTerminals } from '../../browser/clearMultipleTerminals.js';
import { IDisposable, Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';

suite('Terminal - Clear Multiple Terminals', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestTerminalInstance extends Disposable implements Partial<ITerminalInstance> {
		private _buffer: string[] = [];

		readonly instanceId: number;
		readonly resource: URI;
		readonly cols: number = 80;
		readonly rows: number = 30;

		constructor(public readonly title: string, id: number) {
			super();
			this.instanceId = id;
			this.resource = URI.from({ scheme: 'terminal', path: id.toString() });
		}

		get description(): string | undefined {
			return undefined;
		}

		sendText(text: string, shouldExecute = true, bracketedPasteMode?: boolean): Promise<void> {
			this._buffer.push(text);
			return Promise.resolve();
		}

		clearBuffer(): void {
			this._buffer = [];
		}

		getBuffer(): string {
			return this._buffer.join('\n');
		}
	}

	class TestTerminalService extends Disposable implements Partial<ITerminalService> {
		private _instances: TestTerminalInstance[] = [];
		private _nextInstanceId = 1;

		constructor() {
			super();
			this._register(toDisposable(() => {
				for (const instance of this._instances) {
					instance.dispose();
				}
				this._instances = [];
			}));
		}

		get instances(): readonly ITerminalInstance[] {
			return this._instances as unknown as ITerminalInstance[];
		}

		async createTerminal(options?: any): Promise<ITerminalInstance> {
			const name = options?.config && typeof options.config === 'object' && 'profileName' in options.config ?
				options.config.profileName :
				`Terminal ${this._nextInstanceId}`;

			const instance = new TestTerminalInstance(name as string, this._nextInstanceId++);
			this._register(instance);
			this._instances.push(instance);
			return instance as unknown as ITerminalInstance;
		}
	}

	function createMockQuickInputService(
		store: { add: <T extends IDisposable>(disposable: T) => T },
		terminalService: TestTerminalService,
		selectedTerminals: ITerminalInstance[] = [],
		allItemsPicked: boolean = false
	): IQuickInputService {
		const onDidAcceptEmitter = store.add(new Emitter<{ inBackground: boolean }>());
		const onDidHideEmitter = store.add(new Emitter<void>());
		const onDidChangeSelectionEmitter = store.add(new Emitter<any[]>());

		let disposalTracker: IDisposable[] = [];

		return {
			createQuickPick: () => {
				disposalTracker = [];

				const items = terminalService.instances.map(t => ({
					label: t.title,
					description: t.description,
					terminal: t,
					picked: allItemsPicked
				}));

				const selectedItems = allItemsPicked
					? [...items]
					: selectedTerminals.map(t => ({
						label: t.title,
						description: t.description,
						terminal: t
					}));

				const quickPick = {
					items,
					selectedItems,
					canSelectMany: true,
					placeholder: '',
					show: () => {
						setTimeout(() => {
							onDidAcceptEmitter.fire({ inBackground: false });
						}, 0);
					},
					hide: () => {
						onDidHideEmitter.fire();
					},
					dispose: () => {
						disposalTracker.forEach(d => d.dispose());
						disposalTracker = [];
					},
					onDidChangeSelection: (callback: (items: any[]) => void) => {
						const disposable = onDidChangeSelectionEmitter.event(callback);
						disposalTracker.push(disposable);
						return disposable;
					},
					onDidAccept: (callback: () => void) => {
						const disposable = onDidAcceptEmitter.event(callback);
						disposalTracker.push(disposable);
						return disposable;
					},
					onDidHide: (callback: () => void) => {
						const disposable = onDidHideEmitter.event(callback);
						disposalTracker.push(disposable);
						return disposable;
					},
					onDidChangeActive: Event.None,
					onDidChangeValue: Event.None
				};

				return quickPick;
			}
		} as unknown as IQuickInputService;
	}

	test('should clear selected terminals and leave others untouched', async () => {
		const terminalService = store.add(new TestTerminalService());

		const terminal1 = await terminalService.createTerminal({
			config: {
				profileName: 'bash-1',
				path: '/bin/bash',
				isDefault: false
			}
		});
		const terminal2 = await terminalService.createTerminal({
			config: {
				profileName: 'bash-2',
				path: '/bin/bash',
				isDefault: false
			}
		});
		const terminal3 = await terminalService.createTerminal({
			config: {
				profileName: 'bash-3',
				path: '/bin/bash',
				isDefault: false
			}
		});

		await terminal1.sendText('echo "Terminal 1 - Command 1"', true);
		await terminal1.sendText('echo "Terminal 1 - Command 2"', true);
		await terminal2.sendText('echo "Terminal 2 - Command 1"', true);
		await terminal2.sendText('echo "Terminal 2 - Command 2"', true);
		await terminal3.sendText('echo "Terminal 3 - Command 1"', true);
		await terminal3.sendText('echo "Terminal 3 - Command 2"', true);

		const testTerminal1Pre = terminal1 as unknown as TestTerminalInstance;
		const testTerminal2Pre = terminal2 as unknown as TestTerminalInstance;
		const testTerminal3Pre = terminal3 as unknown as TestTerminalInstance;

		assert.strictEqual(
			testTerminal1Pre.getBuffer(),
			'echo "Terminal 1 - Command 1"\necho "Terminal 1 - Command 2"',
			'Terminal 1 should have initial commands'
		);
		assert.strictEqual(
			testTerminal2Pre.getBuffer(),
			'echo "Terminal 2 - Command 1"\necho "Terminal 2 - Command 2"',
			'Terminal 2 should have initial commands'
		);
		assert.strictEqual(
			testTerminal3Pre.getBuffer(),
			'echo "Terminal 3 - Command 1"\necho "Terminal 3 - Command 2"',
			'Terminal 3 should have initial commands'
		);

		const mockQuickInputService = createMockQuickInputService(
			store,
			terminalService,
			[terminal2, terminal3],
			false
		);

		await clearMultipleTerminals(terminalService as unknown as any, mockQuickInputService);

		await new Promise<void>(resolve => setTimeout(resolve, 10));

		const testTerminal1 = terminal1 as unknown as TestTerminalInstance;
		const testTerminal2 = terminal2 as unknown as TestTerminalInstance;
		const testTerminal3 = terminal3 as unknown as TestTerminalInstance;

		assert.strictEqual(testTerminal1.getBuffer(), 'echo "Terminal 1 - Command 1"\necho "Terminal 1 - Command 2"', 'Terminal 1 should not be cleared');
		assert.strictEqual(testTerminal2.getBuffer(), '', 'Terminal 2 should be cleared');
		assert.strictEqual(testTerminal3.getBuffer(), '', 'Terminal 3 should be cleared');
	});

	test('should clear all terminals when Select All is used', async () => {
		const terminalService = store.add(new TestTerminalService());

		const bashTerminal = await terminalService.createTerminal({
			config: {
				profileName: 'bash',
				path: '/bin/bash',
				isDefault: false
			}
		});
		const zshTerminal = await terminalService.createTerminal({
			config: {
				profileName: 'zsh',
				path: '/bin/zsh',
				isDefault: false
			}
		});
		const powershellTerminal = await terminalService.createTerminal({
			config: {
				profileName: 'powershell',
				path: '/usr/bin/pwsh',
				isDefault: false
			}
		});

		await bashTerminal.sendText('echo "Bash - Command 1"', true);
		await bashTerminal.sendText('echo "Bash - Command 2"', true);
		await zshTerminal.sendText('echo "Zsh - Command 1"', true);
		await zshTerminal.sendText('echo "Zsh - Command 2"', true);
		await powershellTerminal.sendText('Write-Host "PowerShell - Command 1"', true);
		await powershellTerminal.sendText('Write-Host "PowerShell - Command 2"', true);

		const testBashTerminal = bashTerminal as unknown as TestTerminalInstance;
		const testZshTerminal = zshTerminal as unknown as TestTerminalInstance;
		const testPowershellTerminal = powershellTerminal as unknown as TestTerminalInstance;

		assert.strictEqual(
			testBashTerminal.getBuffer(),
			'echo "Bash - Command 1"\necho "Bash - Command 2"',
			'Bash terminal should have initial commands'
		);
		assert.strictEqual(
			testZshTerminal.getBuffer(),
			'echo "Zsh - Command 1"\necho "Zsh - Command 2"',
			'Zsh terminal should have initial commands'
		);
		assert.strictEqual(
			testPowershellTerminal.getBuffer(),
			'Write-Host "PowerShell - Command 1"\nWrite-Host "PowerShell - Command 2"',
			'PowerShell terminal should have initial commands'
		);

		const mockQuickInputService = createMockQuickInputService(
			store,
			terminalService,
			[],
			true
		);

		await clearMultipleTerminals(terminalService as unknown as any, mockQuickInputService);

		await new Promise<void>(resolve => setTimeout(resolve, 10));

		assert.strictEqual(testBashTerminal.getBuffer(), '', 'Bash terminal should be cleared');
		assert.strictEqual(testZshTerminal.getBuffer(), '', 'Zsh terminal should be cleared');
		assert.strictEqual(testPowershellTerminal.getBuffer(), '', 'PowerShell terminal should be cleared');
	});
});
