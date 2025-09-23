/*
 * util.ts
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
 
import { CSL } from "editor-types";

const kKeyPattern = /((.*?)\s*:\s*([^\s]+))/g;

// CSL Supports 'Cheater' syntax for field values.
// The suggested form and additional information can be found here
// https://citeproc-js.readthedocs.io/en/latest/csl-json/markup.html#cheater-syntax-for-odd-fields

export function resolveCslJsonCheaterKeys(csl: CSL) {
  resolveCslJsonCheaterKeyForField(csl, "extra");
  resolveCslJsonCheaterKeyForField(csl, "note");
}


export function resolveCslJsonCheaterKeyForValue(csl: CSL, cheaterValue: string) {
  kKeyPattern.lastIndex = 0;
  let match = kKeyPattern.exec(cheaterValue);
  while (match !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value) {
      csl[cheaterKey(key)] = value;
    }
    match = kKeyPattern.exec(cheaterValue);
  }  
  kKeyPattern.lastIndex = 0;
}

export function resolveCslJsonCheaterKeyForField(csl: CSL, fieldName: string) {
  if (csl[fieldName] !== undefined) {
   const value = csl[fieldName];
   if (typeof(value) === "string") {
     resolveCslJsonCheaterKeyForValue(csl, value)
   }
 }
}

function cheaterKey(cslKey: string) {
  if (cslKey === "Citation Key") {
    return "id";
  } else {
    return cslKey;
  }
}

