/*
 * completion-yaml.ts
 *
 * Copyright (C) 2022 by Posit Software, PBC
 * Copyright (c) 2016 James Yu
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

import { lines } from "core";
import {
  Range,
  TextEdit,
  Command,
  CompletionItem,
  CompletionItemKind,
  MarkupKind
} from "vscode-languageserver-types";


import { EditorContext, Quarto } from "../../quarto";

export async function yamlCompletions(quarto: Quarto, context: EditorContext, stripPadding: boolean) {

  // don't do completions from trigger characters (yaml has none)
  if (context.trigger) {
    return null;
  }

  // get completions
  const result = await quarto.getYamlCompletions(context);
  if (result) {
    // if there are no completions then return null
    if (result.completions.length === 0) {
      return null;
    }

    // if there is one completion and it matches the token
    // then don't return it
    if (
      result.completions.length === 1 &&
      result.token === result.completions[0].value
    ) {
      return null;
    }

    // mqp our completions to vscode completions
    return result.completions.map((completion) => {
      const completionWord = completion.value.replace(/: $/, "");
      const item: CompletionItem = {
        label: completionWord,
        kind: CompletionItemKind.Field,
      };
      // strip tags from description
      if (completion.description) {
        item.documentation = {
          kind: MarkupKind.Markdown,
          value: decodeEntities(
            completion.description
              .replace(/(<([^>]+)>)/gi, "")
              .replace(/\n/g, " ")
          )
        }
      }

      // strip padding if requested (vscode doesn't seem to need indentation padding)
      let value = completion.value;
      if (stripPadding) {
        const padding = context.line.match(/^\s+/)?.[0];
        if (padding) {
          value = lines(value).map(line => line.replace(padding, "")).join("\n");
        }
      }

      if (result.token.length > 0 && completionWord.startsWith(result.token)) {
        const edit = TextEdit.replace(
          Range.create(
            context.position.row,
            context.position.column - result.token.length,
            context.position.row,
            context.position.column
          ),
          value
        );
        item.textEdit = edit;
      } else {
        item.insertText = value;
      }

      if (completion.suggest_on_accept) {
        item.command = Command.create(
          "Suggest",
          "editor.action.triggerSuggest"
        );
      }
      return item;
    });
  } else {
    return null;
  }
}

function decodeEntities(encodedString: string) {
  const translate_re = /&(nbsp|amp|quot|lt|gt);/g;
  const translate: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    lt: "<",
    gt: ">",
  };
  return encodedString
    .replace(translate_re, function (_match, entity: string) {
      return translate[entity];
    })
    .replace(/&#(\d+);/gi, function (_match, numStr) {
      const num = parseInt(numStr, 10);
      return String.fromCharCode(num);
    });
}
