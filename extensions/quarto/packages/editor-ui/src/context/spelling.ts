/*
 * editor-spelling.ts
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

import Typo from 'typo-js';

import { useEffect, useMemo, useRef, useState } from 'react';

import { EditorUISpelling } from 'editor';

import { defaultPrefs } from 'editor-types';

import { 
  useGetPrefsQuery,
  useAddToUserDictionaryMutation, 
  useGetDictionaryQuery, 
  useGetUserDictionaryQuery, 
  useIgnoredWordsQuery, 
  useIgnoreWordMutation, 
  useUnignoreWordMutation 
} from 'editor-ui';

export interface SpellingInvalidate {
  invalidateAllWords: () => void;
  invalidateWord: (word: string) => void;
}

export function useEditorSpelling(
  context: string, 
  invalidate: SpellingInvalidate
) : EditorUISpelling {

  // the typo instance and the ignored list is what we need to checkk/suggest
  const typoRef = useRef<Typo | null>(null);
  const [ignored, setIgnored] = useState<string[]>([]);

  // queries for data/context requried to check spelling
  const { data: prefs = defaultPrefs() } = useGetPrefsQuery();
  const { data: dictionary } = useGetDictionaryQuery(prefs.dictionaryLocale);
  const { data: userDictionary } = useGetUserDictionaryQuery();
  const { data: ignoredWords } = useIgnoredWordsQuery(context);

  // some mutations we trigger from spelling actions (these cause the
  // queries above to be automatically re-run)
  const [ addToUserDictionary ] = useAddToUserDictionaryMutation();
  const [ ignoreWord ] = useIgnoreWordMutation();
  const [ unignoreWord ] = useUnignoreWordMutation();

  // recreate typo when dictionary changes
  useEffect(() => {
    if (dictionary) {
      typoRef.current = new Typo(prefs.dictionaryLocale, dictionary.aff, dictionary.words);
    }
    invalidate.invalidateAllWords();
  }, [dictionary, prefs.realtimeSpelling]);

  // update ignored list when user dictionary or ignored words change
  useEffect(() => {
    setIgnored([
      ...(userDictionary || []),
      ...(ignoredWords || [])
    ]);
  }, [userDictionary, ignoredWords]);

  // spelling interface (update if context, dictionary, or ignored changes)
  const spelling = useMemo(() => {
    return {
      checkWords(words: string[]) : string[] {
        return words.filter(word => {
          if (!prefs.realtimeSpelling) {
            return false;
          } else if (ignored.includes(word)) {
            return false;
          // ignore pathalogically long words
          } else if (word.length > 250) {
            return false;
          // ignore words with number or capital letters
          // NOTE: may want to make this a preference
          } else if (ignoreWordWithUppercaseOrNumber(word)) {
            return false;
          } else {
            return typoRef.current ? !typoRef.current.check(word) : false
          }
        });  
      },
      suggestionList(word: string, callback: (suggestions: string[]) => void) {
        callback(typoRef.current?.suggest(word) || []);
      },
      addToDictionary(word: string) {
        addToUserDictionary(word).unwrap()
          .then(() => invalidate.invalidateWord(word));
      },
      isWordIgnored(word: string) {
        return ignored.includes(word);
      },
      ignoreWord(word: string) {
        ignoreWord({ context, word }).unwrap()
          .then(() => invalidate.invalidateWord(word));
       ;
      },
      unignoreWord(word: string) {
        unignoreWord({ context, word }).unwrap()
          .then(() => invalidate.invalidateWord(word));
      }
    }
  }, [context, dictionary, ignored, prefs.realtimeSpelling]);

  return spelling;
}

function ignoreWordWithUppercaseOrNumber(word: string) {
  for (const ch of word) {
    if (ch === ch.toLocaleUpperCase()) {
      return true;
    }
    const code = ch.charCodeAt(0);
    if (code >= 48 && code <= 57) {
      return true;
    }    
  }
  return false;
}