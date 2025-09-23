/*
 * EditorOperationsContext.tsx
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import React from 'react';

import { EditorOperations } from 'editor';

export const EditorOperationsContext = React.createContext<EditorOperations>(null!);

export function withEditorOperations<P extends WithEditorOperationsProps>(Component: React.ComponentType<P>) {
  return function EditorOperationsComponent(props: Pick<P, Exclude<keyof P, keyof WithEditorOperationsProps>>) {
    return (
      <EditorOperationsContext.Consumer>
        {(editor: EditorOperations) => <Component {...(props as P)} editor={editor} />}
      </EditorOperationsContext.Consumer>
    );
  };
}

interface WithEditorOperationsProps {
  editor: EditorOperations;
}
