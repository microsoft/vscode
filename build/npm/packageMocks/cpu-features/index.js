/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const err = new Error("Cannot find module 'cpu-features'");
err.code = 'MODULE_NOT_FOUND';
throw err;
