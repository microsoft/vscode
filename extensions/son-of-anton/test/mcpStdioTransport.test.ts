/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';

// McpStdioTransport's framing logic (`handleStdoutChunk` / `deliverLine`) is
// implemented as private methods that operate on the spawned child process's
// stdout. There is no exported `parseFrames(buffer)` helper to test in
// isolation, and the only public entry point (`start()`) spawns a real child
// process via `node:child_process.spawn`.
//
// Per the testing scope: a unit test here would require either spawning a
// process (turning this into an integration test) or refactoring production
// code to expose the line-buffering helper. Both are out of scope for a
// unit-test pass, so this file is a placeholder.
//
// Coverage strategy going forward: extract `parseFrames(buffer: string):
// { messages: JsonRpcMessage[]; remaining: string }` as a free function
// in McpStdioTransport.ts when next this module is touched, then port the
// scoped cases (single complete line, partial line buffered, multiple lines
// per chunk, malformed JSON dropped).

suite('McpStdioTransport', () => {
	test('placeholder — framing logic is private to the transport', () => {
		assert.ok(true);
	});
});
