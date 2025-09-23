/*
 * link-headings.ts
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

import { Node as ProsemirrorNode } from 'prosemirror-model';
import { findChildrenByType, findChildrenByMark } from 'prosemirror-utils';

import { getMarkRange, getMarkAttrs } from '../../api/mark';
import { Transaction } from 'prosemirror-state';
import { equalsIgnoreCase } from 'core';

// detect links to headings within the doc read from pandoc and update the doc
// to note those headings in the link attributes
export function linkHeadingsPostprocessor(doc: ProsemirrorNode) {
  // alias schema
  const schema = doc.type.schema;

  // start with a list of all headings
  const headings = findChildrenByType(doc, schema.nodes.heading);

  // find link marks
  findChildrenByMark(doc, schema.marks.link).forEach(link => {
    const markRange = getMarkRange(doc.resolve(link.pos), schema.marks.link);
    if (markRange) {
      const attrs = getMarkAttrs(doc, markRange, schema.marks.link);
      const linkText = doc.textBetween(markRange.from, markRange.to);
      const matchedHeading = headings.find(heading => {
        return equalsIgnoreCase(heading.node.textContent, linkText) && !attrs.title && attrs.href === '#';
      });
      if (matchedHeading) {
        // point the link mark at this heading by name
        doc.nodesBetween(markRange.from, markRange.to, node => {
          const linkMark = node.marks.find(m => m.type === schema.marks.link);
          if (linkMark) {
            // this violates the 'readonly' attribute of linkMark.attrs but this
            // isn't actually a prposemirror node but rather the node we read
            // from the pandoc ast -- cast away the readonly
            (linkMark.attrs as Record<string,unknown>).heading = matchedHeading.node.textContent;
          }
        });

        // update the heading to indicate it has a named link to it
        // see comment above re: cast
        (matchedHeading.node.attrs as Record<string,unknown>).link = linkText;
      }
    }
  });

  // return doc
  return doc;
}

export function syncHeadingLinksAppendTransaction() {
  return {
    name: 'sync-heading-links',
    nodeFilter: (node: ProsemirrorNode) =>
      (node.type === node.type.schema.nodes.heading) || !!node.type.schema.marks.link.isInSet(node.marks),
    append: (tr: Transaction) => {
      // alias schema
      const schema = tr.doc.type.schema;

      // fix links to be in sync with their text
      const links = findChildrenByMark(tr.doc, schema.marks.link);
      links.forEach(link => {
        const linkPos = tr.mapping.map(link.pos);
        const range = getMarkRange(tr.doc.resolve(linkPos), schema.marks.link);
        if (range) {
          const attrs = getMarkAttrs(tr.doc, range, schema.marks.link);
          const linkText = tr.doc.textBetween(range.from, range.to);
          if (attrs.heading && !equalsIgnoreCase(attrs.heading, linkText)) {
            tr.removeMark(range.from, range.to, schema.marks.link);
            tr.addMark(range.from, range.to, schema.marks.link.create({ ...attrs, heading: linkText }));
          }
        }
      });

      // if a heading has deviated from it's link, then update the link
      findChildrenByType(tr.doc, schema.nodes.heading).forEach(heading => {
        const headingPos = tr.mapping.map(heading.pos);
        const headingText = heading.node.textContent;
        const headingLink = heading.node.attrs.link;

        if (headingLink && !equalsIgnoreCase(headingLink, headingText) && headingText.length > 0) {
          // set the heading link text
          tr.setNodeMarkup(headingPos, schema.nodes.heading, {
            ...heading.node.attrs,
            link: headingText,
          });

          // find links that don't match and update them
          findChildrenByMark(tr.doc, schema.marks.link).forEach(link => {
            const linkPos = tr.mapping.map(link.pos);
            const range = getMarkRange(tr.doc.resolve(linkPos), schema.marks.link);
            if (range) {
              const attrs = getMarkAttrs(tr.doc, range, schema.marks.link);
              if (equalsIgnoreCase(attrs.heading, headingLink)) {
                tr.insertText(headingText, range.from, range.to);
                tr.addMark(
                  range.from,
                  range.from + headingText.length,
                  schema.marks.link.create({ ...attrs, heading: headingText }),
                );
              }
            }
          });
        }
      });
    },
  };
}
