/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MainThreadTerminalServiceShape, MainContext, TerminalLaunchConfig, ExtHostTerminalIdentifier } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/services/extensions/common/extHostCustomers';
import { IProcessProperty, IProcessReadyWindowsPty, ITerminalOutputMatch, ITerminalOutputMatcher } from 'vs/platform/terminal/common/terminal';
import { ISerializableEnvironmentDescriptionMap, ISerializableEnvironmentVariableCollection } from 'vs/platform/terminal/common/environmentVariable';

@extHostNamedCustomer(MainContext.MainThreadTerminalService)
export class MainThreadTerminalService implements MainThreadTerminalServiceShape {
	constructor() { }

	public dispose(): void { }

	public async $createTerminal(extHostTerminalId: string, launchConfig: TerminalLaunchConfig): Promise<void> {
		throw new Error('Unsupported');
	}

	public async $show(id: ExtHostTerminalIdentifier, preserveFocus: boolean): Promise<void> {
		throw new Error('Unsupported');
	}

	public async $hide(id: ExtHostTerminalIdentifier): Promise<void> {
		throw new Error('Unsupported');
	}

	public async $dispose(id: ExtHostTerminalIdentifier): Promise<void> {
		throw new Error('Unsupported');
	}

	public async $sendText(id: ExtHostTerminalIdentifier, text: string, shouldExecute: boolean): Promise<void> {
		throw new Error('Unsupported');
	}

	public $sendProcessExit(terminalId: number, exitCode: number | undefined): void {
		throw new Error('Unsupported');
	}

	public $startSendingDataEvents(): void {
		throw new Error('Unsupported');
	}

	public $stopSendingDataEvents(): void {
		throw new Error('Unsupported');
	}

	public $startSendingCommandEvents(): void {
		throw new Error('Unsupported');
	}

	public $stopSendingCommandEvents(): void {
		throw new Error('Unsupported');
	}

	public $startLinkProvider(): void {
		throw new Error('Unsupported');
	}

	public $stopLinkProvider(): void {
		throw new Error('Unsupported');
	}

	public $registerProcessSupport(isSupported: boolean): void {
		// Empty
	}

	public $registerProfileProvider(id: string, extensionIdentifier: string): void {
		throw new Error('Unsupported');
	}

	public $unregisterProfileProvider(id: string): void {
		throw new Error('Unsupported');
	}

	public async $registerQuickFixProvider(id: string, extensionId: string): Promise<void> {
		throw new Error('Unsupported');
	}

	public $unregisterQuickFixProvider(id: string): void {
		throw new Error('Unsupported');
	}

	public $sendProcessData(terminalId: number, data: string): void {
		throw new Error('Unsupported');
	}

	public $sendProcessReady(terminalId: number, pid: number, cwd: string, windowsPty: IProcessReadyWindowsPty | undefined): void {
		throw new Error('Unsupported');
	}

	public $sendProcessProperty(terminalId: number, property: IProcessProperty<any>): void {
		throw new Error('Unsupported');
	}

	$setEnvironmentVariableCollection(extensionIdentifier: string, persistent: boolean, collection: ISerializableEnvironmentVariableCollection | undefined, descriptionMap: ISerializableEnvironmentDescriptionMap): void {
		throw new Error('Unsupported');
	}
}

export function getOutputMatchForLines(lines: string[], outputMatcher: ITerminalOutputMatcher): ITerminalOutputMatch | undefined {
	const match: RegExpMatchArray | null | undefined = lines.join('\n').match(outputMatcher.lineMatcher);
	return match ? { regexMatch: match, outputLines: lines } : undefined;
}
