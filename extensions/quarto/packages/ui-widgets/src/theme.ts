/*
 * theme.ts
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

export const kDarkThemeClass = 'bp4-dark';

export function setDarkThemeActive(active: boolean) {
  const root = document.getElementById('root');
  if (root) {
    if (active) {
      root.classList.add(kDarkThemeClass);  
    } else {
      root.classList.remove(kDarkThemeClass);
    }
  }
}

export function isDarkThemeActive() {
  return document.getElementById('root')?.classList.contains(kDarkThemeClass);
}
