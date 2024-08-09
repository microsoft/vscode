/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapSimpleWorker } from 'vs/base/common/worker/simpleWorkerBootstrap';
import { create } from './notebookSimpleWorker';

bootstrapSimpleWorker(create);
