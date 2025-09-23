/*
 * rmd.ts
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

import { Node as ProsemirrorNode, NodeType } from 'prosemirror-model';
import { EditorState, Transaction } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';

import {
  findParentNodeOfType,
  findChildrenByType,
  findChildren,
  findChildrenByMark,
  setTextSelection,
  findParentNode,
} from 'prosemirror-utils';

import { getMarkRange } from './mark';
import { precedingListItemInsertPos, precedingListItemInsert } from './list';
import { toggleBlockType } from './command';
import { selectionIsBodyTopLevel, selectionWithinLastBodyParagraph } from './selection';
import { uuidv4 } from './util';

export interface EditorRmdChunk {
  lang: string;
  meta: string;
  code: string;
  delimiter: string;
}

export type ExecuteRmdChunkFn = (chunk: EditorRmdChunk) => void;

export function canInsertRmdChunk(state: EditorState) {
  // must either be at the body top level, within a list item, within a div, or within a
  // blockquote (and never within a table)
  const schema = state.schema;
  const within = (nodeType: NodeType) => !!findParentNodeOfType(nodeType)(state.selection);
  if (within(schema.nodes.table)) {
    return false;
  }
  if (
    !selectionIsBodyTopLevel(state.selection) &&
    !within(schema.nodes.list_item) &&
    !within(schema.nodes.blockquote) &&
    schema.nodes.div && !within(schema.nodes.div)
  ) {
    return false;
  }

  return true;
}

export function insertRmdChunk(chunkPlaceholder: string) {
  return (state: EditorState, dispatch?: (tr: Transaction) => void) => {
    const schema = state.schema;

    if (
      !(state.selection instanceof GapCursor) &&
      !toggleBlockType(schema.nodes.rmd_chunk, schema.nodes.paragraph)(state) &&
      !precedingListItemInsertPos(state.doc, state.selection)
    ) {
      return false;
    }

    // must either be at the body top level, within a list item, within a div, or within a
    // blockquote (and never within a table)
    if (!canInsertRmdChunk(state)) {
      return false;
    }

    if (dispatch) {
      // perform insert
      const tr = state.tr;
      const rmdText = schema.text(chunkPlaceholder);
      const rmdNode = schema.nodes.rmd_chunk.create({ navigation_id: uuidv4() }, rmdText);
      const prevListItemPos = precedingListItemInsertPos(tr.doc, tr.selection);
      if (prevListItemPos) {
        precedingListItemInsert(tr, prevListItemPos, rmdNode);
      } else {
        const emptyNode = findParentNode(node => node.type === state.schema.nodes.paragraph && node.childCount === 0)(tr.selection);
        if (emptyNode && selectionWithinLastBodyParagraph(tr.selection)) {
          tr.insert(tr.selection.from-1, rmdNode);
        } else {
          tr.replaceSelectionWith(rmdNode);
        }
        setTextSelection(tr.selection.from - 2)(tr);
      }

      dispatch(tr);
    }

    return true;
  };
}

export function activeRmdChunk(state: EditorState): EditorRmdChunk | null {
  if (state.schema.nodes.rmd_chunk) {
    const rmdNode = findParentNodeOfType(state.schema.nodes.rmd_chunk)(state.selection);
    if (rmdNode) {
      return rmdChunk(rmdNode.node.textContent);
    }
  }
  return null;
}

export function previousExecutableRmdChunks(state: EditorState, pos = state.selection.from): EditorRmdChunk[] {
  const activeChunk = activeRmdChunk(state);
  const lang = activeChunk ? activeChunk.lang : 'r';
  const kEvalFalseRegEx = /eval\s*=\s*F(?:ALSE)?/;
  return previousRmdChunks(state, pos, chunk => {
    return (
      chunk.lang.localeCompare(lang, undefined, { sensitivity: 'accent' }) === 0 && !kEvalFalseRegEx.test(chunk.meta)
    );
  });
}

export function previousRmdChunks(state: EditorState, pos: number, filter?: (chunk: EditorRmdChunk) => boolean) {
  // chunks to return
  const chunks: EditorRmdChunk[] = [];

  // find all chunks in the document and return ones before the position that pass the specified filter
  const schema = state.schema;
  const rmdChunkNodes = findChildrenByType(state.doc, schema.nodes.rmd_chunk);
  for (const rmdChunkNode of rmdChunkNodes) {
    if (rmdChunkNode.pos + rmdChunkNode.node.nodeSize > pos) {
      break;
    }
    const chunk = rmdChunk(rmdChunkNode.node.textContent);
    if (chunk && (!filter || filter(chunk))) {
      chunks.push(chunk);
    }
  }

  // return chunks
  return chunks;
}

export function rmdChunk(code: string): EditorRmdChunk | null {
  let lines = code.trimLeft().split('\n');
  if (lines.length > 0) {
    const meta = lines[0].replace(/^[\s`{]*(.*?)\}?\s*$/, '$1');
    const matchLang = meta.match(/[\w_-]+/);
    const lang = matchLang ? matchLang[0] : '';

    const isContainerChunk = ["verbatim", "asis", "comment"].includes(lang);

    // for container chunks, delimiter is one backtick greater than the most 
    // ticks we've found starting a line (otherwise is ```)
    const delimiter = isContainerChunk ? lines.reduce((ticks: string, line: string) => {
      const match = line.match(/^```+/);
      if (match && (match[0].length >= ticks.length)) {
        ticks = match[0] + "`";
      }
      return ticks;
    }, "```") : "```";

    // filter out stray ``` if this isn't a container chunk
    if (!isContainerChunk) {
       // remove lines, other than the first, which are chunk delimiters (start
      // with ```). these are generally unintended but can be accidentally
      // introduced by e.g., pasting a chunk with its delimiters into visual mode,
      // where delimiters are implicit. if these lines aren't removed, they create
      // nested chunks that break parsing and can corrupt the document (see case
      // 8452)
      lines = lines.filter((line, idx) => {
        if (idx === 0) {
          return true;
        }
        return !line.startsWith("```");
      });
    }
   

    // a completely empty chunk (no second line) should be returned
    // as such. if it's not completely empty then append a newline
    // to the result of split (so that the chunk ends w/ a newline)
    const chunkCode = lines.length > 1 ? lines.slice(1).join('\n') + '\n' : '';

    return {
      lang,
      meta,
      code: chunkCode,
      delimiter
    };
  } else {
    return null;
  }
}

export function mergeRmdChunks(chunks: EditorRmdChunk[]) {
  if (chunks.length) {
    const merged = {
      lang: chunks[0].lang,
      meta: '',
      code: '',
    };
    chunks.forEach(chunk => (merged.code += chunk.code + '\n'));
    return merged;
  } else {
    return null;
  }
}

/**
 * Attempts to extract the engine name and label from a chunk header.
 * 
 * @param text The chunk header, e.g. {r foo}
 * @returns An object with `engine` and `label` properties, or null.
 */
export function rmdChunkEngineAndLabel(text: string) {

  // Match the engine and (maybe the) label with a regex
  const match = text.match(/^\{([a-zA-Z0-9_-]+)[\s,]*([a-zA-Z0-9/._='"-]*)/);
  
  if (match) {
    // The first capturing group is the engine
    const engine = match[1];

    // The second capturing group in the regex matches the first string after
    // the engine. This might be: 
    // - a label (e.g., {r label})
    // - a chunk option (e.g., {r echo=FALSE}). If it has an =, presume that it's an option.
    // - empty
    if (match[2].length && match[2].indexOf("=") == -1) {
      return {
        engine: engine,
        label: match[2],
      };
    }

    // Finally, look for label in #| comments
    // 
    // ```{r}
    // #| label: label
    // 
    for (const line of text.split("\n")) {
      const labelMatch = line.match(/^#\|\s*label:\s+(.*)$/);
      if (labelMatch) {
        return {
          engine: engine,
          label: labelMatch[1],
        };
      }
    }
  }

  return null;
}

export function haveTableCellsWithInlineRcode(doc: ProsemirrorNode) {
  const schema = doc.type.schema;
  const haveRCode = !!doc.type.schema.nodes.rmd_chunk;
  if (haveRCode) {
    const isTableCell = (node: ProsemirrorNode) =>
      node.type === schema.nodes.table_cell || node.type === schema.nodes.table_header;
    return findChildren(doc, isTableCell).some(cell => {
      if (doc.rangeHasMark(cell.pos, cell.pos + cell.node.nodeSize, schema.marks.code)) {
        const markedNodes = findChildrenByMark(cell.node, schema.marks.code, true);
        return markedNodes.some(markedNode => {
          const from = cell.pos + 1 + markedNode.pos;
          const markedRange = getMarkRange(doc.resolve(from), schema.marks.code);
          if (markedRange) {
            const text = doc.textBetween(markedRange.from, markedRange.to);
            return /^r[ #].+$/.test(text);
          } else {
            return false;
          }
        });
      } else {
        return false;
      }
    });
  } else {
    return false;
  }
}
