/*
 * edit-callout.tsx
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

import React, { useRef, useState } from "react"

import { Button, Checkbox, Field, Input, Select, SelectTabData, SelectTabEvent, Tab, TabValue, makeStyles } from "@fluentui/react-components"

import { AttrEditInput, CalloutEditProps, CalloutEditResult, CalloutProps, PandocAttr, UIToolsAttr } from "editor-types";

import { ModalDialog, ModalDialogTabList, showValueEditorDialog } from "ui-widgets";

import { fluentTheme } from "../theme";

import { EditAttr, EditAttrPanel } from "./edit-attr";

import { t } from './translate';

import { useEffect } from "react";


export function editCallout(attrUITools: UIToolsAttr) {
  return async (props: CalloutEditProps, removeEnabled: boolean): Promise<CalloutEditResult | null> => {
    
    const values: EditCalloutDialogValues = { 
      values: {...attrUITools.propsToInput(props.attr), ...props.callout}, 
      action: "edit" 
    };

    const result = await showValueEditorDialog(EditCalloutDialog, values, {
      removeEnabled
    });
    if (result) {
      const { id, classes, style, keyvalue, ...callout } = result.values;
      return {
        attr: attrUITools.inputToProps({ id, classes, style, keyvalue }) as PandocAttr,
        callout,
        action: result.action
      }
    } else {
      return null;
    }
  };
}



interface EditCalloutDialogValues {
  values: AttrEditInput & CalloutProps;
  action: "edit" | "remove";
}

interface EditCalloutDialogOptions {
  removeEnabled: boolean;
}

const EditCalloutDialog: React.FC<{ 
  values: EditCalloutDialogValues,
  options: EditCalloutDialogOptions,
  onClosed: (values?: EditCalloutDialogValues) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const focusRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (isOpen && focusRef.current) {
      focusRef.current.focus();
    }
  }, [isOpen])

  const [attr, setAttr] = useState<AttrEditInput>(props.values.values);
  const [type, setType] = useState(props.values.values.type);
  const [appearance, setAppearance] = useState(props.values.values.appearance);
  const [caption, setCaption] = useState(props.values.values.caption);
  const [icon, setIcon] = useState(props.values.values.icon);

  const close = (values?: EditCalloutDialogValues) => {
    setIsOpen(false);
    if (values) {
      props.onClosed(values);
    }
  }

  const removeButton = 
    <Button onClick={() => close({ ...props.values, action: 'remove' })}>
      {t("Unwrap Div")}
    </Button>;

  const [selectedTab, setSelectedTab] = useState<TabValue>("callout");
  const onTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value);
  };
  const classes = useStyles();

  const selectOptions = (options: string[]) => {
    return options.map(option => {
      return (
        <option value={option} key={option}>
          {option}
        </option>);
    });
  };

  const calloutPanel =
    <EditAttrPanel>
      <div className={classes.attribs}>
        <Field label={t("Type")}>
          <Select ref={focusRef} value={type} onChange={(_ev, data) => setType(data.value)} multiple={false}>
            {selectOptions(["note", "tip", "important", "caution", "warning"])}
          </Select>
        </Field>
        <Field label={t("Appearance")}>
          <Select value={appearance} onChange={(_ev, data) => setAppearance(data.value)} multiple={false}>
            {selectOptions(["default", "simple", "minimal"])}
          </Select>
        </Field>
      </div>
      <Field label={t("Caption")} placeholder={t("(Optional)")}>
        <Input value={caption} onChange={(_ev, data) => setCaption(data.value)}/>
      </Field>
      <Checkbox label={t("Display icon alongside callout")} checked={icon} onChange={(_ev, data) => setIcon(!!data.checked)}/> 
    </EditAttrPanel>;

  const attributesPanel = 
    <EditAttrPanel>
      <EditAttr value={attr} onChange={setAttr} />
    </EditAttrPanel>;

  return (
    <ModalDialog
      title={t("Callout")} 
      theme={fluentTheme()}
      isOpen={isOpen} 
      leftButtons={props.options.removeEnabled ? removeButton : undefined}
      onOK={() => close({ values: { ...attr, type, appearance, caption, icon}, action: 'edit'})}
      onCancel={() => close() }
    >
      <ModalDialogTabList
        id="edit-callout" 
        selectedValue={selectedTab} 
        onTabSelect={onTabSelect}
      >
        <Tab id="callout" value="callout">{t("Callout")}</Tab>
        <Tab id="attributes" value="attributes">{t("Attributes")}</Tab> 
      </ModalDialogTabList>
      <div>
        {selectedTab === "callout" && calloutPanel}
        {selectedTab === "attributes" && attributesPanel}
      </div>

    </ModalDialog>
  )
}

const useStyles = makeStyles({
  attribs: {
    display: 'flex',
    flexDirection: 'row',
    columnGap: '8px',
    "& .fui-Field": {
      width: '50%'
    }
  },
})