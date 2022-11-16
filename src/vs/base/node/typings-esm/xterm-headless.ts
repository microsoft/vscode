/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as xterm_headless from 'xterm-headless';
// ESM-comment-end
// ESM-uncomment-begin
// const xterm_headless = globalThis.MonacoNodeModules['xterm-headless'];
// ESM-uncomment-end

export type ITerminalAddon = import('xterm-headless').ITerminalAddon;
export type IMarker = import('xterm-headless').IMarker;
export type IBuffer = import('xterm-headless').IBuffer;
export type IBufferLine = import('xterm-headless').IBufferLine;
export type IDisposable = import('xterm-headless').IDisposable;
export type Terminal = import('xterm-headless').Terminal;
export const Terminal = xterm_headless.Terminal;
