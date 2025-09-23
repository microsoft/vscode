/*
 * EditorLoadFailed.tsx
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

import React from 'react';

import { Button, tokens } from "@fluentui/react-components"
import { CodeRegular } from "@fluentui/react-icons"

import { EditorUIContext } from 'editor';
import { NonIdealState } from 'ui-widgets';

import { EditorError } from '../store';
import { t } from '../i18n';
export interface EditorLoadFailedProps {
  error: EditorError;
  uiContext: EditorUIContext
}

export const EditorLoadFailed:  React.FC<EditorLoadFailedProps> = (props) => {

  const editAction = props.uiContext.reopenInSourceMode 
    ? <Button 
        icon={<CodeRegular />}
        style={{ 
          color: tokens.colorPaletteBlueBorderActive, 
          borderColor: tokens.colorPaletteBlueBorderActive 
        }}
        appearance="outline"
        onClick={() => props.uiContext.reopenInSourceMode!()}
      >
        {t('return_to_source_mode')} 
      </Button>
    : undefined;

  return (
    <NonIdealState
      icon={props.error.icon}
      title={props.error.title}
      action={editAction}
    >
      <p>
      {props.error.description.map(line => {
        return <><span>{line}</span><br/></>;
      })}
      </p>
    </NonIdealState>
  )

  
};

