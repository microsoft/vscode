/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Keep bootstrap-esm.js from redefining 'fs'.
delete process.env['ELECTRON_RUN_AS_NODE'];
