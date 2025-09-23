/*
 * heading.ts
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

import { textblockTypeInputRule, InputRule } from 'prosemirror-inputrules';
import { Node as ProsemirrorNode, Schema, NodeType, Fragment } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { findParentNode, findParentNodeOfType } from 'prosemirror-utils';

import { PandocOutput, PandocToken, PandocTokenType } from '../api/pandoc';
import { EditorCommandId, toggleBlockType, ProsemirrorCommand } from '../api/command';
import { Extension, ExtensionContext } from '../api/extension';
import {
  pandocAttrSpec,
  pandocAttrParseDom,
  pandocAttrToDomAttr,
  pandocAttrReadAST,
  pandocAttrParseText,
} from '../api/pandoc_attr';
import { uuidv4 } from '../api/util';
import { EditorUI } from '../api/ui-types';
import { OmniInsert, OmniInsertGroup } from '../api/omni_insert';
import { emptyNodePlaceholderPlugin } from '../api/placeholder';
import { kHeadingLevel, kHeadingAttr, kHeadingChildren } from '../api/heading';

const kHeadingLevels = [1, 2, 3, 4, 5, 6];

const extension = (context: ExtensionContext): Extension => {
  const { pandocExtensions, format, ui } = context;

  const headingAttr = pandocExtensions.header_attributes || pandocExtensions.mmd_header_identifiers;

  return {
    nodes: [
      {
        name: 'heading',
        spec: {
          attrs: {
            level: { default: 1 },
            link: { default: null },
            navigation_id: { default: null },
            ...(headingAttr ? pandocAttrSpec : {}),
          },
          content: 'inline*',
          group: 'block',
          defining: true,
          parseDOM: [
            { tag: 'h1', getAttrs: headingAttrs(1, headingAttr) },
            { tag: 'h2', getAttrs: headingAttrs(2, headingAttr) },
            { tag: 'h3', getAttrs: headingAttrs(3, headingAttr) },
            { tag: 'h4', getAttrs: headingAttrs(4, headingAttr) },
            { tag: 'h5', getAttrs: headingAttrs(5, headingAttr) },
            { tag: 'h6', getAttrs: headingAttrs(6, headingAttr) },
          ],
          toDOM(node) {
            const attr = headingAttr ? pandocAttrToDomAttr(node.attrs) : {};
            attr.class = (attr.class as string || '').concat(' pm-heading');
            return [
              'h' + node.attrs.level,
              {
                'data-link': node.attrs.link,
                ...attr,
              },

              0,
            ];
          },
        },

        attr_edit: () => {
          if (headingAttr) {
            return {
              type: (schema: Schema) => schema.nodes.heading,
              offset: {
                top: 2,
                right: 6,
              },
              preferHidden: true
            };
          } else {
            return null;
          }
        },

        pandoc: {
          readers: [
            {
              token: PandocTokenType.Header,
              block: 'heading',
              getAttrs: (tok: PandocToken) => ({
                level: tok.c[kHeadingLevel],
                navigation_id: uuidv4(),
                ...(headingAttr ? pandocAttrReadAST(tok, kHeadingAttr) : {}),
              }),
              getChildren: (tok: PandocToken) => tok.c[kHeadingChildren],
            },
          ],
          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            output.writeToken(PandocTokenType.Header, () => {
              output.write(node.attrs.level);
              if (headingAttr) {
                output.writeAttr(node.attrs.id, node.attrs.classes, node.attrs.keyvalue);
              } else {
                output.writeAttr();
              }
              output.writeArray(() => {
                if (node.attrs.level === 1 && format.rmdExtensions.bookdownPart) {
                  writeBookdownH1(output, node);
                } else {
                  output.writeInlines(node.content);
                }
              });
            });
          },
        },
      },
    ],

    commands: (schema: Schema) => {
      return [
        new HeadingCommand(schema, EditorCommandId.Heading1, 1, heading1OmniInsert(ui)),
        new HeadingCommand(schema, EditorCommandId.Heading2, 2, heading2OmniInsert(ui)),
        new HeadingCommand(schema, EditorCommandId.Heading3, 3, heading3OmniInsert(ui)),
        new HeadingCommand(schema, EditorCommandId.Heading4, 4, heading4OmniInsert(ui)),
        new HeadingCommand(schema, EditorCommandId.Heading5, 5),
        new HeadingCommand(schema, EditorCommandId.Heading6, 6),
      ];
    },

    inputRules: (schema: Schema) => {
      const rules = [
        textblockTypeInputRule(
          new RegExp('^(#{1,' + kHeadingLevels.length + '})\\s$'),
          schema.nodes.heading,
          match => ({
            level: match[1].length,
            navigation_id: uuidv4(),
          }),
        ),
      ];

      if (headingAttr) {
        rules.push(headingAttributeInputRule(schema));
      }

      return rules;
    },

    plugins: (schema: Schema) => {
      return [emptyHeadingPlaceholderPlugin(schema.nodes.heading, ui)];
    },
  };
};

function headingAttributeInputRule(schema: Schema) {
  return new InputRule(/ {([^}]+)}$/, (state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
    // only fire in headings
    const heading = findParentNodeOfType(schema.nodes.heading)(state.selection);
    if (heading) {
      // try to parse the attributes
      const attrs = pandocAttrParseText(match[1]);
      if (attrs) {
        const tr = state.tr;
        tr.setNodeMarkup(heading.pos, undefined, {
          ...heading.node.attrs,
          ...attrs,
        });
        tr.deleteRange(start + 1, end);
        return tr;
      } else {
        return null;
      }
    } else {
      return null;
    }
  });
}

class HeadingCommand extends ProsemirrorCommand {
  public readonly nodeType: NodeType;
  public readonly level: number;

  constructor(schema: Schema, id: EditorCommandId, level: number, omniInsert?: OmniInsert) {
    super(id, ['Mod-Alt-' + level], headingCommandFn(schema, level), omniInsert);
    this.nodeType = schema.nodes.heading;
    this.level = level;
  }

  public isActive(state: EditorState) {
    const predicate = (n: ProsemirrorNode) => n.type === this.nodeType && n.attrs.level === this.level;
    const node = findParentNode(predicate)(state.selection);
    return !!node;
  }
}

function heading1OmniInsert(ui: EditorUI) {
  return headingOmniInsert(ui, 1, ui.context.translateText('Part heading'), [
    ui.images.omni_insert.heading1,
    ui.images.omni_insert.heading1_dark,
  ]);
}

function heading2OmniInsert(ui: EditorUI) {
  return headingOmniInsert(ui, 2, ui.context.translateText('Section heading'), [
    ui.images.omni_insert.heading2,
    ui.images.omni_insert.heading2_dark,
  ]);
}
function heading3OmniInsert(ui: EditorUI) {
  return headingOmniInsert(ui, 3, ui.context.translateText('Sub-section heading'), [
    ui.images.omni_insert.heading3,
    ui.images.omni_insert.heading3_dark,
  ]);
}

function heading4OmniInsert(ui: EditorUI) {
  return headingOmniInsert(ui, 4, ui.context.translateText('Small heading'), [
    ui.images.omni_insert.heading4,
    ui.images.omni_insert.heading4_dark,
  ]);
}

function headingOmniInsert(ui: EditorUI, level: number, description: string, images: [string, string], group = OmniInsertGroup.Headings): OmniInsert {
  return {
    name: headingName(ui, level),
    keywords: ["h" + level],
    description,
    group,
    image: () => (ui.prefs.darkMode() ? images[1] : images[0]),
  };
}

function headingName(ui: EditorUI, level: number) {
  const kHeadingPrefix = ui.context.translateText('Heading');
  return `${kHeadingPrefix} ${level}`;
}

function headingCommandFn(schema: Schema, level: number) {
  return toggleBlockType(schema.nodes.heading, schema.nodes.paragraph, { level });
}

// function for getting attrs
function headingAttrs(level: number, pandocAttrSupported: boolean) {
  return (dom: Node | string) => {
    const el = dom as Element;
    return {
      level,
      'data-link': el.getAttribute('data-link'),
      ...(pandocAttrSupported ? pandocAttrParseDom(el, {}) : {}),
    };
  };
}

function emptyHeadingPlaceholderPlugin(nodeType: NodeType, ui: EditorUI) {
  return emptyNodePlaceholderPlugin(nodeType, node => headingName(ui, node.attrs.level));
}

// write a bookdown (PART) H1 w/o spurious \
function writeBookdownH1(output: PandocOutput, node: ProsemirrorNode) {
  // see if this is a (PART\*). note we also match and replay any text
  // before the first ( in case the cursor sentinel ended up there
  const partMatch = node.textContent.match(/^([^()]*)\(PART\\\*\)/);
  if (partMatch) {
    const schema = node.type.schema;
    output.writeInlines(Fragment.from(schema.text(partMatch[1] + '(PART*)')));
    output.writeInlines(node.content.cut(partMatch[0].length));
  } else {
    output.writeInlines(node.content);
  }
}

export default extension;
