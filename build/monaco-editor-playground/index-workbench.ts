/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

registerSingleton(IWebWorkerService, StandaloneWebWorkerService, InstantiationType.Eager);

import '../../src/vs/code/browser/workbench/workbench.ts';
import { InstantiationType, registerSingleton } from '../../src/vs/platform/instantiation/common/extensions.ts';
import { IWebWorkerService } from '../../src/vs/platform/webWorker/browser/webWorkerService.ts';
// eslint-disable-next-line local/code-no-standalone-editor
import { StandaloneWebWorkerService } from '../../src/vs/editor/standalone/browser/services/standaloneWebWorkerService.ts';

