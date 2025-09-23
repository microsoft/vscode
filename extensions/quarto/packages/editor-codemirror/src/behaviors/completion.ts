/*
 * completion.ts
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


import { EditorView } from "@codemirror/view";


import {
  autocompletion,
  Completion,
  CompletionContext,
  CompletionResult,
  insertCompletionText,
  pickedCompletion,
  snippet,
  startCompletion
} from "@codemirror/autocomplete";

import {
  CompletionItem,
  CompletionItemKind,
  InsertReplaceEdit,
  InsertTextFormat,
  MarkupContent,
  MarkupKind,
  TextEdit
} from "vscode-languageserver-types";

import md from "markdown-it";

import { editorLanguage } from "editor-core";

import { CodeViewCompletionContext, codeViewCompletionContext } from "editor";

import { Behavior, BehaviorContext } from ".";
import { escapeRegExpCharacters } from "core";

export function completionBehavior(behaviorContext: BehaviorContext): Behavior {

  // don't provide behavior if we don't have completions
  if (!behaviorContext.pmContext.ui.codeview) {
    return {};
  }

  return {
    extensions: [
      autocompletion({
        closeOnBlur: true,
        override: [
          async (context: CompletionContext): Promise<CompletionResult | null> => {

            // no completions if there is no path
            const filepath = behaviorContext.pmContext.ui.context.getDocumentPath();
            if (!filepath) {
              return null;
            }

            // see if there is a completion context
            const cvContext = codeViewCompletionContext(filepath, behaviorContext.view.state, context.explicit);
            if (!cvContext) {
              return null;
            }

            // check if this is a known editor language
            const language = editorLanguage(cvContext.language);
            if (!language) {
              return null;
            }

            // if we don't have quick suggestions enabled and this isn't explicit then bail
            if (!behaviorContext.pmContext.ui.prefs.quickSuggestions() && !context.explicit) {
              return null;
            }

            // if we aren't explcit then filter based on match (letter + wordchar + optional trigger chars)
            if (!context.explicit) {
              const trigger = (language.trigger || ["."]);
              const match = context.matchBefore(new RegExp('(^|[ \t])[\\\\A-Za-z_\\.][\\w_\\(\\)\\[\\]' + escapeRegExpCharacters(trigger.join('')) + ']*'));
              if (!match) {
                return null;
              }
            }

            // get completions
            return getCompletions(context, cvContext, behaviorContext);
          }
        ]
      })
    ]
  };
}

const compareBySortText = (a: CompletionItem, b: CompletionItem) => {
  if (a.sortText && b.sortText) {
    return a.sortText.localeCompare(b.sortText);
  } else {
    return 0;
  }
};

// compute from
const itemFrom = (item: CompletionItem, contextPos: number) => {
  // compute from
  return item.textEdit
    ? InsertReplaceEdit.is(item.textEdit)
      ? contextPos - (item.textEdit.insert.end.character - item.textEdit.insert.start.character)
      : TextEdit.is(item.textEdit)
        ? contextPos - (item.textEdit.range.end.character - item.textEdit.range.start.character)
        : contextPos
    : contextPos;
};

/**
 * replaceText for a given CompletionItem is the text that is already in the document
 * that that CompletionItem will replace.
 *
 * Example 1: if you are typing `lib` and get the completion `library`, then this function
 *   will give `lib`.
 * Example 2: if you are typing `os.a` and get the completion `abc`, then this function
 *   will give `a`.
 */
const getReplaceText = (context: CompletionContext, item: CompletionItem) =>
  context.state.sliceDoc(itemFrom(item, context.pos), context.pos);

const makeCompletionItemApplier = (item: CompletionItem, context: CompletionContext) =>
  (view: EditorView, completion: Completion) => {
    // compute from
    const from = itemFrom(item, context.pos);

    // handle snippets
    const insertText = item.textEdit?.newText ?? (item.insertText || item.label);
    if (item.insertTextFormat === InsertTextFormat.Snippet) {
      const insertSnippet = snippet(insertText.replace(/\$(\d+)/g, "$${$1}"));
      insertSnippet(view, completion, from, context.pos);
      // normal completions
    } else {
      view.dispatch({
        ...insertCompletionText(view.state, insertText, from, context.pos),
        annotations: pickedCompletion.of(completion)
      });
      if (item.command?.command === "editor.action.triggerSuggest") {
        startCompletion(view);
      }
    }
  };

const sortTextItemsBoostScore = (context: CompletionContext, items: CompletionItem[], index: number) => {
  const total = items.length;
  const item = items[index];
  // compute replaceText
  const replaceText = getReplaceText(context, item);

  // if the replaceText doesn't start with "." then bury items that do
  if (!replaceText.startsWith(".") && item.label.startsWith(".")) {
    return -99;
  }

  // only boost things that have a prefix match
  if (item.label.toLowerCase().startsWith(replaceText) ||
    (item.textEdit && item.textEdit.newText.toLowerCase().startsWith(replaceText)) ||
    (item.insertText && item.insertText.toLowerCase().startsWith(replaceText))) {
    return -99 + Math.round(((total - index) / total) * 198);;
  } else {
    return -99;
  }
};

const defaultBoostScore = (context: CompletionContext, items: CompletionItem[], index: number) => {
  const item = items[index];

  const replaceText = getReplaceText(context, item);

  // if you haven't typed into the completions yet (for example after a `.`) then
  // score items starting with non-alphabetic characters -1, everything else 0.
  if (replaceText.length === 0) return isLetter(item.label[0]) ? 0 : -1;

  // We filter items by replaceText inclusion before scoring,
  // so i is garaunteed to be an index into `item.label`...
  const i = item.label.toLowerCase().indexOf(replaceText.toLowerCase());
  // and `replaceTextInItermLabel` should be the same as `replaceText` up to upper/lowercase
  // differences.
  const replaceTextInItemLabel = item.label.slice(i, replaceText.length);

  // mostly counts how many upper/lowercase differences there are
  let diff = simpleStringDiff(replaceTextInItemLabel, replaceText);

  // `-i` scores completions better if what you typed is earlier in the completion
  // `-diff/10` mostly tie breaks that score by capitalization differences.
  return -i - diff / 10; // 10 is a magic number
};

async function getCompletions(
  context: CompletionContext,
  cvContext: CodeViewCompletionContext,
  behaviorContext: BehaviorContext
): Promise<CompletionResult | null> {
  if (context.aborted) return null;

  // get completions
  const completions = await behaviorContext.pmContext.ui.codeview?.codeViewCompletions(cvContext);
  if (completions === undefined) return null;
  if (completions.items.length == 0) return null;

  const itemsHaveSortText = completions.items?.[0].sortText !== undefined;

  const items = itemsHaveSortText ?
    completions.items.sort(compareBySortText) :
    completions.items;

  // The token is the contents of the line up to your cursor.
  // For example, if you type `os.a` then token will be `os.a`.
  // Note: in contrast, when you type `os.a` replaceText will give `a` for a completion like `abc`.
  const token = context.matchBefore(/\S+/)?.text;

  const filteredItems = items.filter(item => {
    // no text completions that aren't snippets
    if (item.kind === CompletionItemKind.Text &&
      item.insertTextFormat !== InsertTextFormat.Snippet) return false;

    // only allow non-text edits if we have no token
    if (item.textEdit === undefined && token) return false;

    // require at least inclusion
    const replaceText = getReplaceText(context, item).toLowerCase();
    return item.label.toLowerCase().includes(replaceText) ||
      item.insertText?.toLowerCase().includes(replaceText);
  });

  const boostScore = itemsHaveSortText ?
    sortTextItemsBoostScore :
    defaultBoostScore;

  const options = filteredItems
    .map((item, index): Completion => {
      return {
        label: item.label,
        detail: !item.documentation ? item.detail : undefined,
        type: vsKindToType(item.kind),
        info: () => infoNodeForItem(item),
        apply: makeCompletionItemApplier(item, context),
        boost: boostScore(context, filteredItems, index)
      };
    });

  // return completions
  return { from: context.pos, options };
}


function vsKindToType(kind?: CompletionItemKind) {
  kind = kind || CompletionItemKind.Text;
  switch (kind) {
    case CompletionItemKind.Method:
    case CompletionItemKind.Constructor:
      return "method";
    case CompletionItemKind.Function:
      return "function";
    case CompletionItemKind.Field:
    case CompletionItemKind.Property:
    case CompletionItemKind.Event:
      return "property";
    case CompletionItemKind.Variable:
    case CompletionItemKind.Reference:
      return "variable";
    case CompletionItemKind.Class:
    case CompletionItemKind.Struct:
      return "class";
    case CompletionItemKind.Interface:
      return "interface";
    case CompletionItemKind.Module:
    case CompletionItemKind.Unit:
    case CompletionItemKind.File:
    case CompletionItemKind.Folder:
      return "namespace";
    case CompletionItemKind.Value:
    case CompletionItemKind.Constant:
      return "constant";
    case CompletionItemKind.Enum:
    case CompletionItemKind.EnumMember:
      return "enum";
    case CompletionItemKind.Keyword:
      return "keyword";
    case CompletionItemKind.TypeParameter:
      return "type";

    case CompletionItemKind.Text:
    case CompletionItemKind.Snippet:
    case CompletionItemKind.Color:
    case CompletionItemKind.Operator:
    default:
      return "text";
  }
}


function infoNodeForItem(item: CompletionItem) {
  const headerEl = (text: string, tag: string) => {
    const header = document.createElement(tag);
    header.classList.add("cm-completionInfoHeader");
    header.innerText = text;
    return header;
  };
  const textDiv = (text: string) => {
    const span = document.createElement("div");
    span.innerText = text;
    return span;
  };

  if (item.detail && !item.documentation) {
    return headerEl(item.detail, "span");
  } else if (item.documentation) {
    const infoDiv = document.createElement("div");
    if (item.detail) {
      infoDiv.appendChild(headerEl(item.detail, "p"));
    }
    if (MarkupContent.is(item.documentation)) {
      if (item.documentation.kind === MarkupKind.Markdown) {
        const commonmark = md('commonmark');
        const html = commonmark.render(item.documentation.value);
        const mdDiv = document.createElement("div");
        mdDiv.innerHTML = html;
        // remove mdn links
        mdDiv.querySelectorAll("p").forEach(paraEl => {
          if (paraEl.childElementCount === 1 &&
            paraEl.firstElementChild?.tagName === "A") {
            paraEl.parentElement?.removeChild(paraEl);
          }
        });


        infoDiv.appendChild(mdDiv);
      } else {
        infoDiv.appendChild(textDiv(item.documentation.value));
      }
    } else {
      infoDiv.appendChild(textDiv(item.documentation));
    }
    return infoDiv;
  } else {
    return null;
  }
}

function simpleStringDiff(str1: string, str2: string) {
  let diff = 0;
  for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
    if (str1[i] !== str2[i]) diff++;
  }
  return diff;
};

function isLetter(c: string) {
  return c.toLowerCase() != c.toUpperCase();
}
