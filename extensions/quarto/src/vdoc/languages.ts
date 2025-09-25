/*
 * languages.ts
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

import { editorLanguage } from "../types/local-types";

export interface EmbeddedLanguage {
  ids: string[];
  extension: string;
  type: "content" | "tempfile";
  localTempFile?: boolean;
  emptyLine?: string;
  comment?: string;
  trigger?: string[];
  inject?: string[];
  canFormat?: boolean;
  canFormatDocument?: boolean;
}

export function embeddedLanguage(language: string) {
  language = language.split("-").pop() || "";
  return kEmbededLanguages.find((lang) => lang.ids.includes(language));
}

export function languageCanFormatDocument(language: EmbeddedLanguage) {
  return language.canFormatDocument !== false;
}

const kEmbededLanguages = [
  // these languages required creating a temp file
  defineLanguage("python", {
    inject: ["# type: ignore", "# flake8: noqa"],
    emptyLine: "#",
    canFormat: true,
    canFormatDocument: false,
  }),
  defineLanguage("r", {
    emptyLine: "#",
    canFormat: true
  }),
  defineLanguage("julia", {
    emptyLine: "#",
    canFormat: true,
  }),
  defineLanguage("matlab", {
    emptyLine: "%",
    canFormat: true
  }),
  defineLanguage("stata", {
    emptyLine: "*",
  }),
  defineLanguage("typescript", {
    type: "tempfile",
    localTempFile: true,
    inject: ["// deno-lint-ignore-file"],
    emptyLine: "//",
    canFormat: true,
  }),
  defineLanguage("sql"),
  defineLanguage("bash"),
  defineLanguage("sh"),
  defineLanguage("shell"),
  defineLanguage("ruby"),
  defineLanguage("prql"),
  defineLanguage("rust"),
  defineLanguage("java"),
  defineLanguage("cpp"),
  defineLanguage("go"),
  // these languages work w/ text document content provider
  defineLanguage("html", { type: "content" }),
  defineLanguage("css", { type: "content" }),
  defineLanguage("javascript", { type: "content" }),
  defineLanguage("jsx", { type: "content" }),
];

interface LanguageOptions {
  type?: "content" | "tempfile";
  localTempFile?: boolean;
  emptyLine?: string;
  inject?: string[];
  canFormat?: boolean;
  canFormatDocument?: boolean;
}

function defineLanguage(
  id: string,
  options?: LanguageOptions
): EmbeddedLanguage {

  // lookup language
  const language = editorLanguage(id);
  if (!language) {
    throw new Error(`Unknown language ${id}`);
  }

  // validate consistency of options
  if (options?.canFormat && !options?.emptyLine) {
    throw new Error(
      "emptyLine must be specified for languages with canFormat === true"
    );
  }
  return {
    ids: language.ids,
    extension: language.ext || language.ids[0],
    type: options?.type || "tempfile",
    localTempFile: options?.localTempFile,
    comment: language.comment,
    emptyLine: options?.emptyLine,
    trigger: language.trigger,
    inject: options?.inject,
    canFormat: options?.canFormat,
    canFormatDocument: options?.canFormatDocument
  };
}
