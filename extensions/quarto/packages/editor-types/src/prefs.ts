/*
 * prefs.ts
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

export const kPrefsGetPrefs = "prefs_get_prefs";
export const kPrefsSetPrefs = "prefs_set_prefs";

export interface PrefsProvider {
  prefs() : Prefs;
  setPrefs(prefs: Record<string,unknown>) : void;
}

export interface MarkdownPrefs {
  readonly markdownWrap: 'none' | 'column' | 'sentence';
  readonly markdownWrapColumn: number;
  readonly markdownReferences: 'block' | 'section' | 'document';
  readonly markdownReferencesPrefix: string;
  readonly markdownReferenceLinks: boolean;
}

export interface Prefs extends MarkdownPrefs {
  // view
  readonly showOutline: boolean;

  // display
  readonly darkMode: boolean;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly maxContentWidth: number;

  // spelling
  readonly realtimeSpelling: boolean;
  readonly dictionaryLocale: string;

  // editing
  readonly emojiSkinTone: number;
  readonly listSpacing: 'tight' | 'spaced';
  readonly tabKeyMoveFocus: boolean;
  readonly equationPreview: boolean;

  // citations
  readonly zoteroUseBetterBibtex: boolean;
  readonly bibliographyDefaultType: 'bib' | 'yaml' | 'json';
  readonly citationDefaultInText: boolean;
  readonly packageListingEnabled: boolean;

  // code editing (vscode settings)
  readonly spacesForTab: boolean;
  readonly tabWidth: number;
  readonly autoClosingBrackets: boolean;   // done
  readonly highlightSelectedWord: boolean;
  readonly showWhitespace: boolean;
  readonly blinkingCursor: boolean;
  readonly quickSuggestions: boolean;

  // code editing (native settings)
  readonly lineNumbers: boolean;
}

export function defaultMarkdownPrefs(): MarkdownPrefs {
  return {
    markdownWrap: 'none',
    markdownWrapColumn: 72,
    markdownReferences: 'block',
    markdownReferencesPrefix: '',
    markdownReferenceLinks: false
  }
}

export function defaultPrefs() : Prefs {
  return {
    // view
    showOutline: false,

    // display
    darkMode: false,
    fontSize: 12,
    // by default, same as vscode markdown preview
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', system-ui, 'Ubuntu', 'Droid Sans', sans-serif",
    // NOTE: sync with default in vscode/package.json
    maxContentWidth: 1000,

    // spelling
    realtimeSpelling: true,
    dictionaryLocale: 'en_US',

    // editing
    emojiSkinTone: 0,
    listSpacing: 'spaced',
    tabKeyMoveFocus: false,
    equationPreview: true,

    // markdown
    ...defaultMarkdownPrefs(),
   
    // citations
    zoteroUseBetterBibtex: false,
    bibliographyDefaultType: 'bib',
    citationDefaultInText: false,
    packageListingEnabled: false,

    // code editing
    spacesForTab: true,
    tabWidth: 2,
    autoClosingBrackets: true,
    highlightSelectedWord: true,
    lineNumbers: true,
    showWhitespace: false,
    blinkingCursor: true,
    quickSuggestions: true
  }
}

export interface PrefsServer {
  getPrefs: () => Promise<Prefs>;
  setPrefs: (prefs: Prefs) => Promise<void>;
}