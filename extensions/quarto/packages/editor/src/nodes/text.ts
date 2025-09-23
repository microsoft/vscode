/*
 * text.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model';

import { PandocOutput, PandocToken, PandocTokenType, ProsemirrorWriter } from '../api/pandoc';
import { kQuoteType, QuoteType, kQuoteChildren } from '../api/quote';

const extension = () => {
  

  return {
    nodes: [
      {
        name: 'text',
        spec: {
          group: 'inline',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          toDOM(node: ProsemirrorNode): any {
            return node.text;
          },
        },
        pandoc: {
          readers: [
            { token: PandocTokenType.Str, text: true, getText: (t: PandocToken) => t.c },
            { token: PandocTokenType.Space, text: true, getText: () => ' ' },
            { token: PandocTokenType.SoftBreak, text: true, getText: () => ' ' },
            {
              token: PandocTokenType.Quoted,
              handler: () => (writer: ProsemirrorWriter, tok: PandocToken) => {
                const type = tok.c[kQuoteType].t;
                const quote = type === QuoteType.SingleQuote ? "'" : '"';
                writer.writeTokens([{ t: 'Str', c: quote }, ...tok.c[kQuoteChildren], { t: 'Str', c: quote }]);
              },
            },
          ],
          writer: (output: PandocOutput, node: ProsemirrorNode) => {
            const text = node.textContent;
            output.writeText(text);
          },
        },
      },
    ],
  };
};

export default extension;
