/*
 * commands.ts
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

import * as path from "path";
import * as fs from "fs";

import { TextDocument, window, Uri, workspace, commands } from "vscode";
import { QuartoContext, QuartoFormatInfo, quartoDocumentFormats } from "quarto-core";

import { Command } from "../../core/command";
import {
  isPreviewRunningForDoc,
  previewDoc,
} from "./preview";
import { MarkdownEngine } from "../../markdown/engine";
import { canPreviewDoc, findQuartoEditor, isNotebook } from "../../core/doc";
import { renderOnSave } from "./preview-util";
import { documentFrontMatterYaml } from "../../markdown/document";
import { FormatQuickPickItem, RenderCommand } from "../render";
import { QuickPickItemKind } from "vscode";

export function previewCommands(
  quartoContext: QuartoContext,
  engine: MarkdownEngine
): Command[] {
  return [
    new PreviewCommand(quartoContext, engine),
    new PreviewScriptCommand(quartoContext, engine),
    new PreviewFormatCommand(quartoContext, engine),
    new WalkthroughPreviewCommand(quartoContext, engine),
    new ClearCacheCommand(quartoContext, engine),
  ];
}
const kChooseFormat = "EB451697-D09E-48F5-AA40-4DAE7E1D31B8";


abstract class PreviewDocumentCommandBase extends RenderCommand {
  constructor(
    quartoContext: QuartoContext,
    private readonly engine_: MarkdownEngine
  ) {
    super(quartoContext);
  }
  protected async renderFormat(format?: string | null, onShow?: () => void) {
    const targetEditor = findQuartoEditor(this.engine_, this.quartoContext(), canPreviewDoc);
    if (targetEditor) {
      const hasRenderOnSave = await renderOnSave(this.engine_, targetEditor.document);
      const render =
        !hasRenderOnSave ||
        (hasRenderOnSave && format) ||
        !(await isPreviewRunningForDoc(targetEditor.document));
      if (render) {
        if (format === kChooseFormat) {

          const frontMatter = targetEditor.notebook
            ? targetEditor.notebook.cellAt(0)?.document.getText() || ""
            : documentFrontMatterYaml(this.engine_, targetEditor.document);

          const formats = quartoDocumentFormats(this.quartoContext(), targetEditor.document.uri.fsPath, frontMatter);
          if (formats) {
            const declaredFormats = formats.filter(format => !!format.declared);
            const otherFormats = formats.filter(format => !format.declared);
            const asQuickPick = (format: QuartoFormatInfo) => ({
              format: format.format,
              label: `$(preview) Preview ${format.name}`,
              detail: `format: ${format.format}`,
              alwaysShow: true
            });
            const quickPick = window.createQuickPick<FormatQuickPickItem>();
            quickPick.canSelectMany = false;
            const items: FormatQuickPickItem[] = [];

            // declared formats
            items.push({
              format: "default",
              label: "Declared Formats",
              kind: QuickPickItemKind.Separator,
            });
            items.push(...declaredFormats.map(asQuickPick));
            if (otherFormats.length > 0) {
              items.push({
                format: "default",
                label: "Other Formats",
                kind: QuickPickItemKind.Separator,
              });
              items.push(...otherFormats.map(asQuickPick));
            }
            quickPick.items = items;
            quickPick.onDidAccept(async () => {
              quickPick.hide();
              const chosenFormat = quickPick.selectedItems[0].format;
              await previewDoc(targetEditor, chosenFormat, false, this.engine_, this.quartoContext(), onShow);
            });
            quickPick.show();
          }
        } else {
          await previewDoc(targetEditor, format, false, this.engine_, this.quartoContext(), onShow);
        }
      } else {
        // show the editor
        if (!isNotebook(targetEditor.document)) {
          await targetEditor.activate();
        }

        // save (will trigger render b/c renderOnSave is enabled)
        await commands.executeCommand("workbench.action.files.save");
      }
    } else {
      window.showInformationMessage("No Quarto document available to render");
    }
  }
  protected engine() { return this.engine_; }
}

class PreviewCommand
  extends PreviewDocumentCommandBase
  implements Command {
  constructor(quartoContext: QuartoContext, engine: MarkdownEngine) {
    super(quartoContext, engine);
  }
  private static readonly id = "quarto.preview";
  public readonly id = PreviewCommand.id;

  protected async doExecute() {
    return super.renderFormat();
  }
}

class PreviewScriptCommand
  extends PreviewDocumentCommandBase
  implements Command {
  constructor(quartoContext: QuartoContext, engine: MarkdownEngine) {
    super(quartoContext, engine);
  }
  private static readonly id = "quarto.previewScript";
  public readonly id = PreviewScriptCommand.id;

  protected async doExecute() {
    return super.renderFormat();
  }
}

class PreviewFormatCommand
  extends PreviewDocumentCommandBase
  implements Command {
  constructor(quartoContext: QuartoContext, engine: MarkdownEngine) {
    super(quartoContext, engine);
  }
  private static readonly id = "quarto.previewFormat";
  public readonly id = PreviewFormatCommand.id;

  protected async doExecute() {
    return super.renderFormat(kChooseFormat);
  }
}

class WalkthroughPreviewCommand extends PreviewDocumentCommandBase {
  private static readonly id = "quarto.walkthrough.preview";
  public readonly id = WalkthroughPreviewCommand.id;

  protected async doExecute() {
    return super.renderFormat(null, () => {
      commands.executeCommand("workbench.action.closeSidebar");
    });
  }
}

class ClearCacheCommand implements Command {
  private static readonly id = "quarto.clearCache";
  public readonly id = ClearCacheCommand.id;

  constructor(
    private readonly quartoContext_: QuartoContext,
    private readonly engine_: MarkdownEngine
  ) { }

  async execute(): Promise<void> {
    // see if there is a cache to clear
    const doc = findQuartoEditor(this.engine_, this.quartoContext_, canPreviewDoc)?.document;
    if (doc) {
      const cacheDir = cacheDirForDocument(doc);
      if (cacheDir) {
        const result = await window.showInformationMessage(
          "Clear Cache Directory",
          { modal: true, detail: `Delete the cache directory at ${cacheDir}?` },
          "Yes",
          "No"
        );
        if (result === "Yes") {
          await workspace.fs.delete(Uri.file(cacheDir), { recursive: true });
        }
      } else {
        window.showInformationMessage("Unable to Clear Cache", {
          modal: true,
          detail:
            "There is no cache associated with the current Quarto document.",
        });
      }
      // see if there is an _cache directory for this file
      // see if there is a .jupyter_cache directory for this file
    } else {
      window.showInformationMessage("Unable to Clear Cache", {
        modal: true,
        detail: "The current document is not a Quarto document.",
      });
    }
  }
}

function cacheDirForDocument(doc: TextDocument) {
  // directory for doc
  const dir = path.dirname(doc.fileName);

  // check for jupyter cache
  const jupyterCacheDir = path.join(dir, ".jupyter_cache");
  if (fs.existsSync(jupyterCacheDir)) {
    return jupyterCacheDir;
  }

  // check for knitr cache
  const stem = path.basename(doc.fileName, path.extname(doc.fileName));
  const knitrCacheDir = path.join(dir, stem + "_cache");
  if (fs.existsSync(knitrCacheDir)) {
    return knitrCacheDir;
  }

  return undefined;
}
