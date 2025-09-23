/*
 * insert-cite.tsx
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

import React, { useEffect, useMemo, useRef, useState } from "react"

import { Card, Input, makeStyles, Select, shorthands, tokens } from "@fluentui/react-components"

import { Field, ProgressBar } from "@fluentui/react-components"

import { ensureExtension, equalsIgnoreCase } from "core";

import { ModalDialog, showValueEditorDialog } from "ui-widgets";

import { CiteField, CSL, DOIServer, InsertCiteProps, InsertCiteResult, kAlertTypeError, kStatusNoHost, kStatusNotFound, kStatusOK, PrefsProvider } from "editor-types";
import { UIToolsCitation } from "editor";

import { t } from './translate';
import { alert } from "./alert";

import { fluentTheme } from "../theme";

const kIdNone = "71896BB2-16CD-4AB5-B523-6372EEB84D5D";


export function insertCite(prefs: PrefsProvider, server: DOIServer, citationTools: UIToolsCitation) {
  return async (citeProps: InsertCiteProps): Promise<InsertCiteResult | null> => {
    const defaultBiblioFile = `references.${prefs.prefs().bibliographyDefaultType}`
    const values : InsertCiteDialogValues = citeProps.citeUI && citeProps.csl
      ? { 
          id: citeProps.citeUI.suggestedId, 
          bibliographyFile: citeProps.bibliographyFiles[0] || defaultBiblioFile, 
          csl: citeProps.csl, 
          previewFields: citeProps.citeUI.previewFields,
          bibliographyType: prefs.prefs().bibliographyDefaultType 
        }
      : { 
          id: kIdNone, 
          bibliographyFile: citeProps.bibliographyFiles[0] || defaultBiblioFile, 
          csl: { type: "other" }, 
          previewFields: [],
          bibliographyType: prefs.prefs().bibliographyDefaultType 
        };
    const options = { citeProps, server, citationTools, prefs };
    const result = await showValueEditorDialog(InsertCiteDialog, values, options);
    return result || null;
  };
}

interface InsertCiteDialogValues extends InsertCiteResult {
  previewFields: CiteField[];
  bibliographyType: string;
}

interface InsertCiteDialogOptions  {
  citeProps: InsertCiteProps;
  server: DOIServer;
  citationTools: UIToolsCitation;
  prefs: PrefsProvider;
}

const InsertCiteDialog: React.FC<{
  values: InsertCiteDialogValues,
  options: InsertCiteDialogOptions,
  onClosed: (values?: InsertCiteDialogValues) => void
}
> = props => {

  const classes = useStyles();

  const kInvalidCiteIdChars = t('Invalid characters in citation id');
  const kNonUniqueCiteId = t('This citation id already exists in your bibliography');

  const [isOpen, setIsOpen] = useState<boolean>(true);

  const [idFocused, setIdFocused] = useState(false);
  const idEl = useRef<HTMLInputElement>();
  const focusId = () => idEl?.current?.focus();
  const idFocusRef = (el: HTMLInputElement | null) => {
    if (!idFocused && el) {
      setIdFocused(true);
      idEl.current = el;
      focusId();
    }
  }

  const [id, setId] = useState(props.values.id);
  const [bibliographyFile, setBibliographyFile] = useState(props.values.bibliographyFile);
  const [csl, setCsl] = useState(props.values.csl);
  const [previewFields, setPreviewFields] = useState(props.values.previewFields);
  const [bibliographyType, setBibliographyType] = useState(props.values.bibliographyType);

  const idValidationMessage = useMemo(() => {
    if (/.*[@;[\]\s!,].*/.test(id || "")) {
      return kInvalidCiteIdChars;
    } else if (props.options.citeProps.existingIds.find(existingId => equalsIgnoreCase(existingId, id || ""))) {
      return kNonUniqueCiteId;
    } else {
      return "";
    }
  }, [id])

  const close = (values?: InsertCiteDialogValues) => {
    setIsOpen(false);
    props.onClosed(values);
  }

  // alias cite props
  const citeProps = props.options.citeProps;

  return (
    <ModalDialog
      title={props.options.citeProps.provider 
              ? `${t('Citation from')} ${props.options.citeProps.provider}` 
              : `${t("Citation from DOI: ")} ${citeProps.doi}`}
      isOpen={isOpen}
      onOK={() => { 
        if (idValidationMessage === "") {
          close(id !== kIdNone ? { id, bibliographyFile, csl, previewFields, bibliographyType } : undefined)}
        }
      }
      onCancel={() => close()}
      theme={fluentTheme()}
    >
      {id !== kIdNone 
        ? <>
            <Field 
              label={t('Citation Id')}
              validationState={idValidationMessage ? "error" : "none"}
              validationMessage={idValidationMessage}
            >
              <Input 
                ref={idFocusRef} 
                required={true}
                value={id} 
                onChange={(_ev,data) => setId(data.value)} 
              />
            </Field>
            <Field label={t('Citation')}>
              <Card className={classes.insertCitePreview}>
                <table>
                  <tbody>
                    {previewFields.map(field => {
                      return (
                        <tr key={field.name}>
                          <td>{field.name}</td>
                          <td>{field.value}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            </Field>
            <SelectBibliography 
              value={{bibliographyType, bibliographyFile}} 
              onChange={value => {
                setBibliographyType(value.bibliographyType);
                setBibliographyFile(value.bibliographyFile)
              }}
              options={props.options}
            />
          </>
        
        : <FetchDOI 
            onFetched={value => {
              setId(value.id);
              setCsl(value.csl);
              setPreviewFields(value.previewFields)
            }}
            onError={() => close()}
            options={props.options}
        />
      }
    </ModalDialog>
  );

};


interface BibliographyInfo {
  bibliographyType: string;
  bibliographyFile: string;
}

interface SelectBibliographyProps {
  value: BibliographyInfo;
  onChange: (value: BibliographyInfo) => void;
  options: InsertCiteDialogOptions;
}

const SelectBibliography: React.FC<SelectBibliographyProps> = (props) => {

  const styles = useStyles();

  if (props.options.citeProps.bibliographyFiles.length > 0) {
    return (
      <Field label={t('Add to bibliography')} >
        <Select 
          value={props.value.bibliographyFile} 
          onChange={(_ev, data) => props.onChange({...props.value, bibliographyFile: data.value})} 
          multiple={false}
        >
          {props.options.citeProps.bibliographyFiles.map(file => {
            return <option value={file} key={file}>{file}</option>
          })}
        </Select>
      </Field>
    );
  } else {

    return (
      <div className={styles.biblioFields}>
        <Field label={t('Create bibliography file')} className={styles.biblioFileField}>
          <Input 
            required={true}
            value={props.value.bibliographyFile} 
            onChange={(_ev,data) => props.onChange({...props.value, bibliographyFile: data.value})} />
        </Field>
        <Field label={t('Format')}>
          <Select value={props.value.bibliographyType} multiple={undefined}
            onChange={(_ev,data) => {
              props.onChange({
                bibliographyType: data.value,
                bibliographyFile: ensureExtension(props.value.bibliographyFile, data.value)
              })
              props.options.prefs.setPrefs({
                bibliographyDefaultType: data.value
              });
            }}
          >
            <option value="bib">BibLaTeX</option>
            <option value="yaml">CSL-YAML</option>
            <option value="json">CSL-JSON</option>
          </Select>
        </Field>
      </div>
    );
  }
  
};

interface FetchDOIValue {
  id: string;
  csl: CSL;
  previewFields: CiteField[];
}

interface FetchDOIProps {
  onFetched: (value: FetchDOIValue) => void;
  onError: VoidFunction;
  options: InsertCiteDialogOptions;
}

const FetchDOI: React.FC<FetchDOIProps> = (props) => {

  // show error and dismiss dialog
  const displayError = (title: string, message: string) => {
    alert(title, message, kAlertTypeError);
    props.onError();
  };

  // initialize query after the first render
  useEffect(() => {
    try {
      props.options.server.fetchCSL(props.options.citeProps.doi).then(async (result) => {
        if (result.status === kStatusOK) {
          const citeProps = { ...props.options.citeProps, csl: result.message! };
          const citeUI = props.options.citationTools.citeUI(citeProps);
          props.onFetched({
            id: citeUI.suggestedId,
            csl: citeProps.csl, 
            previewFields: citeUI.previewFields
          })
        } else if (result.status === kStatusNotFound) {
          displayError(
            t('DOI Not Found'), 
            `${t('The specified DOI')} (${props.options.citeProps.doi}) ${t('was not found. Are you sure this is a valid DOI?')}`
          );
        } else if (result.status === kStatusNoHost) {
          displayError(
            t('Unable to Lookup DOI'), 
            `${t('Unable to connect to DOI lookup service (this may be due to an unstable or offline internet connection).')}`
          );
        } else {
          displayError(
            t('Error Looking up DOI'),
            result.error
          )
        }
      });
    } catch (err) {
      displayError(
        t('Error Looking up DOI'),
        err instanceof Error ? err.message : JSON.stringify(err)
      )
    }
  }, []);


  return (
    <Field 
      style={{backgroundColor: 'transparent'}}
      validationMessage={`${t('Looking up DOI ' + props.options.citeProps.doi)}...`} 
      validationState="none"
    >
      <ProgressBar 
        shape="rounded"
        thickness="large"
      />
    </Field>
  )
}

const useStyles = makeStyles({
  insertCitePreview: {
    overflowY: 'scroll',
    width: '100%',
    height: '200px',
    ...shorthands.padding('4px'),
    marginBottom: '5px',
    "& td": {
      ...shorthands.padding(0,0,'4px'),
    },
    "& tr td:first-child": {
      fontWeight: tokens.fontWeightSemibold,
      paddingRight: '8px'
    }
  },
  biblioFields: {
    width: "100%",
    display: 'flex',
    flexDirection: 'row',
    columnGap: '8px',
    "& .fui-Input": {
      flexGrow: 1
    }
  },
  biblioFileField: {
    flexGrow: 1
  }
});


