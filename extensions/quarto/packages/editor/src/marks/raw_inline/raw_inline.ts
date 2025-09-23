/*
 * raw_inline.ts
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

import { Mark, Fragment, MarkType } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { Extension, ExtensionContext } from '../../api/extension';
import { ProsemirrorCommand, EditorCommandId, toggleMarkType } from '../../api/command';
import { PandocOutput, PandocToken, PandocTokenType } from '../../api/pandoc';
import { getMarkRange, markIsActive, getMarkAttrs, domAttrNoSpelling } from '../../api/mark';
import { EditorUI } from '../../api/ui-types';
import { RawFormatProps } from 'editor-types';
import { canInsertNode } from '../../api/node';
import { fragmentText } from '../../api/fragment';
import { OmniInsertGroup } from '../../api/omni_insert';

export const kRawInlineFormat = 0;
export const kRawInlineContent = 1;

const extension = (context: ExtensionContext): Extension | null => {
  const { pandocExtensions, pandocCapabilities, ui } = context;

  // always enabled so that extensions can make use of preprocessors + raw_attribute
  // to hoist content out of pandoc for further processing by our token handlers.
  // that means that users can always use the raw attribute in their markdown even
  // if the editing format doesn't support it (in which case it will just get echoed
  // back to the markdown just the way it was written).

  // return the extension
  return {
    marks: [
      {
        name: 'raw_inline',
        noInputRules: true,
        noSpelling: true,
        spec: {
          inclusive: false,
          excludes: 'formatting',
          attrs: {
            format: {},
          },
          parseDOM: [
            {
              tag: "span[class*='raw-inline']",
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                return {
                  format: el.getAttribute('data-format'),
                };
              },
            },
          ],
          toDOM(mark: Mark) {
            const attr = {
              class: 'raw-inline pm-fixedwidth-font pm-markup-text-color',
              'data-format': mark.attrs.format,
            };
            return ['span', domAttrNoSpelling(attr)];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.RawInline,
              mark: 'raw_inline',
              getAttrs: (tok: PandocToken) => {
                return {
                  format: tok.c[kRawInlineFormat],
                };
              },
              getText: (tok: PandocToken) => {
                return tok.c[kRawInlineContent];
              },
            },
          ],
          writer: {
            priority: 1,
            write: (output: PandocOutput, mark: Mark, parent: Fragment) => {
              // get raw content
              const raw = fragmentText(parent);

              // write it
              output.writeToken(PandocTokenType.RawInline, () => {
                output.write(mark.attrs.format);
                output.write(raw);
              });
            },
          },
        },
      },
    ],

    // insert command
    commands: () => {
      if (pandocExtensions.raw_attribute) {
        return [new RawInlineCommand(EditorCommandId.RawInline, '', ui, pandocCapabilities.output_formats)];
      } else {
        return [];
      }
    },
  };
};

// base class for inline commands that auto-insert content
export class RawInlineInsertCommand extends ProsemirrorCommand {
  private markType: MarkType;
  constructor(id: EditorCommandId, keymap: readonly string[], markType: MarkType, insert: (tr: Transaction) => void) {
    super(id, keymap, (state: EditorState, dispatch?: (tr: Transaction) => void) => {
      // if we aren't active then make sure we can insert a text node here
      if (!this.isActive(state) && !canInsertNode(state, markType.schema.nodes.text)) {
        return false;
      }

      // ensure we can apply this mark here
      if (!toggleMarkType(this.markType)(state)) {
        return false;
      }

      if (dispatch) {
        const tr = state.tr;

        if (this.isActive(state)) {
          const range = getMarkRange(state.selection.$head, this.markType);
          if (range) {
            tr.removeMark(range.from, range.to, this.markType);
          }
        } else if (!tr.selection.empty) {
          const mark = markType.create();
          tr.addMark(tr.selection.from, tr.selection.to, mark);
        } else {
          insert(tr);
        }

        dispatch(tr);
      }

      return true;
    });
    this.markType = markType;
  }

  public isActive(state: EditorState) {
    return markIsActive(state, this.markType);
  }
}

// generic raw inline command (opens dialog that allows picking from among formats)
export class RawInlineCommand extends ProsemirrorCommand {
  constructor(id: EditorCommandId, defaultFormat: string, ui: EditorUI, outputFormats: string[]) {
    super(
      id,
      [],
      (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
        const schema = state.schema;

        if (!canInsertNode(state, schema.nodes.text) || !toggleMarkType(schema.marks.raw_inline)(state)) {
          return false;
        }

        async function asyncInlineRaw() {
          if (dispatch) {
            // check if mark is active
            const isActive = markIsActive(state, schema.marks.raw_inline);

            // get the range of the mark
            let range = { from: state.selection.from, to: state.selection.to };
            if (isActive) {
              range = getMarkRange(state.selection.$from, schema.marks.raw_inline) as { from: number; to: number };
            }

            // get raw attributes if we have them
            let raw: RawFormatProps = { content: '', format: defaultFormat };
            raw.content = state.doc.textBetween(range.from, range.to);
            if (isActive) {
              raw = {
                ...raw,
                ...getMarkAttrs(state.doc, state.selection, schema.marks.raw_inline),
              };
            }

            const result = await ui.dialogs.editRawInline(raw, outputFormats);
            if (result) {
              const tr = state.tr;
              tr.removeMark(range.from, range.to, schema.marks.raw_inline);
              if (result.action === 'edit') {
                const mark = schema.marks.raw_inline.create({ format: result.raw.format });
                const node = schema.text(result.raw.content, [mark]);
                // if we are editing a selection then replace it, otherwise insert
                if (raw.content) {
                  tr.replaceRangeWith(range.from, range.to, node);
                } else {
                  tr.replaceSelectionWith(node, false);
                }
              }
              dispatch(tr);
            }

            if (view) {
              view.focus();
            }
          }
        }
        asyncInlineRaw();

        return true;
      },
      {
        name: ui.context.translateText('Raw Inline...'),
        description: ui.context.translateText('Raw inline content'),
        group: OmniInsertGroup.Content,
        priority: 0,
        noFocus: true,
        image: () =>
          ui.prefs.darkMode() ? ui.images.omni_insert.raw_inline_dark : ui.images.omni_insert.raw_inline,
      },
    );
  }
}

export default extension;
