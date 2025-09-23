/*
 * editor.ts
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

import path, { extname } from "path";
import { determineMode } from "./toggle";
import debounce from "lodash.debounce";

import {
  window,
  workspace,
  ExtensionContext,
  Disposable,
  CustomTextEditorProvider,
  TextDocument,
  WebviewPanel,
  CancellationToken,
  Uri,
  Webview,
  Range,
  env,
  commands,
  ViewColumn,
  Selection,
  TextEditorRevealType,
  GlobPattern,
  TabInputText
} from "vscode";

import { LanguageClient } from "vscode-languageclient/node";

import { projectDirForDocument, QuartoContext } from "quarto-core";

import { CodeViewActiveBlockContext, CodeViewSelectionAction, HostContext, NavLocation, Prefs, SourcePos, VSCodeVisualEditor, VSCodeVisualEditorHost, XRef } from "editor-types";

import { getNonce } from "../../core/nonce";
import { isWindows } from "../../core/platform";
import { isQuartoDoc, QuartoEditor } from "../../core/doc";
import { Command } from "../../core/command";

import { visualEditorClient, visualEditorServer } from "./connection";
import { editorSyncManager } from "./sync";
import { documentImageResolver } from "./images";
import { clearInterval } from "timers";
import { vscodePrefsServer } from "./prefs";
import { vscodeCodeViewServer } from "./codeview";
import { MarkdownEngine } from "../../markdown/engine";
import { lspClientTransport } from "core-node";
import { editorSourceJsonRpcServer } from "editor-core";
import { JsonRpcRequestTransport } from "core";
import {
  editInSourceModeCommand,
  editInVisualModeCommand,
  toggleEditModeCommand,
  toggleRenderOnSaveCommand,
  reopenEditorInSourceMode
} from "./toggle";
import { ExtensionHost } from "../../host";
import { TabInputCustom } from "vscode";

const kVisualModeConfirmed = "visualModeConfirmed";

export interface QuartoVisualEditor extends QuartoEditor {
  hasFocus(): Promise<boolean>;
  getActiveBlockContext(): Promise<CodeViewActiveBlockContext | null>;
  setBlockSelection(context: CodeViewActiveBlockContext, action: CodeViewSelectionAction): Promise<void>;
}

export function activateEditor(
  context: ExtensionContext,
  host: ExtensionHost,
  quartoContext: QuartoContext,
  lspClient: LanguageClient,
  engine: MarkdownEngine
): Command[] {
  // register the provider
  context.subscriptions.push(VisualEditorProvider.register(context, host, quartoContext, lspClient, engine));

  // return commands
  return [
    {
      id: 'quarto.test_setkVisualModeConfirmedTrue',
      execute() {
        context.globalState.update(kVisualModeConfirmed, true);
      }
    },
    {
      id: 'quarto.test_isInVisualEditor',
      execute() {
        return VisualEditorProvider.activeEditor() !== undefined;
      }
    },
    editInVisualModeCommand(),
    editInSourceModeCommand(),
    toggleEditModeCommand(),
    toggleRenderOnSaveCommand()
  ];
}


export class VisualEditorProvider implements CustomTextEditorProvider {

  // track the last contents of any active untitled docs (used
  // for recovering from attempt to edit )
  private static activeUntitled?: { uri: Uri, content: string; };

  // track the last edited line of code in text editors (used for syncing position)
  private static editorLastSourcePos = new Map<string, number>();

  // track the list source location in visual editors (used for syncing position)
  private static visualEditorLastSourcePos = new Map<string, SourcePos>();

  // track pending switch to source
  private static visualEditorPendingSwitchToSource = new Set<string>();

  // track pending switch to visual
  private static editorPendingSwitchToVisual = new Set<string>();

  // track pending xref navigations
  private static visualEditorPendingXRefNavigations = new Map<string, XRef>();

  // track visual editors
  private static visualEditors = visualEditorTracker();

  public static register(
    context: ExtensionContext,
    host: ExtensionHost,
    quartoContext: QuartoContext,
    lspClient: LanguageClient,
    engine: MarkdownEngine
  ): Disposable {

    // setup request transport
    const lspRequest = lspClientTransport(lspClient);

    // track edits in the active editor if its untitled. this enables us to recover the
    // content when we switch to an untitled document, which otherwise are just dropped
    // on the floor by vscode
    context.subscriptions.push(workspace.onDidChangeTextDocument(e => {
      const doc = window.activeTextEditor?.document;
      if (doc && isQuartoDoc(doc) && doc.isUntitled && (doc.uri.toString() === e.document.uri.toString())) {
        this.activeUntitled = { uri: doc.uri, content: doc.getText() };
      } else {
        this.activeUntitled = undefined;
      }
    }));

    // track the last editor line of code in text editors (used for syncing position)
    context.subscriptions.push(window.onDidChangeTextEditorSelection(e => {
      const document = e.textEditor.document;
      if (isQuartoDoc(document)) {
        this.editorLastSourcePos.set(document.uri.toString(), e.textEditor.selection.start.line + 1);
      }
    }));

    context.subscriptions.push(window.tabGroups.onDidChangeTabs(async (t) => {
      const tabs = t.opened;

      if (tabs.length > 0) {
        for (const tab of tabs) {
          if (tab.label.endsWith(".qmd") && (tab.input instanceof TabInputText || tab.input instanceof TabInputCustom)) {
            // determine what mode editor should be in
            const uri = tab.input.uri;

            const isTextEditor = tab.input instanceof TabInputText;
            const viewType = isTextEditor ? "textEditor" : tab.input.viewType;

            // get file contents
            const fileData = await workspace.fs.readFile(uri);
            const fileContent = Buffer.from(fileData).toString('utf8');
            const editorMode = determineMode(fileContent, uri);
            let isSwitch = this.visualEditorPendingSwitchToSource.has(uri.toString()) || this.editorPendingSwitchToVisual.has(uri.toString());
            if (this.editorPendingSwitchToVisual.has(uri.toString())) {
              this.editorPendingSwitchToVisual.delete(uri.toString());
            }

            // The `tab` we get from the change event is not precisely the same
            // as the tab in `window.tabGroups`, so if we try and close `tab` we
            // get a "tab not found" error. The one we care about does exist, but we have
            // manually find it via URI, which is a stable field to match on.
            if (editorMode && editorMode !== viewType && !isSwitch) {
              const allTabs = window.tabGroups.all.flatMap(group => group.tabs);

              // find tab to close if swapping editor type
              const tabToClose = allTabs.find(tab =>
                ((tab.input instanceof TabInputText) || (tab.input instanceof TabInputCustom)) &&
                (tab.input?.uri?.toString() === uri?.toString())
              );
              if (!tabToClose) {
                return;
              }
              await window.tabGroups.close(tabToClose, true);
              await commands.executeCommand("vscode.openWith", uri, editorMode);
              return;
            }
          }
        }
      }
    }));


    // when the active editor changes see if we have a visual editor position for it
    context.subscriptions.push(window.onDidChangeActiveTextEditor(debounce(() => {

      // resolve active editor
      const editor = window.activeTextEditor;
      if (!editor) {
        return;
      }
      const document = editor.document;
      if (document && isQuartoDoc(document)) {
        const uri = document.uri.toString();

        // check for switch (one shot)
        const isSwitch = this.visualEditorPendingSwitchToSource.has(uri);

        this.visualEditorPendingSwitchToSource.delete(uri);

        // check for pos (one shot)
        const pos = this.visualEditorLastSourcePos.get(uri);
        this.visualEditorLastSourcePos.delete(uri);

        if (!isSwitch) {
          return;
        }
        if (pos) {

          // find the index
          let cursorIndex = -1;
          for (let i = (pos.locations.length - 1); i >= 0; i--) {
            if (pos.pos >= pos.locations[i].pos) {
              cursorIndex = i;
              break;
            }
          }

          // get source locations
          const source = editorSourceJsonRpcServer(lspRequest);
          source.getSourcePosLocations(document.getText()).then(locations => {
            // map to source line
            const selLine = (cursorIndex !== -1 && (locations.length > cursorIndex))
              ? (locations[cursorIndex] || locations[locations.length - 1]).pos - 1
              : 0;

            // navigate
            const selRange = new Range(selLine, 0, selLine, 0);
            editor.selection = new Selection(selRange.start, selRange.end);
            editor.revealRange(selRange, TextEditorRevealType.InCenter);
          });
        }
      }
    }, 100)));

    const provider = new VisualEditorProvider(context, host, quartoContext, lspRequest, engine);
    const providerRegistration = window.registerCustomEditorProvider(
      VisualEditorProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        }
      }
    );
    return providerRegistration;
  }

  public static readonly viewType = "quarto.visualEditor";

  public static recordPendingSwitchToSource(document: TextDocument) {
    this.visualEditorPendingSwitchToSource.add(document.uri.toString());
  }

  public static recordPendingSwitchToVisual(document: TextDocument) {
    this.editorPendingSwitchToVisual.add(document.uri.toString());
  }

  public static activeEditor(includeVisible?: boolean): QuartoVisualEditor | undefined {
    const editor = this.visualEditors.activeEditor(includeVisible);
    if (editor) {
      return {
        document: editor.document,
        hasFocus: async () => {
          return await editor.editor.isFocused();
        },
        activate: async () => {
          activateVisualEditor(editor);
        },
        slideIndex: async () => {
          return await editor.editor.getSlideIndex();
        },
        getActiveBlockContext: async () => {
          return await editor.editor.getActiveBlockContext();
        },
        setBlockSelection: async (context, action) => {
          await editor.editor.setBlockSelection(context, action);
        },
        viewColumn: editor.webviewPanel.viewColumn
      };
    } else {
      return undefined;
    }
  }

  public static editorForUri(uri: Uri): TrackedEditor | undefined {
    return this.visualEditors.editorForUri(uri);
  }

  public static visualEditorPendingXRefNavigation(uri: string, xref: XRef) {
    this.visualEditorPendingXRefNavigations.set(uri, xref);
  }

  constructor(private readonly context: ExtensionContext,
    private readonly extensionHost: ExtensionHost,
    private readonly quartoContext: QuartoContext,
    private readonly lspRequest: JsonRpcRequestTransport,
    private readonly engine: MarkdownEngine) { }

  public async resolveCustomTextEditor(
    document: TextDocument,
    webviewPanel: WebviewPanel,
    _token: CancellationToken
  ) {

    // if the document is untitled then capture its contents (as vscode throws it on the floor
    // and we may need it to do a re-open)
    const untitledContent =
      (document.isUntitled &&
        VisualEditorProvider.activeUntitled?.uri.toString() === document.uri.toString())
        ? VisualEditorProvider.activeUntitled.content
        : undefined;

    // function to re-open in source mode
    const reopenSourceMode = async () => {
      await reopenEditorInSourceMode(document, untitledContent, webviewPanel.viewColumn);
    };

    // prompt the user

    // Check for environment variables to force the state of the visual editor confirmation modal
    // QUARTO_VISUAL_EDITOR_CONFIRMED > PW_TEST > CI
    const envVars = [
      "CI",
      "PW_TEST",
      "QUARTO_VISUAL_EDITOR_CONFIRMED"
    ];
    envVars.forEach(envVar => {
      if (process.env[envVar] !== undefined) {
        this.context.globalState.update(kVisualModeConfirmed, process.env[envVar] === "true");
      }
    });

    if (this.context.globalState.get(kVisualModeConfirmed) !== true) {
      const kUseVisualMode = "Use Visual Mode";
      const kLearnMore = "Learn More...";
      const result = await window.showInformationMessage<string>(
        "You are activating Quarto visual markdown editing mode.",
        {
          modal: true,
          detail:
            "Visual mode enables you to author using a familiar word processor style interface.\n\n" +
            "Markdown code will be re-formatted using the Pandoc markdown writer."
        },
        kUseVisualMode,
        kLearnMore
      );
      if (!result) {
        await reopenSourceMode();
        return;
      } else if (result === kLearnMore) {
        await env.openExternal(Uri.parse("https://quarto.org/docs/visual-editor/vscode/#markdown-output"));
        await reopenSourceMode();
        return;
      } else {
        this.context.globalState.update(kVisualModeConfirmed, true);
      }
    }

    // some storage locations
    const projectDir = document.isUntitled ? undefined : projectDirForDocument(document.fileName);
    const workspaceDir = this.quartoContext.workspaceDir;

    // track disposables
    const disposables: Disposable[] = [];

    // get visual editor client
    const client = visualEditorClient(webviewPanel);
    disposables.push(client);

    // collect sourcePos if we've been editing this in text mode
    const sourceUri = document.uri.toString();
    const sourcePos = VisualEditorProvider.editorLastSourcePos.get(sourceUri);
    VisualEditorProvider.editorLastSourcePos.delete(sourceUri);

    // collection pending navigation
    const xref = VisualEditorProvider.visualEditorPendingXRefNavigations.get(sourceUri);
    VisualEditorProvider.visualEditorPendingXRefNavigations.delete(sourceUri);

    // sync manager
    const syncManager = editorSyncManager(
      document,
      client.editor,
      this.lspRequest,
      xref || sourcePos
    );

    // editor container implementation
    const host: VSCodeVisualEditorHost = {

      // editor is querying for context
      getHostContext: async (): Promise<HostContext> => {
        return {
          documentPath: document.isUntitled ? null : document.fileName,
          projectDir,
          resourceDir: document.isUntitled
            ? (workspaceDir || process.cwd())
            : path.dirname(document.fileName),
          isWindowsDesktop: isWindows(),
          executableLanguages: this.extensionHost.executableLanguages(true, document, this.engine)
        };
      },

      reopenSourceMode: async () => {

        reopenEditorInSourceMode(
          document,
          untitledContent || '',
          webviewPanel.viewColumn,
        );
      },

      // editor is fully loaded and ready for communication
      onEditorReady: async () => {

        // initialize sync manager
        await syncManager.init();

        // notify for document changes
        disposables.push(workspace.onDidChangeTextDocument(
          async (e) => {
            if (e.document.uri.toString() === document.uri.toString()) {
              await syncManager.onDocumentChanged();
            }
          }
        ));

        // notify for saves (ensure we get latest changes applied)
        disposables.push(workspace.onWillSaveTextDocument(
          (e) => {
            if (e.document.uri.toString() === document.uri.toString()) {
              e.waitUntil(syncManager.onDocumentSaving());
            }
          }
        ));

        // last ditch notification for saves (in case we didn't get our changes applied)
        disposables.push(workspace.onDidSaveTextDocument(
          (doc) => {
            if (doc.uri.toString() === document.uri.toString()) {
              syncManager.onDocumentSaved();
            }
          }
        ));

        // poll for focus (and fix if it gets out of sync)
        disposables.push(focusTracker(webviewPanel, client.editor));

      },

      // notify sync manager when visual editor is updated
      onEditorUpdated: syncManager.onVisualEditorChanged,

      onEditorStateChanged: async (sourcePos: SourcePos) => {
        VisualEditorProvider.visualEditorLastSourcePos.set(document.uri.toString(), sourcePos);
      },

      // flush any pending updates
      flushEditorUpdates: syncManager.flushPendingUpdates,

      // save the document now
      saveDocument: async () => {
        await commands.executeCommand("workbench.action.files.save");
      },

      renderDocument: async () => {
        await commands.executeCommand("quarto.preview");
      },

      // map resources to uris valid in the editor
      editorResourceUri: async (path: string) => {
        const uri = webviewPanel.webview.asWebviewUri(Uri.file(path)).toString();
        return uri;
      },

      openURL: function (url: string): void {
        env.openExternal(Uri.parse(url));
      },
      navigateToXRef: function (file: string, xref: XRef): void {
        navigateToFile(document, file, xref);
      },
      navigateToFile: function (file: string): void {
        navigateToFile(document, file);
      },

      ...documentImageResolver(document, projectDir)
    };

    // create prefs server that also monitors for changes and forwards them to the visual editor
    const [prefsServer, unsubscribe] = await vscodePrefsServer(
      this.quartoContext,
      this.engine,
      document,
      (prefs: Prefs) => {
        if (client.connected()) {
          client.editor.prefsChanged(prefs);
        }
      }
    );
    disposables.push(unsubscribe);

    // setup server on webview iframe
    disposables.push(visualEditorServer(
      webviewPanel,
      this.lspRequest,
      host,
      prefsServer,
      vscodeCodeViewServer(this.engine, document, this.lspRequest)
    ));

    // doc dir
    const docDir = !document.isUntitled ? path.dirname(document.fileName) : undefined;

    // monitor image file changes
    const kImagePattern = '**/*.{png,svg,jpg,jpeg}';
    const globPattern: GlobPattern = docDir
      ? { baseUri: Uri.file(docDir), base: docDir, pattern: kImagePattern }
      : kImagePattern;
    const watcher = workspace.createFileSystemWatcher(globPattern);
    disposables.push(watcher);
    const onChange = (e: Uri) => {
      client.editor.imageChanged(e.fsPath);
    };
    watcher.onDidChange(onChange);
    watcher.onDidCreate(onChange);
    watcher.onDidDelete(onChange);

    // load editor webview (include current doc path in localResourceRoots)
    webviewPanel.webview.options = {
      localResourceRoots: [
        this.context.extensionUri,
        ...(workspace.workspaceFolders ? workspace.workspaceFolders.map(folder => folder.uri) : []),
        ...(docDir ? [Uri.file(docDir)] : [])
      ],
      enableScripts: true
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // track visual editors
    disposables.push(VisualEditorProvider.visualEditors.track(document, webviewPanel, client.editor));

    // handle disposables when editor is closed
    webviewPanel.onDidDispose(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });

  }

  private editorAssetUri(webview: Webview, file: string) {
    return this.extensionResourceUrl(webview, ["assets", "www", "editor", file]);
  }

  protected extensionResourceUrl(webview: Webview, parts: string[]): Uri {
    return webview.asWebviewUri(
      Uri.joinPath(this.context.extensionUri, ...parts)
    );
  }

  /**
   * Get the static html used for the editor webviews.
   */
  private getHtmlForWebview(webview: Webview): string {

    const scriptUri = this.editorAssetUri(webview, "index.js");
    const stylesUri = this.editorAssetUri(webview, "style.css");
    const codiconsUri = this.extensionResourceUrl(webview, [
      "assets",
      "www",
      "codicon",
      "codicon.css",
    ]);
    const codiconsFontUri = this.extensionResourceUrl(webview, [
      "assets",
      "www",
      "codicon",
      "codicon.ttf",
    ]);

    // Use a nonce to whitelist which scripts can be run
    const nonce = getNonce();

    return /* html */ `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">

            <!-- Use a content security policy to only allow scripts that have a specific nonce. -->
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline'; img-src https: data: ${webview.cspSource}; font-src data: ${webview.cspSource};">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">

            <link href="${stylesUri}" rel="stylesheet" />
            <style type="text/css">
            @font-face {
              font-family: "codicon";
              font-display: block;
              src: url("${codiconsFontUri}?939d3cf562f2f1379a18b5c3113b59cd") format("truetype");
            }
            </style>
            <link rel="stylesheet" type="text/css" href="${codiconsUri}">

            <title>Visual Editor</title>
        </head>
        <body>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
  }
}

async function navigateToFile(baseDoc: TextDocument, file: string, xref?: XRef) {

  const docDir = path.dirname(baseDoc.uri.fsPath);
  const filePath = path.normalize(path.isAbsolute(file) ? file : path.join(docDir, file));
  const uri = Uri.file(filePath);
  const ext = extname(filePath).toLowerCase();

  const openWith = async (viewType: string) => {
    await commands.executeCommand("vscode.openWith", uri, viewType, { preserveFocus: false });
  };

  if (ext === ".qmd") {
    if (xref) {
      const visualEditor = VisualEditorProvider.editorForUri(uri);
      if (visualEditor) {
        activateVisualEditor(visualEditor, xref);
      } else {
        VisualEditorProvider.visualEditorPendingXRefNavigation(uri.toString(), xref);
        await openWith(VisualEditorProvider.viewType);
      }
    } else {
      await openWith(VisualEditorProvider.viewType);
    }

  } else if (ext === ".ipynb") {

    await openWith("jupyter-notebook");

  } else {

    const doc = await workspace.openTextDocument(uri);
    await window.showTextDocument(doc, ViewColumn.Active, false);

  }
}

interface TrackedEditor {
  document: TextDocument;
  webviewPanel: WebviewPanel;
  editor: VSCodeVisualEditor;
}

function activateVisualEditor(editor: TrackedEditor, navigation?: NavLocation) {
  editor.webviewPanel.reveal(editor.webviewPanel.viewColumn, false);
  // delay required to circumvent other focus activity
  setTimeout(() => {
    editor.editor.focus(navigation);
  }, 200);
}

interface VisualEditorTracker {
  track: (document: TextDocument, webviewPanel: WebviewPanel, editor: VSCodeVisualEditor) => Disposable;
  editorForUri: (uri: Uri) => TrackedEditor | undefined;
  activeEditor: (includeVisible?: boolean) => TrackedEditor | undefined;
}

function visualEditorTracker(): VisualEditorTracker {

  const activeEditors = new Array<TrackedEditor>();

  return {
    track: (document: TextDocument, webviewPanel: WebviewPanel, editor: VSCodeVisualEditor): Disposable => {
      activeEditors.push({ document, webviewPanel, editor });
      return {
        dispose: () => {
          const idx = activeEditors.findIndex(editor => editor.webviewPanel === webviewPanel);
          if (idx !== -1) {
            activeEditors.splice(idx, 1);
          }
        }
      };
    },
    editorForUri: (uri: Uri) => {
      return activeEditors.find(editor => editor.document.uri.toString() === uri.toString());
    },
    activeEditor: (includeVisible?: boolean) => {
      return activeEditors.find(editor => {
        try {
          return editor.webviewPanel.active || (includeVisible && editor.webviewPanel.visible);
        } catch (err) {
          // we've seen activeEditors hold on to references to disposed editors (can't on the
          // surface see how this would occur as we subscribe to dispose, but as an insurance
          // policy let's eat any exception that occurs, since a single zombie webviewPanel
          // would prevent rendering of other panels
          return false;
        }

      });
    }
  };
}

function focusTracker(webviewPanel: WebviewPanel, editor: VSCodeVisualEditor): Disposable {

  let hasFocus = false;
  let cancelled = false;

  const focusEditor = async () => {
    await commands.executeCommand('workbench.action.focusNextGroup');
    webviewPanel.reveal(webviewPanel.viewColumn, false);
    editor.focus();
  };

  // if we are focused when the window loses focus then restore on re-focus
  let reFocus = false;
  const evWindow = window.onDidChangeWindowState(async (event) => {
    if (!event.focused && hasFocus) {
      reFocus = true;
    } else if (event.focused && reFocus) {
      setTimeout(async () => {
        await focusEditor();
        reFocus = false;
      }, 200);
    }
  });

  // periodically check for focus
  const timer = setInterval(async () => {
    // update focus state
    hasFocus = await editor.isFocused();

    // if focus state between the panel and editor gets out of state, do a reset
    if (webviewPanel.visible && !webviewPanel.active && !cancelled) {
      if (hasFocus && !reFocus) {
        focusEditor();
      }
    }
  }, 1000);

  return {
    dispose: () => {
      cancelled = true;
      clearInterval(timer);
      evWindow.dispose();
    }
  };

}
