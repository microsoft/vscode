/*
 * input_rule.ts
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

import { EditorState, Transaction } from 'prosemirror-state';
import { Schema, MarkType, NodeType, Node as ProsemirrorNode } from 'prosemirror-model';
import { InputRule, wrappingInputRule } from 'prosemirror-inputrules';

import { PandocMark, markIsActive } from './mark';

export function markInputRule(
  regexp: RegExp,
  markType: MarkType,
  filter: MarkInputRuleFilter,
  getAttrs?: ((match: string[]) => object) | object,
) {
  return new InputRule(regexp, (state: EditorState, match: string[], start: number, end: number) => {
    if (!filter(state, start, end)) {
      return null;
    }

    // remove any leading delimter (modulo spaces)
    const textIndex = match[0].indexOf(match[1]);
    const prefix = match[0].substring(0, textIndex).replace(/^\s/, "");
    const delimStart = start + textIndex - prefix.length;
    const tr = state.tr;
    tr.delete(delimStart, delimStart + prefix.length);

    // create mark
    const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
    const mark = markType.create(attrs);

    // apply it to the matching core text
    const markStart = start + textIndex - prefix.length;
    tr.addMark(markStart, markStart + match[1].length, mark);
    tr.removeStoredMark(mark); // Do not continue with mark.
    return tr;
  });
}

export function delimiterMarkInputRule(
  delim: string,
  markType: MarkType,
  filter: MarkInputRuleFilter,
  prefixMask?: string,
  noEnclosingWhitespace?: boolean,
) {
  // create distinct patterns depending on whether we allow enclosing whitespace
  const contentPattern = noEnclosingWhitespace
    ? `[^\\s${delim}][^${delim}]+[^\\s${delim}]|[^\\s${delim}]{1,2}`
    : `[^${delim}]+`;

  // if there is no prefix mask then this is simple regex we can pass to markInputRule
  if (!prefixMask) {
    const regexp = `(?:${delim})(${contentPattern})(?:${delim})$`;
    return markInputRule(new RegExp(regexp), markType, filter);

    // otherwise we need custom logic to get mark placement/eliding right
  } else {
    // build regex
    const regexp = `(^|[^${prefixMask}])(?:${delim})(${contentPattern})(?:${delim})$`;

    // return rule
    return new InputRule(new RegExp(regexp), (state: EditorState, match: string[], start: number, end: number) => {
      if (!filter(state, start, end)) {
        return null;
      }

      // init transaction
      const tr = state.tr;

      // compute offset for mask (should be zero if this was the beginning of a line,
      // in all other cases it would be the length of the any mask found).
      const maskOffset = match[1].length;

      // position of text to be formatted
      const textStart = start + match[0].indexOf(match[2]);
      const textEnd = textStart + match[2].length;

      // remove trailing markdown
      tr.delete(textEnd, end);

      // update start/end to reflect the leading mask which we want to leave alone
      start = start + maskOffset;
      end = start + match[2].length;

      // remove leading markdown
      tr.delete(start, textStart);

      // add mark
      const mark = markType.create();
      tr.addMark(start, end, mark);

      // remove stored mark so typing continues w/o the mark
      tr.removeStoredMark(mark);

      // return transaction
      return tr;
    });
  }
}

export type MarkInputRuleFilter = (context: EditorState | Transaction, from?: number, to?: number) => boolean;

export function markInputRuleFilter(schema: Schema, marks: readonly PandocMark[]): MarkInputRuleFilter {
  const maskedMarkTypes = marksWithNoInputRules(schema, marks);

  return (context: EditorState | Transaction, from?: number, to?: number) => {
    if (from !== undefined && to !== undefined && from !== to) {
      const marksInRange: MarkType[] = [];
      context.doc.nodesBetween(from, to, node => {
        node.marks.forEach(mark => marksInRange.push(mark.type));
      });
      return !marksInRange.some(markType => maskedMarkTypes.includes(markType));
    }
    if (from === undefined) {
      for (const markType of maskedMarkTypes) {
        if (markIsActive(context, markType)) {
          return false;
        }
      }
    }
    return true;
  };
}

export function conditionalWrappingInputRule(
  regexp: RegExp,
  nodeType: NodeType,
  predicate: (state: EditorState) => boolean,
  getAttrs?: { [key: string]: unknown } | ((p: string[]) => { [key: string]: unknown } | null | undefined),
  joinPredicate?: (p1: string[], p2: ProsemirrorNode) => boolean,
): InputRule {
  const wrappingRule = wrappingInputRule(regexp, nodeType, getAttrs, joinPredicate);
  return new InputRule(regexp, (state: EditorState, match: string[], start: number, end: number) => {
    if (!predicate(state)) {
      return null;
    }
    // we know that the input rule has a handler even though the interface doesn't declare it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (wrappingRule as any).handler(state, match, start, end);
  });
}

function marksWithNoInputRules(schema: Schema, marks: readonly PandocMark[]): MarkType[] {
  const disabledMarks: MarkType[] = [];
  marks.forEach((mark: PandocMark) => {
    if (mark.noInputRules) {
      disabledMarks.push(schema.marks[mark.name]);
    }
  });
  return disabledMarks;
}
