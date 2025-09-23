/*
 * context.ts
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

import { JsonRpcRequestTransport, PromiseQueue } from 'core';

import { codeMirrorExtension } from "editor-codemirror";

import { 
  EditorDialogs, 
  Prefs, 
  EditorUISpelling, 
  MathjaxTypesetResult,
  MathServer,
  EditorServer,
  EditorServices
} from 'editor-types';


import {
  EditorContext,
  EditorMath,
  EditorUIContext,
  EditorUIPrefs,
  ListSpacing,
  SkinTone,
  UITools,
  EditorDisplay,
  Extension,
  ExtensionFn
} from "editor";


export interface EditorPrefs {
  prefs: () => Prefs, 
  setPrefs: (prefs: Record<string,unknown>) => void
}

export interface EditorProviders {
  server: EditorServer,
  services: EditorServices,
  request: JsonRpcRequestTransport, 
  uiContext: EditorUIContext,
  prefs: () => EditorPrefs,
  dialogs: () => EditorDialogs,
  display: () => EditorDisplay,
  spelling: () => EditorUISpelling,
  extensions?: Array<Extension | ExtensionFn>
}

export function editorContext(providers: EditorProviders) : EditorContext {
  
  const uiTools = new UITools();
  
  const ui = {
    dialogs: providers.dialogs(),
    display: providers.display(),
    math: editorMath(providers.services.math, providers.uiContext, providers.prefs),
    context: providers.uiContext,
    prefs: editorPrefs(providers.prefs),
    codeview: providers.services.codeview,
    spelling: editorSpelling(providers.spelling),
    images: uiTools.context.defaultUIImages()
  };


  const context : EditorContext = { 
    server: providers.server, 
    ui, 
    extensions: providers.extensions,
    codeViewExtension: codeMirrorExtension 
  };

  return context;
}


export function editorMath(
  server: MathServer,
  uiContext: EditorUIContext,
  prefs: () => EditorPrefs
): EditorMath {

  const mathQueue = new PromiseQueue<MathjaxTypesetResult>();

  return {
    async typeset(
      el: HTMLElement,
      text: string,
      priority: boolean
    ): Promise<boolean> {

      // typeset function
      const typesetFn = () => {
        text = text.replace(/^\$\$?/, "").replace(/\$\$?$/, "");
        return server.mathjaxTypeset(
          text, 
          { 
            format: "data-uri",
            theme: prefs().prefs().darkMode ? "dark" : "light",
            scale: 1,
            extensions: []
          },
          uiContext.getDocumentPath()
        );
      }

      // execute immediately or enque depending on priority
      const result = priority ? await typesetFn() : await mathQueue.enqueue(typesetFn);

      // handle result
      if (result.math) {
        const img = window.document.createElement("img");
        img.src = result.math;
        el.replaceChildren(img);
        return false; // no error
      } else {
        console.log(result.error);
        return true; // error
      }
    },
  };
}

function editorPrefs(provider: () => EditorPrefs): EditorUIPrefs {
  return {
    realtimeSpelling() : boolean {
      return provider().prefs().realtimeSpelling;
    },
    darkMode(): boolean {
      return provider().prefs().darkMode;
    },
    listSpacing(): ListSpacing {
      return provider().prefs().listSpacing;
    },
    equationPreview(): boolean {
      return provider().prefs().equationPreview;
    },
    packageListingEnabled(): boolean {
      return provider().prefs().packageListingEnabled;
    },
    tabKeyMoveFocus(): boolean {
      return provider().prefs().tabKeyMoveFocus;
    },
    emojiSkinTone(): SkinTone {
      return provider().prefs().emojiSkinTone;
    },
    setEmojiSkinTone(emojiSkinTone: SkinTone) {
      provider().setPrefs({ emojiSkinTone });
    },
    zoteroUseBetterBibtex(): boolean {
      return provider().prefs().zoteroUseBetterBibtex;
    },
    setBibliographyDefaultType(bibliographyDefaultType: string) {
      provider().setPrefs({ bibliographyDefaultType });
    },
    bibliographyDefaultType(): string {
      return provider().prefs().bibliographyDefaultType;
    },
    citationDefaultInText(): boolean {
      return provider().prefs().citationDefaultInText;
    },
    setCitationDefaultInText(citationDefaultInText: boolean) {
      provider().setPrefs({ citationDefaultInText });
    },
    spacesForTab: ()=> {
      return provider().prefs().spacesForTab;
    },
    tabWidth: () => {
      return provider().prefs().tabWidth;
    },
    autoClosingBrackets: () => {
      return provider().prefs().autoClosingBrackets;
    },
    highlightSelectedWord: () => {
      return provider().prefs().highlightSelectedWord;
    },
    lineNumbers: () => {
      return provider().prefs().lineNumbers;
    },
    showWhitespace: () => {
      return provider().prefs().showWhitespace;
    },
    blinkingCursor: () => {
      return provider().prefs().blinkingCursor;
    },
    quickSuggestions: () => {
      return provider().prefs().quickSuggestions;
    }
  };
}



function editorSpelling(provider: () => EditorUISpelling) : EditorUISpelling {
  return {
    checkWords(words: string[]): string[] {
      return provider().checkWords(words);
    },
    suggestionList(word: string, callback: (suggestions: string[]) => void) {
      return provider().suggestionList(word, callback);
    },
    isWordIgnored(word: string): boolean {
      return provider().isWordIgnored(word);
    },
    ignoreWord(word: string) {
      return provider().ignoreWord(word);
    },
    unignoreWord(word: string) {
      return provider().unignoreWord(word);
    },
    addToDictionary(word: string) {
      return provider().addToDictionary(word);
    }
  };
}
