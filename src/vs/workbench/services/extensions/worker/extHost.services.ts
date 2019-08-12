/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IExtHostOutputService, ExtHostOutputService } from 'vs/workbench/api/common/extHostOutput';
import { IExtHostWorkspace, ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';
import { IExtHostDecorations, ExtHostDecorations } from 'vs/workbench/api/common/extHostDecorations';
import { IExtHostConfiguration, ExtHostConfiguration } from 'vs/workbench/api/common/extHostConfiguration';
import { IExtHostCommands, ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { IExtHostTerminalService } from 'vs/workbench/api/common/extHostTerminalService';
import { IExtHostTask } from 'vs/workbench/api/common/extHostTask';
import { IExtHostDebugService } from 'vs/workbench/api/common/extHostDebugService';
import { IExtHostSearch } from 'vs/workbench/api/common/extHostSearch';
import { IExtensionStoragePaths } from 'vs/workbench/api/common/extHostStoragePaths';
import { IExtHostExtensionService } from 'vs/workbench/api/common/extHostExtensionService';
import { IExtHostStorage, ExtHostStorage } from 'vs/workbench/api/common/extHostStorage';
import { ExtHostExtensionService } from 'vs/workbench/api/worker/extHostExtensionService';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtHostLogService } from 'vs/workbench/api/worker/extHostLogService';

// register singleton services
registerSingleton(ILogService, ExtHostLogService);
registerSingleton(IExtHostOutputService, ExtHostOutputService);
registerSingleton(IExtHostWorkspace, ExtHostWorkspace);
registerSingleton(IExtHostDecorations, ExtHostDecorations);
registerSingleton(IExtHostConfiguration, ExtHostConfiguration);
registerSingleton(IExtHostCommands, ExtHostCommands);
registerSingleton(IExtHostDocumentsAndEditors, ExtHostDocumentsAndEditors);
registerSingleton(IExtHostStorage, ExtHostStorage);
registerSingleton(IExtHostExtensionService, ExtHostExtensionService);

// register services that only throw errors
function NotImplementedProxy<T>(name: ServiceIdentifier<T>): { new(): T } {
	return <any>class {
		constructor() {
			return new Proxy({}, {
				get(target: any, prop: string | number) {
					if (target[prop]) {
						return target[prop];
					}
					throw new Error(`Not Implemented: ${name}->${String(prop)}`);
				}
			});
		}
	};
}
registerSingleton(IExtHostTerminalService, class extends NotImplementedProxy(IExtHostTerminalService) { });
registerSingleton(IExtHostTask, class extends NotImplementedProxy(IExtHostTask) { });
registerSingleton(IExtHostDebugService, class extends NotImplementedProxy(IExtHostDebugService) { });
registerSingleton(IExtHostSearch, class extends NotImplementedProxy(IExtHostSearch) { });
registerSingleton(IExtensionStoragePaths, class extends NotImplementedProxy(IExtensionStoragePaths) {
	whenReady = Promise.resolve();
});
