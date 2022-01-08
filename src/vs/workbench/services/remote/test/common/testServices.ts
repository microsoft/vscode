/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { IDiagnosticInfoOptions, IDiagnosticInfo } from 'vs/platform/diagnostics/common/diagnostics';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { ISocketFactory } from 'vs/platform/remote/common/remoteAgentConnection';
import { IRemoteAgentEnvironment } from 'vs/platform/remote/common/remoteAgentEnvironment';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IRemoteAgentConnection, IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';

export class TestRemoteAgentService implements IRemoteAgentService {
	_serviceBrand: undefined;
	socketFactory: ISocketFactory = {
		connect() { }
	};
	getConnection(): IRemoteAgentConnection | null {
		throw new Error('Method not implemented.');
	}
	getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		throw new Error('Method not implemented.');
	}
	getRawEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		throw new Error('Method not implemented.');
	}
	whenExtensionsReady(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	scanExtensions(skipExtensions?: ExtensionIdentifier[]): Promise<IExtensionDescription[]> {
		throw new Error('Method not implemented.');
	}
	scanSingleExtension(extensionLocation: URI, isBuiltin: boolean): Promise<IExtensionDescription | null> {
		throw new Error('Method not implemented.');
	}
	getDiagnosticInfo(options: IDiagnosticInfoOptions): Promise<IDiagnosticInfo | undefined> {
		throw new Error('Method not implemented.');
	}
	disableTelemetry(): Promise<void> {
		throw new Error('Method not implemented.');
	}
	logTelemetry(eventName: string, data?: ITelemetryData): Promise<void> {
		throw new Error('Method not implemented.');
	}
	flushTelemetry(): Promise<void> {
		throw new Error('Method not implemented.');
	}

}
