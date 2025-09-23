/*
 * edit-math.tsx
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

import React, { useState } from "react";

import { Field, Input } from "@fluentui/react-components";

import { UIToolsAttr } from "editor-types";

import { ModalDialog, showValueEditorDialog } from "ui-widgets";

import { fluentTheme } from "../theme";

import { t } from './translate';

export function editMath(attrUITools: UIToolsAttr) {
  return async (id: string) : Promise<string | null> => {
    const values: MathValues = { id: attrUITools.asHtmlId(id) || "" };
    const result = await showValueEditorDialog(EditMathDialog, values, undefined);
    return result ? attrUITools.asPandocId(result.id) : null;
  };
}


interface MathValues {
  id: string;
}

const EditMathDialog: React.FC<{ 
  values: MathValues,
  onClosed: (values?: MathValues) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const [id, setId] = useState(props.values.id);

  const close = (values?: MathValues) => {
    setIsOpen(false);
    props.onClosed(values);
  }

  return (
    <ModalDialog
      title={t("Edit Math")} 
      theme={fluentTheme()}
      isOpen={isOpen} 
      onOK={() => close({id })}
      onCancel={() => close() }
    >
      <Field label={t("Identifier")}>
        <Input value={id} onChange={(_ev, data) => setId(data.value) } />
      </Field>
    </ModalDialog>
  )
}