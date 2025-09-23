/*
 * CommandSubMenu2.tsx
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

import React, { PropsWithChildren, useContext } from 'react';

import { SubMenuProps, SubMenu } from '../menu/Menu';

import { CommandMenuItem } from './CommandMenuItem';

import { CommandManagerContext, Commands } from './CommandManager';

export interface CommandSubMenuProps extends SubMenuProps {
  commands?: Commands;
}

export const CommandSubMenu: React.FC<PropsWithChildren<CommandSubMenuProps>> = props => {
  // get command manager for command lookup
  const [cmState] = useContext(CommandManagerContext);


  let haveCommands = false;
  const children = React.Children.toArray(props.children);
  for (const child of children) {

    if (
      React.isValidElement(child) &&
      child.type === CommandMenuItem 
    ) {
      // get command
      let command = props.commands?.[child.props.id];
      if (!command) {
        command = cmState.commands[child.props.id];
      }
      if (command) {
        haveCommands = true;
        break;
      }
    }
  }


  if (haveCommands) {
    return <SubMenu {...props} />;
  } else {
    return null;
  }
};
