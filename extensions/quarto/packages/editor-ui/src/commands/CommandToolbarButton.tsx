/*
 * CommandToolbarButton.tsx
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


import { ToolbarButton } from '../menu/Toolbar';
import { commandTooltipText } from './commands';
import { CommandManagerContext } from 'editor-ui';

export interface CommandToolbarButtonProps  {
  command: string;
}

export const CommandToolbarButton: React.FC<CommandToolbarButtonProps> = (props) => {
  // force re-render when the selection changes
  const [cmState] = useContext(CommandManagerContext);

  // get command
  const command = cmState.commands[props.command];
  if (command) {
    return (
      <ToolbarButton
        icon={command.icon}
        title={commandTooltipText(command)}
        enabled={command.isEnabled()}
        active={command.isActive()}
        onClick={command.execute}
      />
    );
  } else {
    return null;
  }
};
