/*
 * xref.ts
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

import { Schema, Node as ProsemirrorNode, Mark, Fragment } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { InputRule } from 'prosemirror-inputrules';
import { Transform } from 'prosemirror-transform';

import { setTextSelection, findChildren, findChildrenByMark } from 'prosemirror-utils';

import { Extension, ExtensionContext } from '../../api/extension';
import { detectAndApplyMarks, removeInvalidatedMarks, getMarkRange, domAttrNoSpelling } from '../../api/mark';
import { MarkTransaction, trTransform } from '../../api/transaction';
import { FixupContext } from '../../api/fixup';
import { ProsemirrorCommand, EditorCommandId, toggleMarkType } from '../../api/command';
import { canInsertNode } from '../../api/node';
import { fragmentText } from '../../api/fragment';
import { PandocOutput } from '../../api/pandoc';
import { OmniInsertGroup } from '../../api/omni_insert';
import { xrefCompletionHandler } from './xref-completion';
import { xrefPopupPlugin } from './xref-popup';
import { kQuartoDocType } from '../../api/format';
import { insertXref } from '../../behaviors/insert_xref/insert_xref';
import { EditorView } from 'prosemirror-view';

const kRefRegExDetectAndApply = /(?:^|[^`])(\\?@ref\([ A-Za-z0-9:-]*\))/g;

const extension = (context: ExtensionContext): Extension | null => {
  const { pandocExtensions, format, ui, server } = context;

  if (!format.rmdExtensions.bookdownXRef) {
    return null;
  }

  return {
    marks: [
      {
        name: 'xref',
        noInputRules: true,
        noSpelling: true,
        spec: {
          inclusive: false,
          excludes: 'formatting',
          attrs: {},
          parseDOM: [
            {
              tag: "span[class*='xref']",
            },
          ],
          toDOM() {
            return ['span', domAttrNoSpelling({ class: 'xref pm-link-text-color pm-fixedwidth-font' })];
          },
        },
        pandoc: {
          readers: [],
          writer: {
            priority: 1,
            write: (output: PandocOutput, _mark: Mark, parent: Fragment) => {
              // alias xref (may need to transform it to deal with \ prefix)
              let xref = parent;

              // if it starts with a \ then don't write the slash (pandoc will
              // either create one automatically or we'll write one explicitly
              // if pandoc won't b/c it doesn't have all_symbols_escapable)
              if (fragmentText(xref).startsWith('\\')) {
                xref = xref.cut(1, xref.size);
              }

              // if all symbols aren't escapable then we need an explicit \
              // (because pandoc won't automatically escape the \)
              if (!pandocExtensions.all_symbols_escapable) {
                output.writeRawMarkdown('\\');
              }

              // write xref
              output.writeInlines(xref);
            },
          },
        },
      },
    ],

    fixups: (schema: Schema) => {
      return [
        (tr: Transaction, fixupContext: FixupContext) => {
          if (fixupContext === FixupContext.Load) {
            // apply marks
            const markType = schema.marks.xref;
            const predicate = (node: ProsemirrorNode) => {
              return node.isTextblock && node.type.allowsMarkType(markType);
            };
            const markTr = new MarkTransaction(tr);
            findChildren(tr.doc, predicate).forEach(nodeWithPos => {
              const { pos } = nodeWithPos;
              detectAndApplyMarks(
                markTr,
                tr.doc.nodeAt(pos)!,
                pos,
                kRefRegExDetectAndApply,
                markType,
                () => ({}),
                () => true,
                match => match[1],
              );
            });

            // remove leading \ as necessary (this would occur if the underlying format includes
            // a \@ref and doesn't have all_symbols_escapable, e.g. blackfriday)
            trTransform(tr, stripRefBackslashTransform);
          }
          return tr;
        },
      ];
    },

    appendMarkTransaction: () => {
      return [
        {
          name: 'xref-marks',
          filter: (node: ProsemirrorNode) => node.isTextblock && node.type.allowsMarkType(node.type.schema.marks.xref),
          append: (tr: MarkTransaction, node: ProsemirrorNode, pos: number) => {
            removeInvalidatedMarks(tr, node, pos, kRefRegExDetectAndApply, node.type.schema.marks.xref);
            detectAndApplyMarks(
              tr,
              tr.doc.nodeAt(pos)!,
              pos,
              kRefRegExDetectAndApply,
              node.type.schema.marks.xref,
              () => ({}),
              () => true,
              match => match[1],
            );
          },
        },
      ];
    },

    inputRules: () => {
      return [atRefInputRule(), ...(format.rmdExtensions.bookdownXRefUI ? [refPrefixInputRule()] : [])];
    },

    plugins: (schema: Schema) => [xrefPopupPlugin(schema, ui, server)],

    completionHandlers: () => format.rmdExtensions.bookdownXRefUI 
      ? [xrefCompletionHandler(ui, server.xref)]
      : [],

    commands: (schema: Schema) => {
      if (format.rmdExtensions.bookdownXRefUI) {
        return [
          new ProsemirrorCommand(
            EditorCommandId.CrossReference,
            [],
            (state: EditorState, dispatch?: (tr: Transaction) => void) => {
              // enable/disable command
              if (!canInsertNode(state, schema.nodes.text) || !toggleMarkType(schema.marks.xref)(state)) {
                return false;
              }
              if (dispatch) {
                const tr = state.tr;
                insertRef(tr);
                dispatch(tr);
              }
              return true;
            },
            {
              name: ui.context.translateText('Cross Reference'),
              description: ui.context.translateText('Reference to related content'),
              group: OmniInsertGroup.References,
              priority: 0,
              image: () =>
                ui.prefs.darkMode()
                  ? ui.images.omni_insert!.cross_reference_dark!
                  : ui.images.omni_insert!.cross_reference!,
            },
          ),
        ];
      } else if (format.docTypes.includes(kQuartoDocType) && pandocExtensions.citations) {
        return [
          new ProsemirrorCommand(
            EditorCommandId.CrossReference,
            ['Shift-Mod-F10'],
            (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
              // enable/disable command
              if (!canInsertNode(state, schema.nodes.text) || !toggleMarkType(schema.marks.cite_id)(state)) {
                return false;
              }

              // Show the insert Xref dialog
              if (dispatch) {
                insertXref(ui, state.doc, server, (key: string, prefix?: string) => {
                  // An xref was selected, insert it
                  const tr = state.tr;
                  const xref = schema.text(key, [schema.marks.cite_id.create()]);

                  // If there is a custom prefix, create a full cite
                  if (prefix !== undefined || key.startsWith('-')) {
                    const start = tr.selection.from;
                    const wrapperText = schema.text('[]');
                    tr.replaceSelectionWith(wrapperText);

                    // move the selection into the wrapper
                    setTextSelection(tr.selection.from - 1)(tr);

                    // Insert the prefix
                    if (prefix !== undefined) {
                      tr.insertText(`${prefix} `, tr.selection.from);
                    }

                    // Insert the xref
                    tr.insert(tr.selection.from, xref);

                    // Add the cite mark
                    const citeMark = schema.marks.cite.create();
                    tr.addMark(start, tr.selection.from + 1, citeMark);

                    setTextSelection(tr.selection.from + 1)(tr);
                    dispatch(tr);

                  } else {
                    // otherwise, create simple cite_id
                    tr.replaceSelectionWith(xref, false);
                    setTextSelection(tr.selection.from)(tr);
                    dispatch(tr);
                  }
                }).then(() =>{
                  view?.focus();
                });
              }
              return true;
            },
            {
              name: ui.context.translateText('Cross Reference'),
              description: ui.context.translateText('Reference to related content'),
              group: OmniInsertGroup.References,
              priority: 0,
              noFocus: true,
              image: () =>
                ui.prefs.darkMode()
                  ? ui.images.omni_insert!.cross_reference_dark!
                  : ui.images.omni_insert!.cross_reference!,
            },
          ),
        ];


      } else {
        return [];
      }
    },
  };
};

function atRefInputRule() {
  return new InputRule(/(^|[^`])(\\?@ref\()$/, (state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
    // if this completes an xref at this position then stand down
    const kRefLen = 4;
    const { parent, parentOffset } = state.selection.$head;
    const before = parent.textContent.slice(parentOffset - kRefLen, parentOffset);
    const after = parent.textContent.slice(parentOffset);
    const potentialXRef = before + '(' + after;
    if (/^@ref\([A-Za-z0-9:-]*\).*$/.test(potentialXRef)) {
      return null;
    }

    // insert the xref
    const tr = state.tr;
    tr.delete(start + match[1].length, end);
    insertRef(tr);
    return tr;
  });
}

function refPrefixInputRule() {
  return new InputRule(
    /(^|[^`])(Chapter|Chapters|Appendix|Section|Figure|Table|Equation) $/,
    (state: EditorState, match: RegExpMatchArray) => {
      const tr = state.tr;
      tr.insertText(' ');
      let prefix = '';
      if (match[2] === 'Figure') {
        prefix = 'fig:';
      } else if (match[2] === 'Table') {
        prefix = 'tab:';
      } else if (match[2] === 'Equation') {
        prefix = 'eq:';
      }
      insertRef(tr, prefix);
      setTextSelection(tr.selection.head - 1)(tr);
      return tr;
    },
  );
}

function insertRef(tr: Transaction, prefix = '') {
  const schema = tr.doc.type.schema;
  const selection = tr.selection;
  const refText = `@ref(${prefix})`;
  tr.replaceSelectionWith(schema.text(refText, [schema.marks.xref.create()]), false);
  setTextSelection(tr.mapping.map(selection.head) - 1)(tr);
}

function stripRefBackslashTransform(tr: Transform) {
  const markType = tr.doc.type.schema.marks.xref;
  findChildrenByMark(tr.doc, markType).forEach(markedNode => {
    const pos = tr.mapping.map(markedNode.pos);
    if (markType.isInSet(markedNode.node.marks)) {
      const markRange = getMarkRange(tr.doc.resolve(pos), markType);
      if (markRange) {
        const text = tr.doc.textBetween(markRange.from, markRange.to);
        if (text.startsWith('\\')) {
          tr.deleteRange(markRange.from, markRange.from + 1);
        }
      }
    }
  });
}

export default extension;
