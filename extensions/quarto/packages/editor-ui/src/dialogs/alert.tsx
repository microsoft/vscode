/*
 * alert.tsx
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import React, { useState } from 'react';

import { 
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogTrigger,
  Button,
  FluentProvider,
  makeStyles,
  tokens
} from "@fluentui/react-components"

import {
  InfoRegular,
  ErrorCircleRegular,
  WarningRegular
} from "@fluentui/react-icons"


import { kAlertTypeError, kAlertTypeInfo, kAlertTypeWarning } from 'editor-types';

import {
  showValueEditorDialog 
} from 'ui-widgets';

import { fluentTheme } from '../theme';

import { t } from './translate';


export function alert(title: string, message: string | JSX.Element, type: number): Promise<boolean> {
  return alertDialog(title, message, type, true);
}

export async function yesNoMessage(title: string, message: string | JSX.Element, type: number, yesLabel: string, noLabel: string): Promise<boolean> {
  return alertDialog(title, message, type, false, yesLabel, noLabel);
}

async function alertDialog(title: string, message: string | JSX.Element, type: number, noCancelButton?: boolean, okLabel?: string, cancelLabel?: string) {
  const result = await showValueEditorDialog(AlertDialog, { ok: false }, { title, message, type, noCancelButton, okLabel, cancelLabel });
  return !!result?.ok;
}

interface AlertDialogOptions {
  type: number;
  title?: string;
  message?: string | JSX.Element;
  noCancelButton?: boolean;
  okLabel?: string;
  cancelLabel?: string;
}

const AlertDialog: React.FC<{ 
  values: { ok: boolean },
  options: AlertDialogOptions,
  onClosed: (values?: { ok: boolean }) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const close = (ok: boolean) => {
    setIsOpen(false);
    props.onClosed({ ok });
  }

  const classes = useStyles();

  const alertIcon = () => {
    const color = props.options.type === kAlertTypeError 
      ? tokens.colorPaletteRedForeground1
      : props.options.type === kAlertTypeWarning 
      ? tokens.colorPaletteDarkOrangeForeground1
      : tokens.colorPaletteBlueForeground2;
    switch (props.options.type) {
      case kAlertTypeError:
        return <ErrorCircleRegular color={color} className={classes.titleIcon} />;
      case kAlertTypeWarning:
        return <WarningRegular color={color} className={classes.titleIcon}/>
      case kAlertTypeInfo:
      default:
        return <InfoRegular color={color} className={classes.titleIcon} />
    }
  }


  return (
    <FluentProvider theme={fluentTheme()}>
      <Dialog 
        modalType={props.options.noCancelButton ? "modal" : "alert"} 
        open={isOpen} 
        onOpenChange={(_event,data) => {
          if (!data.open) {
            close(false);
          }
        }} 
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              <div className={classes.title}>
                {alertIcon()}&nbsp;&nbsp;{props.options.title}
              </div></DialogTitle>
            <DialogContent>
              {props.options.message}
            </DialogContent>
            <DialogActions>
              {!props.options.noCancelButton 
                ? <DialogTrigger disableButtonEnhancement>
                    <Button onClick={() => close(false)} appearance="secondary">{props.options.cancelLabel || t("Cancel")}</Button>
                  </DialogTrigger>
                : null
              }
              <Button onClick={() => close(true)} appearance="primary">{props.options.okLabel || t("OK")}</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </FluentProvider>
    
  );
  
};


const useStyles = makeStyles({
  title: {
    display: 'inline-flex',
    alignItems: 'center'
  },
  titleIcon: {
    fontSize: '36px'
  }
})