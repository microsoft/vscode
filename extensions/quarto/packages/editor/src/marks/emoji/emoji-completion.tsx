/*
 * emoji-completion.tsx
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

import { EditorState, Transaction } from 'prosemirror-state';
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';

import React from 'react';

import { EditorUI } from '../../api/ui-types';

import { CompletionHandler, CompletionResult, CompletionHeaderProps } from '../../api/completion';
import { emojis, Emoji, SkinTone, emojiFromChar, emojiForAllSkinTones } from '../../api/emoji';
import { getMarkRange, getMarkAttrs } from '../../api/mark';
import { nodeForEmoji } from './emoji';

import './emoji-completion.css';

export function emojiCompletionHandler(ui: EditorUI): CompletionHandler<Emoji> {
  return {
    id: '95A133E1-968B-4D96-8849-4A325FF02C11',

    completions: emojiCompletions(ui),

    replacement(schema: Schema, emoji: Emoji | null): string | ProsemirrorNode | null {
      if (emoji) {
        return nodeForEmoji(schema, emoji, emoji.aliases[0]);
      } else {
        return null;
      }
    },

    view: {
      component: EmojiView,
      key: emoji => emoji.emoji,
      width: 200,
      hideNoResults: true,
    },
  };
}

const kMaxEmojiCompletions = 20;
const kEmojiCompletionRegEx = /(^|[^`:]):(\w{2,})$/;

function emojiCompletions(ui: EditorUI) {
  return (text: string, context: EditorState | Transaction): CompletionResult<Emoji> | null => {
    // look for requisite text sequence
    const match = text.match(kEmojiCompletionRegEx);
    if (match) {
      // determine insert position and prefix to search for
      const prefix = match[2].toLowerCase();
      const pos = context.selection.head - prefix.length - 1; // -1 for the leading :

      // scan for completions that match the prefix (truncate as necessary)
      const completions: Emoji[] = [];
      for (const emoji of emojis(ui.prefs.emojiSkinTone())) {
        const alias = emoji.aliases.find(a => a.startsWith(prefix));
        if (alias) {
          completions.push({
            ...emoji,
            aliases: [alias],
          });
        }
        if (completions.length >= kMaxEmojiCompletions) {
          break;
        }
      }

      // return result
      return {
        pos,
        token: prefix,
        completions: () => Promise.resolve(completions),
      };

      // no match
    } else {
      return null;
    }
  };
}

const EmojiView: React.FC<Emoji> = emoji => {
  return (
    <div className={'pm-completion-list-item-text pm-emoji-font'}>
      {emoji.emoji}&nbsp;:{emoji.aliases[0]}:
    </div>
  );
};

export function emojiSkintonePreferenceCompletionHandler(ui: EditorUI): CompletionHandler<Emoji> {
  return {
    id: '15E92D42-8006-40F4-8FFD-6526F6A8A7FD',

    completions: emojiSkintonePreferenceCompletions(ui),

    replacement(schema: Schema, emoji: Emoji | null): string | ProsemirrorNode | null {
      if (emoji) {
        // Save this preference and use it in the future
        ui.prefs.setEmojiSkinTone(emoji.skinTone);

        // Emit the emoji of the correct skin tone
        return nodeForEmoji(schema, emoji, emoji.aliases[0]);
      } else {
        // The user didn't select a skintoned emoji (e.g. pressed 'ESC'), so
        // just store Default and use that in the future
        ui.prefs.setEmojiSkinTone(SkinTone.Default);

        return null;
      }
    },

    view: {
      header: () => ({
        component: EmojiSkintonePreferenceHeaderView,
        height: kHeaderHeight,
      }),
      component: EmojiSkintonePreferenceView,
      key: pref => pref.skinTone,
      width: kCellWidth,
      height: kCellWidth,
      horizontal: true,
      horizontalItemWidths: [55],
    },
  };
}

const kCellWidth = 40;
const kHeaderHeight = 20;

function emojiSkintonePreferenceCompletions(ui: EditorUI) {
  return (_text: string, context: EditorState | Transaction): CompletionResult<Emoji> | null => {
    // The user has set a preference for skin tone
    if (ui.prefs.emojiSkinTone() !== SkinTone.None) {
      return null;
    }

    const range = getMarkRange(context.doc.resolve(context.selection.head - 1), context.doc.type.schema.marks.emoji);
    if (!range) {
      return null;
    }

    const emojiText = context.doc.textBetween(range.from, range.to);

    // If an attribute to suppress the prompt was explicitly set, don't prompt
    // the user for a skin tone
    const emojiAttrs = getMarkAttrs(context.doc, range, context.doc.type.schema.marks.emoji);
    if (!emojiAttrs.prompt) {
      return null;
    }
    const emoji = emojiFromChar(emojiText);

    // If this is an emoji that doesn't support skin tones just return
    if (!emoji?.supportsSkinTone) {
      return null;
    }

    return {
      pos: range.from,
      token: emojiText,
      completions: () => Promise.resolve(emojiForAllSkinTones(emoji)),
    };
  };
}

const EmojiSkintonePreferenceHeaderView: React.FC<CompletionHeaderProps> = props => {
  return (
    <div className={'pm-completion-emoji-cell-header pm-light-text-color'}>
      {props.ui.context.translateText('Choose preferred skin tone:')}
    </div>
  );
};

// use outline to apply border as a separator
const EmojiSkintonePreferenceView: React.FC<Emoji> = emoji => {
  return <div className="pm-completion-list-item-text pm-completion-emoji-cell">{emoji.emoji}</div>;
};
