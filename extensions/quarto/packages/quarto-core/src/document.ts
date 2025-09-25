/*
 * document.ts
 *
 * Copyright (C) 2023-2024 by Posit Software, PBC
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

import { Position, Range } from 'vscode-languageserver-types';
import { URI } from 'vscode-uri';
import { makeRange } from './range.js';

/**
 * A document in the workspace.
 */
export interface Document {
  /**
   * The uri of the document, as a string.
   */
  readonly uri: string;

  /**
   * The uri of the document, as a URI. 
   */
  readonly $uri?: URI;

  /**
   * The lanugageId of the document
   */
  readonly languageId: string | undefined;

  /**
   * Version number of the document's content. 
   */
  readonly version: number;

  /**
   * The total number of lines in the document.
   */
  readonly lineCount: number;

  /**
   * Get text contents of the document.
   * 
   * @param range Optional range to get the text of. If not specified, the entire document content is returned.
   */
  getText(range?: Range): string;

  /**
   * Converts an offset in the document into a {@link Position position}.
   */
  positionAt(offset: number): Position;
}

export function getLine(doc: Document, line: number): string {
  return doc.getText(makeRange(line, 0, line, Number.MAX_VALUE)).replace(/\r?\n$/, '');
}

export function getDocUri(doc: Document): URI {
  return doc.$uri ?? URI.parse(doc.uri);
}


export const kQuartoLanguageId = "quarto";
export const kMarkdownLanguageId = "markdown";
export const kYamlLanguageId = "yaml";

export enum DocType {
  None,
  Qmd,
  Yaml,
}

export function docType(doc: Document) {
  if (isQuartoDoc(doc)) {
    return DocType.Qmd;
  } else if (isQuartoYaml(doc)) {
    return DocType.Yaml;
  } else {
    return DocType.None;
  }
}

export function isQuartoDoc(doc: Document) {
  return (
    doc.languageId === kQuartoLanguageId ||
    doc.languageId === kMarkdownLanguageId
  );
}

export function isQuartoYaml(doc: Document) {
  return (
    doc.languageId === kYamlLanguageId &&
    (doc.uri.match(/_quarto(-.*?)?\.ya?ml$/) ||
      doc.uri.match(/_brand\.ya?ml$/) ||
      doc.uri.match(/_metadata\.ya?ml$/) ||
      doc.uri.match(/_extension\.ya?ml$/))
  );
}

export function filePathForDoc(doc: Document) {
  return URI.parse(doc.uri).fsPath;
}

export const kRegExYAML =
  /(^)(---[ \t]*[\r\n]+(?![ \t]*[\r\n]+)[\W\w]*?[\r\n]+(?:---|\.\.\.))([ \t]*)$/gm;

export function isQuartoDocWithFormat(doc: Document | string, format: string) {
  if (typeof (doc) !== "string") {
    if (isQuartoDoc(doc)) {
      doc = doc.getText();
    } else {
      return false;
    }
  }
  if (doc) {
    const match = doc.match(kRegExYAML);
    if (match) {
      const yaml = match[0];
      return (
        !!yaml.match(new RegExp("^format:\\s+" + format + "\\s*$", "gm")) ||
        !!yaml.match(new RegExp("^[ \\t]*" + format + ":\\s*(default)?\\s*$", "gm"))
      );
    }
  }
  return false;
}

export function isQuartoRevealDoc(doc: Document | string) {
  return isQuartoDocWithFormat(doc, "revealjs");
}

export function isQuartoDashboardDoc(doc: Document | string) {
  return isQuartoDocWithFormat(doc, "dashboard");
}
