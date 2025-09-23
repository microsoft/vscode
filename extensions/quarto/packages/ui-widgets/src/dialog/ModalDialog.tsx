/*
 * ModalDialog.tsx
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

import React from "react";

import { 
  Button, 
  Dialog, 
  DialogActions, 
  DialogBody, 
  DialogContent, 
  DialogSurface, 
  DialogTitle, 
  DialogTrigger, 
  FluentProvider, 
  Theme, 
  makeStyles, 
  webLightTheme 
} from "@fluentui/react-components";

import { Dismiss24Regular } from "@fluentui/react-icons";

export interface ModalDialogProps {
  title?: string;
  isOpen: boolean;
  theme?: Theme;
  children: React.ReactNode;
  onOK: () => void;
  onOpened?: () => void;
  onCancel?: () => void;
  okCaption?: string;
  noCancelButton?: boolean;
  cancelCaption?: string;
  focusOKButton?: boolean;
  leftButtons?: JSX.Element;
}

export const ModalDialog: React.FC<ModalDialogProps> = props => {

  const styles = useStyles();

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    props.onOK();
  };

  return (
    <FluentProvider theme={props.theme || webLightTheme}>
      <Dialog
        modalType='modal'
        open={props.isOpen}
        onOpenChange={(_event, data) => {
          if (data.open) {
            props.onOpened?.()
          } else {
            props.onCancel?.();
          }
        }}
      >
        <DialogSurface>
          <form onSubmit={handleSubmit} autoComplete="off" autoCorrect="off" spellCheck="false">
            <DialogBody>
              <DialogTitle
                action={props.noCancelButton ?
                  <DialogTrigger action="close">
                    <Button
                      appearance="subtle"
                      aria-label="close"
                      icon={<Dismiss24Regular />}
                    />
                  </DialogTrigger>
                  : undefined}
              >
                {props.title}
              </DialogTitle>
              <DialogContent className={styles.content}>
                {props.children}
              </DialogContent>
              <DialogActions position="start" className={styles.actions}>
                {props.leftButtons}
              </DialogActions>
              <DialogActions position="end" className={styles.actions}>
                {!props.noCancelButton
                  ? <DialogTrigger disableButtonEnhancement>
                      <Button appearance='secondary'>{props.cancelCaption || 'Cancel'}</Button>
                    </DialogTrigger>
                  : null
                }
                <Button 
                  autoFocus={props.focusOKButton} 
                  appearance='primary'
                  type='submit'>
                    {props.okCaption || 'OK'}
                </Button>
              </DialogActions>
            </DialogBody>
          </form>
        </DialogSurface>
      </Dialog>
    </FluentProvider>

  );
}

const useStyles = makeStyles({
  content: {
    display: "flex",
    flexDirection: "column",
    rowGap: "8px",
  },
  actions: {
    marginTop: "8px"
  }
});


