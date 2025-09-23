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

import React, { ChangeEventHandler } from 'react';

import { WidgetProps } from './react';

import './text.css';

export interface CheckboxInputProps extends WidgetProps {
  id?: string;
  tabIndex?: number;
  className?: string;
  checked?: boolean;
  onChange?: ChangeEventHandler;
}
  
export const CheckboxInput= React.forwardRef<HTMLInputElement, CheckboxInputProps>((props, ref) => {
  const style: React.CSSProperties = {
    ...props.style,
  };

  return (
      <input
        id={props.id} 
        type="checkbox"
        className={`
          pm-input-checkbox
          pm-text-color 
          pm-background-color 
          ${props.className}`}
        style={style}
        checked={props.checked}
        onChange={props.onChange}
        tabIndex={props.tabIndex}
        ref={ref}
      />
  );
});


