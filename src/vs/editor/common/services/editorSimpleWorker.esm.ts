/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from './editorSimpleWorker';
import { bootstrapSimpleEditorWorker } from './editorWorkerBootstrap';

bootstrapSimpleEditorWorker(create);
