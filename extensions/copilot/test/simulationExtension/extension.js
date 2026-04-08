/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// You might think this is weird. It is weird.
//
// VS Code must know where require calls happen in order to attribute them to
// the right extension (and check proposed API access.) It does this by checking
// the path of the require'ing module, and this fails once we go out of the
// directory and request the simulation workbench.
//
// This is pulled in via .esbuild.ts which shims the vscode module.
globalThis.COPILOT_SIMULATION_VSCODE = require('vscode');

exports.activate = require(process.env.VSCODE_SIMULATION_EXTENSION_ENTRY);
