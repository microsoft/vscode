/*
 * find.ts
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

import { Compartment, Range, RangeSet } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { scrollCodeViewElementIntoView } from "editor";

import { Behavior, BehaviorContext } from ".";

export function findBehavior(context: BehaviorContext) : Behavior {

    const { view, getPos } = context;  

    const findDecoratorMark = Decoration.mark({class: "pm-find-text"})
    const findDecorators = new Compartment();
  
    return {
      extensions: [findDecorators.of([])],

      pmUpdate(_prevNode, updateNode, cmView) {
      
        // get the find decorations
        const findMarkers: Range<Decoration>[] = [];
        const decorations = context.pmContext.find.decorations();      
        if (decorations && typeof getPos === "function") {
          const decos = decorations?.find(getPos(), getPos() + updateNode.nodeSize - 1);
          if (decos) {
            decos.forEach((deco) => {
              if (deco.from !== view.state.selection.from && deco.to !== view.state.selection.to) {
                findMarkers.push(findDecoratorMark.range(deco.from - getPos() - 1, deco.to - getPos() -1));
              } else {
                // ensure that the selection is visible
                const domElement = cmView.domAtPos(deco.from);
                const el = domElement.node instanceof HTMLElement ? domElement.node : domElement.node.parentElement;
                if (el) {
                  scrollCodeViewElementIntoView(el, context.dom, context.view);
                }
              }
            })
          }
        }

        const ranges = RangeSet.of<Decoration>(findMarkers);
        cmView.dispatch({
          effects: findDecorators.reconfigure(EditorView.decorations.of(ranges))
        });
      },
    }
}