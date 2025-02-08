/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from './editorSimpleWorker.js';
import { bootstrapSimpleEditorWorker } from './editorWorkerBootstrap.js';

bootstrapSimpleEditorWorker(create);
