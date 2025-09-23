/*
 * edit-image.tsx
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

import { 
  Button, 
  Tab, 
  TabValue, 
  SelectTabEvent, 
  SelectTabData, 
  makeStyles, 
  Field, 
  Input, 
  tokens, 
  useId, 
  RadioGroup, 
  Label, 
  Radio 
} from "@fluentui/react-components";

import { ModalDialog, ModalDialogTabList, showValueEditorDialog} from "ui-widgets";
import { AttrEditInput, EditorUIImageResolver, ImageDimensions, ImageProps, UIToolsAttr } from "editor-types";

import { EditAttr, EditAttrPanel } from "./edit-attr";

import { t } from './translate';

import { fluentTheme } from "../theme";
import { capitalizeWord } from "core";

export function editImage(attrUITools: UIToolsAttr, imageResolver?: EditorUIImageResolver) {
  return async (image: ImageProps, dims: ImageDimensions | null, figure: boolean, editAttributes: boolean): Promise<ImageProps | null> => {
    const { id, classes, keyvalue, ...imageAttr } = image;
    const values: EditImageDialogValues = { 
      ...attrUITools.propsToInput({ id, classes, keyvalue }), 
      ...imageAttr,
      // prevent undefined bound props
      src: imageAttr.src || '',
      title: imageAttr.title || '',
      caption: imageAttr.caption || '',
      linkTo: imageAttr.linkTo || ''
    };
 
    const result = await showValueEditorDialog(EditImageDialog, values, { 
      dims, 
      figure, 
      editAttributes,
      imageResolver
    });
    if (result && result.src) {
      const { id, classes, style, keyvalue, ...imageProps } = result;
      const props = {
        ...attrUITools.inputToProps({ id, classes, style, keyvalue }),
        ...imageProps
      };
     
      return { 
        ...props,
         // restore undefined bound props
        title: props.title || undefined,
        caption: props.caption || undefined,
        linkTo: props.linkTo || undefined
      }
    } else {
      return null;
    }
  };
}


type EditImageDialogValues = {
  src: string;
  title: string;
  caption?: string;
  alt?: string;
  align?: string;
  env?: string;
  linkTo?: string;
  width?: number;
  height?: number;
  units?: string;
  lockRatio?: boolean;
} & AttrEditInput;

interface EditImageDialogOptions {
  dims?: ImageDimensions | null;
  figure: boolean;
  editAttributes: boolean;
  imageResolver?: EditorUIImageResolver
}

const EditImageDialog: React.FC<{ 
  values: EditImageDialogValues,
  options: EditImageDialogOptions,
  onClosed: (values?: EditImageDialogValues) => void }
> = props => {

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const [src, setSrc] = useState(props.values.src);
  const [title, setTitle] = useState(props.values.title);
  const [caption, setCaption] = useState(props.values.caption);
  const [alt, setAlt] = useState(props.values.alt);
  const [align, setAlign] = useState(props.values.align);
  const [env, setEnv] = useState(props.values.env);
  const [linkTo, setLinkTo] = useState(props.values.linkTo);
  const [attr, setAttr] = useState<AttrEditInput>(props.values);

  const [selectedTab, setSelectedTab] = useState<TabValue>("image");
  const onTabSelect = (_event: SelectTabEvent, data: SelectTabData) => {
    setSelectedTab(data.value);
  };

  const close = (values?: EditImageDialogValues) => {
    setIsOpen(false);
    props.onClosed(values);
  }
  
const classes = useStyles();
const alignId = useId("align");

const imagePanel = 
  <EditAttrPanel>
    <ImageField value={src} onChange={setSrc} autoFocus={true} imageResolver={props.options.imageResolver}/>
  
    {align !== undefined
      ? <div className={classes.alignmentField}>
          <Label id={alignId}>{t('Alignment: ')}</Label>
          <RadioGroup 
            value={align}
            onChange={(_ev, data) => setAlign(data.value)}
            layout="horizontal" 
            aria-labelledby={alignId}
          >
            {["default", "left", "center", "right"].map(option => {
              return <Radio key={option} value={option} label={capitalizeWord(option)}></Radio>
            })}
          </RadioGroup>
        </div>    
      : null
    }
    <Field label={t("Caption")}>
      <Input 
        value={caption} 
        onChange={(_ev, data) => setCaption(data.value)}
        placeholder={t("(Optional)")}
      />
    </Field>
  
    {alt !== undefined
      ?  <Field label={t("Alternative text")}>
          <Input 
            value={alt} 
            onChange={(_ev, data) => setAlt(data.value)}
            placeholder={t("(Optional)")}
          />
        </Field>
      : null
    }
  </EditAttrPanel>;

  const attributesPanel =  
    <EditAttrPanel>
       <EditAttr value={attr} onChange={setAttr} />
    </EditAttrPanel>;
   
  const advancedPanel = 
    <EditAttrPanel>
      <Field label={t("Link to")}>
        <Input 
          value={linkTo} 
          onChange={(_ev,data) => setLinkTo(data.value)}
        />
      </Field>
      {env 
        ? <Field label={t("LaTeX environment")}>
            <Input value={env} onChange={(_ev,data) => setEnv(data.value)} />
          </Field>
        : null
      }
      <Field label={t("Title attribute")}>
        <Input value={title} onChange={(_ev, data) => setTitle(data.value)} />
      </Field>
    </EditAttrPanel>;

  return (
    <ModalDialog
      title={props.options.figure ? t("Figure") : t("Image")} 
      theme={fluentTheme()}
      isOpen={isOpen} 
      onOK={() => close({
        ...props.values,
        ...attr,
        src, title, caption, alt, align, env, linkTo
      })}
      onCancel={() => close() }
    >
      <ModalDialogTabList
        id="edit-callout" 
        selectedValue={selectedTab} 
        onTabSelect={onTabSelect}
      >
        <Tab id="image" value="image">{t("Image")}</Tab>
        {props.options.editAttributes 
          ? <Tab id="attributes" value="attributes">{t("Attributes")}</Tab> 
          : null
        }
        <Tab id="advanced" value="advanced">{t("Advanced")}</Tab>
      </ModalDialogTabList>
      <div>
        {selectedTab === "image" && imagePanel}
        {selectedTab === "attributes" && attributesPanel}
        {selectedTab === "advanced" && advancedPanel}

      </div>
    </ModalDialog>
  )
}

interface ImageFieldProps {
  value: string;
  onChange?: (data: string) => void;
  autoFocus?: boolean;
  imageResolver?: EditorUIImageResolver;
}

const ImageField: React.FC<ImageFieldProps> = props => {

  const styles = useStyles();

  const focusRef = useRef<HTMLInputElement>(null);
  if (props.autoFocus) {
    useEffect(() => {
      setTimeout(() => {
        if (focusRef.current) {
          focusRef.current.focus();
        }
      }, 0);
    }, []);
  }

  // button
  const button = 
    <Button onClick={async () => {
      const image = await props.imageResolver?.selectImage?.();
        if (image) {
          props.onChange?.(image);
        }
      }}> 
      {t("Browse...")}
    </Button>;

  // image input 
  const imageInput = 
    <Field label={t("Image (File or URL)")} className={styles.imageField}>
      <Input ref={focusRef} value={props.value} onChange={(_ev, data) => props.onChange?.(data.value)}/>
      {button}
    </Field>;
    
  // pair with browse button if we have a selectImage function
  return imageInput;
};

const useStyles = makeStyles({
  imageField: {
    display: 'flex',
    flexDirection: 'row',
    columnGap: '8px',
    "& .fui-Input": {
      flexGrow: 1
    }
  },
  alignmentField: {
    display: "grid",
    gridRowGap: tokens.spacingVerticalS,
  }
})



