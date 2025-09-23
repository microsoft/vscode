/*
 * ModalDialogTabList.tsx
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

import React from "react"

import { TabList, TabListProps, makeStyles, mergeClasses } from "@fluentui/react-components";


export const ModalDialogTabList : React.FC<TabListProps> = props => {
  const styles = useStyles();
  return (
    <TabList {...props} className={mergeClasses(styles.root, props.className)} />
  )
}


const useStyles = makeStyles({
  root: {
    columnGap: "12px",
    paddingBottom: "8px",
    "& .fui-Tab": {
      paddingLeft: 0,
      paddingRight: 0,
      '::after': {
        left: "2px",
        right: "2px"
      },
      '::before': {
        left: "2px",
        right: "2px"
      }
    }
  },
  
});
