/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../src/typings/vscode-globals-product.d.ts" />

import { enableHotReload } from '../../src/vs/base/common/hotReload.ts';
import { getSingletonServiceDescriptors, InstantiationType, registerSingleton } from '../../src/vs/platform/instantiation/common/extensions.ts';
import { IWebWorkerService } from '../../src/vs/platform/webWorker/browser/webWorkerService.ts';
// eslint-disable-next-line local/code-no-standalone-editor
import { StandaloneWebWorkerService } from '../../src/vs/editor/standalone/browser/services/standaloneWebWorkerService.ts';

enableHotReload();

registerSingleton(IWebWorkerService, StandaloneWebWorkerService, InstantiationType.Eager);
const descriptors = getSingletonServiceDescriptors();

// Patch push to ignore future IWebWorkerService registrations.
// This is hot-reload dev only, so it is fine.
const originalPush = descriptors.push;
descriptors.push = function (item: any) {
	if (item[0] === IWebWorkerService) {
		return this.length;
	}
	return originalPush.call(this, item);
};

globalThis._VSCODE_DISABLE_CSS_IMPORT_MAP = true;
globalThis._VSCODE_USE_RELATIVE_IMPORTS = true;
