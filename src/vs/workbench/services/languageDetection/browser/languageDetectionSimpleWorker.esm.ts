/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageDetectionSimpleWorker } from './languageDetectionSimpleWorker';
import { bootstrapSimpleWorker } from 'vs/base/common/worker/simpleWorkerBootstrap';
import { IEditorWorkerHost } from 'vs/editor/common/services/editorWorkerHost';

bootstrapSimpleWorker<IEditorWorkerHost>(host => new LanguageDetectionSimpleWorker(host, () => { return {}; }));
