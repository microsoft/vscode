/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from './languageDetectionSimpleWorker';
import { bootstrapSimpleWorker } from 'vs/base/common/worker/simpleWorkerBootstrap';

bootstrapSimpleWorker(create);
