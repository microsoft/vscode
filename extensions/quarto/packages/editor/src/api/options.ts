/*
 * options.ts
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

import { EditorTheme } from "../editor/editor-theme";

export interface EditorOptions {
  readonly autoFocus?: boolean;
  readonly browserSpellCheck?: boolean;
  readonly commenting?: boolean;
  readonly codeEditor?: string;
  readonly rmdImagePreview?: boolean;
  readonly rmdExampleHighlight?: boolean;
  readonly hideFormatComment?: boolean;
  readonly className?: string;
  readonly outerScrollContainer?: boolean;
  readonly cannotEditUntitled?: boolean;
  readonly initialTheme?: EditorTheme;
  readonly defaultCellTypePython?: boolean;
}
