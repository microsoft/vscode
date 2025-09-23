/*
 * trailing_p.ts
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

import { Transaction } from 'prosemirror-state';
import { Extension } from '../api/extension';
import { FixupContext } from '../api/fixup';
import { requiresTrailingP, insertTrailingP } from '../api/trailing_p';

const extension: Extension = {
  fixups: () => {
    return [
      (tr: Transaction, context: FixupContext) => {
        if (context === FixupContext.Load) {
          if (requiresTrailingP(tr.selection)) {
            insertTrailingP(tr);
          }
        }
        return tr;
      },
    ];
  },

  appendTransaction: () => {
    return [
      {
        name: 'trailing_p',
        append: (tr: Transaction) => {
          if (requiresTrailingP(tr.selection)) {
            insertTrailingP(tr);
          }
          return tr;
        },
      },
    ];
  },
};

export default extension;
