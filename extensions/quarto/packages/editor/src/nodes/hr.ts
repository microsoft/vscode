/*
 * hr.ts
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

import { Schema, DOMOutputSpec } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import { findParentNodeOfType } from 'prosemirror-utils';
import { EditorState } from 'prosemirror-state';

import { ProsemirrorCommand, insertNode, EditorCommandId } from '../api/command';
import { ExtensionContext } from '../api/extension';
import { PandocOutput, PandocTokenType } from '../api/pandoc';
import { EditorUI } from '../api/ui-types';
import { OmniInsertGroup } from '../api/omni_insert';

import './hr-styles.css';

const extension = (context: ExtensionContext) => {
  const { ui } = context;

  return {
    nodes: [
      {
        name: 'horizontal_rule',
        spec: {
          group: 'block',
          parseDOM: [{ tag: 'hr' }],
          toDOM(): DOMOutputSpec {
            return ['div', ['hr', { class: 'pm-hr-background-color' }]];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.HorizontalRule,
              node: 'horizontal_rule',
            },
          ],
          writer: (output: PandocOutput) => {
            output.writeToken(PandocTokenType.HorizontalRule);
          },
        },
      },
    ],

    commands: (schema: Schema) => {
      return [
        new ProsemirrorCommand(
          EditorCommandId.HorizontalRule,
          [],
          insertNode(schema.nodes.horizontal_rule, {}, true),
          hrOmniInsert(ui),
        ),
      ];
    },

    inputRules: () => {
      return [
        new InputRule(/^\*{3}$/, (state: EditorState, _match: RegExpMatchArray, start: number, end: number) => {
          const schema = state.schema;
          const paraNode = findParentNodeOfType(schema.nodes.paragraph)(state.selection);
          if (paraNode && state.selection.$anchor.depth === 2) {
            // only in top-level paragraphs
            return state.tr.replaceRangeWith(start, end, schema.nodes.horizontal_rule.create());
          } else {
            return null;
          }
        }),
      ];
    },
  };
};

function hrOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Horizontal Line'),
    keywords: ["hr", "rule"],
    description: ui.context.translateText('Line that spans across the page'),
    group: OmniInsertGroup.Content,
    priority: 1,
    image: () =>
      ui.prefs.darkMode() ? ui.images.omni_insert.horizontal_rule_dark : ui.images.omni_insert.horizontal_rule,
  };
}

export default extension;
