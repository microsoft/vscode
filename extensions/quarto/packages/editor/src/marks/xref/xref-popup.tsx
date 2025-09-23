/*
 * xref-popup.tsx
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
import { xrefKey } from '../../api/xref';
import { LinkButton } from '../../api/widgets/button';

import './xref-popup.css';
import { EditorServer, XRef } from 'editor-types';

const kMaxWidth = 350; // also in xref-popup.css

export function xrefPopupPlugin(schema: Schema, ui: EditorUI, server: EditorServer) {
  return textPopupDecorationPlugin({
    key: new PluginKey<DecorationSet>('xref-popup'),
    markType: schema.marks.xref,
    maxWidth: kMaxWidth,
    dismissOnEdit: true,
    createPopup: async (_view: EditorView, target: TextPopupTarget, style: React.CSSProperties) => {
      // lookup xref on server
      const docPath = ui.context.getDocumentPath();
      if (docPath) {
        const kXRefRegEx = /^@ref\(([A-Za-z0-9:-]*)\)$/;
        const match = target.text.match(kXRefRegEx);
        if (match && match[1].length) {
          await ui.context.withSavedDocument();
          const xrefs = await server.xref.xrefForId(docPath, match[1]);
          if (xrefs.refs.length) {
            const xref = xrefs.refs[0];

            // click handler
            const onClick = () => {
              const file = xrefs.baseDir + '/' + xref.file;
              ui.display.navigateToXRef(file, xref);
            };

            return <XRefPopup xref={xref} onClick={onClick} style={style} />;
          }
        }
      }
      return null;
    },
    specKey: (target: TextPopupTarget) => {
      return `xref:${target.text}`;
    },
  });
}

interface XRefPopupProps extends WidgetProps {
  xref: XRef;
  onClick: VoidFunction;
  style: React.CSSProperties;
}

const XRefPopup: React.FC<XRefPopupProps> = props => {
  return (
    <Popup classes={['pm-xref-popup']} style={props.style}>
      <div>
        <LinkButton
          text={xrefKey(props.xref)}
          onClick={props.onClick}
          maxWidth={kMaxWidth - 20}
          classes={['pm-xref-popup-key pm-fixedwidth-font']}
        />
      </div>
      <div className="pm-xref-popup-file">{props.xref.file}</div>
    </Popup>
  );
};
