/*
 * table-capsule.ts
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

import { Schema, DOMParser } from 'prosemirror-model';

import {
  PandocBlockCapsuleFilter,
  PandocBlockCapsule,
  blockCapsuleParagraphTokenHandler,
  encodedBlockCapsuleRegex,
  blockCapsuleTextHandler,
  blockCapsuleSourceWithoutPrefix,
  parsePandocBlockCapsule,
} from '../../api/pandoc_capsule';
import { ProsemirrorWriter, PandocToken, PandocTokenType } from '../../api/pandoc';
import { kHTMLFormat } from '../../api/raw';

export function tableBlockCapsuleFilter(): PandocBlockCapsuleFilter {
  const kTableBlockCapsuleType = '8EF5A772-DD63-4622-84BF-AF1995A1B2B9'.toLowerCase();
  const pagraphTokenCapsuleHandler = blockCapsuleParagraphTokenHandler(kTableBlockCapsuleType);
  const tokenRegex = encodedBlockCapsuleRegex('^', '$');

  return {
    type: kTableBlockCapsuleType,

    match: /^([\t >]*)(<table[\W\w]*?<\/table>)([ \t]*)$/gm,

    // textually enclose the capsule so that pandoc parses it as the type of block we want it to
    // (in this case we don't do anything because pandoc would have written this table as a
    // semantically standalone block)
    enclose: (capsuleText: string) => {
      return capsuleText;
    },

    // look for one of our block capsules within pandoc ast text (e.g. a code or raw block)
    // and if we find it, parse and return the original source code
    handleText: blockCapsuleTextHandler(kTableBlockCapsuleType, encodedBlockCapsuleRegex(undefined, undefined, 'gm')),

    // we are looking for a paragraph token consisting entirely of a block capsule of our type.
    // if find that then return the block capsule text
    handleToken: (tok: PandocToken) => {
      // first check for a paragraph
      const capsuleText = pagraphTokenCapsuleHandler(tok);
      if (capsuleText) {
        return capsuleText;
      }

      // now look for a definition list (which is what a table with a caption parses as)
      if (tok.t === PandocTokenType.DefinitionList) {
        if (tok.c.length === 1) {
          const definition = tok.c[0];
          if (definition[0][0].t === PandocTokenType.Str) {
            const term = definition[0][0].c as string;
            const match = term.match(tokenRegex);
            if (match) {
              const capsuleRecord = parsePandocBlockCapsule(term);
              if (capsuleRecord.type === kTableBlockCapsuleType) {
                return term;
              }
            }
          }
        }
      }

      return null;
    },

    // write the node as a table (parse the html)
    writeNode: (schema: Schema, writer: ProsemirrorWriter, capsule: PandocBlockCapsule) => {
      // remove the source prefix
      const source = blockCapsuleSourceWithoutPrefix(capsule.source, capsule.prefix);

      // fallback to write as raw html
      const writeAsRawHTML = () => {
        writer.openNode(schema.nodes.raw_block, { format: kHTMLFormat });
        writer.writeText(source);
        writer.closeNode();
      };

      // parse the table from the string
      const parser = new window.DOMParser();
      const doc = parser.parseFromString(capsule.source, 'text/html');
      if (doc.body && doc.body.firstChild instanceof HTMLTableElement) {
        // get prosemirror dom parser
        const prosemirrorDomParser = DOMParser.fromSchema(schema);

        // get unparsed (by prosemirror) table
        const unparsedTable = doc.body.firstChild;

        // ensure that table cells all have content
        const ensureCellContent = (tag: string) => {
          const cells = unparsedTable.getElementsByTagName(tag);
          for (let i = 0; i < cells.length; i++) {
            const cell = cells.item(i)!;
            if (cell.children.length === 0) {
              cell.append(window.document.createElement('p'));
            }
          }
        };
        ensureCellContent('td');
        ensureCellContent('th');

        // extract caption element
        let captionElement: HTMLTableCaptionElement | null = null;
        const captionCollection = unparsedTable.getElementsByTagName('caption');
        if (captionCollection.length) {
          captionElement = captionCollection.item(0);
          if (captionElement) {
            captionElement.remove();
          }
        }

        // determine caption (either empty or parsed from element)
        let caption = schema.nodes.table_caption.create({ inactive: true });
        if (captionElement) {
          const captionSlice = prosemirrorDomParser.parseSlice(captionElement);
          caption = schema.nodes.table_caption.createAndFill({ inactive: false }, captionSlice.content)!;
        }

        // parse the prosemirror table element
        const slice = prosemirrorDomParser.parseSlice(doc.body);
        if (slice.content.firstChild && slice.content.firstChild.type === schema.nodes.table) {
          const table = slice.content.firstChild;
          writer.addNode(schema.nodes.table_container, {}, [table, caption]);
        } else {
          writeAsRawHTML();
        }

        // fallback to writing as raw_html (round-trip unmodified)
      } else {
        writeAsRawHTML();
      }
    },
  };
}
