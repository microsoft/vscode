
/*
 * attr-edit.tsx
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

import React, { PropsWithChildren, useState } from "react"
import { Button, Field, Input, Textarea, makeStyles } from "@fluentui/react-components";

import { AttrEditInput, AttrEditResult, AttrProps, UIToolsAttr } from "editor-types";

import { ModalDialog, showValueEditorDialog } from "ui-widgets";

import { t } from './translate';
import { fluentTheme } from "../theme";
import { useEffect } from "react";

export interface EditAttrOptions {
  caption?: string;
  removeEnabled?: boolean;
  removeCaption?: string;
}

export function editAttr(attrUITools: UIToolsAttr, options?: EditAttrOptions) {
  return async (attr: AttrProps, idHint?: string | undefined): Promise<AttrEditResult | null> => {
    return showEditAttrDialog(attrUITools, attr, { idHint, ...options });
  }
}

export function editDiv(attrUITools: UIToolsAttr) {
  return async (attr: AttrProps, removeEnabled: boolean): Promise<AttrEditResult | null> => {
    return showEditAttrDialog(attrUITools, attr, { 
      caption: t('Div Attributes'),
      removeCaption: t('Unwrap Div'),
      removeEnabled 
    });
  }
}

export function editSpan(attrUITools: UIToolsAttr) {
  return async (attr: AttrProps): Promise<AttrEditResult | null> => {
    return showEditAttrDialog(attrUITools, attr, { 
      caption: t('Span Attributes'),
      removeEnabled: true, 
      removeCaption: t('Unwrap Span')
    });
  }
}

export interface EditAttrProps {
  value: AttrEditInput;
  onChange: (data: AttrEditInput) => void;
}

export const EditAttr : React.FC<EditAttrProps> = props => {

  const [id, setId] = useState(props.value.id);
  const [classes, setClasses] = useState(props.value.classes);
  const [style, setStyle] = useState(props.value.style);
  const [keyvalue, setKeyvalue] = useState(props.value.keyvalue);

  useEffect(() => {
    props.onChange({ id, classes, style, keyvalue })
  }, [id, classes, style, keyvalue])

  return (
    <>
      <Field label={t("ID (e.g. #overview)")}>
        <Input value={id} onChange={(_ev, data) => setId(data.value)}/>
      </Field>
      <Field label={t("Classes (e.g. .illustration)")}>
        <Input value={classes} onChange={(_ev, data) => setClasses(data.value)} />
      </Field>
      <Field label={t("Style (e.g. color: gray;)")}>
        <Input value={style} onChange={(_ev, data) => setStyle(data.value)} />
      </Field>
      <Field label={t("Attributes (key=value, one per line)")}>
        <Textarea rows={3} value={keyvalue} onChange={(_ev, data) => setKeyvalue(data.value)} />
      </Field>
    </>
  )

}

export const EditAttrPanel : React.FC<PropsWithChildren> = props => {
  const styles = useStyles();
  return (
    <div className={styles.attribsPanel}>
      {props.children}
    </div>
  )
}


async function showEditAttrDialog(attrUITools: UIToolsAttr, attr: AttrProps, options: EditAttrDialogOptions) {
  const inputAttr = attrUITools.propsToInput(attr);
  const result = await showValueEditorDialog(EditAttrDialog, { attr: inputAttr, action: 'edit' }, options);
  if (result) {
    const editedAttr = attrUITools.inputToProps(result.attr);
    return { attr: editedAttr, action: result.action };
  } else {
    return null;
  }
}


interface EditAttrDialogValues {
  attr: AttrEditInput;
  action: "edit" | "remove"
}

interface EditAttrDialogOptions {
  caption?: string;
  idHint?: string;
  removeEnabled?: boolean;
  removeCaption?: string;
}

const EditAttrDialog: React.FC<{ 
  values: EditAttrDialogValues,
  options: EditAttrDialogOptions,
  onClosed: (values?: EditAttrDialogValues) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const [attr, setAttr] = useState(props.values.attr);

  const close = (attr?: AttrEditInput, action?: "edit" | "remove") => {
    action = action || "edit";
    setIsOpen(false);
    props.onClosed(attr ? { attr, action } : undefined );
  }

  const removeButton = props.options.removeEnabled ?
    <Button onClick={() => close(props.values.attr, 'remove')}>
      {props.options.removeCaption || t("Remove Attributes")}
    </Button> : undefined;

  return (
    <ModalDialog
      title={props.options.caption || t("Edit Attributes")} 
      theme={fluentTheme()}
      isOpen={isOpen} 
      leftButtons={removeButton}
      onOK={() => close(attr, 'edit') }
      onCancel={() => close() }
    >
      <EditAttr value={attr} onChange={setAttr} />
    </ModalDialog>
  )
}

const useStyles = makeStyles({
  attribsPanel: {
    minHeight: "290px",
    display: "flex",
    flexDirection: "column",
    rowGap: "8px",
  },
})