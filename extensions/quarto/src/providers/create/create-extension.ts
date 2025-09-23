/*
 * create-extension.ts
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

import path from "path";

import {
  commands,
  ExtensionContext,
  QuickPickItem,
  QuickPickItemKind,
  Uri,
  window,
} from "vscode";
import { Command } from "../../core/command";
import { withMinimumQuartoVersion } from "../../core/quarto";
import { QuartoContext } from "quarto-core";
import { resolveDirectoryForCreate } from "./directory";
import { createFirstRun } from "./firstrun";

export class CreateExtensionCommand implements Command {
  constructor(
    private readonly context_: ExtensionContext,
    private readonly quartoContext_: QuartoContext
  ) { }
  private static readonly id = "quarto.createExtension";
  public readonly id = CreateExtensionCommand.id;

  async execute() {
    await withMinimumQuartoVersion(
      this.quartoContext_,
      "1.2.222",
      "Creating extensions",
      async () => {
        // select extension type
        const typePick = await selectExtensionType(1, 2);
        if (!typePick) {
          return;
        }

        // resolve directory
        const extensionDir = await resolveDirectoryForCreate(
          this.context_,
          "Extension",
          "Extension Name",
          true
        );
        if (!extensionDir) {
          return;
        }

        // create the extension
        await createAndOpenExtension(
          this.context_,
          this.quartoContext_,
          typePick,
          extensionDir
        );
      }
    );
  }
}

async function createAndOpenExtension(
  context: ExtensionContext,
  quartoContext: QuartoContext,
  pick: CreateExtensionQuickPickItem,
  extensionDir: string
) {
  // Create the extension command
  const cmd = extensionCmd(pick.type, extensionDir);
  console.log(cmd);

  // Run the quarto command
  const stdout = quartoContext.runQuarto({ input: cmd }, "create", "--json");

  // Read the response
  const response = JSON.parse(stdout);
  const outPath = response.path;
  const openfiles = response.openfiles;

  // open the project
  createFirstRun(context, outPath, openfiles);
  await commands.executeCommand("vscode.openFolder", Uri.file(outPath));
}

function extensionCmd(template: string, dir: string) {
  const name = path.basename(dir);
  const directory = dir;
  return JSON.stringify({
    type: "extension",
    directive: {
      directory,
      name,
      template,
    }
  });
}

interface CreateExtensionQuickPickItem extends QuickPickItem {
  type: string;
  name: string;
  firstRun: string[];
}

function selectExtensionType(
  step?: number,
  totalSteps?: number
): Promise<CreateExtensionQuickPickItem | undefined> {
  return new Promise<CreateExtensionQuickPickItem | undefined>((resolve) => {
    const extensionQuickPick = (
      name: string,
      type: string,
      detail: string
    ) => ({
      type: type || name.toLowerCase(),
      name,
      firstRun: ["example.qmd"],
      label: name,
      detail,
      alwaysShow: true,
    });

    const quickPick = window.createQuickPick<QuickPickItem>();
    quickPick.title = "Create Quarto Extension";
    quickPick.placeholder = "Select extension type";
    quickPick.step = step;
    quickPick.totalSteps = totalSteps;
    quickPick.items = [
      extensionQuickPick(
        "Shortcode",
        "shortcode",
        "Markdown directive that generates content"
      ),
      extensionQuickPick(
        "Filter",
        "filter",
        "Custom markdown rendering behavior"
      ),
      extensionQuickPick(
        "Revealjs Plugin",
        "revealjs",
        "New capabilities for Revealjs presentations"
      ),
      {
        label: "Formats",
        kind: QuickPickItemKind.Separator,
      },
      extensionQuickPick(
        "Journal Article Format",
        "journal",
        "Professional Journal article format"
      ),
      extensionQuickPick(
        "Custom Format (HTML)",
        "format:html",
        "HTML format with custom options, style sheet, etc."
      ),
      extensionQuickPick(
        "Custom Format (PDF)",
        "format:pdf",
        "PDF format with custom options, LaTeX directives, etc."
      ),
      extensionQuickPick(
        "Custom Format (MS Word)",
        "format:docx",
        "MS Word format with custom options, template, etc."
      ),
      extensionQuickPick(
        "Custom Format (Revealjs)",
        "format:revealjs",
        "Revealjs format with custom options, theme, etc."
      ),
    ];
    let accepted = false;
    quickPick.onDidAccept(() => {
      accepted = true;
      quickPick.hide();
      resolve(quickPick.selectedItems[0] as CreateExtensionQuickPickItem);
    });
    quickPick.onDidHide(() => {
      if (!accepted) {
        resolve(undefined);
      }
    });
    quickPick.show();
  });
}
