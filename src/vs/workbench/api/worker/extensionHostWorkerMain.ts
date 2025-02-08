/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { create } from './extensionHostWorker.js';

const data = create();
self.onmessage = (e) => data.onmessage(e.data);
