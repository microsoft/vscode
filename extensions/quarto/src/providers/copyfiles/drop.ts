/*
 * drop.ts
 *
 * Copyright (C) 2023 by Posit Software, PBC
 * Copyright (c) Microsoft Corporation. All rights reserved.
 *
 * Unless you have received this program directly from Posit Software pursuant
 * to the terms of a commercial license agreement with Posit Software, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

// we can also implement this for copy/paste once the api proposal is finalized:
// https://code.visualstudio.com/updates/v1_68#_copy-paste-api
// https://github.com/microsoft/vscode/issues/30066


import * as path from 'path';
import * as vscode from 'vscode';
import * as URI from 'vscode-uri';
import { Schemes } from '../../core/schemes';

import './types';

export const imageFileExtensions = new Set<string>([
  'bmp',
  'gif',
  'ico',
  'jpe',
  'jpeg',
  'jpg',
  'png',
  'psd',
  'svg',
  'tga',
  'tif',
  'tiff',
  'webp',
]);

export function registerDropIntoEditorSupport(selector: vscode.DocumentSelector) {
  return vscode.languages.registerDocumentDropEditProvider(selector, new class implements vscode.DocumentDropEditProvider {
    async provideDocumentDropEdits(document: vscode.TextDocument, _position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.DocumentDropEdit | undefined> {
      const enabled = vscode.workspace.getConfiguration('markdown', document).get('editor.drop.enabled', true);
      if (!enabled) {
        return undefined;
      }

      const snippet = await tryGetUriListSnippet(document, dataTransfer, token);
      return snippet ? new vscode.DocumentDropEdit(snippet) : undefined;
    }
  });
}

export async function tryGetUriListSnippet(document: vscode.TextDocument, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<vscode.SnippetString | undefined> {
  const urlList = await dataTransfer.get('text/uri-list')?.asString();
  if (!urlList || token.isCancellationRequested) {
    return undefined;
  }

  const uris: vscode.Uri[] = [];
  for (const resource of urlList.split('\n')) {
    try {
      uris.push(vscode.Uri.parse(resource));
    } catch {
      // noop
    }
  }

  return createUriListSnippet(document, uris);
}

interface UriListSnippetOptions {
  readonly placeholderText?: string;

  readonly placeholderStartIndex?: number;

  /**
   * Should the snippet be for an image?
   *
   * If `undefined`, tries to infer this from the uri.
   */
  readonly insertAsImage?: boolean;

  readonly separator?: string;
}

export function createUriListSnippet(document: vscode.TextDocument, uris: readonly vscode.Uri[], options?: UriListSnippetOptions): vscode.SnippetString | undefined {
  if (!uris.length) {
    return undefined;
  }

  const dir = getDocumentDir(document);

  const snippet = new vscode.SnippetString();
  uris.forEach((uri, i) => {
    const mdPath = getMdPath(dir, uri);

    const ext = URI.Utils.extname(uri).toLowerCase().replace('.', '');
    const insertAsImage = typeof options?.insertAsImage === 'undefined' ? imageFileExtensions.has(ext) : !!options.insertAsImage;

    snippet.appendText(insertAsImage ? '![' : '[');

    const placeholderText = options?.placeholderText ?? (insertAsImage ? 'Alt text' : 'label');
    const placeholderIndex = typeof options?.placeholderStartIndex !== 'undefined' ? options?.placeholderStartIndex + i : undefined;
    snippet.appendPlaceholder(placeholderText, placeholderIndex);

    snippet.appendText(`](${mdPath})`);

    if (i < uris.length - 1 && uris.length > 1) {
      snippet.appendText(options?.separator ?? ' ');
    }
  });
  return snippet;
}

function getMdPath(dir: vscode.Uri | undefined, file: vscode.Uri) {
  if (dir && dir.scheme === file.scheme && dir.authority === file.authority) {
    if (file.scheme === Schemes.file) {
      // On windows, we must use the native `path.relative` to generate the relative path
      // so that drive-letters are resolved cast insensitively. However we then want to
      // convert back to a posix path to insert in to the document.
      const relativePath = path.relative(dir.fsPath, file.fsPath);
      return encodeURI(path.posix.normalize(relativePath.split(path.sep).join(path.posix.sep)));
    }

    return encodeURI(path.posix.relative(dir.path, file.path));
  }

  return file.toString(false);
}

function getDocumentDir(document: vscode.TextDocument): vscode.Uri | undefined {
  const docUri = getParentDocumentUri(document);
  if (docUri.scheme === Schemes.untitled) {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }
  return URI.Utils.dirname(docUri);
}

export function getParentDocumentUri(document: vscode.TextDocument): vscode.Uri {
  if (document.uri.scheme === Schemes.notebookCell) {
    for (const notebook of vscode.workspace.notebookDocuments) {
      for (const cell of notebook.getCells()) {
        if (cell.document === document) {
          return notebook.uri;
        }
      }
    }
  }

  return document.uri;
}
