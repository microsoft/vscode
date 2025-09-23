import { initExtensions } from "editor/src/editor/editor-extensions";
import { PandocFormat } from "editor/src/api/pandoc_format";
import { PandocExtensions } from "editor/src/api/pandoc";
import { EditorEvent, EditorEvents } from "editor/src/api/events";
import { EditorUI, EditorDialogs } from "editor/src/api/ui";

const editorOptions = {
  "autoFocus": true,
  "spellCheck": false,
  "codemirror": true,
  "braceMatching": true,
  "rmdCodeChunks": true,
  "rmdImagePreview": false,
  "formatComment": true
};

const ui: EditorUI = {
  context: {
    getDefaultResourceDir: () => "./",
    mapResourceToURL: (path: string) => path,
    translateText: (text: string) => text,
    getUsername: () => "TEST"
  },
  dialogs: {
  } as unknown as EditorDialogs,
  display: {
    openURL: (url: string) => {
      // intentionally left blank
    }
  },
  execute: {},
  images: {}
};

const events: EditorEvents = {
  subscribe: (event, handler) => {
    return () => undefined;
  },
  emit: (event: EditorEvent) => {
    // do nothing
  }
};

const extensions = undefined;

const pandocFormat: PandocFormat = {
  "baseName": "markdown",
  "fullName": "markdown+autolink_bare_uris+tex_math_single_backslash",
  "extensions": {
    "abbreviations": false,
    "all_symbols_escapable": true,
    "angle_brackets_escapable": false,
    "ascii_identifiers": false,
    "auto_identifiers": true,
    "autolink_bare_uris": true,
    "backtick_code_blocks": true,
    "blank_before_blockquote": true,
    "blank_before_header": true,
    "bracketed_spans": true,
    "citations": true,
    "compact_definition_lists": false,
    "definition_lists": true,
    "east_asian_line_breaks": false,
    "emoji": false,
    "escaped_line_breaks": true,
    "example_lists": true,
    "fancy_lists": true,
    "fenced_code_attributes": true,
    "fenced_code_blocks": true,
    "fenced_divs": true,
    "footnotes": true,
    "four_space_rule": false,
    "gfm_auto_identifiers": false,
    "grid_tables": true,
    "hard_line_breaks": false,
    "header_attributes": true,
    "ignore_line_breaks": false,
    "implicit_figures": true,
    "implicit_header_references": true,
    "inline_code_attributes": true,
    "inline_notes": true,
    "intraword_underscores": true,
    "latex_macros": true,
    "line_blocks": true,
    "link_attributes": true,
    "lists_without_preceding_blankline": false,
    "literate_haskell": false,
    "markdown_attribute": false,
    "markdown_in_html_blocks": true,
    "mmd_header_identifiers": false,
    "mmd_link_attributes": false,
    "mmd_title_block": false,
    "multiline_tables": true,
    "native_divs": true,
    "native_spans": true,
    "old_dashes": false,
    "pandoc_title_block": true,
    "pipe_tables": true,
    "raw_attribute": true,
    "raw_html": true,
    "raw_tex": true,
    "shortcut_reference_links": true,
    "simple_tables": true,
    "smart": true,
    "space_in_atx_header": true,
    "spaced_reference_links": false,
    "startnum": true,
    "strikeout": true,
    "subscript": true,
    "superscript": true,
    "task_lists": true,
    "table_captions": true,
    "tex_math_dollars": true,
    "tex_math_double_backslash": false,
    "tex_math_single_backslash": true,
    "yaml_metadata_block": true,
    "gutenberg": false
  } as unknown as PandocExtensions, // cast is necessary cause we're missings ome
  "warnings": {
    "invalidFormat": "",
    "invalidOptions": []
  }
};

const pandocCapabilities = {
  "api_version": [1, 20],
  "version": "2.9",
  "output_formats": [
    "html",
    "latex"
  ],
  "highlight_languages": [
    "r",
    "bash",
    "sql",
    "python"
  ]
};

const editorFormat = {
  "pandocMode": "markdown",
  "pandocExtensions": "",
  "rmdExtensions": {},
  "hugoExtensions": {},
  "wrapColumn": 0,
  "docTypes": []
};

export function createExtensionManager() {
  return initExtensions(
    editorFormat,
    editorOptions,
    ui,
    events,
    extensions,
    pandocFormat.extensions,
    pandocCapabilities);
}

export function initUI() {
  return ui;
}
