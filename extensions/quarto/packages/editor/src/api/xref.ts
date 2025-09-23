/*
 * xref.ts
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

import { Node as ProsemirrorNode, MarkType } from 'prosemirror-model';

import { findChildrenByMark } from 'prosemirror-utils';

import { pandocAutoIdentifier } from './pandoc_id';
import { rmdChunkEngineAndLabel } from './rmd';
import { kTexFormat } from './raw';
import { findChildrenByType } from 'prosemirror-utils';
import { XRef, XRefType } from 'editor-types';


export function xrefKey(xref: XRef, xrefType?: XRefType) {
  if (xrefType === "quarto") {
    // Quarto keys are merely type-id
    if (xref.suffix) {
      return `${xref.type}-${xref.id}${xref.suffix}`;
    } else {
      return `${xref.type}-${xref.id}`;
    }
  } else {
    // headings don't include their type in the key
    const key = /^h\d$/.test(xref.type)
      ? xref.id
      : // no colon if there is no type
      xref.type.length > 0
        ? `${xref.type}:${xref.id}`
        : xref.id;

    // return key with suffix
    return key + xref.suffix;
  }
}

export function parseQuartoXRef(xref: string) {
  const dashPos = xref.indexOf('-');
  if (dashPos !== -1) {
    return {
      type: xref.substring(0, dashPos),
      id: xref.substring(dashPos + 1),
    };
  } else {
    return null;
  }
}

export function xrefPosition(doc: ProsemirrorNode, xref: string, xrefType: XRefType): number {

  if (xrefType === 'quarto') {
    return xrefPositionLocate(doc, xref, quartoXrefPositionLocators);
  } else {
    return xrefPositionLocate(doc, xref, bookdownXrefPositionLocators);
  }
}

function xrefPositionLocate(doc: ProsemirrorNode, xref: string, locators: Record<string, XRefPositionLocator>) {
  // -1 if not found
  let xrefPos = -1;

  // get type and id
  const xrefInfo = parseBookdownXRef(xref);
  if (xrefInfo) {
    const { type, id } = xrefInfo;
    const locator = locators[type];
    if (locator) {
      // if this locator finds by mark then look at doc for marks
      if (locator.markType) {
        const schema = doc.type.schema;
        const markType = schema.marks[locator.markType];
        const markedNodes = findChildrenByMark(doc, markType, true);
        markedNodes.forEach(markedNode => {
          // bail if we already found it
          if (xrefPos !== -1) {
            return;
          }
          // see if we can locate the xref
          if (locator.hasXRef(markedNode.node, id, markType)) {
            xrefPos = markedNode.pos;
          }
        });
      }
      if (xrefPos === -1 && locator.nodeTypes) {
        // otherwise recursively examine nodes to find the xref
        doc.descendants((node, pos) => {
          // bail if we already found it
          if (xrefPos !== -1) {
            return false;
          }
          // see if we can locate the xref
          if (locator.nodeTypes!.includes(node.type.name) && locator.hasXRef(node, id)) {
            xrefPos = pos;
            return false;
          }
          return true;
        });
      }
    }
  }

  // return the position
  return xrefPos;
}

function parseBookdownXRef(xref: string) {
  const colonPos = xref.indexOf(':');
  if (colonPos !== -1) {
    return {
      type: xref.substring(0, colonPos),
      id: xref.substring(colonPos + 1),
    };
  } else {
    return null;
  }
}

interface XRefPositionLocator {
  markType?: string;
  nodeTypes?: string[];
  hasXRef: (node: ProsemirrorNode, id: string, markType?: MarkType) => boolean;
}

const quartoXrefPositionLocators: { [key: string]: XRefPositionLocator } = {
  sec: quartoHeadingLocator(),
  fig: quartoFigureLocator(),
  tbl: quartoTableLocator(),
  eq: quartoMathLocator(),
  lst: quartoListingLocator(),
  thm: quartoDivLocator("thm"),
  lem: quartoDivLocator("lem"),
  cor: quartoDivLocator("cor"),
  prp: quartoDivLocator("prp"),
  cnj: quartoDivLocator("cnj"),
  def: quartoDivLocator("def"),
  exm: quartoDivLocator("exm"),
  exr: quartoDivLocator("exr"),
};


function quartoMathLocator() {
  return {
    nodeTypes: ['paragraph'],
    hasXRef: (node: ProsemirrorNode) => {
      const mathType = node.type.schema.marks.math;
      let prevNodeMath = false;
      for (let i = 0; i < node.childCount; i++) {
        const childNode = node.child(i);
        if (prevNodeMath) {
          const text = childNode.textContent;
          if (text.match(/^\s*\{#eq-.*\}/)) {
            return true;
          }
        }
        prevNodeMath = !!childNode.marks.find(
          mark => mark.type === mathType && mark.attrs.type === "DisplayMath"
        );
      }
      return false;
    },
  };
}

function quartoFigureLocator() {
  return {
    nodeTypes: ['figure'],
    hasXRef: (node: ProsemirrorNode, id: string) => {
      return node.attrs.id === `fig-${id}`;
    },
  };
}

function quartoHeadingLocator() {
  return {
    nodeTypes: ['heading'],
    hasXRef: (node: ProsemirrorNode, id: string) => {
      return node.attrs.id === `sec-${id}`;
    },
  };
}

function quartoTableLocator() {
  return {
    nodeTypes: ['table_container'],
    hasXRef: (node: ProsemirrorNode) => {
      // Look for a table which has a table caption that contains the id
      const captions = findChildrenByType(node, node.type.schema.nodes.table_caption);
      if (captions.length) {
        return !!captions[0].node.textContent.match(/\{#tbl-.*\}/);
      }
      return false;
    },
  };
}

function quartoDivLocator(type: string) {
  return {
    nodeTypes: ['div'],
    hasXRef: (node: ProsemirrorNode, id: string) => {
      return node.attrs.id === `${type}-${id}`;
    },
  };
}

function quartoListingLocator() {
  return {
    nodeTypes: ['code_block'],
    hasXRef: (node: ProsemirrorNode, id: string) => {
      const attrs = node.attrs;
      return attrs.id === `lst-${id}`;
    },
  };
}

const bookdownXrefPositionLocators: { [key: string]: XRefPositionLocator } = {
  h1: headingLocator(),
  h2: headingLocator(),
  h3: headingLocator(),
  h4: headingLocator(),
  h5: headingLocator(),
  h6: headingLocator(),
  fig: {
    nodeTypes: ['rmd_chunk'],
    hasXRef: (node: ProsemirrorNode, id: string) => rmdChunkHasXRef(node, 'r', id, /^\{.*[ ,].*fig\.cap\s*=.*\}\s*\n/m),
  },
  tab: {
    nodeTypes: ['rmd_chunk', 'table_container'],
    hasXRef: (node: ProsemirrorNode, id: string) => {
      if (node.type.name === 'rmd_chunk') {
        return rmdChunkHasXRef(node, 'r', id, /kable\s*\([\s\S]*caption/);
      } else if (node.type.name === 'table_container') {
        const caption = node.child(1);
        const match = caption.textContent.match(/^\s*\(#tab:([a-zA-Z0-9/-]+)\)\s*(.*)$/);
        return !!match && match[1].localeCompare(id, undefined, { sensitivity: 'accent' }) === 0;
      } else {
        return false;
      }
    },
  },
  eq: {
    nodeTypes: ['raw_block'],
    markType: 'math',
    hasXRef: (node: ProsemirrorNode, id: string, markType?: MarkType) => {
      // if it's not a mark then ensure it is tex format before proceeding
      if (!markType && (node.attrs.format !== kTexFormat)) {
        return false;
      }
      const match = node.textContent.match(/^.*\(\\#eq:([a-zA-Z0-9/-]+)\).*$/m);
      return !!match && match[1].localeCompare(id, undefined, { sensitivity: 'accent' }) === 0;
    },
  },
  thm: thereomLocator('theorem'),
  lem: thereomLocator('lemma'),
  cor: thereomLocator('corollary'),
  prp: thereomLocator('proposition'),
  cnj: thereomLocator('conjecture'),
  def: thereomLocator('definition'),
  exr: thereomLocator('exercise'),
};

function rmdChunkHasXRef(node: ProsemirrorNode, engine: string, label: string, pattern?: RegExp) {
  const chunk = rmdChunkEngineAndLabel(node.textContent);
  if (chunk) {
    return (
      chunk.engine.localeCompare(engine, undefined, { sensitivity: 'accent' }) === 0 &&
      chunk.label === label &&
      (!pattern || !!node.textContent.match(pattern))
    );
  } else {
    return false;
  }
}

function headingLocator() {
  return {
    nodeTypes: ['heading'],
    hasXRef: (node: ProsemirrorNode, id: string) => {
      // note we use default pandoc auto id semantics here no matter what the documnet
      // happens to use b/c our xref indexing code also does this (so only ids generated
      // using the 'standard' rules will be in the index)
      return node.attrs.id === id || pandocAutoIdentifier(node.textContent, false) === id;
    },
  };
}

function thereomLocator(engine: string) {
  return {
    nodeTypes: ['rmd_chunk'],
    hasXRef: (node: ProsemirrorNode, id: string) => {
      // look for conventional engine/label
      if (rmdChunkHasXRef(node, engine, id)) {
        return true;
      } else {
        // look for explicit label= syntax
        const match = node.textContent.match(/^\{([a-zA-Z0-9_-]+)[\s,]+label\s*=\s*['"]([^"']+)['"].*\}/);
        return !!match && match[1].localeCompare(engine, undefined, { sensitivity: 'accent' }) === 0 && match[2] === id;
      }
    },
  };
}
