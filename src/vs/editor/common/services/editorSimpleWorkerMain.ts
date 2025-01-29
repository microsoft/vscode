/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from './editorSimpleWorker.js';
import { bootstrapSimpleEditorWorker } from './editorWorkerBootstrap.js';

bootstrapSimpleEditorWorker(create);
