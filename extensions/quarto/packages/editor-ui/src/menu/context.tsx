/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * context.ts
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

import React, { useEffect, useMemo } from "react";
import { createRoot } from 'react-dom/client';

import { v4 as uuidv4 } from 'uuid';


import {
  Menu, 
  MenuPopover, 
  MenuList, 
  MenuItem, 
  FluentProvider, 
  PositioningImperativeRef, 
  PositioningVirtualElement, 
  MenuDivider,
  makeStyles
} from "@fluentui/react-components";

import {
  Checkmark16Filled, 
  Checkmark16Regular,
  bundleIcon
} from "@fluentui/react-icons"

const CheckmarkIcon = bundleIcon(Checkmark16Filled, Checkmark16Regular);

import { Commands, SubMenu, fluentTheme } from "editor-ui";

import { EditorMenuItem } from "editor-types";


export async function showContextMenu(
  commands: Commands,
  items: EditorMenuItem[],
  clientX: number,
  clientY: number
): Promise<boolean> {

  return new Promise<boolean>(resolve => {

    const parent = globalThis.document.createElement("div");
    const root = createRoot(parent);
    const onClosed = () => {
      root.unmount();
      parent.remove();
      resolve(true);
    }
    
    root.render(
      <FluentProvider theme={fluentTheme()}>
         <ContextMenu commands={commands} items={items} clientX={clientX} clientY={clientY} onClosed={onClosed} />
      </FluentProvider>
    );
  });
}


interface ContextMenuProps {
  commands: Commands,
  items: EditorMenuItem[],
  clientX: number,
  clientY: number,
  onClosed: VoidFunction;
}

const ContextMenu : React.FC<ContextMenuProps> = (props) => {

  const positioningRef = React.useRef<PositioningImperativeRef>(null);

  useEffect(() => {
    const virtualElement: PositioningVirtualElement = {
      getBoundingClientRect: () => ({ 
        width: 0, 
        height: 0, 
        top: props.clientY, 
        right: props.clientX,
        bottom: props.clientY,
        left: props.clientX,
        x: props.clientX,
        y: props.clientY
      })
    };
    positioningRef.current?.setTarget(virtualElement);
  }, []);

  const classes = useStyles();

  const menuItem = useMemo(() => (item: EditorMenuItem) => {
    if (item.separator) {
      return <MenuDivider key={uuidv4()} />;
    } else if (item.command) {
      const command = props.commands[item.command];
      return (
        <MenuItem 
          key={command.id}
          className={classes.item}
          icon={command.isActive() ? <CheckmarkIcon /> : undefined}
          disabled={!command.isEnabled()} 
          onClick={command.execute}
          >
            {command.menuText}
          </MenuItem>
        );
    } else if (item.subMenu && item.text) {
      return (
        <SubMenu key={uuidv4()} text={item.text}>
          {item.subMenu.items.map(menuItem)}
        </SubMenu>
      );
    } else if (item.text && item.exec) {
      return <MenuItem key={uuidv4()} className={classes.item} onClick={item.exec}>{item.text}</MenuItem>
    } else {
      return null;
    }
  }, [props.items, props.commands]);

  return (
    <Menu 
      positioning={{ positioningRef }} 
      hasIcons={true}
      open={true} 
      onOpenChange={(_e, data) => { if (!data.open) props.onClosed(); }}>
    <MenuPopover>
      <MenuList>
        {props.items.map(menuItem)}
      </MenuList>
    </MenuPopover>
  </Menu>);
}


const useStyles = makeStyles({
  item: {
    height: '1.5em',
    paddingLeft: 0
  }
});
