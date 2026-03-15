/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { type ISandboxPermissionRequest, type ISandboxRuntimeConfig } from './sandboxHelperIpc.js';

export const ISandboxHelperService = createDecorator<ISandboxHelperService>('ISandboxHelperService');

export interface ISandboxHelperService {
	readonly _serviceBrand: undefined;
	readonly onDidRequestSandboxPermission: Event<ISandboxPermissionRequest>;

	resetSandbox(): Promise<void>;
	resolveSandboxPermissionRequest(requestId: string, allowed: boolean): Promise<void>;
	wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string>;
}
