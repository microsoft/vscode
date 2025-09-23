
/*
 * insert-tabset.tsx
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

import { Tab, SelectTabEvent, SelectTabData, TabValue, Input, Field, makeStyles } from "@fluentui/react-components"

import { AttrEditInput, InsertTabsetResult, PandocAttr, UIToolsAttr } from "editor-types";

import { ModalDialog, ModalDialogTabList, showValueEditorDialog } from "ui-widgets";

import { fluentTheme } from "../theme";

import { EditAttr, EditAttrPanel } from "./edit-attr";

import { t } from "./translate";

export function insertTabset(attrUITools: UIToolsAttr) {
  return async (): Promise<InsertTabsetResult | null> => {
    const values = { 
      tab1: '', tab2: '', tab3: '', tab4: '', tab5: '', tab6: '', 
      ...attrUITools.propsToInput({}) 
    };
    const result = await showValueEditorDialog(InsertTabsetDialog, values, undefined);
    if (result) {
      const { tab1, tab2, tab3, tab4, tab5, tab6, ...attr } = result;
      return { 
        tabs: [tab1,tab2,tab3,tab4,tab5,tab6].filter(tab => tab.length > 0), 
        attr: attrUITools.inputToProps(attr) as PandocAttr 
      };
    } else {
      return null;
    }
  }
}

type InsertTabsetDialogValues = { 
  tab1: string;
  tab2: string;
  tab3: string;
  tab4: string;
  tab5: string;
  tab6: string;
} & AttrEditInput;

const InsertTabsetDialog: React.FC<{ 
  values: InsertTabsetDialogValues,
  options: null | undefined,
  onClosed: (values?: InsertTabsetDialogValues) => void }
> = props => {

  const classes = useStyles();

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const focusRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen && focusRef.current) {
      focusRef.current.focus();
    }
  }, [isOpen])


  const [tab1, setTab1] = useState(props.values.tab1);
  const [tab2, setTab2] = useState(props.values.tab2);
  const [tab3, setTab3] = useState(props.values.tab3);
  const [tab4, setTab4] = useState(props.values.tab4);
  const [tab5, setTab5] = useState(props.values.tab5);
  const [tab6, setTab6] = useState(props.values.tab6);
  const [attr, setAttr] = useState<AttrEditInput>(props.values);

  const [selectedTab, setSelectedTab] = useState<TabValue>("tabs");
  const onTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value);
  };

  const close = (values?: InsertTabsetDialogValues) => {
    setIsOpen(false);
    props.onClosed(values);  
  }

  const tabsPanel = 
    <EditAttrPanel>
      <Field label={t("Tab names:")}>
        <Input className={classes.tabName} value={tab1} onChange={(_ev, data) => setTab1(data.value)} ref={focusRef} required={true} />
        <Input className={classes.tabName} value={tab2} onChange={(_ev, data) => setTab2(data.value)} required={true} />
        <Input className={classes.tabName} value={tab3} onChange={(_ev, data) => setTab3(data.value)} placeholder={t("(Optional)")} />
        <Input className={classes.tabName} value={tab4} onChange={(_ev, data) => setTab4(data.value)} placeholder={t("(Optional)")} />
        <Input className={classes.tabName} value={tab5} onChange={(_ev, data) => setTab5(data.value)} placeholder={t("(Optional)")} />
        <Input className={classes.tabName} value={tab6} onChange={(_ev, data) => setTab6(data.value)} placeholder={t("(Optional)")} />
      </Field>
    </EditAttrPanel>;

  const attributesPanel = 
    <EditAttrPanel>
      <EditAttr value={attr} onChange={setAttr} />
    </EditAttrPanel>;

  return (
    <ModalDialog
      title={t("Insert Tabset")} 
      theme={fluentTheme()}
      isOpen={isOpen} 
      onOK={() => close({...attr, tab1, tab2, tab3, tab4, tab5, tab6}) }
      onCancel={() => close() }
    >
      <ModalDialogTabList
        id="insert-tabset" 
        selectedValue={selectedTab} 
        onTabSelect={onTabSelect}
      >
        <Tab id="tabs" value="tabs">{t("Tabs")}</Tab>
        <Tab id="attributes" value="attributes">{t("Attributes")}</Tab> 
      </ModalDialogTabList>
      <div>
        {selectedTab === "tabs" && tabsPanel}
        {selectedTab === "attributes" && attributesPanel}
      </div>
    </ModalDialog>
  )
}

const useStyles = makeStyles({
  tabName: {
    marginBottom: '10px'
  },
})