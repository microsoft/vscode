/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare function run(): void;

declare function suite(name: string, fn: (err?) => void);
declare function test(name: string, fn: () => void);
declare function test(name: string, fn: (done: (err?) => void) => void);
declare function suiteSetup(fn: (done?: (err?) => void) => void);
declare function suiteTeardown(fn: (done?: (err?) => void) => void);
declare function setup(fn: (done?: (err?) => void) => void);
declare function teardown(fn: (done?: (err?) => void) => void);
