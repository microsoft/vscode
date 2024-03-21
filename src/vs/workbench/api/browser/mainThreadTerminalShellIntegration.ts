/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { TerminalCapability } from 'vs/platform/terminal/common/capabilities/capabilities';
import { ExtHostContext, MainContext, type ExtHostTerminalShellIntegrationShape, type MainThreadTerminalShellIntegrationShape } from 'vs/workbench/api/common/extHost.protocol';
import { ITerminalService } from 'vs/workbench/contrib/terminal/browser/terminal';
import { extHostNamedCustomer, type IExtHostContext } from 'vs/workbench/services/extensions/common/extHostCustomers';

@extHostNamedCustomer(MainContext.MainThreadTerminalShellIntegration)
export class MainThreadTerminalShellIntegration extends Disposable implements MainThreadTerminalShellIntegrationShape {
	private readonly _proxy: ExtHostTerminalShellIntegrationShape;

	constructor(
		extHostContext: IExtHostContext,
		@ITerminalService private readonly _terminalService: ITerminalService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalShellIntegration);
		// TODO: Ensure events are passed properly on reload, there's a race condition

		// onDidChangeTerminalShellIntegration
		const onDidAddCommandDetection = this._terminalService.createOnInstanceEvent(instance => {
			return Event.map(
				Event.filter(instance.capabilities.onDidAddCapabilityType, e => {
					return e === TerminalCapability.CommandDetection;
				}, this._store), () => instance
			);
		});
		this._store.add(onDidAddCommandDetection(e => {
			this._proxy.$acceptDidChangeShellIntegration(e.instanceId);
			console.log('main thread acceptDidChangeShellIntegration');
		}));

		// onDidStartTerminalShellExecution
		const commandDetectionStartEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandExecuted));
		this._store.add(commandDetectionStartEvent.event(e => {
			const command = e.data;
			this._proxy.$acceptTerminalShellExecutionStart(e.instance.instanceId, command.command, command.cwd);
		}));

		// onDidEndTerminalShellExecution
		const commandDetectionEndEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandFinished));
		this._store.add(commandDetectionEndEvent.event(e => {
			console.log('$acceptTerminalShellExecutionEnd');
			this._proxy.$acceptTerminalShellExecutionEnd(e.instance.instanceId, e.data.exitCode);
		}));

		const cwdChangeEvent = this._store.add(this._terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CwdDetection, e => e.onDidChangeCwd));
		this._store.add(cwdChangeEvent.event(e => {
			console.log('$acceptTerminalCwdChange', e.data);
			this._proxy.$acceptTerminalCwdChange(e.instance.instanceId, e.data);
		}));

		// TODO: Only do this if there is a consumer
		// TODO: This needs to go via the server on remote for performance reasons
		// TerminalShellExecution.dataStream
		this._store.add(this._terminalService.onAnyInstanceData(e => this._proxy.$acceptTerminalShellExecutionData(e.instance.instanceId, e.data)));
	}

	$executeCommand(terminalId: number, commandLine: string): void {
		const instance = this._terminalService.getInstanceFromId(terminalId);
		instance?.runCommand(commandLine, true);
	}
}
