/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { enableNodeCompileCache } from './vs/base/node/nodeCompileCache.js';

enableNodeCompileCache('main', new URL('./mainImpl.js', import.meta.url).href);

await import('./mainImpl.js');
