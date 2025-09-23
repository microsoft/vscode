/*
 * emoji.ts
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

import kEmojis from './emojis-all';

export const kEmojiAttr = 0;
export const kEmojiContent = 1;

// A raw emoji which doesn't include skin tone information
export interface EmojiRaw {
  emojiRaw: string;
  aliases: string[];
  category: string;
  description: string;
  supportsSkinTone?: boolean;
  hasMarkdownRepresentation: boolean;
}

// A complete emoji that may additional render skintone
export interface Emoji extends EmojiRaw {
  emoji: string;
  skinTone: SkinTone;
}

// Skin tones that are permitted for emoji
// None = user hasn't expressed a preference
// Default = don't apply a skin tone (use yellow emoji)
export enum SkinTone {
  None = -1,
  Default = 0,
  Light = 0x1f3fb,
  MediumLight = 0x1f3fc,
  Medium = 0x1f3fd,
  MediumDark = 0x1f3fe,
  Dark = 0x1f3ff,
}

function hasSkinTone(skinTone: SkinTone): boolean {
  return skinTone !== SkinTone.None && skinTone !== SkinTone.Default;
}

export function emojis(skinTone: SkinTone): Emoji[] {
  return kEmojis.map(emoji => emojiWithSkinTone(emoji, skinTone));
}

export function emojiCategories(): string[] {
  return kEmojis
    .map(emoji => emoji.category)
    .filter((catgegory, index, categories) => categories.indexOf(catgegory) === index);
}

export function emojiFromString(emojiString: string, skinTone: SkinTone): Emoji | undefined {
  return emojis(skinTone).find(em => em.emoji === emojiString);
}

export function emojiWithSkinTonePreference(emoji: EmojiRaw, skinTone: SkinTone): Emoji {
  return emojiWithSkinTone(emoji, skinTone);
}

// Find a matching non skin toned emoji for a given string
export function emojiFromChar(emojiString: string): EmojiRaw | undefined {
  return kEmojis.find(emoji => emoji.emojiRaw === emojiString);
}

// Returns a non skin tonned emoji for a given alias.
export function emojiFromAlias(emojiAlias: string): EmojiRaw | undefined {
  for (const emoji of kEmojis) {
    if (emoji.aliases.includes(emojiAlias)) {
      return emoji;
    }
  }
  return undefined;
}

// Returns an array of skin toned emoji including the unskintoned emoji. If the emoji
// doesn't support skin tones, this returns the original emoji.
export function emojiForAllSkinTones(emoji: EmojiRaw): Emoji[] {
  if (emoji.supportsSkinTone) {
    return [
      emojiWithSkinTone(emoji, SkinTone.Default),
      emojiWithSkinTone(emoji, SkinTone.Light),
      emojiWithSkinTone(emoji, SkinTone.MediumLight),
      emojiWithSkinTone(emoji, SkinTone.Medium),
      emojiWithSkinTone(emoji, SkinTone.MediumDark),
      emojiWithSkinTone(emoji, SkinTone.Dark),
    ];
  } else {
    return [emojiWithSkinTone(emoji, SkinTone.Default)];
  }
}

// Returns a skin toned version of the emoji, or the original emoji if it
// doesn't support skin tones
function emojiWithSkinTone(emoji: EmojiRaw, skinTone: SkinTone): Emoji {
  if (!emoji.supportsSkinTone) {
    return { ...emoji, emoji: emoji.emojiRaw, skinTone: SkinTone.Default };
  }

  const skinToneEmoji: Emoji = {
    emojiRaw: emoji.emojiRaw,
    aliases: emoji.aliases,
    category: emoji.category,
    description: emoji.description,
    supportsSkinTone: emoji.supportsSkinTone,
    hasMarkdownRepresentation: emoji.hasMarkdownRepresentation,
    emoji: emoji.emojiRaw + characterForSkinTone(skinTone), //
    skinTone,
  };
  return skinToneEmoji;
}

// No skin tone returns an empty string, otherwise the skintone codepoint
// is converted into a string
function characterForSkinTone(skinTone: SkinTone): string {
  return hasSkinTone(skinTone) ? String.fromCodePoint(skinTone) : '';
}
