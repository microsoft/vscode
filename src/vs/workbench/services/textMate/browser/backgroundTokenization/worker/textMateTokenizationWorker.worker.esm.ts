/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from './textMateTokenizationWorker.worker.js';
import { bootstrapSimpleWorker } from '../../../../../../base/common/worker/simpleWorkerBootstrap.js';

bootstrapSimpleWorker(create);
