/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bootstrapSimpleWorker } from 'vs/base/common/worker/simpleWorkerBootstrap';
import { create } from 'vs/workbench/services/search/worker/localFileSearch';

bootstrapSimpleWorker(create);
