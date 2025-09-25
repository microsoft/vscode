/*
 * csl.ts
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

import { Bibliography } from "./csl.js";

export const kPandocGetCapabilities = 'pandoc_get_capabilities';
export const kPandocMarkdownToAst = 'pandoc_markdown_to_ast';
export const kPandocAstToMarkdown = 'pandoc_ast_to_markdown';
export const kPandocListExtensions = 'pandoc_list_extensions';
export const kPandocGetBibliography  = 'pandoc_get_bibliography';
export const kPandocAddtoBibliography = 'pandoc_add_to_bibliography';
export const kPandocCitationHtml = 'pandoc_citation_html';

export type PandocApiVersion = number[];

export interface PandocServer {
  getCapabilities(): Promise<PandocCapabilitiesResult>;
  markdownToAst(markdown: string, format: string, options: string[]): Promise<PandocAst>;
  astToMarkdown(ast: PandocAst, format: string, options: string[]): Promise<string>;
  listExtensions(format: string): Promise<string>;
  getBibliography(
    file: string | null,
    bibliography: string[],
    refBlock: string | null,
    etag: string | null,
  ): Promise<BibliographyResult>;
  addToBibliography(
    bibliography: string,
    project: boolean,
    id: string,
    sourceAsJson: string,
    sourceAsBibTeX: string,
    documentPath: string | null
  ): Promise<boolean>;
  citationHTML(file: string | null, sourceAsJson: string, csl: string | null): Promise<string>;
}

export interface BibliographyResult {
  etag: string;
  bibliography: Bibliography;
}

export interface PandocCapabilitiesResult {
  version: string;
  api_version: PandocApiVersion;
  output_formats: string;
  highlight_languages: string;
}


export interface PandocAst {
  blocks: PandocToken[];
  'pandoc-api-version': PandocApiVersion;
  meta: Record<string,unknown>;
  heading_ids?: string[]; // used only for reading not writing
}

export interface PandocToken {
  t: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c?: any;
}

export interface PandocAttr {
  id: string;
  classes: string[];
  keyvalue: Array<[string, string]>;
}

