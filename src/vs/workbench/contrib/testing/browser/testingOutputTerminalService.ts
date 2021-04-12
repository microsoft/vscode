/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { listenStream } from 'vs/base/common/stream';
import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessDataEvent, ITerminalChildProcess, ITerminalLaunchError, TerminalShellType } from 'vs/platform/terminal/common/terminal';
import { ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';


export interface ITestingOutputTerminalService {
	_serviceBrand: undefined;

	/**
	 * Opens a terminal for the given test's output.
	 */
	open(result: ITestResult): Promise<void>;
}

const friendlyDate = (date: number) => {
	const d = new Date(date);
	return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
};

const genericTitle = localize('testOutputTerminalTitle', 'Test Output');

type TestOutputTerminalInstance = ITerminalInstance & { shellLaunchConfig: { customPtyImplementation: TestOutputProcess } };

export const ITestingOutputTerminalService = createDecorator<ITestingOutputTerminalService>('ITestingOutputTerminalService');

export class TestingOutputTerminalService implements ITestingOutputTerminalService {
	_serviceBrand: undefined;

	constructor(@ITerminalService private readonly terminalService: ITerminalService) { }

	/**
	 * @inheritdoc
	 */
	public async open(result: ITestResult | undefined): Promise<void> {
		const title = result
			? localize('testOutputTerminalTitleWithDate', 'Test Output at {0}', friendlyDate(result.completedAt ?? Date.now()))
			: genericTitle;

		const testOutputPtys = this.terminalService.terminalInstances.filter(
			(i): i is TestOutputTerminalInstance => i.shellLaunchConfig.customPtyImplementation instanceof TestOutputProcess);

		// If there's an existing terminal for the attempted reveal, show that instead.
		const existing = testOutputPtys.find(i => i.shellLaunchConfig.customPtyImplementation.resultId === result?.id);
		if (existing) {
			this.terminalService.setActiveInstance(existing);
			this.terminalService.showPanel();
			return;
		}

		// Try to reuse ended terminals, otherwise make a new one
		let output: TestOutputProcess;
		let terminal = testOutputPtys.find(i => i.shellLaunchConfig.customPtyImplementation.ended);
		if (terminal) {
			output = terminal.shellLaunchConfig.customPtyImplementation;
		} else {
			output = new TestOutputProcess();
			terminal = this.terminalService.createTerminal({
				isFeatureTerminal: true,
				customPtyImplementation: () => output,
				name: title,
			}) as TestOutputTerminalInstance;
		}

		output.resetFor(result?.id, title);
		this.terminalService.setActiveInstance(terminal);
		this.terminalService.showPanel();

		if (!result) {
			// seems like it takes a tick for listeners to be registered
			output.ended = true;
			setTimeout(() => output.pushData(localize('testNoRunYet', '\r\nNo tests have been run, yet.\r\n')));
			return;
		}

		listenStream(await result.getOutput(), {
			onData: d => output.pushData(d.toString()),
			onError: err => output.pushData(`\r\n\r\n${err.stack || err.message}`),
			onEnd: () => {
				const completedAt = result.completedAt ? new Date(result.completedAt) : new Date();
				const text = localize('runFinished', 'Test run finished at {0}', completedAt.toLocaleString());
				output.pushData(`\r\n\r\n\x1b[1m> ${text} <\x1b[0m\r\n`);
				output.ended = true;
			},
		});
	}
}

class TestOutputProcess extends Disposable implements ITerminalChildProcess {
	private processDataEmitter = this._register(new Emitter<string | IProcessDataEvent>());
	private titleEmitter = this._register(new Emitter<string>());

	/** Whether the associated test has ended (indicating the terminal can be reused) */
	public ended = true;
	/** Result currently being displayed */
	public resultId: string | undefined;

	public pushData(data: string | IProcessDataEvent) {
		this.processDataEmitter.fire(data);
	}

	public resetFor(resultId: string | undefined, title: string) {
		this.ended = false;
		this.resultId = resultId;
		this.processDataEmitter.fire('\x1bc');
		this.titleEmitter.fire(title);
	}

	//#region implementation
	public readonly id = 0;
	public readonly shouldPersist = false;

	public readonly onProcessData = this.processDataEmitter.event;
	public readonly onProcessExit = this._register(new Emitter<number | undefined>()).event;
	public readonly onProcessReady = this._register(new Emitter<{ pid: number; cwd: string; }>()).event;
	public readonly onProcessTitleChanged = this.titleEmitter.event;
	public readonly onProcessShellTypeChanged = this._register(new Emitter<TerminalShellType>()).event;

	public start(): Promise<ITerminalLaunchError | undefined> {
		return Promise.resolve(undefined);
	}
	public shutdown(): void {
		// no-op
	}
	public input(): void {
		// not supported
	}
	public processBinary(): Promise<void> {
		return Promise.resolve();
	}
	public resize(): void {
		// no-op
	}
	public acknowledgeDataEvent(): void {
		// no-op, flow control not currently implemented
	}

	public getInitialCwd(): Promise<string> {
		return Promise.resolve('');
	}

	public getCwd(): Promise<string> {
		return Promise.resolve('');
	}

	public getLatency(): Promise<number> {
		return Promise.resolve(0);
	}
	//#endregion
}
