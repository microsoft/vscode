/*
 * render.ts
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

import { workspace, window } from "vscode";

import semver from "semver";

import { QuartoContext, QuartoFormatInfo, projectDirForDocument, quartoDocumentFormats, quartoProjectConfig } from "quarto-core";

import { Command } from "../core/command";

import { MarkdownEngine } from "../markdown/engine";
import { promptForQuartoInstallation } from "../core/quarto";
import { QuartoEditor, canPreviewDoc, findQuartoEditor, isNotebook } from "../core/doc";
import { commands } from "vscode";
import { killTerminal, sendTerminalCommand, terminalCommand, terminalEnv, terminalOptions } from "../core/terminal";
import { QuickPickItem } from "vscode";
import { documentFrontMatterYaml } from "../markdown/document";
import { QuickPickItemKind } from "vscode";
import { Uri } from "vscode";

export function activateRender(quartoContext: QuartoContext, engine: MarkdownEngine): Command[] {

  // establish if we should include the typst command
  // indicate that its okay to show
  if (quartoContext.available && semver.gte(quartoContext.version, "1.4.388")) {
    commands.executeCommand(
      "setContext",
      "quartoCanRenderTypst",
      true
    );
  }

  return [
    new RenderDocumentCommand(quartoContext, engine),
    new RenderProjectCommand(quartoContext, engine),
  ];
}

export abstract class RenderCommand {
  constructor(quartoContext: QuartoContext) {
    this.quartoContext_ = quartoContext;
  }
  async execute() {
    if (this.quartoContext_.available) {
      const kRequiredVersion = "0.9.149";
      if (semver.gte(this.quartoContext_.version, kRequiredVersion)) {
        await this.doExecute();
      } else {
        window.showWarningMessage(
          `Rendering requires Quarto version ${kRequiredVersion} or greater`,
          { modal: true }
        );
      }
    } else {
      await promptForQuartoInstallation("before rendering documents", true);
    }
  }
  protected abstract doExecute(): Promise<void>;
  protected quartoContext() { return this.quartoContext_; }
  private readonly quartoContext_: QuartoContext;
}

export interface FormatQuickPickItem extends QuickPickItem {
  format: string;
}



class RenderDocumentCommand extends RenderCommand
  implements Command {
  constructor(quartoContext: QuartoContext, private readonly engine_: MarkdownEngine) {
    super(quartoContext);
  }
  private static readonly id = "quarto.renderDocument";
  public readonly id = RenderDocumentCommand.id;

  protected async doExecute() {

    const targetEditor = findQuartoEditor(this.engine_, this.quartoContext(), canPreviewDoc);
    if (targetEditor) {

      // show the editor and save
      if (!isNotebook(targetEditor.document)) {
        await targetEditor.activate();
      }
      await commands.executeCommand("workbench.action.files.save");

      // kill any existing terminal
      const kQuartoRenderTitle = "Quarto Render";
      await killTerminal(kQuartoRenderTitle);

      // resolve format
      const format = await this.resolveFormat(targetEditor);
      if (format === undefined) {
        return;
      }

      // create new terminal
      const target = targetEditor.document.uri;
      const env = await terminalEnv(target);
      const options = terminalOptions(kQuartoRenderTitle, target, env);
      const terminal = window.createTerminal(options);

      // build terminal command and send it
      const cmd = terminalCommand("render", this.quartoContext(), target);
      if (format !== "default") {
        cmd.push("--to");
        cmd.push(format);
      }
      await sendTerminalCommand(terminal, env, this.quartoContext(), cmd);

      // focus the editor (sometimes the terminal steals focus)
      if (!isNotebook(targetEditor.document)) {
        await targetEditor.activate();
      }

    }
  }


  private async resolveFormat(targetEditor: QuartoEditor) {
    return new Promise<string | undefined>((resolve) => {

      const frontMatter = targetEditor.notebook
        ? targetEditor.notebook.cellAt(0)?.document.getText() || ""
        : documentFrontMatterYaml(this.engine_, targetEditor.document);

      const kDeclaredFormats = "Declared Formats";
      const kOtherFormats = "Other Formats";


      const formats = quartoDocumentFormats(this.quartoContext(), targetEditor.document.uri.fsPath, frontMatter);
      if (formats) {
        const declaredFormats = formats.filter(format => !!format.declared);
        const otherFormats = formats.filter(format => !format.declared);
        const asQuickPick = (format: QuartoFormatInfo) => ({
          format: format.format,
          label: `$(play) Render ${format.name}`,
          detail: `format: ${format.format}`,
          alwaysShow: true
        });
        const quickPick = window.createQuickPick<FormatQuickPickItem>();
        quickPick.canSelectMany = false;
        const items: FormatQuickPickItem[] = [];
        if (declaredFormats.length > 1) {
          items.push({
            format: "all",
            label: `$(run-all) Render All ${kDeclaredFormats}`,
            detail: `formats: ${declaredFormats.map(format => format.format).join(', ')}`,
            alwaysShow: true,
          });
          items.push({
            format: "default",
            label: kDeclaredFormats,
            kind: QuickPickItemKind.Separator,
          });
          items.push(...declaredFormats.map(asQuickPick));
          items.push({
            format: "default",
            label: kOtherFormats,
            kind: QuickPickItemKind.Separator,
          });
          items.push(...otherFormats.map(asQuickPick));
        } else {
          items.push(...declaredFormats.map(asQuickPick));
          items.push({
            format: "default",
            label: kOtherFormats,
            kind: QuickPickItemKind.Separator,
          });
          items.push(...otherFormats.map(asQuickPick));
        }
        quickPick.items = items;
        let accepted = false;
        quickPick.onDidAccept(async () => {
          accepted = true;
          quickPick.hide();
          const chosenFormat = quickPick.selectedItems[0].format;
          resolve(chosenFormat);
        });
        quickPick.onDidHide(() => {
          if (!accepted) {
            resolve(undefined);
          }
        });
        quickPick.show();
      } else {
        resolve("default");
      }
    });
  }

}


class RenderProjectCommand extends RenderCommand implements Command {
  private static readonly id = "quarto.renderProject";
  public readonly id = RenderProjectCommand.id;

  constructor(quartoContext: QuartoContext,
    private readonly engine_: MarkdownEngine) {
    super(quartoContext);
  }

  async doExecute() {
    await workspace.saveAll(false);

    // determine the project dir
    let projectDir: Uri | undefined;
    const targetEditor = findQuartoEditor(this.engine_, this.quartoContext(), canPreviewDoc);
    if (targetEditor) {
      const docProjectDir = projectDirForDocument(targetEditor.document.uri.fsPath);
      if (docProjectDir) {
        projectDir = Uri.file(docProjectDir);
      }
    }

    // if we didn't find it yet use the workspace
    if (!projectDir && workspace.workspaceFolders) {
      for (const folder of workspace.workspaceFolders) {
        const config = await quartoProjectConfig(this.quartoContext().runQuarto, folder.uri.fsPath);
        if (config) {
          projectDir = folder.uri;
        }
      }
    }


    // render if we have a project dir
    if (projectDir) {

      // kill any existing terminal
      const kQuartoRenderTitle = "Quarto Render";
      await killTerminal(kQuartoRenderTitle);

      // determine format
      const format = await this.resolveFormat(projectDir);
      if (format === undefined) {
        return;
      }

      // create new terminal
      const env = await terminalEnv(projectDir);
      const options = terminalOptions(kQuartoRenderTitle, projectDir, env);
      const terminal = window.createTerminal(options);

      // build terminal command and send it
      const cmd = terminalCommand("render", this.quartoContext());
      if (format !== "default") {
        cmd.push("--to");
        cmd.push(format);
      }
      await sendTerminalCommand(terminal, env, this.quartoContext(), cmd);
    } else {
      // no project found!
      window.showInformationMessage("No project available to render.");
    }
  }

  private async resolveFormat(projectDir: Uri): Promise<string | undefined> {
    return new Promise(async (resolve) => {
      const config = await quartoProjectConfig(this.quartoContext().runQuarto, projectDir.fsPath);
      if (config?.config.project.type === "book" && typeof (config?.config.format) === "object") {
        const formats = Object.keys(config?.config.format);
        if (formats.length > 1) {
          const quickPick = window.createQuickPick<FormatQuickPickItem>();
          quickPick.canSelectMany = false;
          quickPick.items = [
            {
              format: "all",
              label: `$(run-all) Render All Formats`,
              alwaysShow: true,
            },
            {
              format: "default",
              label: "",
              kind: QuickPickItemKind.Separator,
            },
            ...formats.map(format => ({
              format: format,
              label: `$(play) Render ${format} book`,
              alwaysShow: true
            }))
          ];
          let accepted = false;
          quickPick.onDidAccept(async () => {
            accepted = true;
            quickPick.hide();
            const chosenFormat = quickPick.selectedItems[0].format;
            resolve(chosenFormat);
          });
          quickPick.onDidHide(() => {
            if (!accepted) {
              resolve(undefined);
            }
          });
          quickPick.show();
        } else {
          resolve("default");
        }
      } else {
        resolve("default");
      }
    });

  }
}
