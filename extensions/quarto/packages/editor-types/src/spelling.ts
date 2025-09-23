/*
 * spelling.ts
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


export interface EditorUISpelling {
  checkWords: (words: string[]) => string[];
  suggestionList: (word: string, callback: (suggestions: string[]) => void) => void;
  addToDictionary: (word: string) => void;
  isWordIgnored: (word: string) => boolean;
  ignoreWord: (word: string) => void;
  unignoreWord: (word: string) => void;
}








