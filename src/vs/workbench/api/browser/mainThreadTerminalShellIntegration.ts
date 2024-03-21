/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalCapability, type ITerminalCommand } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ExtHostContext, MainContext, type ExtHostTerminalShellIntegrationShape, type MainThreadTerminalShellIntegrationShape } from 'vs/workbench/api/common/extHost.protocol';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { extHostNamedCustomer, type IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

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

		// onDidChangeTerminalShellIntegration
		const onDidAddCommandDetection = this._terminalService.createOnInstanceEvent(instance => {
			return Event.map(
				Event.filter(instance.capabilities.onDidAddCapabilityType, e => {
					return e === TerminalCapability.CommandDetection;
				}, this._store), () => instance
			);
		});
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
			currentCommand = e.data;
			this._proxy.$shellExecutionStart(e.instance.instanceId, e.data.command, e.data.cwd);
		}));

		// onDidEndTerminalShellExecution
		const commandDetectionEndEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandFinished));
		this._store.add(commandDetectionEndEvent.event(e => {
			currentCommand = undefined;
			this._proxy.$shellExecutionEnd(e.instance.instanceId, e.data.command, e.data.exitCode);
		}));

		// onDidChangeTerminalShellIntegration via cwd
		const cwdChangeEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CwdDetection, e => e.onDidChangeCwd));
		this._store.add(cwdChangeEvent.event(e => this._proxy.$cwdChange(e.instance.instanceId, e.data)));

		// Clean up after dispose
		this._store.add(this._terminalService.onDidDisposeInstance(e => this._proxy.$closeTerminal(e.instanceId)));

		// TerminalShellExecution.createDataStream
		// TODO: Support this on remote; it should go via the server
		if (!workbenchEnvironmentService.remoteAuthority) {
			this._store.add(this._terminalService.onAnyInstanceData(e => this._proxy.$shellExecutionData(e.instance.instanceId, e.data)));
		}
	}

	$executeCommand(terminalId: number, commandLine: string): void {
		this._terminalService.getInstanceFromId(terminalId)?.runCommand(commandLine, true);
	}
}
