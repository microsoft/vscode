/*
 * insert_emoji.tsx
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

import { PluginKey, EditorState } from 'prosemirror-state';
import { ProsemirrorCommand, EditorCommandId } from '../../api/command';

import React from 'react';

import { EditorUI } from '../../api/ui-types';
import { emojiCategories, emojis, Emoji, emojiFromString, SkinTone } from '../../api/emoji';
import { Extension, ExtensionContext } from '../../api/extension';
import { nodeForEmoji } from '../../marks/emoji/emoji';
import { OmniInsertGroup } from '../../api/omni_insert';

import { performInsertSymbol, InsertSymbolPlugin } from './insert_symbol-plugin';
import { SymbolDataProvider, SymbolCharacter } from './insert_symbol-dataprovider';
import { SymbolEmojiPreferencesPanel } from './insert_symbol-emoji-skintone';

const key = new PluginKey<boolean>('insert-emoji');

const extension = (context: ExtensionContext): Extension => {
  const { ui, events } = context;
  return {
    commands: () => {
      return [new ProsemirrorCommand(EditorCommandId.Emoji, [], performInsertSymbol(key), emojiOmniInsert(ui))];
    },
    plugins: () => {
      return [new InsertSymbolPlugin(key, new EmojiSymbolDataProvider(ui), ui, events)];
    },
  };
};

function emojiOmniInsert(ui: EditorUI) {
  return {
    name: ui.context.translateText('Emoji...'),
    description: ui.context.translateText('Image expressing idea, emotion, etc.'),
    group: OmniInsertGroup.Content,
    priority: 6,
    image: () => (ui.prefs.darkMode() ? ui.images.omni_insert.emoji_dark : ui.images.omni_insert.emoji),
  };
}

export class EmojiSymbolDataProvider implements SymbolDataProvider {
  public constructor(ui: EditorUI) {
    this.ui = ui;
  }
  private readonly ui: EditorUI;

  public readonly filterPlaceholderHint = 'emoji name';

  public readonly symbolPreviewStyle: React.CSSProperties = { fontSize: '36px' } as React.CSSProperties;

  public symbolPreferencesPanel = SymbolEmojiPreferencesPanel;

  public insertSymbolTransaction(symbolCharacter: SymbolCharacter, searchTerm: string, state: EditorState) {
    const emoji = emojiFromString(symbolCharacter.value, this.skinTone());
    const tr = state.tr;
    if (emoji) {
      // Try to find an alias that matches the user's search term
      const bestAlias = emoji.aliases.find(alias => alias.includes(searchTerm));
      tr.replaceSelectionWith(nodeForEmoji(state.schema, emoji, bestAlias || emoji.aliases[0], false), false);
    } else {
      // This doesn't appear to be an emoji or it doesn't have a markdown representation,
      // just insert the text
      tr.insertText(symbolCharacter.value);
    }
    return tr;
  }

  public symbolGroupNames(): string[] {
    return [kCategoryAll, ...emojiCategories()];
  }

  public getSymbols(groupName: string | undefined) {
    if (groupName === kCategoryAll || groupName === undefined) {
      return emojis(this.skinTone()).map(emoji => symbolForEmoji(emoji));
    } else {
      return emojis(this.skinTone())
        .filter(emoji => emoji.category === groupName)
        .map(emoji => symbolForEmoji(emoji));
    }
  }

  public filterSymbols(filterText: string, symbols: SymbolCharacter[]): SymbolCharacter[] {
    const filteredSymbols = symbols.filter(symbol => {
      // Search by name
      if (symbol.name.includes(filterText)) {
        return true;
      }

      // search each of the aliases
      if (symbol.aliases && symbol.aliases.find(alias => alias.includes(filterText))) {
        return true;
      }

      return false;
    });
    return filteredSymbols;
  }

  private skinTone(): SkinTone {
    return this.ui.prefs.emojiSkinTone();
  }
}

const kCategoryAll = 'All';
function symbolForEmoji(emoji: Emoji): SymbolCharacter {
  return {
    name: emoji.description,
    value: emoji.emoji,
    markdown: emoji.hasMarkdownRepresentation ? `:${emoji.aliases[0]}:` : undefined,
    aliases: emoji.aliases,
    description: emoji.description,
  };
}

export default extension;
