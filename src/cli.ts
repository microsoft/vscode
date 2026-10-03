/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './bootstrap-cli.js'; // this MUST come before other imports as it changes global state
import { configurePortable } from './bootstrap-node.js';
import { bootstrapESM } from './bootstrap-esm.js';
import { resolveNLSConfiguration } from './vs/base/node/nls.js';
import { product } from './bootstrap-meta.js';

// Developer Diagnostic Hook: Record startup time
const startupTimestamp = Date.now();

// NLS
const nlsConfiguration = await resolveNLSConfiguration({ userLocale: 'en', osLocale: 'en', commit: product.commit, nlsMetadataHash: product.nlsMetadataHash, userDataPath: '', nlsMetadataPath: import.meta.dirname });
process.env['VSCODE_NLS_CONFIG'] = JSON.stringify(nlsConfiguration); // required for `bootstrap-esm` to pick up NLS messages

// Enable portable support
configurePortable(product);

// Signal processes that we got launched as CLI
process.env['VSCODE_CLI'] = '1';

// Bootstrap ESM
await bootstrapESM();

// Developer Diagnostic Hook: Logging and duration measurement after ESM initialization
if (process.env['VSCODE_DEV'] || process.env['VSCODE_CLI_DEBUG']) {
    console.error(`[Dev Helper Diagnostic] ESM bootstrap completed in ${Date.now() - startupTimestamp}ms`);
}

// Load Server
await import('./vs/code/node/cli.js');
