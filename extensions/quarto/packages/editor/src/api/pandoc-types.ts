/*
 * pandoc-types.ts
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

export interface PandocFormat {
  mode: string;
  baseName: string;
  fullName: string;
  extensions: PandocExtensions;
  warnings: PandocFormatWarnings;
}

export interface PandocFormatWarnings {
  invalidFormat: string;
  invalidOptions: string[];
}

export interface PandocFormatConfig {
  mode?: string;
  extensions?: string;
  rmdExtensions?: string;
  wrap?: string;
  doctypes?: string[];
  references_location?: string;
  references_prefix?: string;
  references_links?: boolean;
  canonical?: boolean;
}

export interface PandocExtensions {
  abbreviations: boolean;
  all_symbols_escapable: boolean;
  amuse: boolean;
  angle_brackets_escapable: boolean;
  ascii_identifiers: boolean;
  auto_identifiers: boolean;
  autolink_bare_uris: boolean;
  backtick_code_blocks: boolean;
  blank_before_blockquote: boolean;
  blank_before_header: boolean;
  bracketed_spans: boolean;
  citations: boolean;
  compact_definition_lists: boolean;
  definition_lists: boolean;
  east_asian_line_breaks: boolean;
  emoji: boolean;
  empty_paragraphs: boolean;
  epub_html_exts: boolean;
  escaped_line_breaks: boolean;
  example_lists: boolean;
  fancy_lists: boolean;
  fenced_code_attributes: boolean;
  fenced_code_blocks: boolean;
  fenced_divs: boolean;
  footnotes: boolean;
  four_space_rule: boolean;
  gfm_auto_identifiers: boolean;
  grid_tables: boolean;
  hard_line_breaks: boolean;
  header_attributes: boolean;
  ignore_line_breaks: boolean;
  implicit_figures: boolean;
  implicit_header_references: boolean;
  inline_code_attributes: boolean;
  inline_notes: boolean;
  intraword_underscores: boolean;
  latex_macros: boolean;
  line_blocks: boolean;
  link_attributes: boolean;
  lists_without_preceding_blankline: boolean;
  literate_haskell: boolean;
  markdown_attribute: boolean;
  markdown_in_html_blocks: boolean;
  mmd_header_identifiers: boolean;
  mmd_link_attributes: boolean;
  mmd_title_block: boolean;
  multiline_tables: boolean;
  native_divs: boolean;
  native_spans: boolean;
  native_numbering: boolean;
  ntb: boolean;
  old_dashes: boolean;
  pandoc_title_block: boolean;
  pipe_tables: boolean;
  raw_attribute: boolean;
  raw_html: boolean;
  raw_tex: boolean;
  shortcut_reference_links: boolean;
  simple_tables: boolean;
  smart: boolean;
  space_in_atx_header: boolean;
  spaced_reference_links: boolean;
  startnum: boolean;
  strikeout: boolean;
  subscript: boolean;
  superscript: boolean;
  styles: boolean;
  task_lists: boolean;
  table_captions: boolean;
  tex_math_dollars: boolean;
  tex_math_double_backslash: boolean;
  tex_math_single_backslash: boolean;
  yaml_metadata_block: boolean;
  gutenberg: boolean;
  // attributes: boolean; (not yet)
  [key: string]: boolean;
}

export interface PandocWriterReferencesOptions {
  location?: string; // block | section | document
  prefix?: string;
  links?: boolean;
}

export interface PandocWriterOptions {
  atxHeaders?: boolean;
  references?: PandocWriterReferencesOptions;
  wrap?: string;
  dpi?: number;
}