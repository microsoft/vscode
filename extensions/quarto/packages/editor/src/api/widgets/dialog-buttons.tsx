/*
 * dialog-buttons.tsx
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

import { WidgetProps } from './react';

import { TextButton } from './button';
import React, { useState } from 'react';

import './dialog-buttons.css';

export interface DialogButtonsProps extends WidgetProps {
  okLabel: string;
  cancelLabel: string;
  onOk: () => void;
  onCancel: () => void;
}

export const DialogButtons: React.FC<DialogButtonsProps> = props => {
  const [isRStudio] = useState(Object.getOwnPropertyNames(window).includes("rstudio"));
  const buttonProps = (primary?: boolean) => {
    const bprops = {
      classes: isRStudio
        ? ['pm-text-button', 'pm-input-button', 'pm-default-theme', 'pm-dialog-buttons-button', 'pm-rstudio-button']
        : ['fluentui-button'],
      style: (isRStudio ? {} : {minWidth: '90px'}) as React.CSSProperties
    }
    if (primary) {
      if (isRStudio) {
        bprops.style.fontWeight = 600;
      } else {
        bprops.classes.push("fluentui-intent-primary");
        bprops.style.marginLeft = '8px';
      }
    }
    return bprops;
  };

  const okButton = 
    <TextButton
      title={props.okLabel}
      onClick={props.onOk}
      {...buttonProps(true)}
    />;

  const cancelButton = 
    <TextButton
      title={props.cancelLabel}
      onClick={props.onCancel}
      {...buttonProps()}
    />
    
  return (
    <div className="pm-dialog-buttons-panel" style={props.style}>
      {isRStudio 
        ? <>{okButton}{cancelButton}</>
        : <>{cancelButton}{okButton}</>
      }
    </div>
  );
};
