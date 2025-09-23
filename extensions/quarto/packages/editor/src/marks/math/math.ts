/*
 * math.ts
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

import { Node as ProsemirrorNode, Schema, Mark, Fragment, Slice } from 'prosemirror-model';
import { Plugin, PluginKey, EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { InputRule } from 'prosemirror-inputrules';

import { Extension, ExtensionContext } from '../../api/extension';
import { PandocTokenType, PandocToken, PandocOutput } from '../../api/pandoc';
import { BaseKey, BaseKeyBinding } from '../../api/basekeys';
import { domAttrNoSpelling, markIsActive } from '../../api/mark';
import { kCodeText } from '../../api/code';
import { pasteTransaction } from '../../api/clipboard';
import { kQuartoDocType } from '../../api/format';
import { kMathContent, kMathType, delimiterForType, MathType, kMathId } from '../../api/math';
import { MarkInputRuleFilter } from '../../api/input_rule';

import { InsertInlineMathCommand, InsertDisplayMathCommand, insertMath } from './math-commands';
import { mathAppendMarkTransaction } from './math-transaction';
import { mathHighlightPlugin } from './math-highlight';
import { MathPopupPlugin } from './math-popup';
import { mathViewPlugins } from './math-view';
import { displayMathNewline, inlineMathNav } from './math-keys';

import './math-styles.css';

const kInlineMathPattern = '\\$[^ ].*?[^\\ ]?\\$';
const kInlineMathRegex = new RegExp(kInlineMathPattern);

const kSingleLineDisplayMathPattern = '\\$\\$[^\n]*?\\$\\$';
const kSingleLineDisplayMathRegex = new RegExp(kSingleLineDisplayMathPattern);

const extension = (context: ExtensionContext): Extension | null => {
  const {  ui, format, math, events } = context;

  // note that we always enable math (harmless as worst case it is 
  // simply output as ascii math by pandoc) so no check is made here

  // special blogdown handling for markdown renderers that don't support math
  const blogdownMathInCode = format.rmdExtensions.blogdownMathInCode;
  const singleLineDisplayMath = blogdownMathInCode;

  return {
    marks: [
      {
        name: 'math',
        noInputRules: true,
        noSpelling: true,
        spec: {
          attrs: {
            type: {},
            id: { default: null }
          },
          inclusive: false,
          excludes: 'formatting',
          parseDOM: [
            {
              tag: "span[class*='math']",
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                return {
                  type: el.getAttribute('data-type'),
                };
              },
              preserveWhitespace: 'full',
            },
          ],

          toDOM(mark: Mark) {
            return [
              'span',
              domAttrNoSpelling({
                class: 'math pm-fixedwidth-font pm-light-text-color',
                'data-type': mark.attrs.type,
                spellcheck: 'false',
              }),
            ];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.Math,
              mark: 'math',
              getAttrs: (tok: PandocToken) => {
                return {
                  type: tok.c[kMathType].t,
                  id: tok.c[kMathId] || null
                };
              },
              getText: (tok: PandocToken) => {
                const delimter = delimiterForType(tok.c[kMathType].t);
                return delimter + tok.c[kMathContent] + delimter;
              },
            },
            // extract math from backtick code for blogdown
            ...(blogdownMathInCode
              ? [
                  {
                    token: PandocTokenType.Code,
                    mark: 'math',
                    match: (tok: PandocToken) => {
                      const text = tok.c[kCodeText];
                      return kSingleLineDisplayMathRegex.test(text) || kInlineMathRegex.test(text);
                    },
                    getAttrs: (tok: PandocToken) => {
                      const text = tok.c[kCodeText];
                      return {
                        type: kSingleLineDisplayMathRegex.test(text) ? MathType.Display : MathType.Inline,
                      };
                    },
                    getText: (tok: PandocToken) => {
                      return tok.c[kCodeText];
                    },
                  },
                ]
              : []),
          ],
          writer: {
            priority: 1,
            write: (output: PandocOutput, mark: Mark, parent: Fragment) => {
              // collect math content
              let mathText = '';
              parent.forEach((node: ProsemirrorNode) => (mathText = mathText + node.textContent));

              // if this is blogdownMathInCode just write the content in a code mark
              if (blogdownMathInCode) {
                output.writeToken(PandocTokenType.Code, () => {
                  output.writeAttr();
                  output.write(mathText);
                });
              } else {
                // check for delimeter (if it's gone then write this w/o them math mark)
                const delimiter = delimiterForType(mark.attrs.type);
                if (mathText.startsWith(delimiter) && mathText.endsWith(delimiter)) {
                  // remove delimiter
                  mathText = mathText.substr(delimiter.length, mathText.length - 2 * delimiter.length);

                
                  if (mark.attrs.type === MathType.Inline) {
                    // trim inline math
                    mathText = mathText.trim();
                  } else if (mark.attrs.type === MathType.Display) {
                    // remove blank lines from display math (but preserve enclosing whitespace)
                    const beginMatch = mathText.match(/^\s*/);
                    const begin = beginMatch ? beginMatch[0].replace(/\n{2,}/g, "\n") : '';
                    const endMatch = mathText.match(/\s*$/);
                    const end = endMatch ? endMatch[0].replace(/\n{2,}/g, "\n") : '';
                    mathText = begin + mathText.trim()
                      .split("\n")
                      .filter(line => line.trim().length > 0)
                      .join("\n") + end;
                  }
                  
                  // if it's just whitespace then it's not actually math (we allow this state
                  // in the editor because it's the natural starting place for new equations)
                  if (mathText.length === 0) {
                    output.writeText(delimiter + mathText + delimiter);
                  } else {
                    output.writeToken(PandocTokenType.Math, () => {
                      // write type
                      output.writeToken(
                        mark.attrs.type === MathType.Inline ? PandocTokenType.InlineMath : PandocTokenType.DisplayMath,
                      );
                      output.write(mathText);
                    });
                    // write id if we have it
                    if (mark.attrs.id) {
                      output.writeRawMarkdown(` {#${mark.attrs.id}}`);
                    }
                  }
                } else {
                  // user removed the delimiter so write the content literally. when it round trips
                  // back into editor it will no longer be parsed by pandoc as math
                  output.writeRawMarkdown(mathText);
                }
              }
            },
          },
          // filter for picking out id for quarto crossref
          tokensFilter: format.docTypes.includes(kQuartoDocType) ? (tokens: PandocToken[]) => {
            const pendingTokens: PandocToken[] = [];
            const filteredTokens: PandocToken[] = [];

            const clearPendingTokens = () => {
              pendingTokens.splice(0, pendingTokens.length);
            };

            const flushPendingTokens = () => {
              filteredTokens.push(...pendingTokens);
              clearPendingTokens();
            };

            for (const token of tokens) {
              switch(token.t) {
                case PandocTokenType.Math: 
                  flushPendingTokens();
                  if (token.c[kMathType].t === PandocTokenType.DisplayMath) {
                    pendingTokens.push(token);
                  } else {
                    filteredTokens.push(token);
                  }
                  break;
                case PandocTokenType.Space:
                  if (pendingTokens.length > 0) {
                    pendingTokens.push(token);
                  } else {
                    filteredTokens.push(token);
                  }
                  break;
                case PandocTokenType.Str:
                  if (pendingTokens.length > 0) {
                    const match = (token.c as string).match(/{#(eq-[^ }]+)}/);
                    if (match) {
                      const mathToken = pendingTokens[0];
                      mathToken.c[kMathId] = match[1];
                      clearPendingTokens();
                      filteredTokens.push(mathToken);
                    } else {
                      flushPendingTokens();
                      filteredTokens.push(token);
                    }
                  } else {
                    filteredTokens.push(token);
                  }
                  break;
                default:
                  flushPendingTokens();
                  filteredTokens.push(token);
                  break;
              }
            }
            flushPendingTokens();

            return filteredTokens;
          } : undefined
        },
      },
    ],

    baseKeys: () => {
      const keys: BaseKeyBinding[] = [
        { key: BaseKey.Home, command: inlineMathNav(true) },
        { key: BaseKey.End, command: inlineMathNav(false) }
      ];
      if (!singleLineDisplayMath) {
        keys.push({ key: BaseKey.Enter, command: displayMathNewline });
      } 
      return keys;
    },

    inputRules: (schema: Schema, filter: MarkInputRuleFilter) => {
      const kInlineMathInputRulePattern = '\\$[^ ][^\\$]*?[^\\ ]?\\$';
      return [
        // inline math
        new InputRule(
          new RegExp('(^|\\s+)' + kInlineMathInputRulePattern + '$'),
          (state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
            if (!markIsActive(state, schema.marks.math) && filter(state) &&
                !state.doc.rangeHasMark(start, start+1, schema.marks.math)) {
              const tr = state.tr;
              tr.insertText('$');
              const mark = schema.marks.math.create({ type: MathType.Inline });
              tr.removeMark(start + match[1].length, end + 1, undefined);
              tr.addMark(start + match[1].length, end + 1, mark);
              return tr;
            } else {
              return null;
            }
          },
        ),
        new InputRule(/(?:^|[^`])\$$/, (state: EditorState, _match: RegExpMatchArray, start: number) => {
          if (!markIsActive(state, schema.marks.math)) {
            const { parent, parentOffset } = state.selection.$head;
            const text = '$' + parent.textContent.slice(parentOffset);
            if (text.length > 0) {
              const length = mathLength(text);
              if (length > 1) {
                if (filter(state, start, start + length)) {
                  const tr = state.tr;
                  tr.insertText('$');
                  const startMath = tr.selection.from - 1;
                  const mark = schema.marks.math.create({ type: MathType.Inline });
                  tr.addMark(startMath, startMath + length, mark);
                  return tr;
                }
              }
            }
          }
          return null;
        }),
        // display math
        new InputRule(/^\$\$$/, (state: EditorState, _match: RegExpMatchArray, start: number, end: number) => {
          if (filter(state, start, end)) {
            const tr = state.tr;
            tr.delete(start, end);
            insertMath(tr.selection, MathType.Display, !singleLineDisplayMath, tr);
            return tr;
          } else {
            return null;
          }
        }),
      ];
    },

    commands: () => {
      return [new InsertInlineMathCommand(ui), new InsertDisplayMathCommand(ui, !singleLineDisplayMath)];
    },

    appendMarkTransaction: () => {
      return [mathAppendMarkTransaction()];
    },

    plugins: (schema: Schema) => {
      const plugins = [
        new Plugin({
          key: new PluginKey('math'),
          props: {
            // paste plain text into math blocks
            handlePaste: handlePasteIntoMath(),
          },
        }),
        mathHighlightPlugin(schema),
      ];
      if (math) {
        plugins.push(new MathPopupPlugin(ui, math, events, false));
        plugins.push(...mathViewPlugins(schema, format, ui, math));
      }
      return plugins;
    },
  };
};

function mathLength(text: string) {
  const match = text.match(kInlineMathRegex);
  if (match) {
    return match[0].length;
  } else {
    return 0;
  }
}

function handlePasteIntoMath() {
  return (view: EditorView, _event: Event, slice: Slice) => {
    const schema = view.state.schema;
    if (markIsActive(view.state, schema.marks.math)) {
      const tr = pasteTransaction(view.state);
      let math = '';
      slice.content.forEach((node: ProsemirrorNode) => (math = math + node.textContent));
      tr.replaceSelectionWith(schema.text(math));
      view.dispatch(tr);
      return true;
    } else {
      return false;
    }
  };
}


export default extension;
