/*
 * div-callout.ts
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

import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { setTextSelection, ContentNodeWithPos, findParentNodeOfType } from "prosemirror-utils";
import { wrapIn } from "prosemirror-commands";


import { EditorCommandId, ProsemirrorCommand, toggleWrap } from "../../api/command";
import { EditorUI } from "../../api/ui-types";
import { OmniInsertGroup } from "../../api/omni_insert";
import { pandocAttrEnsureClass, pandocAttrSetKeyvalue, pandocAttrGetKeyvalue, 
         pandocAttrRemoveKeyvalue, pandocAttrRemoveClass, pandocAttrFrom, PandocAttr } from "../../api/pandoc_attr";
import { CalloutProps } from "editor-types"
import { removeDiv } from "./div";

export function insertCalloutCommand(ui: EditorUI) {
  return new ProsemirrorCommand(EditorCommandId.Callout, [], insertCalloutCommandFn(ui), {
    name: ui.context.translateText('Callout'),
    description: ui.context.translateText('Content framed for special emphasis'),
    group: OmniInsertGroup.Content,
    priority: 2,
    noFocus: true,
    image: () => ui.images.omni_insert.generic,
  });
}

export async function editCalloutDiv(ui: EditorUI, state: EditorState, dispatch: (tr: Transaction) => void, div: ContentNodeWithPos) {
  
  // extract callout props
  const callout = defaultCallout();
  const attr = pandocAttrFrom(div.node.attrs);
  const calloutType = pandocAttrRemoveClass(attr, clz => clz.startsWith("callout-"));
  if (calloutType) {
    let calloutAppearance = pandocAttrGetKeyvalue(attr, "appearance") as string | undefined;
    if (calloutAppearance) {
      pandocAttrRemoveKeyvalue(attr, "appearance");
    } else {
      calloutAppearance = "default";
    }
    let calloutIcon = true;
    if (pandocAttrGetKeyvalue(attr, "icon") === "false") {
      calloutIcon = false;
      pandocAttrRemoveKeyvalue(attr, "icon");
    }
    let calloutCaption = "";
    if (div.node.firstChild?.type === state.schema.nodes.heading) {
      calloutCaption = div.node.firstChild?.textContent || "";
    }
    callout.type = calloutType.replace(/^callout-/, "");
    callout.appearance = calloutAppearance;
    callout.icon = calloutIcon;
    callout.caption = calloutCaption;
  }
    
  // edit callout
  const result = await ui.dialogs.editCallout({ attr, callout }, true);
   
  if (result) {
    const tr = state.tr;
    if (result.action === 'edit') {
      
      // start with raw attributes
      const resultAttr = result.attr;

      // apply callout attributes 
      pandocAttrEnsureClass(resultAttr, `callout-${result.callout.type}`);
      if (result.callout.appearance !== "default") {
        pandocAttrSetKeyvalue(resultAttr, "appearance", result.callout.appearance);
      }
      if (result.callout.icon !== true) {
        pandocAttrSetKeyvalue(resultAttr, "icon", "false");
      }

      // set node markup
      tr.setNodeMarkup(div.pos, div.node.type, resultAttr);

      // set caption if it's different
      if (result.callout && (callout?.caption !== result.callout?.caption)) {
        if (div.node.firstChild?.type === state.schema.nodes.heading) {
          if (result.callout?.caption) {
            tr.replaceRangeWith(
              div.start, 
              div.start + div.node.firstChild?.nodeSize || 0, 
              state.schema.nodes.heading.create(
                { level: 2 },
                state.schema.text(result.callout?.caption)
              )
            );
          } else {
            tr.deleteRange(div.start, div.start + div.node.firstChild?.nodeSize || 0);
          }
        } else if (result.callout?.caption) {
          tr.insert(
            div.start, 
            state.schema.nodes.heading.create(
              { level: 2 }, 
              state.schema.text(result.callout?.caption)
            )
          );
        }
      }
      dispatch(tr);

    } else if (result.action === 'remove') {
      removeDiv(state, dispatch, div); 
    }
  }
}

function insertCalloutCommandFn(ui: EditorUI) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void, view?: EditorView) => {
    
    const schema = state.schema;
    if (!toggleWrap(schema.nodes.div)(state)) {
      return false;
    }

    async function asyncInsertCallout() {
      if (dispatch) {
        await createCalloutDiv(ui, state, dispatch);
        if (view) {
          view.focus();
        }
      }
    }
    asyncInsertCallout();

    return true;
  };
}

async function createCalloutDiv(ui: EditorUI, state: EditorState, dispatch: (tr: Transaction) => void) {
  const props = {
    attr: { id: "", classes: [], keyvalue: []},
    callout: defaultCallout()
  };
  const result = await ui.dialogs.editCallout(props, false);
  if (result) {
    wrapIn(state.schema.nodes.div)(state, (tr: Transaction) => {
      // set div props from callout
      const attr = result.attr as PandocAttr;
      pandocAttrEnsureClass(attr, `callout-${result.callout.type}`);
      attr.keyvalue = attr.keyvalue || [];
      if (result.callout?.appearance !== "default") {
        attr.keyvalue.push(["appearance", result.callout.appearance]);
      }
      if (result.callout?.icon === false) {
        attr.keyvalue.push(["icon", "false"]);
      }
      const div = findParentNodeOfType(state.schema.nodes.div)(tr.selection)!;
      tr.setNodeMarkup(div.pos, div.node.type, attr);

      // insert caption if one is specified
      if (result.callout?.caption) {
        const calloutContent = [
          state.schema.nodes.heading.create(
            { level: 2 },
            state.schema.text(result.callout?.caption)
          ),
          state.schema.nodes.paragraph.create()
        ];
        tr.replaceWith(div.start, div.start + 1, calloutContent);
        setTextSelection(div.start + calloutContent[0].nodeSize)(tr);
      }
      dispatch(tr);
    });
  }
}

function defaultCallout() : CalloutProps {
  return {
    type: "note",
    appearance: "default",
    icon: true,
    caption: ""
  };
}

