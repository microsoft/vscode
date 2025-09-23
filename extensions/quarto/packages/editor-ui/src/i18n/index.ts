/*
 * index.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import i18n, { TFunction } from 'i18next';

import enCommands from "./locales/en/commands.json";
import enTranslations from "./locales/en/translations.json";

export async function initEditorTranslations(): Promise<TFunction> {
  t = await i18n
    .init({
      fallbackLng: 'en',
      debug: false,
      ns: ['translations', 'commands'],
      defaultNS: 'translations',
      resources: {
        en: {
          commands: enCommands,
          translations: enTranslations
        }
      },
      keySeparator: false,
      interpolation: {
        escapeValue: false,
      },
    });
  
  

  return t;
}

export let t: TFunction;
