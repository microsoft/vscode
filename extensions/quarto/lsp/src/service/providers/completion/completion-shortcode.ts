/*
 * completion-shortcode.ts
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

import fs from 'fs';
import path from 'path';


import { URI, Utils } from 'vscode-uri';
import { CompletionItem, CompletionItemKind, TextEdit, Range } from "vscode-languageserver";

import { isIpynbContent } from 'core-node';

import { EditorContext } from "../../quarto";
import { FileStat, IWorkspace, getWorkspaceFolder } from "../../workspace";
import { Schemes } from '../../util/schemes';
import { jupyterFromJSON, kCellId, kCellLabel, kCellTags, partitionCellOptions } from 'core';

const kShortcodeRegex = /(^\s*{{< )(embed|include)(\s+)([^\s]+)?.*? >}}\s*$/;

export async function shortcodeCompletions(context: EditorContext, workspace: IWorkspace): Promise<CompletionItem[] | null> {

  // bypass if the current line doesn't contain a {{< (performance optimization so we don't execute
  // the regexes below if we don't need to)
  if (context.line.indexOf("{{<") === -1) {
    return null;
  }

  const match = context.line.match(kShortcodeRegex);
  if (match) {
    // is the cursor in the file region (group 4) and is the
    // next character a space?
    const beginFile = match[1].length + match[2].length + match[3].length;
    const endFile = beginFile + (match[4]?.length || 0);
    const col = context.position.column;
    if (col >= beginFile && col <= endFile && context.line[col] === " ") {
      // completion token and shortcode
      const shortcode = match[2];
      const token = (match[4] || "");
      const docUri = URI.file(context.path);

      // if the token is a directory reference then stand down
      if (token.match(/\/?\.\.?$/)) {
        return null;
      }

      // for embed, split on '#' and lookup ids
      if (shortcode === "embed") {
        const parts = token.split("#");
        if (parts.length === 2 && isIpynbContent(parts[0])) {
          const ipynbURI = resolveReference(docUri, workspace, parts[0]);
          if (ipynbURI) {
            return ipynbCompletions(ipynbURI);
          }
        }
      }

      // find parent dir
      const valueBeforeLastSlash = token.substring(0, token.lastIndexOf('/') + 1); // keep the last slash
      const parentDir = resolveReference(docUri, workspace, valueBeforeLastSlash || '.');
      if (!parentDir) {
        return null;
      }

      let dirInfo: Iterable<readonly [string, FileStat]>;
      try {
        dirInfo = await workspace.readDirectory(parentDir);
      } catch {
        return null;
      }

      const completions: CompletionItem[] = [];
      for (const [name, type] of dirInfo) {

        // screen out hidden
        if (name.startsWith(".")) {
          continue;
        }

        // screen based on embed type
        if (!type.isDirectory) {
          const ext = path.extname(name);
          if (shortcode === "include" && ![".md", ".qmd"].includes(ext.toLowerCase())) {
            continue;
          } else if (shortcode === "embed" && ext.toLowerCase() !== ".ipynb") {
            continue;
          }
        }

        // create completion
        const uri = Utils.joinPath(parentDir, name);
        const isDir = type.isDirectory;
        const isIpynb = isIpynbContent(name);
        const insertText = isDir ? name + '/' : isIpynb ? name + '#' : name;
        const edit = TextEdit.replace(
          Range.create(
            context.position.row,
            context.position.column - token.length,
            context.position.row,
            context.position.column
          ),
          valueBeforeLastSlash + insertText
        );
        const useEdit = !valueBeforeLastSlash.startsWith(".");

        completions.push({
          label: name,
          insertText: useEdit ? undefined : insertText,
          textEdit: useEdit ? edit : undefined,
          kind: isDir ? CompletionItemKind.Folder : CompletionItemKind.File,
          documentation: isDir ? uri.path + '/' : uri.path,
          command: isDir || isIpynb ? { command: 'editor.action.triggerSuggest', title: '' } : undefined,
        });
      }
      return completions;
    }
  }

  return null;

}

function resolveReference(
  docUri: URI,
  workspace: IWorkspace,
  ref: string): URI | undefined {

  if (ref.startsWith('/')) {
    const workspaceFolder = getWorkspaceFolder(workspace, docUri);
    if (workspaceFolder) {
      return Utils.joinPath(workspaceFolder, ref);
    } else {
      return resolvePath(docUri, ref.slice(1));
    }
  }

  return resolvePath(docUri, ref);
}

function resolvePath(root: URI, ref: string): URI | undefined {
  try {
    if (root.scheme === Schemes.file) {
      return URI.file(path.resolve(path.dirname(root.fsPath), ref));
    } else {
      return root.with({
        path: path.resolve(path.dirname(root.path), ref),
      });
    }
  } catch {
    return undefined;
  }
}

function ipynbCompletions(uri: URI): CompletionItem[] | null {
  const ipynbPath = uri.fsPath;
  if (fs.existsSync(ipynbPath)) {
    const modified = fs.statSync(ipynbPath).mtime.getTime();
    const cached = ipynbEmbedIds.get(ipynbPath);
    if (cached && modified <= cached.modified) {
      return cached.ids.map(idToCompletion);
    } else {
      const ids = readIpynbEmbedIds(ipynbPath);
      if (ids) {
        ipynbEmbedIds.set(ipynbPath, { modified, ids })
        return ids.map(idToCompletion);
      } else {
        return null;
      }
    }
  } else {
    return null;
  }
}

const ipynbEmbedIds = new Map<string, { modified: number, ids: string[] }>();

function readIpynbEmbedIds(ipynbPath: string): string[] | null {
  const embedIds: string[] = [];
  const nbContents = fs.readFileSync(ipynbPath, { encoding: "utf-8" });
  const nb = jupyterFromJSON(nbContents);
  for (const cell of nb.cells) {
    if (cell.cell_type === "code") {
      const { yaml } = partitionCellOptions(nb.metadata.kernelspec.language, cell.source);
      if (typeof (yaml?.[kCellLabel]) === "string") {
        embedIds.push(yaml[kCellLabel])
      } else if (typeof (yaml?.[kCellId]) === "string") {
        embedIds.push(yaml[kCellId])
      } else if (Array.isArray(cell.metadata[kCellTags]) && cell.metadata[kCellTags].length) {
        embedIds.push(String(cell.metadata[kCellTags][0]))
      }
    } else if (cell.cell_type === "markdown") {
      const source = cell.source.join("");
      const match = source.match(/\)\{#(fig-\S+)\}/);
      if (match) {
        embedIds.push(match[1]);
      }
    }
  }
  return embedIds.length ? embedIds : null;
}

function idToCompletion(id: string): CompletionItem {
  return {
    label: id,
    kind: CompletionItemKind.Field
  };
}
