/*
 * index.ts
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

import React from "react";
import { createRoot } from "react-dom/client";

export function showValueEditorDialog<T,O = undefined>(
  dialog: React.FC<{ values: T, options: O, onClosed: (values?: T) => void}>,
  values: T,
  options: O)
:  Promise<T | null> {
  return new Promise(resolve => {
    const parent = globalThis.document.createElement("div");
    const root = createRoot(parent);
    const onClosed = (values?: T) => {
      root.unmount();
      parent.remove();
      resolve(values || null);
    }  
    root.render(React.createElement(dialog, { values, options, onClosed }));
  });
}

export { ModalDialog } from './ModalDialog';
export { ModalDialogTabList } from './ModalDialogTabList';


