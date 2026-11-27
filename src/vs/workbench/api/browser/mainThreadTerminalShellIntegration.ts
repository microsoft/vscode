/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableMap, MutableDisposable } from '../../../base/common/lifecycle.js';
import { TerminalCapability, type ITerminalCommand } from '../../../platform/terminal/common/capabilities/capabilities.js';
import { ExtHostContext, MainContext, type ExtHostTerminalShellIntegrationShape, type MainThreadTerminalShellIntegrationShape } from '../common/extHost.protocol.js';
import { ITerminalService, type ITerminalInstance } from '../../contrib/terminal/browser/terminal.js';
import { IWorkbenchEnvironmentService } from '../../services/environment/common/environmentService.js';
import { extHostNamedCustomer, type IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import { TerminalShellExecutionCommandLineConfidence } from '../common/extHostTypes.js';
import { IExtensionService } from '../../services/extensions/common/extensions.js';

@extHostNamedCustomer(MainContext.MainThreadTerminalShellIntegration)
export class MainThreadTerminalShellIntegration extends Disposable implements MainThreadTerminalShellIntegrationShape {
	private readonly _proxy: ExtHostTerminalShellIntegrationShape;
	private readonly _executionDataForwarders = this._register(new DisposableMap<number, ShellExecutionDataForwarder>());

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IWorkbenchEnvironmentService workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IExtensionService private readonly _extensionService: IExtensionService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalShellIntegration);

		// onDidChangeTerminalShellIntegration initial state
		for (const terminal of this._terminalService.instances) {
			const cmdDetection = terminal.capabilities.get(TerminalCapability.CommandDetection);
			if (cmdDetection) {
				this._enableShellIntegration(terminal);
			}
		}

		// onDidChangeTerminalShellIntegration via command detection
		const onDidAddCommandDetection = this._store.add(this._terminalService.createOnInstanceEvent(instance => {
			return Event.map(
				instance.capabilities.onDidAddCommandDetectionCapability,
				() => instance
			);
		})).event;
		this._store.add(onDidAddCommandDetection(e => this._enableShellIntegration(e)));

		// onDidChangeTerminalShellIntegration via cwd
		const cwdChangeEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CwdDetection, e => e.onDidChangeCwd));
		this._store.add(cwdChangeEvent.event(e => {
			this._proxy.$cwdChange(e.instance.instanceId, e.data);
		}));

		// onDidChangeTerminalShellIntegration via env
		const envChangeEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.ShellEnvDetection, e => e.onDidChangeEnv));
		this._store.add(envChangeEvent.event(e => {
			if (e.data.value && typeof e.data.value === 'object') {
				const envValue = e.data.value as { [key: string]: string | undefined };

				// Extract keys and values
				const keysArr = Object.keys(envValue);
				const valuesArr = Object.values(envValue);
				this._proxy.$shellEnvChange(e.instance.instanceId, keysArr, valuesArr as string[], e.data.isTrusted);
			}
		}));

		// onDidStartTerminalShellExecution
		const commandDetectionStartEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandExecuted));
		let currentCommand: ITerminalCommand | undefined;
		let lastCommandId = 0;
		this._store.add(commandDetectionStartEvent.event(e => {
			// Prevent duplicate events from being sent in case command detection double fires the
			// event
			if (e.data === currentCommand) {
				return;
			}
			// String paths are not exposed in the extension API
			currentCommand = e.data;
			const instanceId = e.instance.instanceId;
			const commandId = ++lastCommandId;
			// Flush the data of a command that didn't finish before the next execution starts
			this._executionDataForwarders.deleteAndDispose(instanceId);
			const hasReader = this._proxy.$shellExecutionStart(instanceId, commandId, instanceSupportsExecuteCommandApi(e.instance), e.data.command, convertToExtHostCommandLineConfidence(e.data), e.data.isTrusted, e.data.cwd);

			// TerminalShellExecution.read
			const forwarder = new ShellExecutionDataForwarder(commandId, e.instance.onData, data => this._proxy.$shellExecutionData(instanceId, data));
			this._executionDataForwarders.set(instanceId, forwarder);
			hasReader.then(value => {
				if (!value) {
					forwarder.pause();
				}
			});
		}));

		// onDidEndTerminalShellExecution
		const commandDetectionEndEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandFinished));
		this._store.add(commandDetectionEndEvent.event(e => {
			currentCommand = undefined;
			const instanceId = e.instance.instanceId;
			this._executionDataForwarders.deleteAndDispose(instanceId);
			// Shell integration C (executed) and D (command finished) sequences should always be in
			// their own events, so send this immediately. This means that the D sequence will not
			// be included as it's currently being parsed when the command finished event fires.
			this._proxy.$shellExecutionEnd(instanceId, e.data.command, convertToExtHostCommandLineConfidence(e.data), e.data.isTrusted, e.data.exitCode);
		}));

		// Clean up after dispose
		this._store.add(this._terminalService.onDidDisposeInstance(e => {
			this._executionDataForwarders.deleteAndDispose(e.instanceId);
			this._proxy.$closeTerminal(e.instanceId);
		}));
	}

	$executeCommand(terminalId: number, commandLine: string): void {
		this._terminalService.getInstanceFromId(terminalId)?.runCommand(commandLine, true);
	}

	$startSendingExecutionData(terminalId: number, commandId: number): void {
		const forwarder = this._executionDataForwarders.get(terminalId);
		// A request for a previous command can arrive after the next command started
		if (forwarder?.commandId === commandId) {
			forwarder.resume();
		}
	}

	private _enableShellIntegration(instance: ITerminalInstance): void {
		this._extensionService.activateByEvent('onTerminalShellIntegration:*');
		if (instance.shellType) {
			this._extensionService.activateByEvent(`onTerminalShellIntegration:${instance.shellType}`);
		}
		this._proxy.$shellIntegrationChange(instance.instanceId, instanceSupportsExecuteCommandApi(instance));
		const cwdDetection = instance.capabilities.get(TerminalCapability.CwdDetection);
		if (cwdDetection) {
			this._proxy.$cwdChange(instance.instanceId, cwdDetection.getCwd());
		}
	}
}

function convertToExtHostCommandLineConfidence(command: ITerminalCommand): TerminalShellExecutionCommandLineConfidence {
	switch (command.commandLineConfidence) {
		case 'high':
			return TerminalShellExecutionCommandLineConfidence.High;
		case 'medium':
			return TerminalShellExecutionCommandLineConfidence.Medium;
		case 'low':
		default:
			return TerminalShellExecutionCommandLineConfidence.Low;
	}
}

function instanceSupportsExecuteCommandApi(instance: ITerminalInstance): boolean {
	return instance.shellLaunchConfig.type !== 'Task';
}

/**
 * Sends a running command's data to the extension host. Data is batched to reduce the message
 * count, but a batch is sent at most {@link ShellExecutionDataForwarder._flushDelay}ms after its
 * first chunk or once it reaches {@link ShellExecutionDataForwarder._maxBatchLength} characters,
 * so continuous output is neither held back nor buffered without limit.
 */
class ShellExecutionDataForwarder extends Disposable {
	private static readonly _flushDelay = 50;
	private static readonly _maxBatchLength = 1024 * 1024;

	private _batch: string[] = [];
	private _batchLength = 0;
	private _isResumed = false;
	private readonly _listener = this._register(new MutableDisposable());
	private readonly _flushScheduler = this._register(new RunOnceScheduler(() => this._flush(), ShellExecutionDataForwarder._flushDelay));

	constructor(
		readonly commandId: number,
		private readonly _onData: Event<string>,
		private readonly _send: (data: string) => void,
	) {
		super();
		this._listen();
	}

	/**
	 * Stops sending data and drops the data that wasn't sent yet, as the execution has no reader.
	 * This is ignored after {@link resume}, which can arrive first when the extension host adds
	 * a reader right after it reported that there was none.
	 */
	pause(): void {
		if (this._isResumed) {
			return;
		}
		this._listener.clear();
		this._flushScheduler.cancel();
		this._batch = [];
		this._batchLength = 0;
	}

	resume(): void {
		this._isResumed = true;
		if (!this._listener.value && !this._store.isDisposed) {
			this._listen();
		}
	}

	override dispose(): void {
		this._flush();
		super.dispose();
	}

	private _listen(): void {
		this._listener.value = this._onData(data => {
			this._batch.push(data);
			this._batchLength += data.length;
			if (this._batchLength >= ShellExecutionDataForwarder._maxBatchLength) {
				this._flush();
			} else if (!this._flushScheduler.isScheduled()) {
				this._flushScheduler.schedule();
			}
		});
	}

	private _flush(): void {
		this._flushScheduler.cancel();
		if (this._batch.length) {
			const data = this._batch.join('');
			this._batch = [];
			this._batchLength = 0;
			this._send(data);
		}
	}
}
