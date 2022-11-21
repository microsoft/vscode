/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
import * as xterm from 'xterm';
// ESM-comment-end

// ESM-uncomment-begin
// const xterm = globalThis._VSCODE_NODE_MODULES.xterm;
// ESM-uncomment-end


export type Terminal = import('xterm').Terminal;
export const Terminal = xterm.Terminal;


export type ITerminalOptions = import('xterm').ITerminalOptions;
export type ITerminalInitOnlyOptions = import('xterm').ITerminalInitOnlyOptions;
export type ITheme = import('xterm').ITheme;
export type IDisposable = import('xterm').IDisposable;
export type IEvent<T, U = void> = import('xterm').IEvent<T, U>;
export type IMarker = import('xterm').IMarker;
export type IDisposableWithEvent = import('xterm').IDisposableWithEvent;
export type IDecoration = import('xterm').IDecoration;
export type IDecorationOverviewRulerOptions = import('xterm').IDecorationOverviewRulerOptions;
export type IDecorationOptions = import('xterm').IDecorationOptions;
export type ILocalizableStrings = import('xterm').ILocalizableStrings;
export type IWindowOptions = import('xterm').IWindowOptions;
export type ITerminalAddon = import('xterm').ITerminalAddon;
export type IViewportRange = import('xterm').IViewportRange;
export type IViewportRangePosition = import('xterm').IViewportRangePosition;
export type ILinkHandler = import('xterm').ILinkHandler;
export type ILinkProvider = import('xterm').ILinkProvider;
export type ILink = import('xterm').ILink;
export type ILinkDecorations = import('xterm').ILinkDecorations;
export type IBufferRange = import('xterm').IBufferRange;
export type IBufferCellPosition = import('xterm').IBufferCellPosition;
export type IBuffer = import('xterm').IBuffer;
export type IBufferNamespace = import('xterm').IBufferNamespace;
export type IBufferLine = import('xterm').IBufferLine;
export type IBufferCell = import('xterm').IBufferCell;
export type IFunctionIdentifier = import('xterm').IFunctionIdentifier;
export type IParser = import('xterm').IParser;
export type IUnicodeVersionProvider = import('xterm').IUnicodeVersionProvider;
export type IUnicodeHandling = import('xterm').IUnicodeHandling;
export type IModes = import('xterm').IModes;
