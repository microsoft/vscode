/*
 * language.ts
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

// Support emitting languages using 'babel' names
// This isn't strictly supported by pure BibTex
// but this seems likely to helpful to include
export const lanagugeMappings = {
  acadian: {
    csl: 'fr-CA',
    bibtex: 'acadian',
  },
  afrikaans: {
    csl: 'af-ZA',
    bibtex: 'afrikaans',
  },
  arabic: {
    csl: 'ar',
    bibtex: 'arabic',
  },
  basque: {
    csl: 'eu',
    bibtex: 'basque',
  },
  bulgarian: {
    csl: 'bg-BG',
    bibtex: 'bulgarian',
  },
  catalan: {
    csl: 'ca-AD',
    bibtex: 'catalan',
  },
  chinese: {
    csl: 'zh-CN',
    bibtex: 'pinyin',
  },
  croatian: {
    csl: 'hr-HR',
    bibtex: 'croatian',
  },
  czech: {
    csl: 'cs-CZ',
    bibtex: 'czech',
  },
  danish: {
    csl: 'da-DK',
    bibtex: 'danish',
  },
  dutch: {
    csl: 'nl-NL',
    bibtex: 'dutch',
  },
  auenglish: {
    csl: 'en-GB',
    bibtex: 'australian',
  },
  caenglish: {
    csl: 'en-US',
    bibtex: 'canadian',
  },
  nzenglish: {
    csl: 'en-GB',
    bibtex: 'newzealand',
  },
  ukenglish: {
    csl: 'en-GB',
    bibtex: 'ukenglish',
  },
  usenglish: {
    csl: 'en-US',
    bibtex: 'usenglish',
  },
  estonian: {
    csl: 'et-EE',
    bibtex: 'estonian',
  },
  finnish: {
    csl: 'fi-FI',
    bibtex: 'finnish',
  },
  french: {
    csl: 'fr-FR',
    bibtex: 'french',
  },
  cafrench: {
    csl: 'fr-CA',
    bibtex: 'canadien',
  },
  german: {
    csl: 'de-DE',
    bibtex: 'ngerman',
  },
  atgerman: {
    csl: 'de-AT',
    bibtex: 'naustrian',
  },
  greek: {
    csl: 'el-GR',
    bibtex: 'greek',
  },
  hebrew: {
    csl: 'he-IL',
    bibtex: 'hebrew',
  },
  hungarian: {
    csl: 'hu-HU',
    bibtex: 'hungarian',
  },
  icelandic: {
    csl: 'is-IS',
    bibtex: 'icelandic',
  },
  italian: {
    csl: 'it-IT',
    bibtex: 'italian',
  },
  japanese: {
    csl: 'ja-JP',
    bibtex: 'japanese',
  },
  latin: {
    csl: 'la',
    bibtex: 'latin',
  },
  latvian: {
    csl: 'lv-LV',
    bibtex: 'latvian',
  },
  lithuanian: {
    csl: 'lt-LT',
    bibtex: 'lithuanian',
  },
  magyar: {
    csl: 'hu-HU',
    bibtex: 'magyar',
  },
  mongolian: {
    csl: 'mn-MN',
    bibtex: 'mongolian',
  },
  norwegian: {
    csl: 'nb-NO',
    bibtex: 'norsk',
  },
  newnorwegian: {
    csl: 'nn-NO',
    bibtex: 'nynorsk',
  },
  farsi: {
    csl: 'fa-IR',
    bibtex: 'farsi',
  },
  polish: {
    csl: 'pl-PL',
    bibtex: 'polish',
  },
  portuguese: {
    csl: 'pt-PT',
    bibtex: 'portuguese',
  },
  brportuguese: {
    csl: 'pt-BR',
    bibtex: 'brazilian',
  },
  romanian: {
    csl: 'ro-RO',
    bibtex: 'romanian',
  },
  russian: {
    csl: 'ru-RU',
    bibtex: 'russian',
  },
  serbian: {
    csl: 'sr-RS',
    bibtex: 'serbian',
  },
  cyrillicserbian: {
    csl: 'sr-RS',
    bibtex: 'serbianc',
  },
  slovak: {
    csl: 'sk-SK',
    bibtex: 'slovak',
  },
  slovene: {
    csl: 'sl-SL',
    bibtex: 'slovene',
  },
  spanish: {
    csl: 'es-ES',
    bibtex: 'spanish',
  },
  swedish: {
    csl: 'sv-SE',
    bibtex: 'swedish',
  },
  thai: {
    csl: 'th-TH',
    bibtex: 'thai',
  },
  turkish: {
    csl: 'tr-TR',
    bibtex: 'turkish',
  },
  ukrainian: {
    csl: 'uk-UA',
    bibtex: 'ukrainian',
  },
  vietnamese: {
    csl: 'vi-VN',
    bibtex: 'vietnamese',
  },
};
