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

import { Fragment, Mark, Schema } from 'prosemirror-model';
import { PluginKey, Plugin } from 'prosemirror-state';

import { tryDecodeUri } from 'core';

import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { PandocToken, PandocOutput, PandocTokenType } from '../../api/pandoc';
import { kShortcodePattern } from '../../api/shortcode';

import {
  pandocAttrSpec,
  pandocAttrParseDom,
  pandocAttrToDomAttr,
  pandocAttrReadAST,
  PandocAttr,
} from '../../api/pandoc_attr';
import { Extension, ExtensionContext } from '../../api/extension';
import { kLinkTarget, kLinkTargetUrl, kLinkTargetTitle, kLinkAttr, kLinkChildren, linkPasteHandler } from '../../api/link';
import { hasShortcutHeadingLinks } from '../../api/pandoc_format';

import { linkCommand, removeLinkCommand, linkOmniInsert } from './link-command';
import { linkInputRules } from './link-input';
import { linkHeadingsPostprocessor, syncHeadingLinksAppendTransaction } from './link-headings';
import { linkPopupPlugin } from './link-popup';

import './link-styles.css';

const extension = (context: ExtensionContext): Extension => {
  const { pandocExtensions, ui, navigation } = context;

  const capabilities = {
    headings: hasShortcutHeadingLinks(pandocExtensions),
    attributes: pandocExtensions.link_attributes,
    text: true,
  };
  const linkAttr = pandocExtensions.link_attributes;
  const autoLink = pandocExtensions.autolink_bare_uris;
  const citations = pandocExtensions.citations;

  const excludes = citations ? { excludes: 'cite_id' } : {};

  return {
    marks: [
      {
        name: 'link',
        spec: {
          attrs: {
            href: {},
            heading: { default: null },
            title: { default: null },
            ...(linkAttr ? pandocAttrSpec : {}),
            clipboard: { default: false }
          },
          inclusive: false,
          ...excludes,
          parseDOM: [
            {
              tag: 'a[href]',
              getAttrs(dom: Node | string) {
                const el = dom as Element;
                const attrs: { [key: string]: string | null } = {
                  href: el.getAttribute('href'),
                  title: el.getAttribute('title'),
                  heading: el.getAttribute('data-heading'),
                };
                return {
                  ...attrs,
                  ...(linkAttr ? pandocAttrParseDom(el, attrs) : {}),
                };
              },
            },
          ],
          toDOM(mark: Mark) {
            const linkClasses = 'pm-link pm-link-text-color';

            let extraAttr: Record<string,unknown> = {};
            if (linkAttr) {
              extraAttr = pandocAttrToDomAttr({
                ...mark.attrs,
                classes: [...mark.attrs.classes, linkClasses],
              });
            } else {
              extraAttr = { class: linkClasses };
            }

            return [
              'a',
              {
                href: mark.attrs.clipboard ? mark.attrs.href : '#0',
                title: mark.attrs.title,
                'data-heading': mark.attrs.heading,
                ...extraAttr,
              },
            ];
          },
        },
        pandoc: {
          readers: [
            {
              token: PandocTokenType.Link,
              mark: 'link',
              getAttrs: (tok: PandocToken) => {
                const target = tok.c[kLinkTarget];

                // decode href if this is a shortcode
                let href = target[kLinkTargetUrl] as string;
                const decodedRef = tryDecodeUri(href)
                if (decodedRef.match(kShortcodePattern)) {
                  href = decodedRef;
                }

                return {
                  href,
                  title: target[kLinkTargetTitle] || null,
                  ...(linkAttr ? pandocAttrReadAST(tok, kLinkAttr) : {}),
                };
              },
              getChildren: (tok: PandocToken) => {
                const children = tok.c[kLinkChildren];
                if (children.length > 0) {
                  return children;
                } else {
                  return [{
                    t: PandocTokenType.Space,
                  }]
                }
              },

              postprocessor: hasShortcutHeadingLinks(pandocExtensions) ? linkHeadingsPostprocessor : undefined,
            },
          ],

          writer: {
            priority: 11,
            write: (output: PandocOutput, mark: Mark, parent: Fragment) => {
              if (mark.attrs.heading) {
                output.writeRawMarkdown('[');
                output.writeInlines(parent);
                output.writeRawMarkdown(']');
              } else {
                output.writeLink(
                  mark.attrs.href,
                  mark.attrs.title,
                  linkAttr ? (mark.attrs as PandocAttr) : null,
                  () => {
                    output.writeInlines(parent);
                  },
                );
              }
            },
          },
        },
      },
    ],

    commands: (schema: Schema) => {
      return [
        new ProsemirrorCommand(
          EditorCommandId.Link,
          ['Mod-k'],
          linkCommand(schema.marks.link, ui.dialogs.editLink, capabilities),
          linkOmniInsert(ui),
        ),
        new ProsemirrorCommand(EditorCommandId.RemoveLink, [], removeLinkCommand(schema.marks.link)),
      ];
    },

    inputRules: linkInputRules(autoLink),

    appendTransaction: () =>
      pandocExtensions.implicit_header_references ? [syncHeadingLinksAppendTransaction()] : [],

    plugins: (schema: Schema) => {
      const plugins = [
        linkPopupPlugin(
          schema,
          ui,
          navigation,
          linkCommand(schema.marks.link, ui.dialogs.editLink, capabilities),
          removeLinkCommand(schema.marks.link),
        )
      ];
      if (autoLink) {
        plugins.push(
          new Plugin({
            key: new PluginKey('link-auto'),
            props: {
              transformPasted: linkPasteHandler(schema),
            }
          }),
        );
      }
      return plugins;
    },
  };
};

export default extension;
