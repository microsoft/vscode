/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapWebWorker } from '../../../../../base/common/worker/webWorkerBootstrap.js';
import { create } from './notebookWebWorker.js';

bootstrapWebWorker(create);
