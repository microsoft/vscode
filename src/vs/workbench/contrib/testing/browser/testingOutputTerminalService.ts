/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from 'vs/base/common/async';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { listenStream } from 'vs/base/common/stream';
import { isDefined } from 'vs/base/common/types';
import { localize } from 'vs/nls';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessDataEvent, IProcessPropertyMap, IShellLaunchConfig, ITerminalChildProcess, ITerminalDimensionsOverride, ITerminalLaunchError, ProcessCapability, ProcessPropertyType, TerminalLocation, TerminalShellType } from 'vs/platform/terminal/common/terminal';
import { IViewsService } from 'vs/workbench/common/views';
import { ITerminalEditorService, ITerminalGroupService, ITerminalInstance, ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TERMINAL_VIEW_ID } from 'vs/workbench/contrib/terminal/common/terminal';
import { testingViewIcon } from 'vs/workbench/contrib/testing/browser/icons';
import { ITestResult } from 'vs/workbench/contrib/testing/common/testResult';
import { ITestResultService } from 'vs/workbench/contrib/testing/common/testResultService';


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

const getTitle = (result: ITestResult | undefined) => {
	return result
		? localize('testOutputTerminalTitleWithDate', 'Test Output at {0}', friendlyDate(result.completedAt ?? Date.now()))
		: genericTitle;
};

const genericTitle = localize('testOutputTerminalTitle', 'Test Output');

export const ITestingOutputTerminalService = createDecorator<ITestingOutputTerminalService>('ITestingOutputTerminalService');

export class TestingOutputTerminalService implements ITestingOutputTerminalService {
	_serviceBrand: undefined;

	private outputTerminals = new WeakMap<ITerminalInstance, TestOutputProcess>();

	constructor(
		@ITerminalService private readonly terminalService: ITerminalService,
		@ITerminalGroupService private readonly terminalGroupService: ITerminalGroupService,
		@ITerminalEditorService private readonly terminalEditorService: ITerminalEditorService,
		@ITestResultService resultService: ITestResultService,
		@IViewsService private viewsService: IViewsService,
	) {
		// If a result terminal is currently active and we start a new test run,
		// stream live results there automatically.
		resultService.onResultsChanged(evt => {
			const active = this.terminalService.activeInstance;
			if (!('started' in evt) || !active) {
				return;
			}

			const pane = this.viewsService.getActiveViewWithId(TERMINAL_VIEW_ID);
			if (!pane) {
				return;
			}

			const output = this.outputTerminals.get(active);
			if (output && output.ended) {
				this.showResultsInTerminal(active, output, evt.started);
			}
		});
	}

	/**
	 * @inheritdoc
	 */
	public async open(result: ITestResult | undefined): Promise<void> {
		const testOutputPtys = this.terminalService.instances
			.map(t => {
				const output = this.outputTerminals.get(t);
				return output ? [t, output] as const : undefined;
			})
			.filter(isDefined);

		// If there's an existing terminal for the attempted reveal, show that instead.
		const existing = testOutputPtys.find(([, o]) => o.resultId === result?.id);
		if (existing) {
			this.terminalService.setActiveInstance(existing[0]);
			if (existing[0].target === TerminalLocation.Editor) {
				this.terminalEditorService.revealActiveEditor();
			} else {
				this.terminalGroupService.showPanel();
			}
			return;
		}

		// Try to reuse ended terminals, otherwise make a new one
		const ended = testOutputPtys.find(([, o]) => o.ended);
		if (ended) {
			ended[1].clear();
			this.showResultsInTerminal(ended[0], ended[1], result);
			return;
		}

		const output = new TestOutputProcess();
		this.showResultsInTerminal(await this.terminalService.createTerminal({
			config: {
				isFeatureTerminal: true,
				icon: testingViewIcon,
				customPtyImplementation: () => output,
				name: getTitle(result),
			}
		}), output, result);
	}

	private async showResultsInTerminal(terminal: ITerminalInstance, output: TestOutputProcess, result: ITestResult | undefined) {
		this.outputTerminals.set(terminal, output);
		output.resetFor(result?.id, getTitle(result));
		this.terminalService.setActiveInstance(terminal);
		if (terminal.target === TerminalLocation.Editor) {
			this.terminalEditorService.revealActiveEditor();
		} else {
			this.terminalGroupService.showPanel();
		}

		if (!result) {
			// seems like it takes a tick for listeners to be registered
			output.ended = true;
			setTimeout(() => output.pushData(localize('testNoRunYet', '\r\nNo tests have been run, yet.\r\n')));
			return;
		}

		const [stream] = await Promise.all([result.getOutput(), output.started]);
		let hadData = false;
		listenStream(stream, {
			onData: d => {
				hadData = true;
				output.pushData(d.toString());
			},
			onError: err => output.pushData(`\r\n\r\n${err.stack || err.message}`),
			onEnd: () => {
				if (!hadData) {
					output.pushData(`\x1b[2m${localize('runNoOutout', 'The test run did not record any output.')}\x1b[0m`);
				}

				const completedAt = result.completedAt ? new Date(result.completedAt) : new Date();
				const text = localize('runFinished', 'Test run finished at {0}', completedAt.toLocaleString());
				output.pushData(`\r\n\r\n\x1b[1m> ${text} <\x1b[0m\r\n\r\n`);
				output.ended = true;
			},
		});
	}
}

class TestOutputProcess extends Disposable implements ITerminalChildProcess {
	onProcessOverrideDimensions?: Event<ITerminalDimensionsOverride | undefined> | undefined;
	onProcessResolvedShellLaunchConfig?: Event<IShellLaunchConfig> | undefined;
	onDidChangeHasChildProcesses?: Event<boolean> | undefined;
	onDidChangeProperty = Event.None;
	private processDataEmitter = this._register(new Emitter<string | IProcessDataEvent>());
	private titleEmitter = this._register(new Emitter<string>());
	private readonly startedDeferred = new DeferredPromise<void>();
	private _capabilities: ProcessCapability[] = [];
	get capabilities(): ProcessCapability[] { return this._capabilities; }
	/** Whether the associated test has ended (indicating the terminal can be reused) */
	public ended = true;
	/** Result currently being displayed */
	public resultId: string | undefined;
	/** Promise resolved when the terminal is ready to take data */
	public readonly started = this.startedDeferred.p;

	public pushData(data: string | IProcessDataEvent) {
		this.processDataEmitter.fire(data);
	}

	public clear() {
		this.processDataEmitter.fire('\x1bc');
	}

	public resetFor(resultId: string | undefined, title: string) {
		this.ended = false;
		this.resultId = resultId;
		this.titleEmitter.fire(title);
	}

	//#region implementation
	public readonly id = 0;
	public readonly shouldPersist = false;

	public readonly onProcessData = this.processDataEmitter.event;
	public readonly onProcessExit = this._register(new Emitter<number | undefined>()).event;
	private readonly _onProcessReady = this._register(new Emitter<{ pid: number; cwd: string; capabilities: ProcessCapability[] }>());
	public readonly onProcessReady = this._onProcessReady.event;
	public readonly onProcessTitleChanged = this.titleEmitter.event;
	public readonly onProcessShellTypeChanged = this._register(new Emitter<TerminalShellType>()).event;

	public start(): Promise<ITerminalLaunchError | undefined> {
		this.startedDeferred.complete();
		this._onProcessReady.fire({ pid: -1, cwd: '', capabilities: [] });
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
	public setUnicodeVersion(): Promise<void> {
		// no-op
		return Promise.resolve();
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

	public refreshProperty<T extends ProcessPropertyType>(property: ProcessPropertyType): Promise<IProcessPropertyMap[T]> {
		throw new Error(`refreshProperty is not suppported in TestOutputProcesses. property: ${property}`);
	}

	public updateProperty(property: ProcessPropertyType, value: any): Promise<void> {
		throw new Error(`updateProperty is not suppported in TestOutputProcesses. property: ${property}, value: ${value}`);
	}
	//#endregion
}
