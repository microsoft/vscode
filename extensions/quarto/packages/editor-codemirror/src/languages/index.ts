// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
/*
 * index.ts
 *
 * Copyright (C) 2022 by Emergence Engineering (ISC License)
 * https://gitlab.com/emergence-engineering/prosemirror-codemirror-block
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

import { StreamLanguage, Language } from "@codemirror/language";

import { cpp } from "@codemirror/lang-cpp";
import { html } from "@codemirror/lang-html"
import { css } from "@codemirror/lang-css";
import { sql } from "@codemirror/lang-sql";
import { xml } from "@codemirror/lang-xml";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { java } from "@codemirror/legacy-modes/mode/clike";
import { fortran } from "@codemirror/legacy-modes/mode/fortran";
import { haskell } from "@codemirror/legacy-modes/mode/haskell";
import { julia } from "@codemirror/legacy-modes/mode/julia";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { powerShell } from "@codemirror/legacy-modes/mode/powershell";
import { r } from "@codemirror/legacy-modes/mode/r";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { sas } from "@codemirror/legacy-modes/mode/sas";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { yaml } from "@codemirror/legacy-modes/mode/yaml";

export enum Languages {
  javascript = "javascript",
  html = "html",
  css = "css",
  sql = "sql",
  python = "python",
  rust = "rust",
  xml = "xml",
  markdown = "markdown",
  cpp = "cpp",
  java = "java",
  fortran = "fortran",
  haskell = "haskell",
  julia = "julia",
  lua = "lua",
  powershell = "powershell",
  r = "r",
  ruby = "ruby",
  sas = "sas",
  shell = "shell",
  stex = "stex",
  yaml = "yaml",
}


const modes = new Map<string,Language>();

export function languageMode(lang: string) : Language  | null {
  if (!modes.has(lang)) {
    modes.set(lang, createLanguageMode(lang));
  }
  return modes.get(lang) || null;
}


export function createLanguageMode(lang: string) : Language  | null {

  // mappings
  switch(lang) {
    case 'yaml-frontmatter':
      lang = 'yaml';
      break;
    case 'bash':
    case 'sh':
      lang = 'shell';
      break;
    case 'js':
    case 'ojs':
      lang = 'javascript';
      break;
  }

  switch(lang) {
    case Languages.javascript:
      return javascript().language;
    case Languages.html:
      return html().language;
    case Languages.css:
      return css().language;
    case Languages.sql:
      return sql().language;
    case Languages.python:
      return python().language;
    case Languages.rust:
      return rust().language;
    case Languages.xml:
      return xml().language;
    case Languages.markdown:
      return markdown().language;
    case Languages.cpp:
      return cpp().language;
    case Languages.java:
      return StreamLanguage.define(java);
    case Languages.fortran:
      return StreamLanguage.define(fortran);
    case Languages.haskell:
      return StreamLanguage.define(haskell);
    case Languages.julia:
      return StreamLanguage.define(julia);
    case Languages.lua:
      return StreamLanguage.define(lua);
    case Languages.powershell:
      return StreamLanguage.define(powerShell);
    case Languages.r:
      return StreamLanguage.define(r);
    case Languages.ruby:
      return StreamLanguage.define(ruby);
    case Languages.sas:
      return StreamLanguage.define(sas);
    case Languages.shell:
      return StreamLanguage.define(shell);
    case Languages.stex:
      return StreamLanguage.define(stex);
    case Languages.yaml:
      return StreamLanguage.define(yaml);
    default:
      return null;
  }
}


