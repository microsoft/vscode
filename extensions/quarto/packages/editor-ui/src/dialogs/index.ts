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

import { 
  EditorDialogs, 
  EditorServer, 
  EditorUIImageResolver,
  PrefsProvider,  
} from "editor-types";

import { UITools } from "editor";

import { alert, yesNoMessage } from "./alert";
import { editAttr, editDiv, editSpan } from "./edit-attr";
import { editLink } from "./edit-link";
import { editImage } from "./edit-image";
import { editMath } from "./edit-math";
import { editList } from "./edit-list";
import { editRawInline, editRawBlock } from "./edit-raw";
import { editCodeBlock } from "./edit-codeblock";
import { editCallout } from "./edit-callout";
import { insertTable } from "./insert-table";
import { insertTabset } from "./insert-tabset";
import { insertCite } from "./insert-cite";
import { htmlDialog } from "./html-dialog";

export { 
  alert, 
  yesNoMessage, 
  editAttr, 
  editDiv, 
  editSpan,
  editLink, 
  editMath, 
  editList, 
  editRawInline, 
  editRawBlock, 
  editCodeBlock, 
  editCallout,
  insertTable,
  insertCite,
  htmlDialog
};


export function editorDialogs(
  prefs: PrefsProvider,
  uiTools: UITools, 
  server: EditorServer,
  imageResolver: EditorUIImageResolver) : EditorDialogs {
  return {
    alert,
    yesNoMessage,
    editLink: editLink(uiTools.attr),
    editImage: editImage(uiTools.attr, imageResolver),
    editCodeBlock: editCodeBlock(uiTools.attr),
    editList,
    editAttr: editAttr(uiTools.attr),
    editSpan: editSpan(uiTools.attr),
    editDiv: editDiv(uiTools.attr),
    editCallout: editCallout(uiTools.attr),
    editRawInline,
    editRawBlock,
    editMath: editMath(uiTools.attr),
    insertTable,
    insertTabset: insertTabset(uiTools.attr),
    insertCite: insertCite(prefs, server.doi, uiTools.citation),
    htmlDialog
  };
} 

