/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Entry point — delegates to the TypeScript gulpfile in build/
// The actual task definitions live in build/gulpfile.ts.
// This .mjs shim exists so gulp can load the entry point natively.
// See CONTRIBUTING.md for build instructions.
import './build/gulpfile.ts';
