/*
 * solarized.ts
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
  webLightTheme,
  webDarkTheme
} from "@fluentui/react-components";

import { EditorTheme } from "editor";
import { isDarkThemeActive, setDarkThemeActive } from "ui-widgets";

// detect solarized theme using various hueristics
export function isSolarizedThemeActive() {
  return (document.body.getAttribute('data-vscode-theme-name') || '').includes('Solarized Light');
}

export function setEditorTheme(theme: EditorTheme) { 
  setDarkThemeActive(theme.darkMode);
}

export function fluentTheme() {
  if (isDarkThemeActive()) {
    return webDarkTheme;
  } else {
    return webLightTheme;
  }
}

