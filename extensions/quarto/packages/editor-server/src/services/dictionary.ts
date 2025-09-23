/* eslint-disable @typescript-eslint/no-unused-vars */
/*
 * dictionary.ts
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

import fs from "node:fs";
import path from "node:path";

import { v4 as uuidv4 } from 'uuid';

import { JsonRpcServerMethod } from "core";

import { 
  Dictionary, 
  DictionaryInfo, 
  DictionaryServer, 
  IgnoredWord, 
  kDictionaryAddToUserDictionary, 
  kDictionaryAvailableDictionaries, 
  kDictionaryGetDictionary, 
  kDictionaryGetIgnoredwords, 
  kDictionaryGetUserDictionary, 
  kDictionaryIgnoreWord,
  kDictionaryUnignoreWord
} from "editor-types";
import { jsonRpcError, lines } from "core";

// dictionaries from: https://github.com/wooorm/dictionaries

export interface DictionaryServerOptions {
  dictionariesDir: string;
  userDictionaryDir: string;
}

export function dictionaryServer(options: DictionaryServerOptions) : DictionaryServer {
  
  // user dictionary
  if (!fs.existsSync(options.userDictionaryDir)) {
    fs.mkdirSync(options.userDictionaryDir);
  }
  const userDictionaryPath = path.join(options.userDictionaryDir, "dictionary.txt");
  // read/write user dictionary
  const readUserDictionary = () => {
    if (fs.existsSync(userDictionaryPath)) {
      return lines(fs.readFileSync(userDictionaryPath, { encoding: "utf-8" }));
    } else {
      return [];
    }
  }
  const writeUserDictionary = (words: string[]) => {
    fs.writeFileSync(userDictionaryPath, words.join("\n"), { encoding: "utf-8" });
  }

  // ignored words
  const ignoredWordsPath = path.join(options.userDictionaryDir, "ignored");
  if (!fs.existsSync(ignoredWordsPath)) {
    fs.mkdirSync(ignoredWordsPath, { recursive: true });
  }
  const ignoredWordsIndexFile = path.join(ignoredWordsPath, "INDEX");
  const readIgnoredWordsIndex = () : Record<string,string> => {
    if (fs.existsSync(ignoredWordsIndexFile)) {
      return JSON.parse(fs.readFileSync(ignoredWordsIndexFile, { encoding: "utf-8" })) as Record<string,string>;
    } else {
      return {};
    }
  }
  const writeIgnoredWordsIndex = (index: Record<string,string>) => {
    fs.writeFileSync(ignoredWordsIndexFile, JSON.stringify(index, undefined, 2), { encoding: "utf-8" });
  }
  const readIgnoredWords = (context: string) : string[] => {
    const index = readIgnoredWordsIndex();
    if (index[context]) {
      const wordsPath = path.join(ignoredWordsPath, index[context]);
      if (fs.existsSync(wordsPath)) {
        return lines(fs.readFileSync(wordsPath, { encoding: "utf-8" }));
      } else {
        return [];
      }
    } else {
      return [];
    }
  }
  const writeIgnoredWords = (context: string, words: string[]) => {
    const index = readIgnoredWordsIndex();
    if (!index[context]) {
      index[context] = uuidv4();
      writeIgnoredWordsIndex(index);
    }
    const wordsPath = path.join(ignoredWordsPath, index[context]);
    fs.writeFileSync(wordsPath, words.join("\n"), { "encoding": "utf-8" });
  }
  
  return {
    async availableDictionaries(): Promise<DictionaryInfo[]> {
      return kKnownDictionaires.filter(dictionary => {
        return fs.existsSync(path.join(options.dictionariesDir, `${dictionary.locale}.dic`))
      })
    },
    async getDictionary(locale: string): Promise<Dictionary> {
      const wordsPath = path.join(options.dictionariesDir, `${locale}.dic`);
      const affPath = path.join(options.dictionariesDir, `${locale}.aff`);
      if (fs.existsSync(wordsPath) && fs.existsSync(affPath)) {
        const words = fs.readFileSync(wordsPath, { encoding: "utf-8" });
        const aff = fs.readFileSync(affPath, { encoding: "utf-8" });
        return { words, aff };
      } else {
        throw jsonRpcError(`Dictionary for ${locale} not found`);
      }
    },
    async getUserDictionary() : Promise<string[]> {
      return readUserDictionary();
    },
    async addToUserDictionary(word: string) : Promise<string[]> {
      const words = readUserDictionary().concat(word);
      writeUserDictionary(words);
      return words;
    },
    async getIgnoredWords(context: string) : Promise<string[]> {
      return readIgnoredWords(context);
    },
    async ignoreWord(word: IgnoredWord) : Promise<string[]> {
      const words = readIgnoredWords(word.context).concat(word.word);
      writeIgnoredWords(word.context, words);
      return words;
    },
    async unignoreWord(word: IgnoredWord) : Promise<string[]> {
      const words = readIgnoredWords(word.context).filter(w => w !== word.word);
      writeIgnoredWords(word.context, words);
      return words;
    }
  }
}

export function dictionaryServerMethods(options: DictionaryServerOptions) : Record<string, JsonRpcServerMethod> {
  const server = dictionaryServer(options);
  const methods: Record<string, JsonRpcServerMethod> = {
    [kDictionaryAvailableDictionaries]: () => server.availableDictionaries(),
    [kDictionaryGetDictionary]: args => server.getDictionary(args[0]),
    [kDictionaryGetUserDictionary]: () => server.getUserDictionary(),
    [kDictionaryAddToUserDictionary]: args => server.addToUserDictionary(args[0]),
    [kDictionaryGetIgnoredwords]: args => server.getIgnoredWords(args[0]),
    [kDictionaryIgnoreWord]: args => server.ignoreWord(args[0]),
    [kDictionaryUnignoreWord]: args => server.unignoreWord(args[0])
  }
  return methods;
}

const kKnownDictionaires: DictionaryInfo[] =
[
   { locale: "bg_BG",     name: "Bulgarian"                },
   { locale: "ca_ES",     name: "Catalan"                  },
   { locale: "cs_CZ",     name: "Czech"                    },
   { locale: "da_DK",     name: "Danish"                   },
   { locale: "de_DE",     name: "German"                   },
   { locale: "de_DE_neu", name: "German (New)"             },
   { locale: "el_GR",     name: "Greek"                    },
   { locale: "en_AU",     name: "English (Australia)"      },
   { locale: "en_CA",     name: "English (Canada)"         },
   { locale: "en_GB",     name: "English (United Kingdom)" },
   { locale: "en_US",     name: "English (United States)"  },
   { locale: "es_ES",     name: "Spanish"                  },
   { locale: "fr_FR",     name: "French"                   },
   { locale: "hr_HR",     name: "Croatian"                 },
   { locale: "hu-HU",     name: "Hungarian"                },
   { locale: "id_ID",     name: "Indonesian"               },
   { locale: "it_IT",     name: "Italian"                  },
   { locale: "lt_LT",     name: "Lithuanian"               },
   { locale: "lv_LV",     name: "Latvian"                  },
   { locale: "nb_NO",     name: "Norwegian"                },
   { locale: "nl_NL",     name: "Dutch"                    },
   { locale: "pl_PL",     name: "Polish"                   },
   { locale: "pt_BR",     name: "Portuguese (Brazil)"      },
   { locale: "pt_PT",     name: "Portuguese (Portugal)"    },
   { locale: "ro_RO",     name: "Romanian"                 },
   { locale: "ru_RU",     name: "Russian"                  },
   { locale: "sh",        name: "Serbo-Croatian"           },
   { locale: "sk_SK",     name: "Slovak"                   },
   { locale: "sl_SI",     name: "Slovenian"                },
   { locale: "sr",        name: "Serbian"                  },
   { locale: "sv_SE",     name: "Swedish"                  },
   { locale: "uk_UA",     name: "Ukrainian"                },
   { locale: "vi_VN",     name: "Vietnamese"               },
];



