/*
 * documents.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
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

import fs from "node:fs";

import { URI } from "vscode-uri";
import { TextDocuments } from "vscode-languageserver";

import {  Document } from "quarto-core";
export interface EditorServerDocument {
  filePath: string;
  code: string;
  lastModified: Date;
  version?: number;
}

export interface EditorServerDocuments {
  getDocument(filePath: string) : EditorServerDocument;
}

export function editorServerDocuments(documents: TextDocuments<Document>) {
  return {
    getDocument(filePath: string) {
      const uri = URI.file(filePath).toString();
      const lastModified = fs.statSync(filePath).mtime;
      const doc = documents.get(uri);
      if (doc) {
        return { 
          filePath,
          code: doc.getText(),
          lastModified,
          version: doc.version
        }
      } else {
        return {
          filePath,
          code: fs.readFileSync(filePath, { encoding: "utf-8" }),
          lastModified
        }
      }
    }
  }
}

export function editorDocumentsEqual(a: EditorServerDocument, b: EditorServerDocument) {
  return a.filePath === b.filePath &&
         a.code === b.code &&
         a.lastModified.getTime() === b.lastModified.getTime() &&
         a.version === b.version;
}

