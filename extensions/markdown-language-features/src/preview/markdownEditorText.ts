/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TextDocumentSync } from '@vscode/web-editors';

/**
 * What the Markdown editor's features need of the {@link TextDocumentSync}
 * between the editor and the document: the editor text, which is the
 * document text once {@link TextDocumentSync.drain drained}, and offsets the
 * editor sent, tracked into it.
 */
export type MarkdownEditorText = Pick<TextDocumentSync, 'text' | 'revision' | 'version' | 'drain' | 'trackFromEditor'>;