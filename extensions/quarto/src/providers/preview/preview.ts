/*
 * preview.ts
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
import * as uuid from "uuid";
import axios from "axios";
import * as semver from "semver";

import vscode, {
  commands,
  env,
  ExtensionContext,
  MessageItem,
  Terminal,
  TextDocument,
  Selection,
  Range,
  Uri,
  ViewColumn,
  window,
  Position,
  TextEditorRevealType,
  NotebookDocument,
  ProgressLocation,
  CancellationToken,
} from "vscode";

import {
  normalizeNewlines,
} from "core";
import { QuartoContext } from "quarto-core";

import { previewCommands } from "./commands";
import { Command } from "../../core/command";
import {
  canPreviewDoc,
  findQuartoEditor,
  isNotebook,
  preserveEditorFocus,
  previewDirForDocument,
  quartoCanRenderScript,
  QuartoEditor,
  validatateQuartoCanRender,
} from "../../core/doc";
import { PreviewOutputSink } from "./preview-output";
import { isHtmlContent, isTextContent, isPdfContent } from "core-node";

import * as tmp from "tmp";
import {
  PreviewEnv,
  PreviewEnvManager,
  previewEnvsEqual
} from "./preview-env";
import { MarkdownEngine } from "../../markdown/engine";

import {
  QuartoPreviewWebview,
  QuartoPreviewWebviewManager,
} from "./preview-webview";
import {
  haveNotebookSaveEvents,
  isQuartoShinyDoc,
  isQuartoShinyKnitrDoc,
  isRPackage,
  renderOnSave,
} from "./preview-util";

import { vsCodeWebUrl } from "../../core/platform";
import { killTerminal, sendTerminalCommand, terminalCommand, terminalOptions } from "../../core/terminal";

import {
  jupyterErrorLocation,
  knitrErrorLocation,
  luaErrorLocation,
  yamlErrorLocation,
} from "./preview-errors";
import { ExtensionHost } from "../../host";

tmp.setGracefulCleanup();

const kPreviewWindowTitle = "Quarto Preview";

const kLocalPreviewRegex =
  /(http:\/\/(?:localhost|127\.0\.0\.1)\:\d+\/?[^\s]*)/;

let previewManager: PreviewManager;

export function activatePreview(
  context: ExtensionContext,
  host: ExtensionHost,
  quartoContext: QuartoContext,
  engine: MarkdownEngine
): Command[] {
  // create preview manager
  if (quartoContext.available) {
    previewManager = new PreviewManager(context, host, quartoContext, engine);
    context.subscriptions.push(previewManager);
  }

  // render on save
  const onSave = async (docUri: Uri) => {
    const editor = findQuartoEditor(
      engine,
      quartoContext,
      (editorDoc) => editorDoc.uri.fsPath === docUri.fsPath
    );
    if (editor) {
      if (
        canPreviewDoc(editor.document) &&
        (await renderOnSave(engine, editor.document)) &&
        (await previewManager.isPreviewRunningForDoc(editor.document))
      ) {
        await previewDoc(editor, undefined, true, engine, quartoContext);
      }
    }
  };
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (doc: TextDocument) => {
      await onSave(doc.uri);
    })
  );
  // we use 1.66 as our minimum version (and type import) but
  // onDidSaveNotebookDocument was introduced in 1.67
  if (haveNotebookSaveEvents()) {
    context.subscriptions.push(
      (vscode.workspace as any).onDidSaveNotebookDocument(
        async (notebook: NotebookDocument) => {
          await onSave(notebook.uri);
        }
      )
    );
  }

  // monitor active document to see whether it can be rendered by quarto
  const updateRenderDocActive = (editor?: vscode.TextEditor) => {
    const renderDocActive =
      editor && validatateQuartoCanRender(editor.document);
    vscode.commands.executeCommand(
      "setContext",
      "quartoRenderDocActive",
      renderDocActive
    );
    vscode.commands.executeCommand(
      "setContext",
      "quartoRenderScriptActive",
      renderDocActive && quartoCanRenderScript(editor.document)
    );
  };
  updateRenderDocActive(window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateRenderDocActive)
  );
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc: TextDocument) => {
      if (doc.uri.fsPath === window.activeTextEditor?.document.uri.fsPath) {
        updateRenderDocActive(window.activeTextEditor);
      }
    })
  );

  // preview commands
  return previewCommands(quartoContext, engine);
}


export function isPreviewRunning() {
  return previewManager.isPreviewRunning();
}

export function isPreviewRunningForDoc(doc: TextDocument) {
  return previewManager.isPreviewRunningForDoc(doc);
}

export async function previewDoc(
  editor: QuartoEditor,
  format: string | null | undefined,
  renderOnSave: boolean,
  engine: MarkdownEngine,
  quartoContext: QuartoContext,
  onShow?: () => void
) {
  // set the slide index from the source editor so we can
  // navigate to it in the preview frame
  const slideIndex = !isNotebook(editor.document)
    ? await editor.slideIndex()
    : undefined;
  previewManager.setSlideIndex(slideIndex);

  //  set onShow if provided
  if (onShow !== undefined) {
    previewManager.setOnShow(onShow);
  }

  // if this wasn't a renderOnSave then activate the editor and save
  if (!renderOnSave) {
    // activate the editor
    if (!isNotebook(editor.document)) {
      await editor.activate();
    }

    await commands.executeCommand("workbench.action.files.save");
    if (editor.document.isDirty) {
      return;
    }
  }

  // execute the preview (rerefresh the reference after save)
  const previewEditor = findQuartoEditor(
    engine,
    quartoContext,
    (editorDoc) => editorDoc.uri.fsPath === editor.document.uri.fsPath
  );
  if (previewEditor) {
    // error if we didn't save using a valid quarto extension
    if (
      !isNotebook(previewEditor.document) &&
      !validatateQuartoCanRender(previewEditor.document)
    ) {
      window.showErrorMessage("Unsupported File Extension", {
        modal: true,
        detail:
          "This document cannot be rendered because it doesn't have a supported Quarto file extension. " +
          "Save the file with a .qmd extension then try rendering again.",
      });
      return;
    }

    // run the preview
    await previewManager.preview(
      previewEditor.document.uri,
      previewEditor.document,
      format,
      slideIndex
    );

    // focus the editor (sometimes the terminal steals focus)
    if (!renderOnSave) {
      if (!isNotebook(previewEditor.document)) {
        await previewEditor.activate();
      }
    }
  }
}

export async function previewProject(target: Uri, format?: string) {
  await previewManager.preview(target, undefined, format);
}

class PreviewManager {
  constructor(
    context: ExtensionContext,
    host: ExtensionHost,
    private readonly quartoContext_: QuartoContext,
    private readonly engine_: MarkdownEngine
  ) {
    this.renderToken_ = uuid.v4();
    this.webviewManager_ = new QuartoPreviewWebviewManager(
      context,
      host,
      "quarto.previewView",
      "Quarto Preview",
      QuartoPreviewWebview
    );
    this.outputSink_ = new PreviewOutputSink(
      this.onPreviewOutput.bind(this),
      this.onPreviewTick.bind(this)
    );
    this.previewEnvManager_ = new PreviewEnvManager(
      this.outputSink_,
      this.renderToken_
    );
  }

  dispose() {
    this.webviewManager_.dispose();
    this.outputSink_.dispose();
  }

  public async preview(
    uri: Uri,
    doc: TextDocument | undefined,
    format: string | null | undefined,
    slideIndex?: number
  ) {
    // resolve format if we need to
    if (format === undefined) {
      format = this.previewFormats_.get(uri.fsPath) || null;
    } else {
      this.previewFormats_.set(uri.fsPath, format);
    }

    this.progressDismiss();
    this.progressCancellationToken_ = undefined;
    this.previewOutput_ = "";
    this.previewDoc_ = doc;
    const previewEnv = await this.previewEnvManager_.previewEnv(uri);
    if (doc && (await this.canReuseRunningPreview(doc, previewEnv))) {
      try {
        const response = await this.previewRenderRequest(doc, format);
        if (response.status === 200) {
          this.progressShow(uri);
        } else {
          await this.startPreview(previewEnv, uri, format, doc, slideIndex);
        }
      } catch (e) {
        await this.startPreview(previewEnv, uri, format, doc, slideIndex);
      }
    } else {
      await this.startPreview(previewEnv, uri, format, doc, slideIndex);
    }
  }

  public setSlideIndex(slideIndex?: number) {
    this.previewSlideIndex_ = slideIndex;
    this.webviewManager_.setSlideIndex(slideIndex);
  }

  public setOnShow(f: () => void) {
    this.webviewManager_.setOnShow(f);
  }

  public async isPreviewRunning() {
    // no terminal means no preview server
    if (!this.terminal_ || this.terminal_.exitStatus !== undefined) {
      return false;
    }

    // no recorded preview server uri
    if (!this.previewCommandUrl_) {
      return false;
    }

    // look for any response from the server (it will give a 404 w/o logging for favicon)
    const pingRequestUri = this.previewServerRequestUri("/favicon.ico");
    try {
      const response = await axios.get(pingRequestUri, {
        timeout: 1000,
        validateStatus: () => true,
      });
      return response.status === 200 || response.status === 404;
    } catch (e) {
      return false;
    }
  }

  public async isPreviewRunningForDoc(doc: TextDocument) {
    return (
      (await this.isPreviewRunning()) &&
      this.previewTarget_?.fsPath === doc.uri.fsPath
    );
  }

  private async canReuseRunningPreview(
    doc: TextDocument,
    previewEnv: PreviewEnv
  ) {
    return (
      !!this.previewUrl_ &&
      previewEnvsEqual(this.previewEnv_, previewEnv) &&
      this.previewType_ === this.previewTypeConfig() &&
      (this.previewType_ !== "internal" || this.webviewManager_.hasWebview()) &&
      !!this.terminal_ &&
      this.terminal_.exitStatus === undefined &&
      !this.usesQuartoServeCommand(doc)
    );
  }

  private usesQuartoServeCommand(doc?: TextDocument) {
    return isQuartoShinyKnitrDoc(this.engine_, doc) ||
      (isQuartoShinyDoc(this.engine_, doc) && semver.lte(this.quartoContext_.version, "1.4.414"));
  }

  private previewRenderRequest(doc: TextDocument, format: string | null) {
    const requestUri = this.previewServerRequestUri("/" + this.renderToken_);

    const params: Record<string, unknown> = {
      path: doc.uri.fsPath,
    };
    if (format) {
      params.format = format;
    }
    return axios.get(requestUri, { params });
  }

  private async previewTerminateRequest() {
    const kTerminateToken = "4231F431-58D3-4320-9713-994558E4CC45";
    try {
      await axios.get(this.previewServerRequestUri("/" + kTerminateToken), {
        timeout: 1000,
      });
    } catch (error) {
      /*
      console.log("Error requesting preview server termination");
      console.log(error);
      */
    }
  }

  private previewServerRequestUri(path: string) {
    const previewUri = Uri.parse(this.previewCommandUrl_!);
    const requestUri = previewUri.scheme + "://" + previewUri.authority + path;
    return requestUri;
  }

  private async killPreview() {
    await killTerminal(kPreviewWindowTitle, async () => await this.previewTerminateRequest());
    this.progressDismiss();
    this.progressCancellationToken_ = undefined;
  }

  private async startPreview(
    previewEnv: PreviewEnv,
    target: Uri,
    format: string | null,
    doc?: TextDocument,
    slideIndex?: number
  ) {
    // dispose any existing preview terminals
    await this.killPreview();

    // cleanup output
    this.outputSink_.reset();

    // reset preview state
    this.previewEnv_ = previewEnv;
    this.previewTarget_ = target;
    this.previewType_ = this.previewTypeConfig();
    this.previewUrl_ = undefined;
    this.previewSlideIndex_ = slideIndex;
    this.previewDir_ = undefined;
    this.previewCommandUrl_ = undefined;
    this.previewOutputFile_ = undefined;

    // determine preview dir (if any)
    const isFile = fs.statSync(target.fsPath).isFile();
    this.previewDir_ = isFile ? previewDirForDocument(target) : undefined;

    // terminal options
    const options = terminalOptions(kPreviewWindowTitle, target, this.previewEnv_);

    // is this workspace an R package?
    const isRPackageWorkspace = await isRPackage();

    // is this is a shiny doc?
    const isShiny = isQuartoShinyDoc(this.engine_, doc);
    const useServeCommand = this.usesQuartoServeCommand(doc);

    // clear if a shiny doc
    if (isShiny && this.webviewManager_) {
      this.webviewManager_.clear();
    }

    // creat terminal
    this.terminal_ = window.createTerminal(options);

    // create base terminal command
    const cmd = terminalCommand(useServeCommand ? "serve" : "preview", this.quartoContext_, target);

    // extra args for normal docs
    if (!useServeCommand) {
      if (!doc) {
        // project render
        cmd.push("--render", format || "all");
      } else if (format) {
        // doc render
        cmd.push("--to", format);
      }

      cmd.push("--no-browser");
      cmd.push("--no-watch-inputs");
    }

    // use temp output-dir for R package
    if (isRPackageWorkspace && this.previewRPackageDirConfig()) {
      const rPkgRequiredVersion = "1.5.39";
      if (semver.gte(this.quartoContext_.version, rPkgRequiredVersion)) {
        cmd.push("--output-dir", tmp.dirSync().name);
        cmd.push("--embed-resources");
      } else {
        window.showWarningMessage(
          `Rendering requires Quarto version ${rPkgRequiredVersion} or greater`,
          { modal: true }
        );
        return;
      }
    }

    // send terminal command
    await sendTerminalCommand(this.terminal_, this.previewEnv_, this.quartoContext_, cmd);

    // show progress
    this.progressShow(target);
  }

  private async onPreviewTick() {
    if (this.progressCancelled()) {
      await this.killPreview();
    }
  }

  private async onPreviewOutput(output: string) {
    this.detectErrorNavigation(output);
    const kOutputCreatedPattern = /Output created\: (.*?)\n/;
    this.previewOutput_ += output;
    if (!this.previewUrl_) {
      // detect new preview and show in browser
      const match = this.previewOutput_.match(kLocalPreviewRegex);
      if (match) {
        // dismiss progress
        this.progressDismiss();

        // capture output file
        const fileMatch = this.previewOutput_.match(kOutputCreatedPattern);
        if (fileMatch) {
          this.previewOutputFile_ = this.outputFileUri(fileMatch[1]);
        }

        // capture preview command url and preview url
        this.previewCommandUrl_ = match[1];
        const browseMatch = this.previewOutput_.match(
          /(Browse at|Listening on) (https?:\/\/[^\n]*)/
        );
        if (browseMatch) {
          // earlier versions of quarto serve didn't print out vscode urls
          // correctly so we compenstate for that here
          if (isQuartoShinyDoc(this.engine_, this.previewDoc_)) {
            this.previewUrl_ = vsCodeWebUrl(browseMatch[2]);
          } else {
            this.previewUrl_ = browseMatch[2];
          }
        } else {
          this.previewUrl_ = this.previewCommandUrl_;
        }

        // if there was a 'preview service running' message then that
        // also establishes an alternate control channel
        const previewServiceMatch = this.previewOutput_.match(
          /Preview service running \((\d+)\)/
        );
        if (previewServiceMatch) {
          this.previewCommandUrl_ = `http://127.0.0.1:${previewServiceMatch[1]}`;
        }

        if (this.previewType_ === "internal") {
          await this.showPreview();
        } else if (this.previewType_ === "external") {
          try {
            const url = Uri.parse(this.previewUrl_);
            env.openExternal(url);
          } catch {
            // Noop
          }
        }
      }
    } else {
      // detect update to existing preview and activate browser
      if (this.previewOutput_.match(kOutputCreatedPattern)) {
        this.progressDismiss();
        if (this.previewType_ === "internal" && this.previewRevealConfig()) {
          this.updatePreview();
        }
      }
    }
  }

  private progressShow(uri: Uri) {
    window.withProgress(
      {
        title: `Rendering ${path.basename(uri.fsPath)}`,
        cancellable: true,
        location: ProgressLocation.Window,
      },
      (_progress, token) => {
        this.progressCancellationToken_ = token;
        return new Promise((resolve) => {
          this.progressDismiss_ = resolve;
        });
      }
    );
  }

  private progressDismiss() {
    if (this.progressDismiss_) {
      this.progressDismiss_();
      this.progressDismiss_ = undefined;
    }
  }

  private progressCancelled() {
    return !!this.progressCancellationToken_?.isCancellationRequested;
  }

  private async detectErrorNavigation(output: string) {
    // bail if this is a notebook or we don't have a previewDoc
    if (!this.previewDoc_ || isNotebook(this.previewDoc_)) {
      return;
    }

    // normalize
    output = normalizeNewlines(output);

    // run all of our tests
    const previewFile = this.previewDoc_.uri.fsPath;
    const previewDir = this.previewDir_ || this.targetDir();
    const errorLoc =
      yamlErrorLocation(output, previewFile, previewDir) ||
      jupyterErrorLocation(output, previewFile, previewDir) ||
      knitrErrorLocation(output, previewFile, previewDir) ||
      luaErrorLocation(output, previewFile, previewDir);
    if (errorLoc && fs.existsSync(errorLoc.file)) {
      // dismiss progress
      this.progressDismiss();

      // ensure terminal is visible
      this.terminal_!.show(true);

      // find existing visible instance
      const fileUri = Uri.file(errorLoc.file);
      const editor = findQuartoEditor(
        this.engine_,
        this.quartoContext_,
        (doc) => doc.uri.fsPath === fileUri.fsPath
      );
      if (editor) {
        if (editor.textEditor) {
          // if the current selection is outside of the error region then
          // navigate to the top of the error region
          const errPos = new Position(errorLoc.lineBegin - 1, 0);
          const errEndPos = new Position(errorLoc.lineEnd - 1, 0);
          const textEditor = editor.textEditor;
          if (
            textEditor.selection.active.isBefore(errPos) ||
            textEditor.selection.active.isAfter(errEndPos)
          ) {
            textEditor.selection = new Selection(errPos, errPos);
            textEditor.revealRange(
              new Range(errPos, errPos),
              TextEditorRevealType.InCenterIfOutsideViewport
            );
          }
        }
        preserveEditorFocus(editor);
      }
    }
  }

  private async showPreview() {
    if (
      !this.previewOutputFile_ || // no output file means project render/preview
      this.isBrowserPreviewable(this.previewOutputFile_)
    ) {
      // https://code.visualstudio.com/api/advanced-topics/remote-extensions
      const previewUrl = (
        await vscode.env.asExternalUri(Uri.parse(this.previewUrl_!))
      ).toString();
      this.webviewManager_.showWebview(
        {
          url: previewUrl,
          zoomLevel: this.zoomLevel(this.previewOutputFile_),
          slideIndex: this.previewSlideIndex_,
        },
        {
          preserveFocus: true,
          viewColumn: ViewColumn.Beside,
        }
      );
      this.webviewManager_.setOnError(this.progressDismiss.bind(this));
    } else {
      this.showOuputFile();
    }
  }

  private updatePreview() {
    if (this.isBrowserPreviewable(this.previewOutputFile_)) {
      this.webviewManager_.revealWebview();
    } else {
      this.showOuputFile();
    }
  }

  private targetDir() {
    const targetPath = this.previewTarget_!.fsPath;
    if (fs.statSync(targetPath).isDirectory()) {
      return targetPath;
    } else {
      return path.dirname(targetPath);
    }
  }

  private outputFileUri(file: string) {
    if (path.isAbsolute(file)) {
      return Uri.file(file);
    } else {
      return Uri.file(path.join(this.targetDir()!, file));
    }
  }

  private zoomLevel(uri?: Uri) {
    if (uri === undefined || isHtmlContent(uri.toString())) {
      return this.webviewManager_.getZoomLevelConfig();
    } else {
      return undefined;
    }
  }

  private isBrowserPreviewable(uri?: Uri) {
    return (
      isHtmlContent(uri?.toString()) ||
      isPdfContent(uri?.toString()) ||
      isTextContent(uri?.toString())
    );
  }

  private previewTypeConfig(): "internal" | "external" | "none" {
    return this.quartoConfig().get("render.previewType", "internal");
  }

  private previewRevealConfig(): boolean {
    return this.quartoConfig().get("render.previewReveal", true);
  }

  private previewRPackageDirConfig(): boolean {
    return this.quartoConfig().get("render.rPackageOutputDirectory", true);
  }

  private quartoConfig() {
    return vscode.workspace.getConfiguration("quarto");
  }

  private async showOuputFile() {
    if (this.previewOutputFile_) {
      const outputFile = this.previewOutputFile_.fsPath;
      const viewFile: MessageItem = { title: "View Preview" };
      const result = await window.showInformationMessage<MessageItem>(
        "Render complete for " + path.basename(outputFile),
        viewFile
      );
      if (result === viewFile) {
        // open non localhost urls externally
        if (this.previewUrl_ && !this.previewUrl_.match(kLocalPreviewRegex)) {
          vscode.env.openExternal(Uri.parse(this.previewUrl_!));
        } else {
          const outputTempDir = tmp.dirSync();
          const outputTemp = path.join(
            outputTempDir.name,
            path.basename(outputFile)
          );
          fs.copyFileSync(outputFile, outputTemp);
          fs.chmodSync(outputTemp, fs.constants.S_IRUSR);
          vscode.env.openExternal(Uri.file(outputTemp));
        }
      }
    }
  }

  private previewOutput_ = "";
  private previewDoc_: TextDocument | undefined;
  private previewEnv_: PreviewEnv | undefined;
  private previewTarget_: Uri | undefined;
  private previewUrl_: string | undefined;
  private previewSlideIndex_: number | undefined;
  private previewDir_: string | undefined;
  private previewCommandUrl_: string | undefined;
  private previewOutputFile_: Uri | undefined;
  private previewType_: "internal" | "external" | "none" | undefined;

  private terminal_: Terminal | undefined;

  // progress management
  private progressDismiss_: ((value?: unknown) => void) | undefined;
  private progressCancellationToken_: CancellationToken | undefined;

  private readonly renderToken_: string;
  private readonly previewEnvManager_: PreviewEnvManager;
  private readonly webviewManager_: QuartoPreviewWebviewManager;
  private readonly outputSink_: PreviewOutputSink;
  private readonly previewFormats_ = new Map<string, string | null>();
}
