/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="../../src/typings/vscode-globals-product.d.ts" />

import { enableHotReload } from '../../src/vs/base/common/hotReload.ts';
import { InstantiationType, registerSingleton } from '../../src/vs/platform/instantiation/common/extensions.ts';
import { IWebWorkerService } from '../../src/vs/platform/webWorker/browser/webWorkerService.ts';
// eslint-disable-next-line local/code-no-standalone-editor
import { StandaloneWebWorkerService } from '../../src/vs/editor/standalone/browser/services/standaloneWebWorkerService.ts';

enableHotReload();
registerSingleton(IWebWorkerService, StandaloneWebWorkerService, InstantiationType.Eager);

globalThis._VSCODE_DISABLE_CSS_IMPORT_MAP = true;
globalThis._VSCODE_USE_RELATIVE_IMPORTS = true;
