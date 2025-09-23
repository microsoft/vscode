/*
 * langmode.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model'

import { Compartment } from "@codemirror/state";
import { EditorView } from '@codemirror/view';

import { languageMode } from '../languages';

import { Behavior, BehaviorContext } from '.';

export function langModeBehavior(context: BehaviorContext) : Behavior {

  // compartment for dynamically reconfiguring the language
  const languageConf = new Compartment();

  // helper to get the language for a node
  const nodeLang = (nd: ProsemirrorNode) => context.options.lang(nd, nd.textContent) || '';

  // helper to set the current language node
  const setMode = (lang: string, cmView: EditorView) => {
    const support = languageMode(lang);
    if (support)
      cmView.dispatch({
        effects: languageConf.reconfigure(support),
      });
  };

  return {
    
    extensions: [languageConf.of([])],

    init: (pmNode: ProsemirrorNode, cmView: EditorView) => {
      const lang = nodeLang(pmNode);
      setMode(lang, cmView);
    },

    pmUpdate: (prevNode: ProsemirrorNode, updateNode: ProsemirrorNode, cmView: EditorView) => {
      const updateLang = nodeLang(updateNode);
      if (nodeLang(prevNode)!== updateLang)
        setMode(updateLang, cmView);
    }

  }

}
