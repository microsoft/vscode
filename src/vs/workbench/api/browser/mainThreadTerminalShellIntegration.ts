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

		console.log('init!');

		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostTerminalShellIntegration);

		const onDidAddCommandDetection = _terminalService.createOnInstanceEvent(instance => {
			return Event.map(
				Event.filter(instance.capabilities.onDidAddCapabilityType, e => {
					return e === TerminalCapability.CommandDetection;
				}, this._store), () => instance
			);
		});
		this._store.add(onDidAddCommandDetection(e => this._proxy.$acceptDidChangeShellIntegration(e.instanceId)));
		const commandDetectionStartedEvent = this._store.add(
			_terminalService.createOnInstanceCapabilityEvent(TerminalCapability.CommandDetection, e => e.onCommandStarted)
		);
		commandDetectionStartedEvent.event(e => this._proxy.$acceptTerminalShellExecutionStarted(e.instance.instanceId)); // TODO: Fill in
	}

}
