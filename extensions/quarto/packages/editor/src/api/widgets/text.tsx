/*
 * text.tsx
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

import React, { ChangeEventHandler, KeyboardEventHandler, FocusEventHandler, ClipboardEventHandler } from 'react';

import { WidgetProps } from './react';

import './text.css';

export interface TextInputProps extends WidgetProps {
  width: string;
  tabIndex?: number;
  className?: string;
  placeholder?: string;
  iconAdornment?: string;
  value?: string;
  onChange?: ChangeEventHandler;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onKeyUp?: KeyboardEventHandler<HTMLInputElement>;
  onKeyPress?: KeyboardEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onPaste?: ClipboardEventHandler<HTMLInputElement>;
  onFocus?: FocusEventHandler<HTMLInputElement>;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>((props, ref) => {
  // Allow specifying an actual width (e.g. a percentage) or a character width
  // If a character width is specified, we should prefer to use the size attribute of the input
  // as the focus widget that is added to focus elements is confused by the 'ch' size in styles
  const characterWidth = props.width.endsWith('ch')
    ? parseInt(props.width.substr(0, props.width.length - 2), 10)
    : undefined;
  const style: React.CSSProperties = {
    ...props.style,
    width: characterWidth ? undefined : props.width,
  };

  return (
    <div className="pm-textinput-container" style={style}>
      {props.iconAdornment ? <img src={props.iconAdornment} className="pm-textinput-icon" alt="" draggable="false"/> : undefined}
      <input
        type="text"
        placeholder={props.placeholder}
        size={characterWidth}
        className={`
          pm-input-text 
          pm-textinput-input 
          pm-text-color 
          pm-background-color 
          ${props.className}
          ${props.iconAdornment ? 'pm-textinput-input-with-icon' : ''}`}
        value={props.value !== undefined ? props.value : undefined}
        onChange={props.onChange}
        onKeyDown={props.onKeyDown}
        onKeyUp={props.onKeyUp}
        onKeyPress={props.onKeyPress}
        onBlur={props.onBlur}
        onFocus={props.onFocus}
        tabIndex={props.tabIndex}
        onPaste={props.onPaste}
        ref={ref}
        spellCheck={false}
      />
    </div>
  );
});
