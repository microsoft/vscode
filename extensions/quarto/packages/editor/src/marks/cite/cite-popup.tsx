/*
 * cite-popup.tsx
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

import { Schema } from 'prosemirror-model';
import { PluginKey } from 'prosemirror-state';
import { DecorationSet, EditorView } from 'prosemirror-view';

import React from 'react';

import { EditorUI } from '../../api/ui-types';
import { textPopupDecorationPlugin, TextPopupTarget } from '../../api/text-popup';
import { WidgetProps } from '../../api/widgets/react';
import { Popup } from '../../api/widgets/popup';
import { BibliographyManager } from '../../api/bibliography/bibliography';

import './cite-popup.css';
import { urlForCitation } from '../../api/cite';
import { cslFromDoc } from '../../api/csl';
import { EditorServer } from 'editor-types';

const kMaxWidth = 400; // also in cite-popup.css

export function citePopupPlugin(schema: Schema, ui: EditorUI, bibMgr: BibliographyManager, server: EditorServer) {
  return textPopupDecorationPlugin({
    key: new PluginKey<DecorationSet>('cite-popup'),
    markType: schema.marks.cite_id,
    maxWidth: kMaxWidth,
    dismissOnEdit: true,
    makeLinksAccessible: true,
    createPopup: async (view: EditorView, target: TextPopupTarget, style: React.CSSProperties) => {
      await bibMgr.loadLocal(ui, view.state.doc);

      const citeId = target.text.replace(/^-@|^@/, '');

      // See if this will be handled by Xref
      let isXRef = false;
      const docPath = ui.context.getDocumentPath();
      if (docPath) {
        const xrefs = await server.xref.quartoXrefForId(docPath, citeId);
        isXRef = xrefs.refs.length > 0;
      }

      if (!isXRef) {
        const csl = cslFromDoc(view.state.doc);
        const source = bibMgr.findIdInLocalBibliography(citeId);

        if (source) {
          const previewHtml = await server.pandoc.citationHTML(
            ui.context.getDocumentPath(),
            JSON.stringify([source]),
            csl || null,
          );
          const finalHtml = ensureSafeLinkIsPresent(previewHtml, () => {
            const url = urlForCitation(source);
            if (url) {
              return {
                text: ui.context.translateText('[Link]'),
                url,
              };
            } else {
              return undefined;
            }
          });

          return <CitePopup previewHtml={finalHtml} style={style} />;
        }
      }
      return null;
    },
    specKey: (target: TextPopupTarget) => {
      return `cite:${target.text}`;
    },
  });
}

const kCiteHangingIndentClass = 'hanging-indent';
const kCiteLinkClassName = 'pm-cite-popup-link';

function ensureSafeLinkIsPresent(html: string, getLinkData: () => { text: string; url: string } | undefined) {
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // remove id, class, and role from main div
  const rootDiv = doc.body.getElementsByClassName('references');
  if (rootDiv.length > 0) {
    const classNames = rootDiv[0].getAttribute('class');
    const hasHangingIndent = classNames?.match(`(^|\\s)${kCiteHangingIndentClass}($|\\s)`);

    rootDiv[0].removeAttribute('id');
    rootDiv[0].removeAttribute('role');

    if (hasHangingIndent && hasHangingIndent.length > 0) {
      rootDiv[0].setAttribute('class', kCiteHangingIndentClass);
    } else {
      rootDiv[0].removeAttribute('class');
    }
  }

  const linkElements = doc.body.getElementsByTagName('a');
  if (linkElements.length === 0) {
    const linkData = getLinkData();

    // There aren't any links, we should append one
    // (If links are present, we assume that we shouldn't add another)
    const paragraphs = doc.body.getElementsByTagName('p');
    if (paragraphs.length === 1 && linkData) {
      // The paragraph containing the formatted source
      const paragraph = paragraphs[0];

      // Create a link to append
      const linkElement = doc.createElement('a');
      linkElement.innerText = linkData.text;
      linkElement.setAttribute('href', linkData.url);
      linkElement.setAttribute('class', `${kCiteLinkClassName} pm-link-text-color`);
      setLinkTarget(linkElement);

      // Append the link to the formatted source
      paragraph.appendChild(linkElement);
    }
  } else {
    // There are links, ensure all of them have appropriate target information
    // tslint:disable-next-line: prefer-for-of
    for (let i = 0; i < linkElements.length; i++) {
      linkElements[i].setAttribute('class', `pm-link-text-color`);
      setLinkTarget(linkElements[i]);
    }
  }

  // Return the HTML omitting CR/LF - CR
  return doc.body.innerHTML.replace(/\r?\n|\r/g, '');
}

function setLinkTarget(linkElement: HTMLAnchorElement) {
  linkElement.setAttribute('target', '_blank');
  linkElement.setAttribute('rel', 'noopener noreferrer');
}

interface CitePopupProps extends WidgetProps {
  previewHtml: string;
}

const CitePopup: React.FC<CitePopupProps> = props => {
  return (
    <Popup classes={['pm-cite-popup']} style={props.style}>
      <div className="pm-cite-popup-preview">
        <div dangerouslySetInnerHTML={{ __html: props.previewHtml || '' }} />
      </div>
    </Popup>
  );
};
