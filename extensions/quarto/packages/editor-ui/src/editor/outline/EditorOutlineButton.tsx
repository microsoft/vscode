/*
 * EditorOutlineButton.tsx
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

import React, { useContext } from 'react';

import {
  TextAlignJustify20Filled,
  TextAlignJustify20Regular,
  bundleIcon
} from "@fluentui/react-icons"

const TextAlignJustifyIcon = bundleIcon(TextAlignJustify20Filled, TextAlignJustify20Regular);

import { Button } from '@fluentui/react-components';


import { CommandManagerContext, commandTooltipText, EditorUICommandId } from 'editor-ui';

import styles from './EditorOutlineSidebar.module.scss';


export interface EditorOutlineButtonProps {
  visible: boolean;
  onClick: () => void;
}

export const EditorOutlineButton: React.FC<EditorOutlineButtonProps> = props => {
  const [cmState] = useContext(CommandManagerContext);
  const command = cmState.commands[EditorUICommandId.ShowOutline];
  const title = command ? commandTooltipText(command) : '';

  if (props.visible) {
    return (
      <div className={styles.showOutlineButtonGutter}>
        <Button 
          title={title} 
          className={styles.showOutlineButton} 
          icon={<TextAlignJustifyIcon />} 
          appearance='transparent'  
          onClick={props.onClick} 
        />
      </div>
    );
  } else {
    return null;
  }
};
