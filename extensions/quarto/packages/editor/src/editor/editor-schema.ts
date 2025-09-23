/*
 * editor-schema.ts
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

import { Schema, NodeSpec, MarkSpec, Node as ProsemirrorNode } from 'prosemirror-model';

import { ExtensionManager } from './editor-extensions';
import { PandocNode } from '../api/node';
import { PandocMark } from '../api/mark';
import { kPmScrollContainer } from '../api/scroll';
import { EditorOptions } from '../api/options';

export function editorSchema(options: EditorOptions, extensions: ExtensionManager, bodyScrollContainer: boolean): Schema {
  // build in doc node + nodes from extensions
  const nodes: { [name: string]: NodeSpec } = {
    doc: {
      attrs: {
        initial: { default: false },
      },
      content: 'body notes' + (options.commenting ? ' annotations' : ''),
    },

    body: {
      content: 'block+',
      isolating: true,
      parseDOM: [{ tag: 'div[class*="body"]' }],
      toDOM() {
        return [
          'div',
          { class: 'body pm-cursor-color pm-text-color pm-background-color pm-editing-root-node'
                   + (bodyScrollContainer ? ` ${kPmScrollContainer}` : '') },
          ['div', { class: 'pm-content' }, 0],
        ];
      },
    },

    notes: {
      content: 'note*',
      parseDOM: [{ tag: 'div[class*="notes"]' }],
      toDOM() {
        return [
          'div',
          { class: `notes pm-cursor-color pm-text-color pm-background-color pm-editing-root-node ${kPmScrollContainer}` },
          ['div', { class: 'pm-content' }, 0],
        ];
      },
    },

    note: {
      content: 'block+',
      attrs: {
        ref: {},
        number: { default: 1 },
      },
      isolating: true,
      parseDOM: [
        {
          tag: 'div[class*="note"]',
          getAttrs(dom: Node | string) {
            const el = dom as Element;
            return {
              ref: el.getAttribute('data-ref'),
            };
          },
        },
      ],
      toDOM(node: ProsemirrorNode) {
        return [
          'div',
          { 'data-ref': node.attrs.ref, class: 'note pm-footnote-body', 'data-number': node.attrs.number },
          0,
        ];
      },
    },

    ...(options.commenting ? {
      annotations: {
        content: '',
        editable: false,
        selectable: false,
        attrs: {},
        // No parseDOM/toDOM because we're using a NodeView
      },
    } : {}),

  };
  extensions.pandocNodes().forEach((node: PandocNode) => {
    nodes[node.name] = node.spec;
  });

  // marks from extensions
  const marks: { [name: string]: MarkSpec } = {};
  extensions.pandocMarks().forEach((mark: PandocMark) => {
    marks[mark.name] = mark.spec;
  });

  // allow code to exclude marks that don't support input rules
  // (e.g. marks that denote a special escape sequences from markdown,
  // like raw_tex, raw_html, shortcodes, xrefs, math, etc.)
  if (marks.code) {
    const excludeInCode = extensions
      .pandocMarks()
      .filter(mark => mark.noInputRules && mark.name !== 'code')
      .map(mark => mark.name)
      .join(' ');
    marks.code.excludes = excludeInCode;
  }

  // return schema
  return new Schema({
    nodes,
    marks,
  });
}
