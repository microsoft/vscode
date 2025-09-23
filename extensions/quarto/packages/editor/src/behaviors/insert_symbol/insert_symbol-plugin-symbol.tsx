/*
 * insert_symbol.tsx
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

import { PluginKey, Transaction, EditorState } from 'prosemirror-state';

import { ProsemirrorCommand, EditorCommandId } from '../../api/command';
import { Extension, ExtensionContext } from '../../api/extension';
import { EditorUI } from '../../api/ui-types';
import { parseCodepoint } from '../../api/unicode';
import { OmniInsertGroup } from '../../api/omni_insert';

import { performInsertSymbol, InsertSymbolPlugin } from './insert_symbol-plugin';
import { SymbolDataProvider, SymbolCharacterGroup, SymbolCharacter } from './insert_symbol-dataprovider';

import symbolData from './symbols';

const key = new PluginKey<boolean>('insert-symbol');

const extension = (context: ExtensionContext): Extension => {
  const { ui, events } = context;
  return {
    commands: () => {
      return [new ProsemirrorCommand(EditorCommandId.Symbol, [], performInsertSymbol(key), symbolOmniInsert(ui))];
    },
    plugins: () => {
      return [new InsertSymbolPlugin(key, new UnicodeSymbolDataProvider(), ui, events)];
    },
  };
};

function symbolOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Symbol...'),
    keywords: ['unicode', 'special', 'character'],
    description: ui.context.translateText('Unicode symbol / special character'),
    group: OmniInsertGroup.Content,
    priority: 6,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.symbol_dark : ui.images.omni_insert?.symbol),
  };
}

class UnicodeSymbolDataProvider implements SymbolDataProvider {
  constructor() {
    this.symbolGroups = symbolData.sort((a, b) => a.name.localeCompare(b.name));
  }
  private readonly symbolGroups: SymbolCharacterGroup[];

  public insertSymbolTransaction(
    symbolCharacter: SymbolCharacter,
    _searchTerm: string,
    state: EditorState,
  ): Transaction {
    const tr = state.tr;
    tr.insertText(symbolCharacter.value);
    return tr;
  }

  public readonly filterPlaceholderHint = 'keyword or codepoint';

  public readonly symbolPreviewStyle: React.CSSProperties = { fontSize: '28px' } as React.CSSProperties;

  public symbolGroupNames(): string[] {
    return [kCategoryAll, ...this.symbolGroups.map(symbolGroup => symbolGroup.name)];
  }

  public getSymbols(groupName: string | undefined) {
    if (groupName === undefined || groupName === kCategoryAll) {
      return this.symbolGroups
        .map(symbolGroup => symbolGroup.symbols)
        .flat()
        .sort((a, b) => a.codepoint! - b.codepoint!);
    }
    return this.symbolGroups
      .filter(symbolGroup => groupName === symbolGroup.name)
      .map(symbolGroup => symbolGroup.symbols)
      .flat();
  }

  public filterSymbols(filterText: string, symbols: SymbolCharacter[]): SymbolCharacter[] {
    const codepoint = parseCodepoint(filterText);
    const filteredSymbols = symbols.filter(symbol => {
      // Search by name
      if (symbol.name.includes(filterText.toUpperCase())) {
        return true;
      }

      // Search by codepoint
      if (codepoint && symbol.codepoint === codepoint) {
        return true;
      }

      return false;
    });

    if (filteredSymbols.length === 0 && codepoint !== undefined) {
      return [
        {
          name: codepoint.toString(16),
          value: String.fromCodePoint(codepoint),
          codepoint,
        },
      ];
    }
    return filteredSymbols;
  }
}
const kCategoryAll = 'All';

export default extension;
