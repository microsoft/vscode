/*
 * CommandToolbarMenu.tsx
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

import { MenuDivider } from '@fluentui/react-components';

import { v4 as uuidv4 } from 'uuid';

import { CommandManagerContext } from './CommandManager';
import { Command } from './commands';
import { Menu } from '../menu/Menu';

import { CommandMenuItem, CommandMenuItemActive } from './CommandMenuItem';

const kSeparator = '---';

export interface CommandToolbarMenuProps {
  commands: Array<string | '---'>;
  minWidth?: number;
}

export const CommandToolbarMenu: React.FC<CommandToolbarMenuProps> = (props) => {
  // force re-render when the selection changes
  const [cmState] = useContext(CommandManagerContext);

  // read command instances
  type CommandItem = Command | '---';
  const commands: CommandItem[] = props.commands.reduce((allCmds, command) => {
    if (command === kSeparator) {
      allCmds.push(kSeparator);
    } else {
      const cmd = cmState.commands[command];
      if (cmd) {
        allCmds.push(cmd);
      }
    }
    return allCmds;
  }, Array<CommandItem>());

  // if we have any then build the menu
  if (commands.length) {
    // turn into JSX (get selected item while we iterate)
    let selected = '';
    const menuItems = commands.map(command => {
      if (command === kSeparator) {
        return <MenuDivider key={uuidv4()}/>;
      } else {
        if (command.isActive()) {
          selected = command.menuText;
        }
        return <CommandMenuItem key={command.id} id={command.id} active={CommandMenuItemActive.Check} />;
      }
    });

    // if nothing is selected then display the first/default
    const disabled = !selected;
    if (disabled) {
      selected = (commands[0] as Command).menuText;
    }

    // return JSX popover + menu items
    return (
      <Menu  text={selected} type="toolbar" minWidth={props.minWidth}>
        {menuItems}
      </Menu>
    );
  } else {
    return null;
  }
};
