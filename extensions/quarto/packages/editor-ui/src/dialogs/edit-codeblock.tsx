/*
 * edit-codeblock.tsx
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

import React, { useState } from "react"

import { AttrEditInput, CodeBlockProps, UIToolsAttr } from "editor-types";
import { ModalDialog, showValueEditorDialog } from "ui-widgets";

import { t } from './translate';
import { EditAttr } from "./edit-attr";
import { fluentTheme } from "../theme";
import { Field, Input } from "@fluentui/react-components";

export function editCodeBlock(attrUITools: UIToolsAttr) {
  return async (codeBlock: CodeBlockProps, attributes: boolean, languages: string[]): Promise<CodeBlockProps | null>  => {
    const values: EditCodeBlockValues = { ...attrUITools.propsToInput(codeBlock), lang: codeBlock.lang };
    const result = await showValueEditorDialog(EditCodeBlockDialog, values, { attributes, languages });
    if (result) {
      return { ...attrUITools.inputToProps(result), lang: result.lang };
    } else {
      return null;
    }
  }
}

interface EditCodeBlockValues extends AttrEditInput {
  lang: string;
}

interface EditCodeBlockOptions {
  attributes: boolean;
  languages: string[];
}


const EditCodeBlockDialog: React.FC<{ 
  values: EditCodeBlockValues,
  options: EditCodeBlockOptions,
  onClosed: (values?: EditCodeBlockValues) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const { lang: codeBlockLang, ...codeBlockAttrs } = props.values;

  const [lang, setLang] = useState(codeBlockLang);
  const [attr, setAttr] = useState(codeBlockAttrs);

  const close = (values?: EditCodeBlockValues) => {
    setIsOpen(false);
    props.onClosed(values);
  }

  return (
    <ModalDialog
      title={t("Code Block")}
      theme={fluentTheme()}
      isOpen={isOpen}
      onOK={() => close({ ...attr, lang }) }
      onCancel={() => close() }
    >
      <Field label={t("Language")}>
        <Input value={lang} onChange={(_ev, data) => setLang(data.value)}/>
      </Field>
      <EditAttr value={attr} onChange={setAttr} />
    </ModalDialog>
  )
}