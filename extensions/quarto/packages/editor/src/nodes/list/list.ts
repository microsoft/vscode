/*
 * list.ts
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
import { splitListItem } from 'prosemirror-schema-list';
import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { findParentNodeOfType } from 'prosemirror-utils';

import { Extension, ExtensionContext } from '../../api/extension';
import { BaseKey } from '../../api/basekeys';
import { EditorUI, kListSpacingTight } from '../../api/ui-types';
import { ListCapabilities, ListNumberDelim, ListNumberStyle } from '../../api/list-types';
import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { PandocTokenType } from '../../api/pandoc';
import { OmniInsertGroup } from '../../api/omni_insert';
import { conditionalWrappingInputRule } from '../../api/input_rule';
import { kPresentationDocType } from '../../api/format';

import { ListCommand, TightListCommand, EditListPropertiesCommand, editListPropertiesCommandFn } from './list-commands';

import {
  CheckedListItemNodeView,
  checkedListItemInputRule,
  checkedListInputRule,
  CheckedListItemCommand,
  CheckedListItemToggleCommand,
} from './list-checked';

import { liftListItem, sinkListItem } from './list-indent';

import { writePandocBulletList, writePandocOrderedList, readPandocList } from './list-pandoc';

import './list-styles.css';


const plugin = new PluginKey('list');

const extension = (context: ExtensionContext): Extension => {
  const { pandocExtensions, ui, format } = context;

  // determine list capabilities based on active format options
  const capabilities: ListCapabilities = {
    tasks: pandocExtensions.task_lists,
    fancy: pandocExtensions.fancy_lists,
    /*
     Always disable example lists b/c they don't round trip through the AST:
      - (@good) referenced elsewhere via (@good) just becomes a generic example (@) with 
        a literal numeric reference.
      - The writer doesn't preserve the (@) or the (@good) when writing
    */
    // example: pandocExtensions.fancy_lists && pandocExtensions.example_lists,
    example: false,
    order: pandocExtensions.startnum,
    incremental: format.docTypes.includes(kPresentationDocType)
  };

  return {
    nodes: [
      {
        name: 'list_item',
        spec: {
          content: 'list_item_block block*',
          attrs: {
            checked: { default: null },
          },
          defining: true,
          parseDOM: [
            {
              tag: 'li',
              getAttrs: (dom: Node | string) => {
                const el = dom as Element;
                const attrs: Record<string,unknown> = {};
                if (capabilities.tasks && el.hasAttribute('data-checked')) {
                  attrs.checked = el.getAttribute('data-checked') === 'true';
                }
                return attrs;
              },
            },
          ],
          toDOM(node) {
            const attrs: Record<string,unknown> = {
              class: 'pm-list-item',
            };
            if (capabilities.tasks && node.attrs.checked !== null) {
              attrs['data-checked'] = node.attrs.checked ? 'true' : 'false';
            }
            return ['li', attrs, 0];
          },
        },
        pandoc: {},
      },
      {
        name: 'bullet_list',
        spec: {
          content: 'list_item+',
          group: 'block',
          attrs: {
            tight: { default: false },
          },
          parseDOM: [
            {
              tag: 'ul',
              getAttrs: (dom: Node | string) => {
                const el = dom as Element;
                const attrs: Record<string,unknown> = {};
                if (el.hasAttribute('data-tight')) {
                  attrs.tight = true;
                }
                return attrs;
              },
            },
          ],
          toDOM(node) {
            const attrs: { [key: string]: string } = {};
            attrs.class = 'pm-list pm-bullet-list';
            if (node.attrs.tight) {
              attrs['data-tight'] = 'true';
            }
            return ['ul', attrs, 0];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.BulletList,
              handler: (schema: Schema) => readPandocList(schema.nodes.bullet_list, capabilities),
            },
          ],
          writer: writePandocBulletList(capabilities),
        },

        attr_edit: listAttrEdit('bullet_list', capabilities, ui),
      },
      {
        name: 'ordered_list',
        spec: {
          content: 'list_item+',
          group: 'block',
          attrs: {
            tight: { default: false },
            order: { default: 1 },
            number_style: { default: ListNumberStyle.DefaultStyle },
            number_delim: { default: ListNumberDelim.DefaultDelim },
          },
          parseDOM: [
            {
              tag: 'ol',
              getAttrs(dom: Node | string) {
                const el = dom as Element;

                const attrs: Record<string,unknown> = {};
                attrs.tight = el.hasAttribute('data-tight');

                if (capabilities.order) {
                  const order: string | null = el.getAttribute('start');
                  if (!order) {
                    attrs.order = 1;
                  } else {
                    attrs.order = parseInt(order, 10) || 1;
                  }
                }

                if (capabilities.fancy) {
                  if (capabilities.example && el.getAttribute('data-example')) {
                    attrs.number_style = ListNumberStyle.Example;
                  } else {
                    attrs.number_style = typeToNumberStyle(el.getAttribute('type'));
                  }
                  const numberDelim = el.getAttribute('data-number-delim');
                  if (numberDelim) {
                    attrs.number_delim = numberDelim;
                  }
                }

                return attrs;
              },
            },
          ],
          toDOM(node) {
            const attrs: { [key: string]: string } = {};
            attrs.class = 'pm-list pm-ordered-list';
            if (node.attrs.tight) {
              attrs['data-tight'] = 'true';
            }
            if (capabilities.order && node.attrs.order !== 1) {
              attrs.start = node.attrs.order;
            }
            if (capabilities.fancy) {
              const type = numberStyleToType(node.attrs.number_style);
              if (type) {
                attrs.type = type;
              }
              if (capabilities.example) {
                if (node.attrs.number_style === ListNumberStyle.Example) {
                  attrs['data-example'] = '1';
                }
              }
              attrs['data-number-delim'] = node.attrs.number_delim;
            }
            return ['ol', attrs, 0];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.OrderedList,
              handler: (schema: Schema) => readPandocList(schema.nodes.ordered_list, capabilities),
            },
          ],
          writer: writePandocOrderedList(capabilities),
        },

        attr_edit: listAttrEdit('ordered_list', capabilities, ui),
      },
    ],

    plugins: () => {
      const plugins: Plugin[] = [];
      if (capabilities.tasks) {
        plugins.push(
          new Plugin({
            key: plugin,
            props: {
              nodeViews: {
                list_item(node: ProsemirrorNode, view: EditorView, getPos: boolean | (() => number)) {
                  return new CheckedListItemNodeView(node, view, getPos as () => number);
                },
              },
            },
          }),
        );
      }
      return plugins;
    },

    commands: (schema: Schema) => {
      const commands = [
        new ListCommand(
          EditorCommandId.BulletList,
          [],
          schema.nodes.bullet_list,
          schema.nodes.list_item,
          bulletListOmniInsert(ui),
          ui.prefs,
        ),
        new ListCommand(
          EditorCommandId.OrderedList,
          [],
          schema.nodes.ordered_list,
          schema.nodes.list_item,
          orderedListOmniInsert(ui),
          ui.prefs,
        ),
        new ProsemirrorCommand(EditorCommandId.ListItemSink, ['Tab'], sinkListItem(schema.nodes.list_item)),
        new ProsemirrorCommand(EditorCommandId.ListItemLift, ['Shift-Tab'], liftListItem(schema.nodes.list_item)),
        new ProsemirrorCommand(EditorCommandId.ListItemSplit, ['Enter'], splitListItem(schema.nodes.list_item)),
        new TightListCommand(),
      ];
      if (capabilities.fancy) {
        commands.push(new EditListPropertiesCommand(ui, capabilities));
      }
      if (capabilities.tasks) {
        commands.push(
          new CheckedListItemCommand(schema.nodes.list_item),
          new CheckedListItemToggleCommand(schema.nodes.list_item),
        );
      }
      return commands;
    },

    baseKeys: (schema: Schema) => {
      return [
        { key: BaseKey.Enter, command: splitListItem(schema.nodes.list_item) },
        { key: BaseKey.Tab, command: sinkListItem(schema.nodes.list_item) },
        { key: BaseKey.ShiftTab, command: liftListItem(schema.nodes.list_item) },
      ];
    },

    inputRules: (schema: Schema) => {
      // reflect tight pref
      const tightFn = () => {
        return {
          tight: ui.prefs.listSpacing() === kListSpacingTight,
        };
      };

      const isNotInHeading = (state: EditorState) => {
        return !findParentNodeOfType(schema.nodes.heading)(state.selection);
      };

      const rules = [
        conditionalWrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list, isNotInHeading, tightFn),
        conditionalWrappingInputRule(
          /^(\d+)\.\s$/,
          schema.nodes.ordered_list,
          isNotInHeading,
          match => ({ order: +match[1], tight: tightFn() }),
          (match, node) => node.childCount + node.attrs.order === +match[1],
        ),
      ];
      if (capabilities.tasks) {
        rules.push(checkedListItemInputRule(), checkedListInputRule(schema));
      }
      return rules;
    },
  };
};

function listAttrEdit(type: string, capabilities: ListCapabilities, ui: EditorUI) {
  return () => {
    return {
      type: (schema: Schema) => schema.nodes[type],
      editFn: () => editListPropertiesCommandFn(ui, capabilities),
      offset: {
        top: 5,
        right: 5,
      },
      preferHidden: true
    };
  };
}

function numberStyleToType(style: ListNumberStyle): string | null {
  switch (style) {
    case ListNumberStyle.DefaultStyle:
    case ListNumberStyle.Decimal:
    case ListNumberStyle.Example:
      return 'l';
    case ListNumberStyle.LowerAlpha:
      return 'a';
    case ListNumberStyle.UpperAlpha:
      return 'A';
    case ListNumberStyle.LowerRoman:
      return 'i';
    case ListNumberStyle.UpperRoman:
      return 'I';
    default:
      return null;
  }
}

function typeToNumberStyle(type: string | null): ListNumberStyle {
  switch (type) {
    case 'l':
      return ListNumberStyle.Decimal;
    case 'a':
      return ListNumberStyle.LowerAlpha;
    case 'A':
      return ListNumberStyle.UpperAlpha;
    case 'i':
      return ListNumberStyle.LowerRoman;
    case 'I':
      return ListNumberStyle.UpperRoman;
    default:
      return ListNumberStyle.Decimal;
  }
}




function bulletListOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Bullet List'),
    description: ui.context.translateText('List using bullets for items'),
    group: OmniInsertGroup.Common,
    priority: 4,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.bullet_list_dark : ui.images.omni_insert.bullet_list),
  };
}

function orderedListOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Numbered List'),
    description: ui.context.translateText('List using numbers for items'),
    group: OmniInsertGroup.Common,
    priority: 3,
    image: () =>
      ui.prefs.darkMode() ? ui.images.omni_insert.ordered_list_dark : ui.images.omni_insert.ordered_list,
  };
}

export default extension;
