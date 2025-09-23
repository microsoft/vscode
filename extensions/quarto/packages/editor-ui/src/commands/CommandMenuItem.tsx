/*
 * CommandMenuItem2.tsx
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
  Checkmark16Filled, 
  Checkmark16Regular,
  bundleIcon
} from "@fluentui/react-icons"

const CheckmarkIcon = bundleIcon(Checkmark16Filled, Checkmark16Regular);


import { keyCodeString } from './keycodes';
import { commandKeymapText } from './commands';
import { CommandManagerContext, Commands } from 'editor-ui';
import { MenuItem } from '@fluentui/react-components';
import { useMenuStyles } from '../menu/styles';

export enum CommandMenuItemActive {
  Check = 'check',
  Latch = 'latch',
  None = 'none',
}

export interface CommandMenuItemProps {
  id: string;
  text?: string;
  keyCode?: string;
  active?: CommandMenuItemActive;
  commands?: Commands;
}

export const CommandMenuItem: React.FC<CommandMenuItemProps> = props => {

  const classes = useMenuStyles();

  const { id, keyCode, active = CommandMenuItemActive.None } = props;

  // force re-render when the selection changes
  const [cmState] = useContext(CommandManagerContext);
  
  // get command
  let command = props.commands?.[id];
  if (!command) {
    command = cmState.commands[id];
  }
  
  if (command) {
    // resolve label
    const label = keyCode ? keyCodeString(keyCode, true) : commandKeymapText(command, true);

    const isActive = active === 'latch' ? command.isActive() : false;

    return (
      <MenuItem 
        key={command.id}
        className={classes.item}
        secondaryContent={label}
        icon={isActive ? <CheckmarkIcon /> : undefined}
        disabled={!command.isEnabled()} 
        onClick={command.execute}
      >
        {props.text || command.menuText}
      </MenuItem>
    );
  } else {
    return null;
  }
};
