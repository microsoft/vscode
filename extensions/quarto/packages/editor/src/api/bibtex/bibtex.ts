/*
 * bibtex.ts
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

import { NodeArray, RangeArray, NameDictObject, TextNodeObject, NodeObject, MarkObject } from 'biblatex-csl-converter';
import { FieldMap } from './fields';
import { typeMapping } from './types';
import { FormattingTags } from './formatting';
import characters from './characters';
import { BibDB, EntryObject } from '../bibliography/bibDB';

export interface Config {
  traditionalNames?: boolean;
  exportUnexpectedFields?: boolean;
}

export interface Entry {
  type: string;
  key: string;
  values?: { [key: string]: string };
}

export function bibDbToBibTeX(bibDB: BibDB) {
  // Keys of items to export
  const keysToExport = Object.keys(bibDB);

  // The final entries
  const bibtexEntries: Entry[] = [];

  // Go through each item and compose the entry and
  // append all the fields with BibTeX specific formatting
  keysToExport?.forEach(key => {
    const entryObject: EntryObject = bibDB[key];

    const cslType = entryObject.csl_type;
    const bibTexType = cslType ? typeMapping(cslType).bibtex : entryObject.bib_type;

    const bibtexEntry: Entry = {
      type: bibTexType,
      key: entryObject.entry_key,
    };

    // The formatted output fields for this entry
    const outputFields: { [key: string]: string } = {};

    // All the fields for this entry
    const fieldsForExport: Record<string, unknown> = entryObject.fields;
    Object.keys(fieldsForExport).forEach(fieldKey => {
      // Lookup the field information in the mapping
      // (maps CSL fields names to their peer BibTeX types)
      const fieldType = FieldMap[fieldKey];

      // This is a well understood field type
      if (fieldType) {
        const type = fieldType.type;

        // Read the type (either as raw value or passing the type to look it up)
        const typeReader = fieldType.bibtex;
        const bibtexKey = typeof typeReader === 'string' ? typeReader : typeReader(bibTexType);
        const bibtexValue = fieldsForExport[fieldKey];

        switch (type) {
          case 'f_date': {
              // Output the raw date value
              outputFields[bibtexKey] = String(bibtexValue);

              // Also output the year and month, if possible
              // The value being parsed is a EDTF 1.0 level 0/1 compliant string. (2000-12-31)
              const parts: string[] = String(bibtexValue).split('-');
              if (parts.length > 0) {
                outputFields.year = parts[0];
                if (parts.length > 1) {
                  outputFields.month = parts[1];
                }
              }
            }
            break;
          case 'f_integer':
            outputFields[bibtexKey] = formatText(bibtexValue as NodeArray);
            break;
          case 'f_key':
            outputFields[bibtexKey] = formatKey(bibtexValue as string | NodeArray, bibtexKey);
            break;
          case 'f_literal':
          case 'f_long_literal':
            outputFields[bibtexKey] = formatText(bibtexValue as NodeArray);
            break;
          case 'l_range':
            outputFields[bibtexKey] = formatRange(bibtexValue as RangeArray[]);
            break;
          case 'f_title':
            outputFields[bibtexKey] = formatText(bibtexValue as NodeArray);
            break;
          case 'f_uri':
          case 'f_verbatim':
            // Strip any braces from verbatims
            outputFields[bibtexKey] = (bibtexValue as string).replace(/{|}/g, '');
            break;
          case 'l_key':
            outputFields[bibtexKey] = escapeNonAscii(
              (bibtexValue as string[]).map((k: string) => formatKey(k, bibtexKey)).join(' and '),
            );
            break;
          case 'l_literal':
            outputFields[bibtexKey] = (bibtexValue as NodeArray[]).map((text: NodeArray) => formatText(text)).join(' and ');
            break;
          case 'l_name':
            outputFields[bibtexKey] = formatNames(bibtexValue as NameDictObject[]);
            break;
          case 'l_tag':
            outputFields[bibtexKey] = escapeNonAscii((bibtexValue as string[]).join(', '));
            break;
          default:
            // This is a field type that we don't understand, skip it
            break;
        }
      }
    });

    bibtexEntry.values = outputFields;
    bibtexEntries.push(bibtexEntry);
  });
  return toBibtex(bibtexEntries);
}

// Writes BibTex
const toBibtex = (entries: Entry[]): string => {
  const length = entries.length;
  let bibTexStr = '';
  for (let i = 0; i < length; i++) {
    // The entry we're writing
    const entry = entries[i];

    // Write the key and open the entry
    bibTexStr = bibTexStr + `@${entry.type}{${entry.key}`;

    // The fields for this item
    if (entry.values && Object.keys(entry.values).length > 0) {
      sortedKeys(entry.values).forEach(key => {
        if (entry.values) {
          const rawValue = entry.values[key];
          const value = `{${rawValue}}`;

          // Strip empty braces
          // TODO: If we support variables, we may need to clean this
          // const cleanedValue = value.replace(/\{\} # /g, '').replace(/# \{\}/g, '');
          bibTexStr = bibTexStr + `,\n\t${key} = ${value}`;
        }
      });
    } else {
      // There are no values, we need to minimally place a ',' at the end of the id
      // If we omit this, pandoc cannot parse the bibliography
      bibTexStr = bibTexStr + ",";
    }

    // Close the entry
    bibTexStr = bibTexStr + '\n}';
  }
  return bibTexStr;
};

const sortedKeys = (fields: { [key: string]: string }) => {
  let pos = 1;
  const keySortOrder: { [id: string]: number } = {};
  keySortOrder.title = pos++;
  keySortOrder.author = pos++;
  keySortOrder.editor = pos++;
  keySortOrder.year = pos++;
  keySortOrder.month = pos++;
  keySortOrder.date = pos++;
  keySortOrder.journal = pos++;
  keySortOrder.booktitle = pos++;
  keySortOrder.publisher = pos++;
  keySortOrder.howpublished = pos++;
  keySortOrder.pages = pos++;
  keySortOrder.series = pos++;
  keySortOrder.volume = pos++;
  keySortOrder.chapter = pos++;
  keySortOrder.number = pos++;
  keySortOrder.edition = pos++;
  keySortOrder.issue = pos++;
  keySortOrder.doi = pos++;
  keySortOrder.url = pos++;
  keySortOrder.abstract = pos++;
  keySortOrder.note = pos++;

  const keys = Object.keys(fields);
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
};

// Converts any non asciii characters to their LaTeX representations
const escapeNonAscii = (value: string): string => {
  let result = '';

  // Split the string in a way that will maintain unicode characters
  const chars = Array.from(value);
  chars.forEach(c => {
    const char = c.codePointAt(0);
    // Look for a LaTeX replace in the character mapping
    if (char) {
      const characterMap = characters[char];
      if (characterMap) {
        // Found one, emit the LaTeX
        // Use the braces to group the expression, unless the character replacement explicitly
        // doesn't want to be grouped
        result = result + (characterMap.ungrouped ? characterMap.latex : `{${characterMap.latex}}`);
      } else {
        // No LaTeX replacement, just emit the character
        result = result + String.fromCodePoint(char);
      }
    } else {
      // A position which has no codepoint. what on earth is this?
      result = result + '?';
    }
  });
  return result;
};

// Formats keys
const formatKey = (value: string | NodeArray, fieldKey: string) => {
  if (typeof value === 'string') {
    const fieldType = FieldMap[fieldKey];
    // If the field is an array, we can just emit the value
    // Otherwise, we should treat options as a keyed object and lookup
    // the bibtex value for this value
    if (Array.isArray(fieldType.options)) {
      return escapeNonAscii(value);
    } else if (fieldType.options) {
      return escapeNonAscii(fieldType.options[value].bibtex);
    } else {
      return escapeNonAscii(value);
    }
  } else {
    return formatText(value);
  }
};

// Formats text
const formatText = (nodes: NodeArray): string => {
  let formattedText = '';
  let lastNodeMarks: string[] = [];

  // This empty node at the end will cause us to go through the loop
  // after the last 'real' node and close out any open marks.
  const textNodes = nodes.concat({ type: 'text', text: '' });

  textNodes.forEach((node: NodeObject) => {
    /*
    // TODO: Do we need to deal with this (and if so, we need to re-add that escape routine)
    if (node.type === 'variable') {
      // This is an undefined variable
      // This should usually not happen, as CSL doesn't know what to
      // do with these. We'll put them into an unsupported tag.
      latex += `} # ${node.attrs.variable} # {`
      this.warnings.push({
        type: 'undefined_variable',
        variable: node.attrs.variable
      })
      return
    }
    */

    const thisNodeMarks: string[] = [];
    if (node.marks) {
      // Figure out the new marks for this node
      // TODO: Do we need to re-enable math mode for these low level sup/sub nodes?
      // let mathEnabled = false;
      node.marks.forEach((mark: MarkObject) => {
        // We need to activate mathmode for the lowest level sub/sup node.
        // Don't activate math mode for the lowest level node
        /*
        if ((mark.type === 'sup' || mark.type === 'sub') && !mathEnabled) {
          thisNodeMarks.push('math');
          thisNodeMarks.push(mark.type);
          mathEnabled = true;
        } else 
        */

        if (mark.type === 'nocase') {
          // No case should be the outer mark
          thisNodeMarks.unshift(mark.type);
        } else {
          // regular old mark
          thisNodeMarks.push(mark.type);
        }
      });
    }

    // Close any marks that aren't still open in this node
    let closing = false;
    const closeTags: string[] = [];
    lastNodeMarks.forEach((mark, index) => {
      if (mark !== thisNodeMarks[index]) {
        closing = true;
      }
      if (closing) {
        const closeTag =
          lastNodeMarks[0] !== 'nocase' && FormattingTags[mark].open[0] === '\\'
            ? `${FormattingTags[mark].close}}`
            : FormattingTags[mark].close;
        closeTags.push(closeTag);
      }
    });

    // Emit the close tags for the previous (last to first)
    closeTags.reverse();
    formattedText = formattedText + closeTags.join('');

    // Emit the open tags
    let opening = false;
    let doNotEscape = false;
    thisNodeMarks.forEach((mark, index) => {
      if (mark !== lastNodeMarks[index]) {
        opening = true;
      }
      if (opening) {
        // If not in a nocase, we can add protective brace
        if (thisNodeMarks[0] !== 'nocase' && FormattingTags[mark].open[0] === '\\') {
          formattedText = formattedText + '{';
        }
        formattedText = formattedText + FormattingTags[mark].open;
        if (FormattingTags[mark].verbatim) {
          doNotEscape = true;
        }
      }
    });

    const textNode = node as TextNodeObject;
    if (doNotEscape) {
      formattedText = formattedText + textNode.text;
    } else {
      formattedText = formattedText + escapeNonAscii(textNode.text);
    }
    lastNodeMarks = thisNodeMarks;
  });
  return formattedText;
};

// Formats ranges
const formatRange = (value: RangeArray[]): string => {
  // The correct symbol for a range of numbers is an en-dash, which in LaTeX is usually input as --.
  return value.map(range => range.map((text: NodeArray) => formatText(text)).join('--')).join(',');
};

// Formats author values
const formatNames = (names: NameDictObject[]): string => {
  const formattedNames: string[] = [];
  names.forEach(name => {
    if (name.literal) {
      // Use the literal
      const literal = formatText(name.literal);
      if (literal.length) {
        formattedNames.push(`{${literal}}`);
      }
    } else {
      // Compose the name
      // http://www.texfaq.org/FAQ-manyauthor
      const family = name.family ? formatText(name.family) : '';
      const given = name.given ? formatText(name.given) : '';
      const suffix = name.suffix ? formatText(name.suffix) : false;
      const prefix = name.prefix ? formatText(name.prefix) : false;

      if (suffix && prefix) {
        formattedNames.push(`${protect(`${prefix} ${family}`)}, ${protect(suffix)}, ${protect(given)}`);
      } else if (suffix) {
        formattedNames.push(`${protect(family)}, ${protect(suffix)}, ${protect(given)}`);
      } else if (prefix) {
        formattedNames.push(`${protect(`${prefix} ${family}`)}, ${protect(given)}`);
      } else {
        formattedNames.push(`${protect(family)}, ${protect(given)}`);
      }
    }
  });
  return formattedNames.join(' and ');
};

const kBibtexSafeRegex = /^[a-zA-Z0-9 .-]*$/;
function protect(str: string) {
  if (str.match(kBibtexSafeRegex)) {
    return str;
  } else {
    return `{${str}}`;
  }
}