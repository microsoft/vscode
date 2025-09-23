/*
 * insert_symbol-dataprovider.ts
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

import { Transaction, EditorState } from 'prosemirror-state';

import { EditorUIPrefs, EditorUIContext } from '../../api/ui-types';
import { WidgetProps } from '../../api/widgets/react';

// The data provider is used by the insert symbol popup to render different types of
// symbols (e.g. emoji versus symbol characters)
export interface SymbolDataProvider {
  symbolGroupNames(): string[];
  getSymbols(groupName: string | undefined): SymbolCharacter[];
  filterSymbols(filterText: string, symbols: SymbolCharacter[]): SymbolCharacter[];

  readonly filterPlaceholderHint: string;
  symbolPreviewStyle: React.CSSProperties;
  symbolPreferencesPanel?: React.FC<SymbolPreferencesProps>;

  insertSymbolTransaction(symbolCharacter: SymbolCharacter, searchTerm: string, state: EditorState): Transaction;
}

// A named group of symbols
export interface SymbolCharacterGroup {
  name: string;
  symbols: SymbolCharacter[];
}

// An individual symbol
export interface SymbolCharacter {
  name: string;
  value: string;
  markdown?: string;
  codepoint?: number;

  aliases?: string[];
  description?: string;
}

// If the data provide implements a Preference Panel, these are the
// properties that will be provided to the panel component
export interface SymbolPreferencesProps extends WidgetProps {
  selectedSymbolIndex: number;
  context: EditorUIContext;
  prefs: EditorUIPrefs;
  onPreferencesChanged: VoidFunction;
}
