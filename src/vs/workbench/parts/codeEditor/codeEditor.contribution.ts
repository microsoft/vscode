/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './electron-browser/accessibility';
import './electron-browser/inspectKeybindings';
import './electron-browser/menuPreventer';
import './electron-browser/selectionClipboard';
import './electron-browser/textMate/inspectTMScopes';
import './electron-browser/toggleMinimap';
import './electron-browser/toggleMultiCursorModifier';
import './electron-browser/toggleRenderControlCharacter';
import './electron-browser/toggleRenderWhitespace';
import './electron-browser/toggleWordWrap';
import { OPTIONS, TextBufferType } from 'vs/editor/common/model/textModel';

// Configure text buffer implementation
if (process.env['VSCODE_PIECE_TREE']) {
	console.log(`Using TextBufferType.PieceTree (env variable VSCODE_PIECE_TREE)`);
	OPTIONS.TEXT_BUFFER_IMPLEMENTATION = TextBufferType.PieceTree;
}
