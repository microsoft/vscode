/*
 * xref-completion.tsx
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

import { EditorState, Transaction } from 'prosemirror-state';
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { DecorationSet } from 'prosemirror-view';

import React from 'react';

import Fuse from 'fuse.js';
import uniqby from 'lodash.uniqby';

import { EditorUI } from '../../api/ui-types';
import { CompletionHandler, CompletionResult } from '../../api/completion';
import { xrefKey } from '../../api/xref';
import { markIsActive } from '../../api/mark';
import { searchPlaceholderDecoration } from '../../api/placeholder';
import { CompletionItemView } from '../../api/widgets/completion';

import './xref-completion.css';
import { XRef, XRefServer } from 'editor-types';

const kMaxResults = 20;

export function xrefCompletionHandler(ui: EditorUI, server: XRefServer): CompletionHandler<XRef> {
  const index = new FuseIndex();

  return {
    id: 'BAACC160-56BE-4322-B079-54477A880623',

    enabled: (context: EditorState | Transaction) => {
      return markIsActive(context, context.doc.type.schema.marks.xref);
    },

    completions: xrefCompletions(ui, server, index),

    filter: (completions: XRef[], _state: EditorState, token: string) => {
      if (token.length > 0) {
        return index.search(token, kMaxResults);
      } else {
        return completions.slice(0, kMaxResults);
      }
    },

    replacement(_schema: Schema, xref: XRef | null): string | ProsemirrorNode | null {
      if (xref) {
        return xrefKey(xref);
      } else {
        return null;
      }
    },

    view: {
      component: xrefView(ui),
      key: xref => xrefKey(xref),
      height: 52,
      width: 350,
      maxVisible: 5,
      hideNoResults: true,
    },
  };
}

class FuseIndex {
  private fuse: Fuse<XRef>;

  private keys: Fuse.FuseOptionKeyObject<void>[] = [
    { name: 'id', weight: 20 },
    { name: 'type', weight: 1 },
    { name: 'title', weight: 1 },
  ];

  constructor() {
    this.fuse = this.createIndex([]);
  }

  public update(xrefs: XRef[]) {
    this.fuse = this.createIndex(xrefs);
  }

  public search(query: string, limit: number) {
    // see if we have an explicit type
    let type: string | null = null;
    let typeQuery: string | null = null;
    const colonLoc = query.indexOf(':');
    if (colonLoc !== -1) {
      const prefix = query.slice(0, colonLoc);
      if (Object.prototype.hasOwnProperty.call(kXRefTypes,prefix)) {
        type = prefix;
        if (query.length > type.length + 1) {
          typeQuery = query.slice(colonLoc + 1);
        }
      }
    }

    // search options
    const options = {
      isCaseSensitive: false,
      shouldSort: true,
      minMatchCharLength: 2,
      limit,
      keys: this.keys,
    };

    // perform query (use type if we have one)
    const results = type
      ? typeQuery
        ? this.fuse.search({ $and: [{ type }, { $or: [{ id: typeQuery }, { title: typeQuery }] }] }, options)
        : this.fuse.search({ type }, options)
      : this.fuse.search(query, options);

    // return results (eliminating duplicates)
    return uniqby(
      results.map((result: { item: XRef }) => result.item),
      xrefKey,
    );
  }

  private createIndex(xrefs: XRef[]) {
    const options = {
      keys: this.keys.map(key => key.name),
    };
    const index = Fuse.createIndex(options.keys, xrefs);
    return new Fuse(xrefs, options, index);
  }
}

function xrefCompletions(ui: EditorUI, server: XRefServer, index: FuseIndex) {
  const kXRefCompletionRegEx = /(@ref\()([ A-Za-z0-9:-]*)$/;
  return (text: string, context: EditorState | Transaction): CompletionResult<XRef> | null => {
    const match = text.match(kXRefCompletionRegEx);
    if (match) {
      const pos = context.selection.head - match[2].length;
      const token = match[2];
      return {
        pos,
        offset: -match[1].length + 1,
        token,
        completions: async () => {
          const docPath = ui.context.getDocumentPath();
          if (docPath) {
            await ui.context.withSavedDocument();
            const xrefs = await server.indexForFile(docPath);
            index.update(xrefs.refs);
            return xrefs.refs;
          } else {
            index.update([]);
            return Promise.resolve([]);
          }
        },
        decorations:
          token.length === 0 ? DecorationSet.create(context.doc, [searchPlaceholderDecoration(pos, ui)]) : undefined,
      };
    } else {
      return null;
    }
  };
}

function xrefView(ui: EditorUI): React.FC<XRef> {
  return (xref: XRef) => {
    const type = kXRefTypes[xref.type];
    const image = type?.image(ui) || ui.images.omni_insert.generic;

    return (
      <CompletionItemView
        width={350}
        classes={['pm-xref-completion-item']}
        image={image}
        title={xrefKey(xref)}
        subTitle={xref.title || ''}
        detail={xref.file}
      />
    );
  };
}

const kGenericType = {
  image: (ui: EditorUI) => ui.images.omni_insert.generic,
};

const kEqType = {
  image: (ui: EditorUI) =>
    ui.prefs.darkMode() ? ui.images.omni_insert?.math_display_dark : ui.images.omni_insert?.math_display,
};

const kTableType =  {
  image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.omni_insert?.table_dark : ui.images.omni_insert?.table),
};

export const kXRefTypes: { [key: string]: { image: (ui: EditorUI) => string | undefined } } = {
  h1: {
    image: (ui: EditorUI) =>
      ui.prefs.darkMode() ? ui.images.omni_insert?.heading1_dark : ui.images.omni_insert?.heading1,
  },
  h2: {
    image: (ui: EditorUI) =>
      ui.prefs.darkMode() ? ui.images.omni_insert?.heading2_dark : ui.images.omni_insert?.heading2,
  },
  h3: {
    image: (ui: EditorUI) =>
      ui.prefs.darkMode() ? ui.images.omni_insert?.heading3_dark : ui.images.omni_insert?.heading3,
  },
  h4: {
    image: (ui: EditorUI) =>
      ui.prefs.darkMode() ? ui.images.omni_insert?.heading4_dark : ui.images.omni_insert?.heading4,
  },
  fig: {
    image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.omni_insert?.image_dark : ui.images.omni_insert?.image),
  },
  tab: kTableType,
  tbl:kTableType,
  eq: kEqType,
  thm: kEqType,
  lem: kEqType,
  cor: kEqType,
  prp: kEqType,
  cnj: kEqType,
  def: kEqType,
  exm: kGenericType,
  exr: kGenericType,
};

const kTheoremType = {
  image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.xrefs?.theorem_dark : ui.images.xrefs?.theorem)
};


export const kQuartoXRefTypes: { [key: string]: { image: (ui: EditorUI) => string | undefined } } = {
  sec: {
    image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.xrefs?.section_dark : ui.images.xrefs?.section)
  },
  fig: {
    image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.xrefs?.figure_dark : ui.images.xrefs?.figure),
  },
  tbl: {
    image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.xrefs?.table_dark : ui.images.xrefs?.table),
  },
  lst: {
    image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.xrefs?.listing_dark : ui.images.xrefs?.listing),
  },
  eq: {
    image: (ui: EditorUI) => (ui.prefs.darkMode() ? ui.images.xrefs?.equation_dark : ui.images.xrefs?.equation)
  },
  thm: kTheoremType,
  lem: kTheoremType,
  cor: kTheoremType,
  prp: kTheoremType,
  cnj: kTheoremType,
  def: kTheoremType,
  exm: kTheoremType,
  exr: kTheoremType,
};