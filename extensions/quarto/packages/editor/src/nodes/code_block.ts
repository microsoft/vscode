/*
 * code_block.ts
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

import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { newlineInCode, exitCode } from 'prosemirror-commands';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { findParentNodeOfType } from 'prosemirror-utils';

import { lines } from 'core';

import { BlockCommand, EditorCommandId, ProsemirrorCommand, toggleBlockType } from '../api/command';
import { Extension, ExtensionContext } from '../api/extension';
import { BaseKey } from '../api/basekeys';
import { codeNodeSpec } from '../api/code';
import { PandocOutput, PandocTokenType, PandocExtensions, ProsemirrorWriter } from '../api/pandoc';
import { pandocAttrSpec, pandocAttrParseDom, pandocAttrToDomAttr, pandocAttrAvailable } from '../api/pandoc_attr';
import { PandocCapabilities } from '../api/pandoc_capabilities';
import { EditorUI } from '../api/ui-types';
import { CodeBlockProps } from 'editor-types';
import { hasFencedCodeBlocks } from '../api/pandoc_format';
import { precedingListItemInsertPos, precedingListItemInsert } from '../api/list';
import { EditorOptions } from '../api/options';
import { OmniInsertGroup } from '../api/omni_insert';
import { blockCapsuleHandlerOr, blockCapsuleParagraphTokenHandler, blockCapsuleSourceWithoutPrefix, blockCapsuleStrTokenHandler, blockCapsuleTextHandler, encodedBlockCapsuleRegex, PandocBlockCapsule, PandocBlockCapsuleFilter } from '../api/pandoc_capsule';

const kNoAttributesSentinel = 'CEF7FA46';

const extension = (context: ExtensionContext): Extension => {
  const { pandocExtensions, pandocCapabilities, ui, options } = context;

  const hasAttr = hasFencedCodeBlocks(pandocExtensions);

  return {
    nodes: [
      {
        name: 'code_block',

        spec: {
          ...codeNodeSpec(),
          attrs: { ...(hasAttr ? pandocAttrSpec : {}) },
          parseDOM: [
            {
              tag: 'pre',
              preserveWhitespace: 'full',
              getAttrs: (node: Node | string) => {
                if (hasAttr) {
                  const el = node as Element;
                  return pandocAttrParseDom(el, {});
                } else {
                  return {};
                }
              },
            },
          ],
          toDOM(node: ProsemirrorNode) {
            const fontClass = 'pm-fixedwidth-font';
            const attrs = hasAttr
              ? pandocAttrToDomAttr({
                ...node.attrs,
                classes: [...node.attrs.classes, fontClass],
              })
              : {
                class: fontClass,
              };
            return ['pre', attrs, ['code', 0]];
          },
        },

        code_view: {
          lang: (node: ProsemirrorNode) => {
            return codeBlockLang(node, options);
          },
          attrEditFn: codeBlockFormatCommandFn(pandocExtensions, ui, pandocCapabilities.highlight_languages),
        },

        attr_edit: codeBlockAttrEdit(pandocExtensions, pandocCapabilities, ui),

        pandoc: {
          readers: [
            {
              token: PandocTokenType.CodeBlock,
              code_block: true,
            },
          ],
          writer: (output: PandocOutput, node: ProsemirrorNode) => {

            // see if we need to escape executable code block syntax
            if (!pandocAttrAvailable(node.attrs) && pandocExtensions.backtick_code_blocks) {
              let text = node.textContent;
              const textLines = lines(text);
              if (textLines.length > 0) {
                const match = textLines[0].match(/^(```+)(\{+[^}]+\}+)([ \t]*)$/);
                if (match) {
                  textLines[0] = `${match[1]}{${match[2]}}${match[3]}`;
                  text = textLines.join("\n");
                  output.writeToken(PandocTokenType.Para, () => {
                    output.writeRawMarkdown(text);
                  });
                  return;
                }
              }
            }

            output.writeToken(PandocTokenType.CodeBlock, () => {
              if (hasAttr) {
                const id = pandocExtensions.fenced_code_attributes ? node.attrs.id : '';
                const keyvalue = pandocExtensions.fenced_code_attributes ? node.attrs.keyvalue : [];

                // if there are no attributes this will end up outputting a code block
                // without the fence markers (rather indenting the code block 4 spaces).
                // we don't want this so we add a sentinel class to the attributes to
                // force the fence markers (which we then cleanup below in the postprocessor)
                const classes = [...node.attrs.classes];
                if (!pandocAttrAvailable(node.attrs) && pandocExtensions.backtick_code_blocks) {
                  classes.push(kNoAttributesSentinel);
                }

                output.writeAttr(id, classes, keyvalue);
              } else {
                output.writeAttr();
              }
              output.write(node.textContent);
            });
          },
          blockCapsuleFilter: escapedRmdChunkBlockCapsuleFilter(),
          markdownPostProcessor: (markdown: string) => {
            // cleanup the sentinel classes we may have added above
            if (pandocExtensions.backtick_code_blocks) {
              markdown = markdown.replace(
                new RegExp("``` " + kNoAttributesSentinel, 'g'),
                "``` " + " ".repeat(kNoAttributesSentinel.length)
              );
            }
            return markdown;
          }
        },
      },
    ],

    commands: (schema: Schema) => {
      const commands: ProsemirrorCommand[] = [
        new BlockCommand(EditorCommandId.CodeBlock, [], schema.nodes.code_block, schema.nodes.paragraph, {}),
      ];
      if (hasAttr) {
        commands.push(new CodeBlockFormatCommand(pandocExtensions, ui, pandocCapabilities.highlight_languages));
      }
      return commands;
    },

    baseKeys: () => {
      return [
        { key: BaseKey.Enter, command: newlineInCode },
        { key: BaseKey.ModEnter, command: exitCode },
        { key: BaseKey.ShiftEnter, command: exitCode },
      ];
    },
  };
};

class CodeBlockFormatCommand extends ProsemirrorCommand {
  constructor(pandocExtensions: PandocExtensions, ui: EditorUI, languages: string[]) {
    super(
      EditorCommandId.CodeBlockFormat,
      ['Shift-Mod-\\'],
      codeBlockFormatCommandFn(pandocExtensions, ui, languages),
      {
        name: ui.context.translateText('Code Block...'),
        description: ui.context.translateText('Source code display'),
        group: OmniInsertGroup.Blocks,
        priority: 7,
        noFocus: true,
        image: () =>
          ui.prefs.darkMode() ? ui.images.omni_insert.code_block_dark : ui.images.omni_insert.code_block,
      },
    );
  }
}

function codeBlockFormatCommandFn(pandocExtensions: PandocExtensions, ui: EditorUI, languages: string[]) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    // enable if we are either inside a code block or we can toggle to a code block
    const schema = state.schema;
    const codeBlock = findParentNodeOfType(schema.nodes.code_block)(state.selection);
    if (
      !codeBlock &&
      !toggleBlockType(schema.nodes.code_block, schema.nodes.paragraph)(state) &&
      !precedingListItemInsertPos(state.doc, state.selection)
    ) {
      return false;
    }

    async function asyncEditCodeBlock() {
      if (dispatch) {
        // get props to edit
        const codeBlockProps = codeBlock
          ? { ...(codeBlock.node.attrs as CodeBlockProps), lang: '' }
          : defaultCodeBlockProps();

        // set lang if the first class is from available languages
        // (alternatively if we don't support attributes then it's
        // automatically considered the language)
        if (codeBlockProps.classes && codeBlockProps.classes.length) {
          const potentialLang = codeBlockProps.classes[0];
          if (!pandocExtensions.fenced_code_attributes || languages.includes(potentialLang)) {
            codeBlockProps.lang = potentialLang;
            codeBlockProps.classes = codeBlockProps.classes.slice(1);
          }
        }

        // show dialog
        const result = await ui.dialogs.editCodeBlock(
          codeBlockProps,
          pandocExtensions.fenced_code_attributes,
          languages,
        );
        if (result) {
          // extract lang
          const applyProps = propsWithLangClass(result);

          // edit or toggle as appropriate
          if (codeBlock) {
            const tr = state.tr;
            tr.setNodeMarkup(codeBlock.pos, schema.nodes.code_block, applyProps);
            dispatch(tr);
          } else {
            const prevListItemPos = precedingListItemInsertPos(state.doc, state.selection);
            if (prevListItemPos) {
              const tr = state.tr;
              const block = schema.nodes.code_block.create(applyProps);
              precedingListItemInsert(tr, prevListItemPos, block);
              dispatch(tr);
            } else {
              toggleBlockType(schema.nodes.code_block, schema.nodes.paragraph, applyProps)(state, dispatch, view);
            }
          }
        }
      }

      if (view) {
        view.focus();
      }
    }

    asyncEditCodeBlock();

    return true;
  };
}

function defaultCodeBlockProps() {
  return { id: '', classes: [], keyvalue: [], lang: '' };
}

function propsWithLangClass(props: CodeBlockProps) {
  const newProps = { ...props };
  if (newProps.classes && newProps.lang) {
    newProps.classes.unshift(props.lang);
  }
  return newProps;
}

// determine the code block language. if it's an Rmd example (i.e. with `r ''`) and
// we have rmdExampleHighlight enabled then use the Rmd chunk language for highlighting
function codeBlockLang(node: ProsemirrorNode, options: EditorOptions) {
  if (node.attrs.classes && node.attrs.classes.length) {
    const lang = node.attrs.classes[0];
    if (options.rmdExampleHighlight && lang === 'md') {
      const match = node.textContent.match(/^```+\s*\{([a-zA-Z0-9_-]+)( *[ ,].*)?\}`r ''`/);
      if (match) {
        return match[1].split("-").pop() || "";
      }
    }
    return lang;
  } else {
    return null;
  }
}

function codeBlockAttrEdit(pandocExtensions: PandocExtensions, pandocCapabilities: PandocCapabilities, ui: EditorUI) {
  return () => {
    if (hasFencedCodeBlocks(pandocExtensions)) {
      return {
        type: (schema: Schema) => schema.nodes.code_block,
        tags: (node: ProsemirrorNode) => {
          const tags: string[] = [];
          if (node.attrs.id) {
            tags.push(`#${node.attrs.id}`);
          }
          if (node.attrs.classes) {
            for (let i = 1; i < node.attrs.classes.length; i++) {
              tags.push(`.${node.attrs.classes[i]}`);
            }
            if (node.attrs.classes.length > 0) {
              const lang = node.attrs.classes[0];
              if (pandocCapabilities.highlight_languages.includes(lang) || lang === 'tex') {
                tags.push(lang);
              } else {
                tags.push(`.${lang}`);
              }
            }
          }
          if (node.attrs.keyvalue && node.attrs.keyvalue.length) {
            tags.push(`${node.attrs.keyvalue.map(
              (kv: [string, string]) => kv[0] + '="' + (kv[1] || '1') + '"').join(' ')}
            `);
          }
          return tags;
        },
        offset: {
          top: 3,
          right: 0,
        },
        editFn: () => codeBlockFormatCommandFn(pandocExtensions, ui, pandocCapabilities.highlight_languages),
      };
    } else {
      return null;
    }
  };
}

// NOTE: we also reverse this when writing code blocks: for the first line ```{python} becomes ```{{python}}
export function escapedRmdChunkBlockCapsuleFilter(): PandocBlockCapsuleFilter {
  const kEscapedRmdChunkBlockCapsuleType = '9CB79E6C-888D-4A0E-9C9B-FF67CD404E60'.toLowerCase();

  return {
    type: kEscapedRmdChunkBlockCapsuleType,

    // eslint-disable-next-line no-useless-escape
    match: /^([\t >]*)((```+)\s*\{{2,}[a-zA-Z0-9_-]+(?: *[ ,].*?)?\}{2,}[ \t]*\n(?:[\t >]*\3|[\W\w]*?\n[\t >]*\3))([ \t]*)$/gm,

    extract: (_match: string, p1: string, p2: string, _p3: string, p4: string) => {
      return {
        prefix: p1,
        source: p2,
        suffix: p4,
      };
    },

    // textually enclose the capsule so that pandoc parses it as the type of block we want it to
    // (in this case we don't do anything because pandoc would have written this table as a
    // semantically standalone block)
    enclose: (capsuleText: string) => {
      return capsuleText;
    },

    // look for one of our block capsules within pandoc ast text (e.g. a code or raw block)
    // and if we find it, parse and return the original source code
    handleText: blockCapsuleTextHandler(
      kEscapedRmdChunkBlockCapsuleType,
      encodedBlockCapsuleRegex(undefined, undefined, 'gm'),
    ),

    // we are looking for a paragraph token consisting entirely of a block capsule of our type
    //   OR a string token with a block capsule of our type. if find that then return the
    //   block capsule text.
    // Historical note: we were previously only using the paragraph handler, but it did not work if the
    //   code block did not have a blank line between it and the previous paragraph becuase
    //   Pandoc would parse the block capsule into the end of the that paragraph.
    handleToken:
      blockCapsuleHandlerOr(
        blockCapsuleParagraphTokenHandler(kEscapedRmdChunkBlockCapsuleType),
        blockCapsuleStrTokenHandler(kEscapedRmdChunkBlockCapsuleType)
      ),

    // write the node
    writeNode: (schema: Schema, writer: ProsemirrorWriter, capsule: PandocBlockCapsule) => {
      // remove the source prefix
      const source = blockCapsuleSourceWithoutPrefix(capsule.source, capsule.prefix);

      // remove escaping
      const sourceLines = lines(source);
      sourceLines[0] = sourceLines[0].replace(/^(```+)\{(\{+[^}]+\}+)\}([ \t]*)$/, "$1$2$3");

      const isWritingInsideParagraph = writer.isNodeOpen(schema.nodes.paragraph);
      // We can't write code blocks inside of paragraphs, so let's temporarily leave the paragraph
      // before reopening it after writing the code block
      if (isWritingInsideParagraph) writer.closeNode();
      writer.addNode(schema.nodes.code_block, {}, [schema.text(sourceLines.join("\n"))]);
      if (isWritingInsideParagraph) writer.openNode(schema.nodes.paragraph, {});
    },
  };
}


export default extension;
