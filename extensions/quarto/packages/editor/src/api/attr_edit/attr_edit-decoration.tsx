/*
 * attr_edit-decoration.tsx
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

import { NodeSelection } from 'prosemirror-state';
import { EditorView, Decoration } from 'prosemirror-view';
import { setTextSelection } from 'prosemirror-utils';

import * as React from 'react';

import { EditorUI } from '../ui-types';
import { ImageButton } from '../../api/widgets/button';
import { CommandFn } from '../../api/command';
import { WidgetProps, reactRenderForEditorView } from '../../api/widgets/react';

import { selectionIsWithinRange } from '../../api/selection';
import './attr_edit-decoration.css';
import { GapCursor } from 'prosemirror-gapcursor';

export const kEditAttrShortcut = 'F4';

export interface AttrEditDecorationOptions {
  pos: number;
  tags: string[];
  editFn: CommandFn;
  ui: EditorUI;
  offset?: { top: number; right: number };
  preferHidden?: boolean;
  noSelectOnClick?: boolean;
}

export function attrEditDecorationWidget(options: AttrEditDecorationOptions) {
  return Decoration.widget(
    options.pos,
    (view: EditorView, getPos: () => number | undefined) => {
      // does the offsetParent have any right padding we need to offset for?
      // we normally use right: 5px for positioning but that is relative to
      // the edge of the offsetParent. However, some offset parents (e.g. a
      // td or a nested div) have their own internal padding to account for
      // so we look for it here
      let rightPaddingOffset = 0;
      const pos = getPos();
      if (pos !== undefined) {
        const attrsNode = view.nodeDOM(pos);
        if (attrsNode) {
          const attrsEl = attrsNode as HTMLElement;
          if (attrsEl.offsetParent) {
            const offsetParentStyle = window.getComputedStyle(attrsEl.offsetParent);
            rightPaddingOffset = -parseInt(offsetParentStyle.paddingRight!, 10) || 0;
          }
        }
      }

      // cacculate position offsets
      const baseOffset = options.offset || { top: 0, right: 0 };
      const xOffset = baseOffset.right + rightPaddingOffset;
      const yOffset = baseOffset.top + 6;
      const cssProps: React.CSSProperties = {
        transform: `translate(${xOffset}px,-${yOffset}px)`,
      };

      // create attr edit react component
      const attrEdit = (
        <AttrEditDecoration
          tags={options.tags}
          editFn={options.editFn}
          getPos={getPos}
          view={view}
          ui={options.ui}
          style={cssProps}
          noSelectOnClick={options.noSelectOnClick}
        />
      );

      // create decorator and render attr editor into it
      const decoration = window.document.createElement('div');
      reactRenderForEditorView(attrEdit, decoration, view);

      return decoration;
    },
    {
      ignoreSelection: true,
      stopEvent: () => {
        return true;
      },
      preferHidden: options.preferHidden
    },
  );
}

interface AttrEditDecorationProps extends WidgetProps {
  tags: string[];
  editFn: CommandFn;
  getPos: () => number | undefined;
  view: EditorView;
  ui: EditorUI;
  noSelectOnClick?: boolean;
}

const AttrEditDecoration: React.FC<AttrEditDecorationProps> = props => {
  const buttonTitle = `${props.ui.context.translateText('Edit Attributes')} (${kEditAttrShortcut})`;

  const onClick = () => {
    // set selection before invoking function
    if (props.view.dispatch && !props.noSelectOnClick) {
      const pos = props.getPos();
      if (pos !== undefined) {
        const node = props.view.state.doc.nodeAt(pos);
        if (node) {
          const tr = props.view.state.tr;
          if (node.type.spec.selectable) {
            tr.setSelection(new NodeSelection(tr.doc.resolve(pos)));
          } else if (!selectionIsWithinRange(tr.selection, { from: pos, to: pos + node.nodeSize })) {
            setTextSelection(pos + 1)(tr);
          } else if (tr.selection instanceof NodeSelection) {
            const cursor = new GapCursor(tr.doc.resolve(pos+1));
            tr.setSelection(cursor);
          }
          props.view.dispatch(tr);
        }
      }
     
    }
    
    // perform edit
    props.editFn(props.view.state, props.view.dispatch, props.view);
  };

  return (
    <div className="pm-attr-edit-decoration pm-surface-widget-text-color " style={props.style}>
      {props.tags.length
        ? props.tags.map(tag => {
            return (
              <span
                key={tag}
                className="attr-edit-tag attr-edit-widget pm-block-border-color pm-border-background-color"
                onClick={onClick}
              >
                {tag}
              </span>
            );
          })
        : null}
      {props.editFn(props.view.state) ? (
        <ImageButton
          classes={['attr-edit-button']}
          image={props.ui.prefs.darkMode() ? props.ui.images.properties_deco_dark! : props.ui.images.properties_deco!}
          title={buttonTitle}
          tabIndex={-1}
          onClick={onClick}
        />
      ) : null}
    </div>
  );
};
