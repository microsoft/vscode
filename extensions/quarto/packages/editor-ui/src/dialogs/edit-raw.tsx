/*
 * edit-raw.tsx
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

import React, { useEffect, useRef, useState } from "react";
import { Button, Field, Input, Select } from "@fluentui/react-components";

import { RawFormatProps, RawFormatResult } from "editor-types";

import { ModalDialog, showValueEditorDialog } from "ui-widgets";


import { t } from './translate';
import { fluentTheme } from "../theme";

export async function editRawInline(raw: RawFormatProps, outputFormats: string[]): Promise<RawFormatResult | null> {
  return showValueEditorDialog(EditRawDialog, { raw, action: 'edit' }, { outputFormats, editContent: true })
}

export async function editRawBlock(raw: RawFormatProps, outputFormats: string[]): Promise<RawFormatResult | null> {
  return showValueEditorDialog(EditRawDialog, { raw, action: 'edit' }, { outputFormats, editContent: false })
}

interface EditRawDialogOptions {
  outputFormats: string[];
  editContent: boolean;
}

const EditRawDialog: React.FC<{ 
  values: RawFormatResult,
  options: EditRawDialogOptions,
  onClosed: (values?: RawFormatResult) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const focusRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (isOpen && focusRef.current) {
      focusRef.current.focus();
    }
  }, [isOpen])

  const [format, setFormat] = useState(props.values.raw.format);
  const [content, setContent] = useState(props.values.raw.content);

  const close = (raw?: RawFormatProps, action?: "edit" | "remove") => {
    action = action || "edit";
    setIsOpen(false);
    props.onClosed(raw ? { raw, action } : undefined);
  }

  const removeButton = 
    <Button onClick={() => close(props.values.raw, 'remove')}>
      {t("Remove Format")}
    </Button>;

  const formats = props.options.outputFormats.map(value => ({ value, label: undefined as string | undefined }));
  if (!props.values.raw.format) {
    formats.unshift({ value: '', label: "(Choose Format)" });
  }

  return (
    <ModalDialog
      title={t("Raw Format")} 
      theme={fluentTheme()}
      isOpen={isOpen} 
      leftButtons={props.values.raw.format ? removeButton : undefined}
      onOK={() => close({ format, content }, 'edit') }
      onCancel={() => close() }
    >
      <Field label={t("Format")}>
        <Select 
          ref={focusRef}
          value={format} 
          onChange={(_ev, data) => setFormat(data.value)} 
          multiple={false}
        >
          {formats.map(format => {
            return (
              <option 
                value={format.value} 
                key={format.value}
              >
                {format.label || format.value}
              </option>
            );
          })}
        </Select>
      </Field>

      {props.options.editContent 
        ? <Field label={t("Content")}>
            <Input 
              style={{fontFamily: 'monospace'}} 
              value={content} 
              onChange={(_ev, data) => setContent(data.value)} 
            />
          </Field> 
        : null}
    </ModalDialog>
  )
}

