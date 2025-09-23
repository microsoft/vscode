/*
 * button.tsx
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

export interface LinkButtonProps extends WidgetProps {
  text: string;
  onClick: () => void;
  title?: string;
  maxWidth?: number;
}

export const LinkButton: React.FC<LinkButtonProps> = props => {
  const className = ['pm-link', 'pm-link-text-color'].concat(props.classes || []).join(' ');

  const style: React.CSSProperties = {
    ...props.style,
    maxWidth: props.maxWidth,
  };

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    props.onClick();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.keyCode === 32) {
      e.preventDefault();
      props.onClick();
    }
  };

  return (
    <a
      href={"#0"}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={onKeyDown}
      title={props.title || props.text}
      className={className}
      style={style}
    >
      {props.text}
    </a>
  );
};

export interface ImageButtonProps extends WidgetProps {
  title: string;
  image: string;
  tabIndex?: number;
  onClick?: () => void;
}

export const ImageButton = React.forwardRef<HTMLButtonElement, ImageButtonProps>((props: ImageButtonProps, ref) => {
  const className = ['pm-image-button'].concat(props.classes || []).join(' ');
  const onClick = (e: React.MouseEvent) => {
    if (props.onClick) {
      e.preventDefault();
      props.onClick();
    }
  };
  return (
    <button
      onClick={onClick}
      title={props.title}
      className={className}
      style={props.style}
      ref={ref}
      tabIndex={props.tabIndex}
    >
      <img src={props.image} alt={props.title} draggable="false"/>
    </button>
  );
});

export interface TextButtonProps extends WidgetProps {
  title: string;
  onClick?: () => void;
  tabIndex?: number;
  disabled?: boolean;
}

export const TextButton = React.forwardRef<HTMLButtonElement, TextButtonProps>((props: TextButtonProps, ref) => {
  const className = props.classes?.join(' ');
  const onClick = (e: React.MouseEvent) => {
    if (props.onClick) {
      e.preventDefault();
      props.onClick();
    }
  };
  return (
    <button
      onClick={onClick}
      type="button"
      className={className}
      style={props.style}
      ref={ref}
      tabIndex={props.tabIndex}
      disabled={props.disabled}
    >
      {props.title}
    </button>
  );
});

export interface OutlineButtonProps extends WidgetProps {
  title: string;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tabIndex?: number;
}

export const OutlineButton = React.forwardRef<HTMLButtonElement, OutlineButtonProps>(
  (props: OutlineButtonProps, ref) => {
    const className = ['pm-outline-button', 'pm-input-button', 'pm-input-outline-button']
      .concat(props.classes || [])
      .join(' ');
    return (
      <button
        onClick={props.onClick}
        type="button"
        className={className}
        style={props.style}
        ref={ref}
        tabIndex={props.tabIndex}
      >
        {props.title}
      </button>
    );
  },
);
