/*
 * ui.ts
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

import { CompletionList } from 'vscode-languageserver-types';

import { SkinTone } from './emoji';

import {
  EditorUISpelling,
  EditorDialogs,
  EditorDisplay,
  EditorUIImageResolver,
  CodeViewCompletionContext,
  CodeViewExecute,
  CodeViewActiveBlockContext,
  DiagramState,
  CodeViewCellContext,
  LintItem
} from 'editor-types';

export * from './spelling';
export { SkinTone } from './emoji';
export type { EditorDisplay };

export interface EditorUI {
  dialogs: EditorDialogs;
  display: EditorDisplay;
  context: EditorUIContext;
  prefs: EditorUIPrefs;
  images: EditorUIImages;
  math?: EditorUIMath;
  spelling?: EditorUISpelling;
  codeview?: EditorUICodeView;
  chunks?: EditorUIChunks;
}

/**
 * Callbacks supplied to the host to interact with a code chunk and its output.
 */
export interface EditorUIChunkCallbacks {
  getPos: () => number;
  scrollIntoView: (ele: HTMLElement) => void;
  scrollCursorIntoView: () => void;
  getTextContent: () => string;
}

export interface EditorUIChunks {
  // create a code chunk editor
  createChunkEditor: (type: string, element: Element, index: number, classes: string[], callbacks: EditorUIChunkCallbacks) => ChunkEditor;

  // expand or collapse all chunk editors
  setChunksExpanded: (expanded: boolean) => void;
}

export interface ChunkEditor {
  editor: unknown;
  setMode(mode: string): void;
  executeSelection(): void;
  element: HTMLElement;
  destroy(): void;
  setExpanded(expanded: boolean): void;
  getExpanded(): boolean;
}


export interface EditorMath {
  typeset: (el: HTMLElement, math: string, priority: boolean) => Promise<boolean>;
}

export interface EditorUIContext extends EditorUIImageResolver {

  // are we running in windows desktop mode?
  isWindowsDesktop: () => boolean;

  // check if we are the active tab
  isActiveTab: () => boolean;

  // get the path to the current document
  getDocumentPath: () => string | null;

  // ensure the edited document is saved on the server before proceeding
  // (note this just means that the server has a copy of it for e.g.
  // indexing xrefs, from the user's standpoint the doc is still dirty)
  withSavedDocument: () => Promise<boolean>;

  // get the default directory for resources (e.g. where relative links point to)
  getDefaultResourceDir: () => string;

  // map from a resource reference (e.g. images/foo.png) to a URL we can use in the document
  mapResourceToURL: (path: string) => string | Promise<string>;

  // watch a resource for changes (returns an unsubscribe function)
  watchResource: (path: string, notify: VoidFunction) => VoidFunction;

  // translate a string
  translateText: (text: string) => string;

  // are there dropped uris available?
  droppedUris: () => string[] | null;

  // uris from the clipboard
  clipboardUris: () => Promise<string[] | null>;

  // image from the clipboard (returned as file path)
  clipboardImage: () => Promise<string | null>;

  // get the current username
  getUsername?: () => string;

  // reopen the file in source mode
  reopenInSourceMode?: () => void,

  // executable languages
  executableLanguges?: () => string[];
}

export interface EditorUIMath {
  typeset: (el: HTMLElement, text: string, priority: boolean) => Promise<boolean>;
}

export interface EditorUICodeView {
  codeViewAssist: (context: CodeViewCellContext) => Promise<void>;
  codeViewExecute: (execute: CodeViewExecute, context: CodeViewActiveBlockContext) => Promise<void>;
  codeViewCompletions: (context: CodeViewCompletionContext) => Promise<CompletionList>;
  codeViewDiagnostics: (context: CodeViewCellContext) => Promise<LintItem[] | undefined>;
  codeViewPreviewDiagram: (state: DiagramState, activate: boolean) => Promise<void>;
}

export const kListSpacingTight = 'tight';
export const kListSpacingSpaced = 'spaced';
export type ListSpacing = 'tight' | 'spaced';


export interface EditorUIPrefs {
  realtimeSpelling: () => boolean;
  darkMode: () => boolean;
  listSpacing: () => ListSpacing;
  equationPreview: () => boolean;
  packageListingEnabled: () => boolean;
  tabKeyMoveFocus: () => boolean;
  emojiSkinTone: () => SkinTone;
  setEmojiSkinTone: (skinTone: SkinTone) => void;
  zoteroUseBetterBibtex: () => boolean;
  setBibliographyDefaultType: (type: string) => void;
  bibliographyDefaultType: () => string;
  citationDefaultInText: () => boolean;
  setCitationDefaultInText: (value: boolean) => void;
  spacesForTab: () => boolean,
  tabWidth: () => number,
  autoClosingBrackets: () => boolean,
  highlightSelectedWord: () => boolean,
  lineNumbers: () => boolean,
  showWhitespace: () => boolean,
  blinkingCursor: () => boolean,
  quickSuggestions: () => boolean;
}


export interface EditorUIImages {
  copy: string;
  properties: string;
  properties_deco: string;
  properties_deco_dark: string;
  removelink: string;
  runchunk: string;
  runprevchunks: string;
  search: string;
  search_progress: string;
  omni_insert: {
    generic: string;
    heading1: string;
    heading1_dark: string;
    heading2: string;
    heading2_dark: string;
    heading3: string;
    heading3_dark: string;
    heading4: string;
    heading4_dark: string;
    ordered_list: string;
    ordered_list_dark: string;
    bullet_list: string;
    bullet_list_dark: string;
    blockquote: string;
    blockquote_dark: string;
    math_inline: string;
    math_inline_dark: string;
    math_display: string;
    math_display_dark: string;
    html_block: string;
    html_block_dark: string;
    line_block: string;
    line_block_dark: string;
    emoji: string;
    emoji_dark: string;
    comment: string;
    comment_dark: string;
    div: string;
    div_dark: string;
    code_block: string;
    code_block_dark: string;
    footnote: string;
    footnote_dark: string;
    citation: string;
    citation_dark: string;
    cross_reference: string;
    cross_reference_dark: string;
    symbol: string;
    symbol_dark: string;
    table: string;
    table_dark: string;
    definition_list: string;
    definition_list_dark: string;
    horizontal_rule: string;
    horizontal_rule_dark: string;
    image: string;
    image_dark: string;
    link: string;
    link_dark: string;
    paragraph: string;
    paragraph_dark: string;
    raw_block: string;
    raw_block_dark: string;
    raw_inline: string;
    raw_inline_dark: string;
    tex_block: string;
    tex_block_dark: string;
    yaml_block: string;
    yaml_block_dark: string;
    python_chunk: string;
    sql_chunk: string;
    d3_chunk: string;
    stan_chunk: string;
    bash_chunk: string;
    bash_chunk_dark: string;
    r_chunk: string;
    r_chunk_dark: string;
    rcpp_chunk: string;
    rcpp_chunk_dark: string;
    tabset: string;
    tabset_dark: string;
    slide_columns: string;
    slide_columns_dark: string;
    slide_pause: string;
    slide_pause_dark: string;
    slide_notes: string;
    slide_notes_dark: string;
  };
  citations: {
    article: string;
    article_dark: string;
    book: string;
    book_dark: string;
    broadcast: string;
    broadcast_dark: string;
    data: string;
    data_dark: string;
    entry: string;
    entry_dark: string;
    image: string;
    image_dark: string;
    legal: string;
    legal_dark: string;
    map: string;
    map_dark: string;
    movie: string;
    movie_dark: string;
    other: string;
    other_dark: string;
    song: string;
    song_dark: string;
    web: string;
    web_dark: string;
    zoteroOverlay: string;
    local_sources: string;
    packages: string;
    bibligraphy: string;
    bibligraphy_folder: string;
    zotero_library: string;
    zotero_collection: string;
    zotero_root: string;
    doi: string;
    crossref: string;
    pubmed: string;
    datacite: string;
  };
  xrefs: {
    section_dark: string;
    section: string;
    equation: string;
    equation_dark: string;
    table: string;
    table_dark: string;
    listing: string;
    listing_dark: string;
    theorem: string;
    theorem_dark: string;
    figure: string;
    figure_dark: string;
    type_all: string;
    type_section: string;
    type_figure: string;
    type_table: string;
    type_listing: string;
    type_equation: string;
    type_theorem: string;
  };
  widgets: {
    tag_delete: string;
    tag_edit: string;
  };
}
