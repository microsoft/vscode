/*
 * BibDB.ts
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


import {
  BibFieldTypes,
  NodeArray,
  NameDictObject,
  RangeArray,
  BibField,
  BibLatexExporter,
  BibTypes,
  BibType,
} from 'biblatex-csl-converter';

import { Mark, Node as ProsemirrorNode } from 'prosemirror-model';

import { CSL, CSLDate, cslDateToEDTFDate, CSLName } from '../csl';
import { cslTextToProsemirrorNode } from '../csl-text';
import { bibDbToBibTeX } from '../bibtex/bibtex';

export type BibDB = Record<string, EntryObject>;

export interface EntryObject {
  csl_type?: string;
  bib_type: string;
  entry_key: string;
  fields: Record<string, unknown>;
  incomplete?: boolean;
  unexpected_fields?: Record<string, unknown>;
  unknown_fields?: Record<string, unknown>;
}

// This is our wrapper of a typescript BibLaTeX exporter
// https://github.com/fiduswriter/biblatex-csl-converter

// Traditional Form Looks Like:
// author = {{Abbas}, {Osma Ahmed} and {Ibrahim}, {Issa Ghada} and {Ismail}, {Abdel-Gawad Eman}}
//
// Non traditional form looks like:
// author = {given={Osma Ahmed}, family={Abbas} and given={Issa Ghada}, family={Ibrahim} and given={Abdel-Gawad Eman}, family={Ismail}}
const kUseTraditionalNameForm = false;

// Generates bibLaTeX for a given CSL object / id
export function toBibLaTeX(id: string, csl: CSL): string | undefined {
  // A BibDB is basically a map of key / EntryObject[] that is
  // used by the exporter to generate BibLaTeX
  const bibDB = cslToBibDB(id, csl);
  if (bibDB) {
    // Use the exported to parse the bibDB and generate bibLaTeX
    const exporter: BibLatexExporter = new BibLatexExporter(bibDB, false, {
      traditionalNames: kUseTraditionalNameForm,
    });
    const sourceAsBibLaTeX = exporter.parse();

    // Indent any , new lines
    return sourceAsBibLaTeX.replace(/,\n/g, ',\n\t');
  }
  return undefined;
}

export function toBibTeX(id: string, csl: CSL): string | undefined {
  // A BibDB is basically a map of key / EntryObject[] that is
  // used by the exporter to generate BibLaTeX
  const bibDB = cslToBibDB(id, csl);
  if (bibDB) {
    // Use the exported to parse the bibDB and generate bibLaTeX
    const sourceAsBibTeX = bibDbToBibTeX(bibDB);

    // Indent any , new lines
    return sourceAsBibTeX;
  }
  return undefined;
}

// Converts a single CSL item to a bibDB containing
// a single EntryObject representing that CSL item
function cslToBibDB(id: string, csl: CSL): BibDB | undefined {
  const bibType = bibTypeForCSL(csl.type);
  const bibObject: EntryObject = {
    bib_type: bibType[0],
    csl_type: bibType[1].csl,
    entry_key: id,
    fields: {},
  };

  const enumerableCSL = csl as Record<string,string | unknown>;
  sortedKeys(csl).forEach(key => {
    const value: unknown = enumerableCSL[key];

    const bibFieldDatas = bibFieldForValue(key, csl.type);

    bibFieldDatas?.forEach(bibFieldData => {
      if (bibFieldData) {
        const bibFieldKey = bibFieldData[0];
        const bibField = bibFieldData[1];
        const type = bibField.type;
        let nodeValue: unknown;
        switch (type) {
          case 'f_date': {
            // f_date = // EDTF 1.0 level 0/1 compliant string. (2000-12-31)
            const cslDate = value as CSLDate;
            if (cslDate) {
              const edtfDate = cslDateToEDTFDate(cslDate);
              if (edtfDate) {
                nodeValue = edtfDate;
              }
            }
            break;
          }
          case 'f_integer':
          case 'f_literal':
          case 'f_long_literal':
          case 'f_title':
            // f_integer, f_literal, f_long_literal, f_title = [nodeValue]
            // l_literal = [nodeValue]
            if (typeof(value) === "string" && value.length > 0) {
              nodeValue = textNodes(value);
            }
            break;
          case 'l_literal':
            // l_literal = [NodeArray]
            if (typeof(value) === "string" && value.length > 0) {
              nodeValue = [textNodes(value)];
            }
            break;
          case 'f_key':
            // f_key: string | NodeArray (string points to another key
            // name in BibObject whose value is used for this key)
            if (bibField.options) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const options = bibField.options as any;
              Object.keys(options).find(optionKey => {
                const optionValue = options[optionKey] as Record<string,unknown>;
                if (optionValue.csl === value) {
                  nodeValue = optionKey;
                  return true;
                } else {
                  return false;
                }
              });

              if (!nodeValue) {
                nodeValue = textNodes(String(value));
              }
            }

            break;
          case 'l_key':
            // l_key, list of [string | NodeArray]
            if (bibField.options) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const options = bibField.options as any;
              Object.keys(options).find(optionKey => {
                const optionValue = options[optionKey];
                if (optionValue.csl === value) {
                  nodeValue = [optionKey];
                  return true;
                } else {
                  return false;
                }
              });

              if (!nodeValue && typeof(value) === "string" && value.length > 0) {
                nodeValue = textNodes(value);
              }
            }
            break;
          case 'l_range': {
              // l_range Array<RangeArray>
              const valueStr = value as string;
              const parts = valueStr.split('-');
              const range = rangeArray(parts);
              if (range) {
                nodeValue = [range];
              }
              break;
            }
          case 'f_uri':
          case 'f_verbatim':
            // f_uri, f_verbatim: string
            nodeValue = value;
            break;
          case 'l_name': {
              // l_name Array<NameDictObject>
              const names = value as CSLName[];
              nodeValue = names.map(name => {
                const nameDict: NameDictObject = {
                  family: name.family ? textNodes(name.family) : undefined,
                  given: name.given ? textNodes(name.given) : undefined,
                  literal: name.literal ? textNodes(name.literal) : undefined,
                };
                return nameDict;
              });

              break;
            }
          case 'l_tag':
            // l_tag: string[]
            nodeValue = [value];
            break;
        }

        if (nodeValue) {
          if (shouldIncludeField(bibFieldKey, bibType[1])) {
            bibObject.fields[bibFieldKey] = nodeValue;
          }
        }
      }
    });
  });

  const bibDB: BibDB = {
    item: bibObject,
  };
  return bibDB;
}

// For a given type, we filter out any fields that aren't required,
// eitheror, or optional.
function shouldIncludeField(bibDBFieldName: string, bibType: BibType) {
  // Special case:
  // For datasets, allow author 
  // Fixes https://github.com/rstudio/rstudio/issues/9059
  if (bibType.csl === 'dataset' && bibDBFieldName === 'author') {
    return true;
  }

  return (
    bibType.required.includes(bibDBFieldName) ||
    bibType.optional.includes(bibDBFieldName) ||
    bibType.eitheror.includes(bibDBFieldName)
  );
}

// Returns text nodes for a given CSL string. This implements
// support for the basic CSL marks that are outlined here:
// https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html#html-like-formatting-tags
function textNodes(str: string): NodeArray {
  const pmNode = cslTextToProsemirrorNode(str);
  if (pmNode) {
    const nodes: NodeArray = [];
    pmNode.forEach((node: ProsemirrorNode) => {
      nodes.push({
        type: 'text',
        text: node.textContent,
        marks: node.marks.map((mark: Mark) => ({ type: mark.type.name })),
      });
    });
    return nodes;
  } else {
    return [
      {
        type: 'text',
        text: str,
        marks: [],
        attrs: {},
      },
    ];
  }
}

// Useful for things like page ranges
function rangeArray(parts: string[]): RangeArray | undefined {
  if (parts.length === 1) {
    return [textNodes(parts[0])];
  } else if (parts.length === 2) {
    return [textNodes(parts[0]), textNodes(parts[1])];
  } else {
    return undefined;
  }
}

// Returns the bibDB type for a given CSL type.
function bibTypeForCSL(cslType: string): [string, BibType] {
  const key = Object.keys(BibTypes).find(bibTypeKey => {
    const bibType = BibTypes[bibTypeKey];
    return bibType.csl === cslType;
  });

  if (key) {
    const bibType = BibTypes[key];
    return [key, bibType];
  } else {
    const bibType = BibTypes.misc;
    return ['misc', bibType];
  }
}

function bibFieldForValue(cslKey: string, cslType: string): Array<[string, BibField]> | undefined {
  // Special case the following fields:
  // article-journal issue
  // patent number
  // * collection-number
  // See https://discourse.citationstyles.org/t/issue-number-and-bibtex/1072
  // https://github.com/fiduswriter/biblatex-csl-converter/blob/35d152935eba253ebadd00e285fb13c5828f167f/src/const.js#L561
  if (
    (cslType === 'article-journal' && cslKey === 'issue') ||
    (cslType === 'patent' && cslKey === 'number') ||
    cslKey === 'collection-number'
  ) {
    const bibField = {
      type: 'f_literal',
      biblatex: 'number',
      csl: cslKey,
    };
    return [['number', bibField]];
  }

  // Find the key that corresponds to this CSL key
  const keys = Object.keys(BibFieldTypes).filter(bibFieldKey => {
    const bibField = BibFieldTypes[bibFieldKey];
    const cslFieldName = bibField.csl;
    return cslFieldName && cslFieldName === cslKey;
  });

  // Get the field and return
  if (keys) {
    return keys.map(key => {
      const bibField = BibFieldTypes[key];
      return [key, bibField];
    });
  } else {
    return undefined;
  }
}

function sortedKeys(csl: CSL) {
  let pos = 1;
  const keySortOrder: { [id: string]: number } = {};
  keySortOrder.title = pos++;

  keySortOrder.author = pos++;
  keySortOrder.editor = pos++;
  keySortOrder.director = pos++;
  keySortOrder.illustrator = pos++;
  keySortOrder['collection-editor'] = pos++;
  keySortOrder.translator = pos++;

  keySortOrder.doi = pos++;

  keySortOrder.issued = pos++;
  keySortOrder['event-date'] = pos++;

  keySortOrder['container-title'] = pos++;
  keySortOrder['collection-title'] = pos++;

  keySortOrder.url = pos++;

  keySortOrder.page = pos++;
  keySortOrder.publisher = pos++;

  const enumerableCSL = csl as Record<string,unknown>;
  const keys = Object.keys(enumerableCSL);
  const sorted = keys.sort((a, b) => {
    const aOrder = keySortOrder[a.toLowerCase()];
    const bOrder = keySortOrder[b.toLowerCase()];
    if (aOrder && bOrder) {
      return aOrder - bOrder;
    } else if (aOrder !== undefined) {
      return -1;
    } else if (bOrder !== undefined) {
      return 1;
    }
    return a.localeCompare(b);
  });
  return sorted;
}
