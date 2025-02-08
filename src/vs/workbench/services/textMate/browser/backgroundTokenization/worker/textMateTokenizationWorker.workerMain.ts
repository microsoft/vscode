/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from './textMateTokenizationWorker.worker.js';
import { bootstrapSimpleWorker } from '../../../../../../base/common/worker/simpleWorkerBootstrap.js';

bootstrapSimpleWorker(create);
