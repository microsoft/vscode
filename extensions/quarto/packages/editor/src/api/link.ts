/*
 * link.ts
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

import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { findChildren, findChildrenByType } from 'prosemirror-utils';

import { LinkType, LinkCapabilities, LinkTargets, LinkHeadingTarget } from 'editor-types'
import { markPasteHandler } from './clipboard';

export const kLinkTargetUrl = 0;
export const kLinkTargetTitle = 1;

export const kLinkAttr = 0;
export const kLinkChildren = 1;
export const kLinkTarget = 2;

export { LinkType };

export type { LinkCapabilities, LinkTargets, LinkHeadingTarget  };

export const kLinkRegex = /(?:<)?([a-z]+:\/\/[^\s>]+)(?:>)?/;

export function isLink(text: string) {
  return kLinkRegex.test(text);
}

export async function linkTargets(doc: ProsemirrorNode) {
  const ids = findChildren(doc, node => !!node.attrs.id).map(value => value.node.attrs.id);

  const headings = findChildrenByType(doc, doc.type.schema.nodes.heading).map(heading => ({
    level: heading.node.attrs.level,
    text: heading.node.textContent,
  }));

  return {
    ids,
    headings,
  };
}

export function linkPasteHandler(schema: Schema) {
  return markPasteHandler(
    new RegExp(kLinkRegex.source, 'g'),
    schema.marks.link, 
    url => ({ href: url })
  )
}


