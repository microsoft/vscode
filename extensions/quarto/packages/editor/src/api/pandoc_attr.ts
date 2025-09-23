/*
 * pandoc_attr.ts
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

import { NodeSpec, MarkSpec } from 'prosemirror-model';

import { PandocAttr } from 'editor-types';

import { PandocToken, PandocExtensions } from './pandoc';
import { extensionEnabled, extensionIfEnabled, Extension } from './extension';

export const kPandocAttrId = 0;
export const kPandocAttrClasses = 1;
export const kPandocAttrKeyvalue = 2;

const kDataPmPandocAttr = 'data-pm-pandoc-attr';

export const kWidthAttrib = 'width';
export const kHeightAttrib = 'height';
export const kStyleAttrib = 'style';
export const kAlignAttrib = 'align';
export const kFigAltAttrib = 'fig-alt';
export const kFigAlignAttrib = 'fig-align';
export const kFigEnvAttrib = 'fig-env';

export const kCodeBlockAttr = 0;
export const kCodeBlockText = 1;

export const kSpanAttr = 0;
export const kSpanChildren = 1;

export type { PandocAttr };



export const pandocAttrSpec = {
  id: { default: null },
  classes: { default: [] },
  keyvalue: { default: [] },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrAvailable(attrs: any, keyvalue = true) {
  return !!attrs.id || 
         (attrs.classes && attrs.classes.length > 0) || 
         (keyvalue && attrs.keyvalue && attrs.keyvalue.length > 0);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrFrom(attrs: any) : PandocAttr {
  const pandocAttr: PandocAttr = {
    id: "",
    classes: [],
    keyvalue: []
  };
  if (attrs.id) {
    pandocAttr.id = attrs.id;
  }
  if (attrs.classes) {
    pandocAttr.classes = attrs.classes;
  }
  if (attrs.keyvalue) {
    pandocAttr.keyvalue = attrs.keyvalue;
  }

  return pandocAttr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrEnsureClass(attr: any, name: string) {
  attr.classes = [name].concat((attr.classes || []).filter((clz: string) => clz !== name));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrRemoveClass(attr: any, predicate: (str: string) => boolean) : string | undefined {
  let foundClass: string | undefined;
  if (Array.isArray(attr.classes)) {
    const classes: string[] = [];
    for (const clz of attr.classes) {
      if (predicate(clz)) {
        foundClass = clz;
      } else {
        classes.push(clz);
      }
    }
    attr.classes = classes;
    return foundClass;
   
  } else {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrHasClass(attrs: any, predicate: (str: string) => boolean) {
  if (Array.isArray(attrs.classes)) {
    const classes = attrs.classes as string[];
    return classes.some(clz => predicate(clz));
  } else {
    return false;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrGetKeyvalue(attr: any, key: string) {
  if (attr.keyvalue) {
    const entry = attr.keyvalue.find((keyval: string[]) => keyval[0] === key);
    if (entry) {
      return entry[1];
    } else {
      return undefined;
    }
  } else {
    return undefined;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrSetKeyvalue(attr: any, key: string, value: string) {
  const keyvalue = [...(attr.keyvalue || [])] as string[][];
  let add = true;
  for (const entry of keyvalue) {
    if (entry[0] === key) {
      entry[1] = value;
      add = false;
      break;
    }
  }
  if (add) {
    keyvalue.push([key, value]);
  }
  attr.keyvalue = keyvalue;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrRemoveKeyvalue(attr: any, key: string) {
  if (attr.keyvalue) {
    attr.keyvalue = attr.keyvalue.filter((entry: string[]) => entry[0] !== key);
  }
}

export function pandocAttrInSpec(spec: NodeSpec | MarkSpec) {
  const keys = Object.keys((spec.attrs as object) || {});
  return keys.includes('id') && keys.includes('classes') && keys.includes('keyvalue');
}

export function pandocAttrReadAST(tok: PandocToken, index: number) : PandocAttr {
  const pandocAttr = tok.c[index];
  return {
    id: pandocAttr[kPandocAttrId] || undefined,
    classes: (pandocAttr[kPandocAttrClasses] || []).map((clz: string) => clz.replace(/^\.+/, "")),
    keyvalue: pandocAttr[kPandocAttrKeyvalue],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pandocAttrToDomAttr(attrs: any, marker = true) {
  // id and class
  const domAttr: Record<string,unknown> = {};
  if (attrs.id) {
    domAttr.id = attrs.id;
  }
  if (attrs.classes && attrs.classes.length > 0) {
    domAttr.class = attrs.classes.join(' ');
  }

  // keyvalue pairs
  attrs.keyvalue.forEach((keyvalue: [string, string]) => {
    domAttr[keyvalue[0]] = keyvalue[1];
  });

  // marker
  if (marker) {
    domAttr[kDataPmPandocAttr] = '1';
  }

  return domAttr;
}

export function pandocAttrParseDom(el: Element, attrs: { [key: string]: string | null }, forceAttrs = false) {
  
  // exclude any keys passed to us as well as always exclude the spellcheck attribute
  const excludedNames = [...Object.keys(attrs), "spellcheck"];

  // if this isn't from a prosemirror pandoc node then include only src and alt
  const includedNames: string[] = [];
  if (!forceAttrs && !el.hasAttribute(kDataPmPandocAttr)) {
    includedNames.push('src', 'alt');
  }

  // read attributes
  const attr: PandocAttr = {
    id: "",
    classes: [],
    keyvalue: []
  };
  el.getAttributeNames().forEach(name => {
    const value: string = el.getAttribute(name) as string;
    // exclude attributes already parsed and prosemirror internal attributes
    if (excludedNames.indexOf(name) === -1 && !name.startsWith('data-pm')) {
      // if we have an include filter then use it
      if (!includedNames.length || includedNames.includes(name)) {
        if (name === 'id') {
          attr.id = value;
        } else if (name === 'class') {
          attr.classes = value
            .split(/\s+/)
            .filter(val => !!val.length)
            .filter(val => !val.startsWith('pm-'));
        } else {
          attr.keyvalue.push([name, value]);
        }
      }
    }
  });
  return attr;
}

export function pandocAttrParseText(attr: string): PandocAttr | null {
  attr = attr.trim();

  let id = '';
  const classes: string[] = [];
  let remainder = '';

  let current = '';
  const resolveCurrent = () => {
    const resolve = current;
    current = '';

    if (resolve.length === 0) {
      return true;
    } else if (resolve.startsWith('#')) {
      if (id.length === 0 && resolve.length > 1) {
        id = resolve.substr(1);
        return true;
      } else {
        return false;
      }
    } else if (resolve.startsWith('.')) {
      if (resolve.length > 1) {
        classes.push(resolve.substr(1));
        return true;
      } else {
        return false;
      }
    } else {
      remainder = resolve;
      return true;
    }
  };

  for (let i = 0; i < attr.length; i++) {
    let inQuotes = false;
    const ch = attr[i];
    inQuotes = ch === '"' ? !inQuotes : inQuotes;
    if (ch !== ' ' && !inQuotes) {
      current += ch;
    } else if (resolveCurrent()) {
      // if we have a remainder then the rest of the string is the remainder
      if (remainder.length > 0) {
        remainder = remainder + attr.substr(i);
        break;
      }
    } else {
      return null;
    }
  }

  if (resolveCurrent()) {
    if (id.length === 0 && classes.length === 0) {
      remainder = attr;
    }
    return {
      id,
      classes,
      keyvalue: remainder.length > 0 ? pandocAttrKeyvalueFromText(remainder, ' ') : [],
    };
  } else {
    return null;
  }
}

export function pandocAttrKeyvalueFromText(text: string, separator: ' ' | '\n'): Array<[string, string]> {
  // if the separator is a space then convert unquoted spaces to newline
  if (separator === ' ') {
    let convertedText = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      let ch = text.charAt(i);
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ' ' && !inQuotes) {
        ch = '\n';
      }
      convertedText += ch;
    }
    text = convertedText;
  }

  const lines = text.trim().split('\n');
  return lines.map(line => {
    const idx = line.indexOf('=');
    if (idx === -1) {
      return [line.trim(), ""]
    } else {
      const lhs = line.substring(0, idx).trim();
      const rhs = line.substring(idx + 1).trim();
      return [lhs, rhs.replace(/^"/, '').replace(/"$/, '')];
    }
  });
}

export interface AttrKeyvaluePartitioned {
  base: Array<[string, string]>;
  partitioned: Array<[string, string]>;
}

export function attrPartitionKeyvalue(partition: string[], keyvalue: Array<[string, string]>): AttrKeyvaluePartitioned {
  const base = new Array<[string, string]>();
  const partitioned = new Array<[string, string]>();

  keyvalue.forEach(kv => {
    if (partition.includes(kv[0])) {
      partitioned.push(kv);
    } else {
      base.push(kv);
    }
  });

  return {
    base,
    partitioned,
  };
}

export function extensionIfPandocAttrEnabled(extension: Extension) {
  return extensionIfEnabled(extension, kPandocAttrExtensions);
}

export function pandocAttrEnabled(pandocExtensions: PandocExtensions) {
  return extensionEnabled(pandocExtensions, kPandocAttrExtensions);
}

const kPandocAttrExtensions = [
  'link_attributes',
  'mmd_link_attributes',
  'mmd_header_identifiers',
  'header_attributes',
  'fenced_code_attributes',
  'inline_code_attributes',
  'bracketed_spans',
  'native_spans',
  'fenced_divs',
  'native_divs',
];
