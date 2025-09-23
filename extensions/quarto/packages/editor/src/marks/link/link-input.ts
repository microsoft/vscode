/*
 * link-input.ts
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

import { Schema } from 'prosemirror-model';
import { InputRule } from 'prosemirror-inputrules';
import { EditorState } from 'prosemirror-state';
import { setTextSelection } from 'prosemirror-utils';

import { markInputRule, MarkInputRuleFilter } from '../../api/input_rule';

export function linkInputRules(autoLink: boolean) {
  return (schema: Schema, filter: MarkInputRuleFilter) => {
    const rules = [
      // <link> style link
      markInputRule(/(?:(?:^|[^`])<)(https?:\/\/[^>]+)(?:>)$/, schema.marks.link, filter, (match: string[]) => ({
        href: match[1],
      })),
       // full markdown link
      new InputRule(/(?:\[)([^\]]+)(?:\]\()([^)]+)(?:\))$/, (state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
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
        const attrs = { href: match[2] };
        const mark = schema.marks.link.create(attrs);
    
        // apply it to the matching core text
        const markStart = start + textIndex - prefix.length;
        tr.addMark(markStart, markStart + match[1].length, mark);
        tr.removeStoredMark(mark); // Do not continue with mark.
    
        // remove any remaining text
        const remainStart = markStart + match[1].length;
        tr.delete(remainStart, end);
        setTextSelection(remainStart)(tr);
    
        return tr;
      })
    ];

    if (autoLink) {
      // plain link
      rules.push(
        new InputRule(
          /(^|[^`])(https?:\/\/[^\s]+\w)[.?!,)]* $/,
          (state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
            const tr = state.tr;
            start = start + match[1].length;
            const linkEnd = start + match[2].length;
            tr.addMark(start, linkEnd, schema.marks.link.create({ href: match[2] }));
            tr.removeStoredMark(schema.marks.link);
            tr.insertText(' ');
            setTextSelection(end + 1)(tr);
            return tr;
          },
        ),
      );
    }

    return rules;
  };
}

