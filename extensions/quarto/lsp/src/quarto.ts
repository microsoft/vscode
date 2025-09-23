/*
 * quarto.ts
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

import * as path from "node:path";
import * as fs from "node:fs";

import fileUrl from "file-url";
import * as yaml from "js-yaml";

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
  Range,
  TextEdit,
} from "vscode-languageserver";

import { QuartoContext } from "quarto-core";

import {
  Quarto,
  CompletionResult,
  EditorContext,
  HoverResult,
  AttrContext,
  AttrToken,
  kContextDiv,
  kContextDivSimple
} from "./service/quarto";
import { LintItem } from "editor-types";

export async function initializeQuarto(context: QuartoContext): Promise<Quarto> {
  const quartoModule = await initializeQuartoYamlModule(context.resourcePath) as QuartoYamlModule;
  return {
    ...context,
    getYamlCompletions: quartoModule.getCompletions,
    getAttrCompletions: initializeAttrCompletionProvider(
      context.resourcePath
    ),
    getYamlDiagnostics: quartoModule.getLint,
    getHover: quartoModule.getHover
  };

}

interface Attr {
  contexts: AttrContext[];
  formats: string[];
  filter?: RegExp;
  value: string;
  doc?: string;
  sortText?: string;
}

interface AttrGroup {
  group: string;
  contexts: AttrContext[];
  formats?: string[];
  filter?: RegExp;
  completions: AttrCompletion[];
}

interface AttrCompletion {
  value: string;
  doc?: string;
}

// cache array of Attr
const attrs: Attr[] = [];

function initializeAttrCompletionProvider(resourcesPath: string) {
  // read attr.yml from resources
  const attrYamlPath = path.join(resourcesPath, "editor", "tools", "attrs.yml");
  try {
    const attrGroups = yaml.load(
      fs.readFileSync(attrYamlPath, "utf-8")
    ) as AttrGroup[];
    for (const group of attrGroups) {
      const filter = group.filter ? new RegExp(group.filter) : undefined;
      group.completions.forEach((completion, index) => {
        const attr: Attr = {
          contexts: group.contexts,
          formats: group.formats || [],
          filter,
          ...completion,
        };
        attr.sortText = group.group + "-" + String.fromCharCode(65 + index);
        attrs.push(attr);
      });
    }
  } catch (error) {
    console.log(error);
  }

  return async (
    token: AttrToken,
    context: EditorContext
  ): Promise<CompletionItem[]> => {
    const simpleDiv = token.context === kContextDivSimple;
    token.context =
      token.context === kContextDivSimple ? kContextDiv : token.context;
    const completions: CompletionItem[] = attrs
      .filter((attr) => {
        if (attr.filter && !token.line.match(attr.filter)) {
          // check filter
          return false;
        } else if (
          attr.formats.length > 0 &&
          !attr.formats.some((format) => context.formats.includes(format))
        ) {
          // check formats
          return false;
        } else if (!attr.contexts.includes(token.context)) {
          // check context
          return false;
        } else {
          const value = normalizedValue(attr.value, simpleDiv);
          return value.startsWith(token.token);
        }
      })
      .map((attr) => {
        // remove leading . if this is a simple div
        const value = normalizedValue(attr.value, simpleDiv);

        const edit = TextEdit.replace(
          Range.create(
            context.position.row,
            context.position.column - token.token.length,
            context.position.row,
            context.position.column
          ),
          value
        );
        const item: CompletionItem = {
          label: value.replace('="$0"', "").replace("$0", ""),
          kind: CompletionItemKind.Field,
          textEdit: edit,
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: attr.sortText,
        };
        if (attr.doc) {
          item.documentation = { kind: MarkupKind.Markdown, value: attr.doc };
        }
        return item;
      });

    return completions;
  };
}

function normalizedValue(value: string, simpleDiv: boolean) {
  return simpleDiv && value.startsWith(".") ? value.slice(1) : value;
}


interface QuartoYamlModule {
  getCompletions(context: EditorContext): Promise<CompletionResult>;
  getLint(context: EditorContext): Promise<Array<LintItem>>;
  getHover?: (context: EditorContext) => Promise<HoverResult | null>;
}

function initializeQuartoYamlModule(
  resourcesPath: string
): Promise<QuartoYamlModule> {
  const modulePath = path.join(resourcesPath, "editor", "tools", "vs-code.mjs");
  return new Promise((resolve, reject) => {
    import(fileUrl(modulePath))
      .then((mod) => {
        const quartoModule = mod as QuartoYamlModule;
        resolve(quartoModule);
      })
      .catch((error) => {
        reject(error);
      });
  });
}
