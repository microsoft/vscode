/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, toDisposable, type IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { TerminalCapability, type ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ExtHostContext, MainContext, type ExtHostTerminalShellIntegrationShape, type MainThreadTerminalShellIntegrationShape } from 'vs/workbench/api/common/extHost.protocol';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { extHostNamedCustomer, type IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { TerminalShellExecutionCommandLineConfidence } from 'vs/workbench/api/common/extHostTypes';

@extHostNamedCustomer(MainContext.MainThreadTerminalShellIntegration)
export class MainThreadTerminalShellIntegration extends Disposable implements MainThreadTerminalShellIntegrationShape {
	private readonly _proxy: ExtHostTerminalShellIntegrationShape;

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private readonly _terminalService: ITerminalService,
		@IWorkbenchEnvironmentService workbenchEnvironmentService: IWorkbenchEnvironmentService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalShellIntegration);

		const instanceDataListeners: Map<number, IDisposable> = new Map();
		this._register(toDisposable(() => {
			for (const listener of instanceDataListeners.values()) {
				listener.dispose();
			}
		}));

		// onDidChangeTerminalShellIntegration
		const onDidAddCommandDetection = this._store.add(this._terminalService.createOnInstanceEvent(instance => {
			return Event.map(
				Event.filter(instance.capabilities.onDidAddCapabilityType, e => {
					return e === TerminalCapability.CommandDetection;
				}), () => instance
			);
		})).event;
		this._store.add(onDidAddCommandDetection(e => this._proxy.$shellIntegrationChange(e.instanceId)));

		// onDidStartTerminalShellExecution
		const commandDetectionStartEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandExecuted));
		let currentCommand: ITerminalCommand | undefined;
		this._store.add(commandDetectionStartEvent.event(e => {
			// Prevent duplicate events from being sent in case command detection double fires the
			// event
			if (e.data === currentCommand) {
				return;
			}
			// String paths are not exposed in the extension API
			currentCommand = e.data;
			const instanceId = e.instance.instanceId;
			this._proxy.$shellExecutionStart(instanceId, e.data.command, convertToExtHostCommandLineConfidence(e.data), e.data.isTrusted, this._convertCwdToUri(e.data.cwd));

			// TerminalShellExecution.createDataStream
			// Debounce events to reduce the message count - when this listener is disposed the events will be flushed
			instanceDataListeners.get(instanceId)?.dispose();
			instanceDataListeners.set(instanceId, Event.accumulate(e.instance.onData, 50, this._store)(events => this._proxy.$shellExecutionData(instanceId, events.join(''))));
		}));

		// onDidEndTerminalShellExecution
		const commandDetectionEndEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandFinished));
		this._store.add(commandDetectionEndEvent.event(e => {
			currentCommand = undefined;
			const instanceId = e.instance.instanceId;
			instanceDataListeners.get(instanceId)?.dispose();
			// Send end in a microtask to ensure the data events are sent first
			setTimeout(() => {
				this._proxy.$shellExecutionEnd(instanceId, e.data.command, convertToExtHostCommandLineConfidence(e.data), e.data.isTrusted, e.data.exitCode);
			});
		}));

		// onDidChangeTerminalShellIntegration via cwd
		const cwdChangeEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CwdDetection, e => e.onDidChangeCwd));
		this._store.add(cwdChangeEvent.event(e => {
			this._proxy.$cwdChange(e.instance.instanceId, this._convertCwdToUri(e.data));
		}));

		// Clean up after dispose
		this._store.add(this._terminalService.onDidDisposeInstance(e => this._proxy.$closeTerminal(e.instanceId)));
	}

	$executeCommand(terminalId: number, commandLine: string): void {
		this._terminalService.getInstanceFromId(terminalId)?.runCommand(commandLine, true);
	}

	private _convertCwdToUri(cwd: string | undefined): URI | undefined {
		return cwd ? URI.file(cwd) : undefined;
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
