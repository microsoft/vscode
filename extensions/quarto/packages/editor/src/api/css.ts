/*
 * css.ts
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

import { kWidthAttrib, kHeightAttrib, kStyleAttrib } from './pandoc_attr';

export const kPercentUnit = '%';
export const kPixelUnit = 'px';
export function removeStyleAttrib(style: string, attrib: string, handler?: (attrib: string, value: string) => void) {
  const pattern = '(' + attrib + ')\\:\\s*([^;]+);?';
  const regex = new RegExp(pattern, 'g');
  return style.replace(regex, (_match, p1, p2) => {
    if (handler) {
      handler(p1, p2);
    }
    return '';
  });
}

export function extractSizeStyles(keyvalues: Array<[string, string]> | undefined) {
  if (!keyvalues) {
    return keyvalues;
  }

  let newKeyvalues = keyvalues;

  const getValue = (key: string) => {
    const pair = newKeyvalues.find(keyvalue => keyvalue[0] === key);
    return pair ? pair[1] : null;
  };

  const setValue = (key: string, value: string | null) => {
    newKeyvalues = newKeyvalues.filter(keyvalue => keyvalue[0] !== key);
    if (value) {
      newKeyvalues.push([key, value]);
    }
  };

  let width = getValue(kWidthAttrib);
  let height = getValue(kHeightAttrib);
  let style = getValue(kStyleAttrib);

  if (style) {
    style = removeStyleAttrib(style, kWidthAttrib, (_attrib, value) => {
      if (!width) {
        width = value;
      }
    });
    style = removeStyleAttrib(style, kHeightAttrib, (_attrib, value) => {
      if (!height) {
        height = value;
      }
    });

    // remove leading ; from style
    style = style.replace(/^\s*;+\s*/, '').trimLeft();
  }

  setValue(kWidthAttrib, width);
  setValue(kHeightAttrib, height);
  setValue(kStyleAttrib, style);

  return newKeyvalues;
}

export function applyStyles(el: HTMLElement, classes?: string[], style?: { [key: string]: string }) {
  if (classes) {
    if (classes) {
      classes.forEach(clz => el.classList.add(clz));
    }
  }
  if (style) {
    Object.keys(style).forEach(name => {
      el.style.setProperty(name, style[name]);
    });
  }
}

export function replaceClassWithStyle(el: HTMLElement, className: string, style: { [key: string]: string }) {
  if (el.classList.contains(className)) {
    el.classList.remove(className);
    if (el.classList.length === 0) {
      el.removeAttribute('class');
    }

    Object.keys(style).forEach(name => {
      el.style.setProperty(name, style[name]);
    });
  }
  const children = el.children;
  for (let i = 0; i<children.length; i++) {
    const child = children.item(i);
    if (child instanceof HTMLElement) {
      replaceClassWithStyle(child, className, style);
    }
   
  }
}
