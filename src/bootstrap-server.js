/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check
'use strict';

// Keep bootstrap-amd.js from redefining 'fs'.
delete process.env['ELECTRON_RUN_AS_NODE'];
