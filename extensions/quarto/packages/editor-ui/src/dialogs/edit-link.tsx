/*
 * edit-link.tsx
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

import { Button, Select, Tab, TabValue, SelectTabEvent, SelectTabData, Field, Input, makeStyles } from "@fluentui/react-components"

import { AttrEditInput, LinkCapabilities, LinkEditResult, LinkProps, LinkTargets, LinkType, UIToolsAttr } from "editor-types";


import {  ModalDialog, ModalDialogTabList, showValueEditorDialog } from "ui-widgets";

import { EditAttr, EditAttrPanel } from "./edit-attr";

import { fluentTheme } from "../theme";

import { t } from './translate';

export function editLink(attrUITools: UIToolsAttr) {
  return async (link: LinkProps, targets: LinkTargets,  capabilities: LinkCapabilities)
  : Promise<LinkEditResult | null> => {
    const { id, classes, keyvalue, ...linkAttr } = link;
    linkAttr.title = linkAttr.title || '';
    const value = {
      value: { ...attrUITools.propsToInput({ id, classes, keyvalue }), ...linkAttr },
      action: "edit" as ("edit" | "remove")
    };
    const result = await showValueEditorDialog(EditLinkDialog, value, { targets, capabilities });
    if (result && result.value.href && result.value.text) {
      const { id, classes, style, keyvalue, ...linkAttr } = result.value;
      return {
        link: { ...attrUITools.inputToProps({ id, classes, style, keyvalue }), ...linkAttr },
        action: result.action
      }
    } else {
      return null;
    }
  }
}

interface EditLinkDialogFields extends AttrEditInput {
  readonly type: LinkType;
  readonly text: string;
  readonly href: string;
  readonly heading?: string;
  readonly title?: string;
}

interface EditLinkDialogValues {
  value: EditLinkDialogFields;
  action: "edit" | "remove"
}

interface EditLinkDialogOptions {
  capabilities: LinkCapabilities;
  targets: LinkTargets;
}

const EditLinkDialog: React.FC<{ 
  values: EditLinkDialogValues,
  options: EditLinkDialogOptions,
  onClosed: (values?: EditLinkDialogValues) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const focusRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (isOpen && focusRef.current) {
      focusRef.current.focus();
    }
  }, [isOpen])


  const [type, setType] = useState(props.values.value.type);
  const [text, setText] = useState(props.values.value.text);
  const [href, setHref] = useState(props.values.value.href);
  const [heading] = useState(props.values.value.heading);
  const [title, setTitle] = useState(props.values.value.title);
  const [attr, setAttr] = useState<AttrEditInput>({
    id: props.values.value.id,
    classes: props.values.value.classes,
    style: props.values.value.style,
    keyvalue: props.values.value.keyvalue
  });

  const [selectedTab, setSelectedTab] = useState<TabValue>("link");
  const onTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value);
  };

  const close = (values?: EditLinkDialogValues) => {
    setIsOpen(false);
    if (values) {
      const type = asLinkType(values.value.type);
      if (type === LinkType.Heading) {
        props.onClosed({
          value: { 
            ...values.value,
            type,
            href,
            text: href,
            heading: href
          },
          action: values.action
        })
      } else {
        props.onClosed({
          ...values,
          value: { ...values.value, type, heading: undefined }
        });
      }
    } else {
      props.onClosed();
    }
   
  }

  const removeButton = props.values.value.href ?
    <Button onClick={() => close({ value: props.values.value, action: 'remove' })}>
      {t("Remove Link")}
    </Button> : undefined;
 
  const linkType = asLinkType(type);
  const classes = useStyles();

  const suggestionsForType = (linkType: LinkType) => {
    switch (asLinkType(linkType)) {
      case LinkType.URL:
        return [];
      case LinkType.Heading:
        return props.options.targets.headings.map(heading => ({
          label: heading.text,
          value: heading.text,
        }));
      case LinkType.ID:
        return props.options.targets.ids.map(id => ({ value: '#' + id }));
    }
  };

  const defaultHRefForType = (linkType: LinkType) => {
    const suggestions = suggestionsForType(linkType);
    return suggestions.length ? suggestions[0].value : '';
  };
    

  const linkPanel =
    <EditAttrPanel>
      <Field label={t("Link to")}>
        <div className={classes.linkTo}>
          <Select 
            value={type}
            onChange={(_ev,data) => {
              const linkType = asLinkType(data.value);
              setType(linkType);
              setHref(defaultHRefForType(linkType));
            }}
            multiple={undefined} 
          >
            {[
              { label: t('URL'), value: LinkType.URL },
              ...(props.options.capabilities.headings && (props.options.targets.headings.length > 0)
                ? [{ label: t('Heading'), value: LinkType.Heading }]
                : []),
              ...(props.options.targets.ids.length > 0
                ? [{ label: t('ID'), value: LinkType.ID }]
                : [])
            ].map(option => {
              return (
                <option value={option.value} key={option.value}>
                  {option.label || option.value}
                </option>);
            })}
          </Select>
          {linkType === LinkType.URL ? (
            <Input 
              ref={focusRef}
              type="text"
              value={href}
              onChange={(_ev, data) => setHref(data.value)}
            />
          ) : (
            <Select 
              className={classes.linkToSelect}
              value={href}
              onChange={(_ev, data) => setHref(data.value)}
              multiple={undefined}
            >
              {suggestionsForType(linkType).map(option => {
                return (
                  <option value={option.value} key={option.value}>
                    {option.value}
                  </option>);
              })}
            </Select>
          )}
        </div>
      </Field>
      {linkType !== LinkType.Heading ? <>
        <Field label={t("Text")}>
          <Input value={text} onChange={(_ev,data) => setText(data.value)} />
        </Field>
        <Field label={t("Title/Tooltip")}>
          <Input value={title} onChange={(_ev,data) => setTitle(data.value)} />
        </Field>
        </>
          : undefined
      }
      
    </EditAttrPanel>
  ;
  

  const attributesPanel = 
    <EditAttrPanel>
      <EditAttr value={attr} onChange={setAttr} />
    </EditAttrPanel>;

 

  return (
    <ModalDialog
      title={t("Link")} 
      theme={fluentTheme()}
      isOpen={isOpen} 
      leftButtons={removeButton}
      onOK={() => close({ value: {...attr, type, text, href, heading, title}, action: "edit" })}
      onCancel={() => close()}
    >
      {props.options.capabilities.attributes 
        ? <>
            <ModalDialogTabList
              selectedValue={selectedTab} 
              onTabSelect={onTabSelect}
              >
                <Tab id="link" value="link">{t("Link")}</Tab>
                {linkType !== LinkType.Heading 
                  ? <Tab id="attributes" value="attributes">{t("Attributes")}</Tab> 
                  : null
                }
            </ModalDialogTabList>
            <div>
              {selectedTab === "link" && linkPanel}
              {selectedTab === "attributes" && attributesPanel}
            </div>
          </>
        : linkPanel}
    </ModalDialog>
  )
}

const asLinkType = (linkType: LinkType | string) : LinkType  => {
  return typeof(linkType) === "string" ? parseInt(linkType, 10) : linkType;
}

const useStyles = makeStyles({
  linkTo: {
    marginBottom: '10px',
    display: 'flex',
    flexDirection: 'row',
    columnGap: '8px',
    "& .fui-Input": {
      flexGrow: 1
    }
  },
  linkToSelect: {
    flexGrow: 1
  }
})
