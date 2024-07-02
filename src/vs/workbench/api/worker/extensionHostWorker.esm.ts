/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from 'vs/workbench/api/worker/extensionHostWorker';

const messageHandler = create();
self.onmessage = (e: MessageEvent) => messageHandler.onmessage(e.data);
