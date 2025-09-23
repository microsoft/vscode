/*
 * completion.tsx
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

import React from 'react';

import { WidgetProps } from './react';

import './completion.css';

export interface CompletionItemViewProps extends WidgetProps {
  width: number;
  image?: string;
  imageAdornment?: string;
  title: string;
  detail?: string;
  subTitle: string;
  htmlTitle?: boolean;
}

export const CompletionItemView: React.FC<CompletionItemViewProps> = props => {
  const className = ['pm-completion-item'].concat(props.classes || []).join(' ');
  const style: React.CSSProperties = {
    width: props.width + 'px',
    ...props.style,
  };

  return (
    <div className={className} style={style}>
      <div className={'pm-completion-item-type'}>
        {props.imageAdornment ? (
          <img
            className={'pm-completion-image-adorn pm-block-border-color pm-background-color'}
            src={props.imageAdornment}
            draggable="false"
          />
        ) : (
          undefined
        )}
        <img className={'pm-completion-item-icon pm-block-border-color'} src={props.image} draggable="false"/>
      </div>
      <div className={'pm-completion-item-summary'} style={{ width: props.width - 40 - 36 + 'px' }}>
        <div className={'pm-completion-item-id'}>
          <div className={'pm-completion-item-primary pm-completion-item-title pm-fixedwidth-font'}>{props.title}</div>
          <div className={'pm-completion-item-primary pm-completion-item-detail'}>{props.detail}</div>
        </div>
        {props.htmlTitle ? (
          <div className={'pm-completion-item-subTitle'} dangerouslySetInnerHTML={{ __html: props.subTitle || '' }} />
        ) : (
          <div className={'pm-completion-item-subTitle'}>{props.subTitle}</div>
        )}
      </div>
    </div>
  );
};
