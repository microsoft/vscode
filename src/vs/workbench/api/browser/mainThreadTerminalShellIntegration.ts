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
		@ITerminalService terminalService: ITerminalService
	) {
		super();

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalShellIntegration);

		// onDidChangeTerminalShellIntegration
		const onDidAddCommandDetection = terminalService.createOnInstanceEvent(instance => {
			return Event.map(
				Event.filter(instance.capabilities.onDidAddCapabilityType, e => {
					return e === TerminalCapability.CommandDetection;
				}, this._store), () => instance
			);
		});
		this._store.add(onDidAddCommandDetection(e => this._proxy.$acceptDidChangeShellIntegration(e.instanceId)));

		// onDidStartTerminalShellExecution
		const commandDetectionStartEvent = this._store.add(
			terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandStarted)
		);
		this._store.add(commandDetectionStartEvent.event(e => {
			const command = e.data;
			this._proxy.$acceptTerminalShellExecutionStart(e.instance.instanceId, command.command, command.cwd);
		}));

		// onDidEndTerminalShellExecution
		const commandDetectionEndEvent = this._store.add(
			terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandFinished)
		);
		this._store.add(commandDetectionEndEvent.event(e => {
			this._proxy.$acceptTerminalShellExecutionEnd(e.instance.instanceId, e.data.exitCode);
		}));
	}

}
