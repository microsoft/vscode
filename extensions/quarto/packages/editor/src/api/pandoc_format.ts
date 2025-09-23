/*
 * pandoc_format.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model';

import { PandocServer, PandocExtensions } from './pandoc';
import { EditorFormat, kHugoDocType } from './format';
import { firstYamlBlock, yamlMetadataNodes } from './yaml';
import { findValue } from './object';
import { PandocFormat, PandocFormatConfig, PandocFormatWarnings } from './pandoc-types';

export const kMarkdownFormat = 'markdown';
export const kMarkdownPhpextraFormat = 'markdown_phpextra';
export const kMarkdownGithubFormat = 'markdown_github';
export const kMarkdownMmdFormat = 'markdown_mmd';
export const kMarkdownStrictFormat = 'markdown_strict';
export const kGfmFormat = 'gfm';
export const kCommonmarkFormat = 'commonmark';
export const kCommonmarkXFormat = 'commonmark_x';

export function matchPandocFormatComment(code: string) {
  const magicCommentRegEx = /^<!--\s+-\*-([\s\S]*?)-\*-\s+-->\s*$/m;
  return code.match(magicCommentRegEx);
}

export function pandocFormatConfigFromDoc(doc: ProsemirrorNode, isRmd: boolean) {
  return pandocFormatConfigFromYamlInDoc(doc, isRmd) || pandocFormatConfigFromCommentInDoc(doc) || {};
}

export function pandocFormatConfigFromCode(code: string, isRmd: boolean): PandocFormatConfig {
  return pandocFormatConfigFromYamlInCode(code, isRmd) || pandocFormatConfigFromCommentInCode(code) || {};
}

function pandocFormatConfigFromYamlInCode(code: string, isRmd: boolean): PandocFormatConfig | null {
  // get the first yaml block in the file
  const yaml = firstYamlBlock(code);

  // did we find yaml?
  if (yaml) {
    // see if we have any md_extensions defined
    let mdExtensions : string | undefined = isRmd ? findValue('md_extensions', yaml?.output as Record<string,unknown>) : undefined;
    if (!mdExtensions) {
      // look for quarto 'from'
      const from = findValue('from', yaml);
      if (from) {
        const fromStr = String(from);
        const extensions = fromStr.match(/^\w+([+-][\w+-]+)$/);
        if (extensions) {
          mdExtensions = extensions[1];
        }
      }
    }

    // see if we have any markdown options defined
    let yamlFormatConfig: PandocFormatConfig | undefined;

    // first check 'editor' then check 'editor_options'
    const yamlEditor = yaml?.editor;

    if (yamlEditor && (yamlEditor instanceof Object) && 
        yamlEditor.markdown && (yamlEditor.markdown instanceof Object)) {
      yamlFormatConfig = readPandocFormatConfig(yamlEditor.markdown);
    } else {
      const yamlMarkdownOptions = yaml?.editor_options?.markdown;
      if (yamlMarkdownOptions instanceof Object) {
        yamlFormatConfig = readPandocFormatConfig(yamlMarkdownOptions);
      }
    }

    // combine and return
    if (mdExtensions || yamlFormatConfig) {
      const formatConfig: PandocFormatConfig = yamlFormatConfig ? yamlFormatConfig : {};
      if (mdExtensions) {
        formatConfig.extensions = mdExtensions + (formatConfig.extensions || '');
      }
      return formatConfig;
    } else {
      return null;
    }
  } else {
    return null;
  }
}

function pandocFormatConfigFromYamlInDoc(doc: ProsemirrorNode, isRmd: boolean): PandocFormatConfig | null {
  const yamlNodes = yamlMetadataNodes(doc);
  if (yamlNodes.length > 0) {
    return pandocFormatConfigFromYamlInCode(yamlNodes[0].node.textContent, isRmd);
  } else {
    return null;
  }
}

function pandocFormatConfigFromCommentInCode(code: string): PandocFormatConfig | null {
  const keyValueRegEx = /^([^:]+):\s*(.*)$/;
  const match = matchPandocFormatComment(code);
  if (match) {
    const comment = match[1];
    // split into semicolons
    const fields = comment.split(/\s*;\s/).map(field => field.trim());
    const variables: { [key: string]: string } = {};
    fields.forEach(field => {
      const keyValueMatch = field.match(keyValueRegEx);
      if (keyValueMatch) {
        variables[keyValueMatch[1].trim()] = keyValueMatch[2].trim();
      }
    });
    return readPandocFormatConfig(variables);
  } else {
    return null;
  }
}

function pandocFormatConfigFromCommentInDoc(doc: ProsemirrorNode): PandocFormatConfig | null {
  let config: PandocFormatConfig | null = null;
  let foundFirstRawInline = false;
  doc.descendants((node) => {
    // don't search once we've found our target
    if (foundFirstRawInline) {
      return false;
    }

    // if it's a text node with a raw-html then scan it for the format comment
    const schema = doc.type.schema;
    if (
      node.isText &&
      schema.marks.raw_html_comment &&
      schema.marks.raw_html_comment.isInSet(node.marks) &&
      node.attrs.format
    ) {
      foundFirstRawInline = true;
      config = pandocFormatConfigFromCommentInCode(node.textContent);
      return false;
    } else {
      return true;
    }
  });
  return config;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readPandocFormatConfig(source: Record<string,any>) {
  const asString = (obj: unknown): string => {
    if (typeof obj === 'string') {
      return obj;
    } else if (obj) {
      return obj.toString();
    } else {
      return '';
    }
  };

  const asBoolean = (obj: unknown) => {
    if (typeof obj === 'boolean') {
      return obj;
    } else {
      const str = asString(obj).toLowerCase();
      return str === 'true' || str === '1';
    }
  };

  const readWrap = () => {
    const wrap = source.wrap || source.wrap_column || source['fill-column'];
    if (wrap) {
      return asString(wrap);
    } else {
      return undefined;
    }
  };

  const formatConfig: PandocFormatConfig = {};
  if (source.mode) {
    formatConfig.mode = asString(source.mode);
  }
  if (source.extensions) {
    formatConfig.extensions = asString(source.extensions);
  }
  if (source.rmd_extensions) {
    formatConfig.rmdExtensions = asString(source.rmd_extensions);
  }
  formatConfig.wrap = readWrap();
  if (source.doctype) {
    formatConfig.doctypes = asString(source.doctype)
      .split(',')
      .map(str => str.trim());
  }
  if (source.references) {
    if (typeof source.references === 'string') {
      formatConfig.references_location = source.references;
    } else {
      formatConfig.references_location = source.references.location;
      formatConfig.references_prefix = source.references.prefix;
      formatConfig.references_links = asBoolean(source.references.links);
    }
  }
  if (source.canonical) {
    formatConfig.canonical = asBoolean(source.canonical);
  }
  return formatConfig;
}

export async function resolvePandocFormat(pandoc: PandocServer, format: EditorFormat): Promise<PandocFormat> {
  // additional markdown variants we support
  const kMarkdownVariants: { [key: string]: string[] } = {
    [kCommonmarkFormat]: commonmarkExtensions(),
    [kCommonmarkXFormat]: commonmarkXExtensions(),
    [kGfmFormat]: gfmExtensions(),
    goldmark: goldmarkExtensions(format),
    blackfriday: blackfridayExtensions(format),
  };

  // setup warnings
  const warnings: PandocFormatWarnings = { invalidFormat: '', invalidOptions: [] };

  // alias options and basename
  let options = format.pandocExtensions;
  let baseName = format.pandocMode;

  // validate the base format (fall back to markdown if it's not known)
  if (
    ![
      kMarkdownFormat,
      kMarkdownPhpextraFormat,
      kMarkdownGithubFormat,
      kMarkdownMmdFormat,
      kMarkdownStrictFormat,
      kGfmFormat,
      kCommonmarkFormat,
      kCommonmarkXFormat
    ]
      .concat(Object.keys(kMarkdownVariants))
      .includes(baseName)
  ) {
    warnings.invalidFormat = baseName;
    baseName = 'markdown';
  }

  // if we are using a variant then get it's base options and merge with user options
  if (kMarkdownVariants[baseName]) {
    const variant = kMarkdownVariants[baseName];
    options = variant.map(option => `${option}`).join('') + options;
    baseName = 'markdown_strict';
  }

  // query for format options
  const formatOptions = await pandoc.listExtensions(baseName);

  // active pandoc extensions
  const pandocExtensions: { [key: string]: boolean } = {};

  // first parse extensions for format
  parseExtensions(formatOptions).forEach(option => {
    pandocExtensions[option.name] = option.enabled;
  });

  // now parse extensions for user options (validate and build format name)
  const validOptionNames = parseExtensions(formatOptions).map(option => option.name);

  let fullName = baseName;
  parseExtensions(options).forEach(option => {
    // validate that the option is valid
    if (validOptionNames.includes(option.name)) {
      // add option
      fullName += (option.enabled ? '+' : '-') + option.name;
      pandocExtensions[option.name] = option.enabled;
    } else {
      warnings.invalidOptions.push(option.name);
    }
  });

  // return format name, enabled extensiosn, and warnings
  return {
    mode: format.pandocMode,
    baseName,
    fullName,
    extensions: (pandocExtensions as unknown) as PandocExtensions,
    warnings,
  };
}

function parseExtensions(options: string) {
  // remove any linebreaks
  options = options.split('\n').join();

  // parse into separate entries
  const extensions: Array<{ name: string; enabled: boolean }> = [];
  const re = /([+-])([a-z_]+)/g;
  let match = re.exec(options);
  while (match) {
    extensions.push({ name: match[2], enabled: match[1] === '+' });
    match = re.exec(options);
  }

  return extensions;
}

export function pandocFormatWith(format: string, prepend: string, append: string) {
  const split = splitPandocFormatString(format);
  return `${split.format}${prepend}${split.options}${append}`;
}

export function splitPandocFormatString(format: string) {
  // split out base format from options
  let optionsPos = format.indexOf('-');
  if (optionsPos === -1) {
    optionsPos = format.indexOf('+');
  }
  const base = optionsPos === -1 ? format : format.substr(0, optionsPos);
  const options = optionsPos === -1 ? '' : format.substr(optionsPos);
  return {
    format: base,
    options,
  };
}

export function hasFencedCodeBlocks(pandocExtensions: PandocExtensions) {
  return pandocExtensions.backtick_code_blocks || pandocExtensions.fenced_code_blocks;
}

// e.g. [My Heading] to link to ## My Heading
export function hasShortcutHeadingLinks(pandocExtensions: PandocExtensions) {
  return pandocExtensions.implicit_header_references && pandocExtensions.shortcut_reference_links;
}

function commonmarkExtensions(rawHTML = true) {
  const extensions = [
    rawHTML ? '+raw_html' : '-raw_html',
    '+all_symbols_escapable',
    '+backtick_code_blocks',
    '+fenced_code_blocks',
    '+space_in_atx_header',
    '+intraword_underscores',
    '+lists_without_preceding_blankline',
    '+shortcut_reference_links',
  ];
  return extensions;
}

// https://github.com/jgm/pandoc/commit/0aed9dd589189a9bbe5cae99e0e024e2d4a92c36
function commonmarkXExtensions() {
  const extensions = [
    '+pipe_tables',
    '+raw_html',
    '+auto_identifiers',
    '+strikeout',
    '+task_lists',
    '+emoji',
    '+raw_tex',
    '+smart',
    '+tex_math_dollars',
    '+superscript',
    '+subscript',
    '+definition_lists',
    '+footnotes',
    '+fancy_lists',
    '+fenced_divs',
    '+bracketed_spans',
    '+raw_attribute',
    '+implicit_header_references',
    // '+attributes' (not yet)
  ];
  return extensions;
}

function gfmExtensions() {
  const extensions = [
    ...commonmarkExtensions(),
    '+auto_identifiers',
    '+autolink_bare_uris',
    '+emoji',
    '+gfm_auto_identifiers',
    '+pipe_tables',
    '+strikeout',
    '+task_lists',
    '+tex_math_dollars',
    '+footnotes'
  ];
  return extensions;
}

// https://gohugo.io/getting-started/configuration-markup/#goldmark
// https://github.com/yuin/goldmark/#html-renderer-options
function goldmarkExtensions(format: EditorFormat) {
  const extensions = [
    // start with commonmark
    ...commonmarkExtensions(false),

    // adds most of gfm
    '+pipe_tables',
    '+strikeout',
    '+autolink_bare_uris',
    '+task_lists',
    '+backtick_code_blocks',

    // plus some extras
    '+definition_lists',
    '+footnotes',
    '+smart',

    // hugo preprocessor supports yaml metadata
    '+yaml_metadata_block',
  ];

  if (includeTexMathDollars(format)) {
    extensions.push('+tex_math_dollars');
  }

  return extensions;
}

// https://github.com/russross/blackfriday/tree/v2#extensions
function blackfridayExtensions(format: EditorFormat) {
  const extensions = [
    '+intraword_underscores',
    '+pipe_tables',
    '+backtick_code_blocks',
    '+definition_lists',
    '+footnotes',
    '+autolink_bare_uris',
    '+strikeout',
    '+smart',
    '+yaml_metadata_block',
  ];

  if (includeTexMathDollars(format)) {
    extensions.push('+tex_math_dollars');
  }

  return extensions;
}

function includeTexMathDollars(format: EditorFormat) {
  // hugo users often sort out some way to include math so we enable it for hugo
  return format.docTypes.includes(kHugoDocType) || format.rmdExtensions.blogdownMathInCode;
}
