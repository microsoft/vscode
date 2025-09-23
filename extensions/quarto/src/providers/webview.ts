/*
 * webview.ts
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

import {
  Uri,
  WebviewPanel,
  window,
  ViewColumn,
  EventEmitter,
  ExtensionContext,
} from "vscode";

import { Disposable } from "../core/dispose";
import { preserveEditorFocus } from "../core/doc";
import { getNonce } from "../core/nonce";
import { ExtensionHost, HostWebviewPanel } from "../host";

export interface ShowOptions {
  readonly preserveFocus?: boolean;
  readonly viewColumn?: ViewColumn;
}

export class QuartoWebviewManager<T extends QuartoWebview<S>, S> {
  constructor(
    protected readonly context: ExtensionContext,
    private readonly host_: ExtensionHost,
    private readonly viewType_: string,
    private readonly title_: string,
    private webviewType_: new (
      context: ExtensionContext,
      state: S,
      webviewPanel: HostWebviewPanel
    ) => T
  ) {

    context.subscriptions.push(
      window.registerWebviewPanelSerializer(this.viewType_, {
        deserializeWebviewPanel: async (panel, state: S) => {
          this.restoreWebvew(panel, state);
          setTimeout(() => {
            panel.dispose();
          }, 200);
        },
      })
    );
  }

  public setOnShow(f: () => void) {
    this.onShow_ = f;
  }

  public showWebview(state: S, options?: ShowOptions): void {
    if (this.activeView_) {
      this.activeView_.show(state, options);
    } else {
      const view = this.createWebview(this.context, state, options);
      this.registerWebviewListeners(view);
      this.activeView_ = view;
    }
    this.resolveOnShow();
    if (options?.preserveFocus) {
      preserveEditorFocus();
    }
  }

  public revealWebview() {
    if (this.activeView_) {
      this.activeView_.reveal();
      this.resolveOnShow();
    }
  }

  public hasWebview() {
    return !!this.activeView_;
  }

  public isVisible() {
    return !!this.activeView_ && this.activeView_.webviewPanel().visible;
  }

  protected onViewStateChanged() { }

  private resolveOnShow() {
    if (this.onShow_) {
      this.onShow_();
      this.onShow_ = undefined;
    }
  }

  private restoreWebvew(panel: WebviewPanel, state: S): void {
    const view = new this.webviewType_(this.context, state, panel);
    this.registerWebviewListeners(view);
    this.activeView_ = view;
  }


  private createWebview(
    context: ExtensionContext,
    state: S,
    showOptions?: ShowOptions
  ): T {
    const webview = this.host_.createPreviewPanel(
      this.viewType_,
      this.title_,
      showOptions?.preserveFocus,
      {
        enableScripts: true,
        enableForms: true,
        retainContextWhenHidden: true,
        localResourceRoots: [Uri.joinPath(context.extensionUri, "assets", "www")],
      }
    );

    const quartoWebview = new this.webviewType_(context, state, webview);

    return quartoWebview;
  }

  private registerWebviewListeners(view: T) {
    view.onDispose(() => {
      if (this.activeView_ === view) {
        this.activeView_ = undefined;
      }
    });
    view.webviewPanel().onDidChangeViewState(() => {
      this.onViewStateChanged();
    });
  }

  public dispose() {
    if (this.activeView_) {
      this.activeView_.dispose();
      this.activeView_ = undefined;
    }
    let item: Disposable | undefined;
    while ((item = this.disposables_.pop())) {
      item.dispose();
    }
  }
  protected activeView_?: T;
  protected readonly disposables_: Disposable[] = [];

  private onShow_?: () => void;
}

export abstract class QuartoWebview<T> extends Disposable {
  protected readonly _webviewPanel: HostWebviewPanel;

  private readonly _onDidDispose = this._register(new EventEmitter<void>());
  public readonly onDispose = this._onDidDispose.event;

  public constructor(
    private readonly context: ExtensionContext,
    state: T,
    webviewPanel: HostWebviewPanel
  ) {
    super();

    this._webviewPanel = this._register(webviewPanel);

    this._register(
      this._webviewPanel.onDidDispose(() => {
        this.dispose();
      })
    );

    this.show(state);
  }

  public override dispose() {
    this._onDidDispose.fire();
    super.dispose();
  }

  public show(state: T, options?: ShowOptions) {
    this._webviewPanel.webview.html = this.getHtml(state);
    this._webviewPanel.reveal(options?.viewColumn, options?.preserveFocus);
  }

  public reveal() {
    this._webviewPanel.reveal(undefined, true);
  }

  public webviewPanel() {
    return this._webviewPanel;
  }

  protected abstract getHtml(state: T): string;

  protected webviewHTML(
    js: Array<string[]>,
    css: string[],
    headerHtml: string,
    bodyHtml: string,
    allowUnsafe = false
  ) {
    const nonce = getNonce();

    if (!Array.isArray(js)) {
      js = [js];
    }

    const jsHtml = js.reduce((html, script) => {
      return (
        html +
        `<script src="${this.extensionResourceUrl(
          script
        )}" nonce="${nonce}"></script>\n`
      );
    }, "");

    const mainCss = this.extensionResourceUrl(css);
    const codiconsUri = this.extensionResourceUrl([
      "assets",
      "www",
      "codicon",
      "codicon.css",
    ]);
    const codiconsFontUri = this.extensionResourceUrl([
      "assets",
      "www",
      "codicon",
      "codicon.ttf",
    ]);

    return /* html */ `<!DOCTYPE html>
			<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">

				<meta http-equiv="Content-Security-Policy" content="
					default-src 'none';
					font-src ${this._webviewPanel.webview.cspSource};
					style-src ${this._webviewPanel.webview.cspSource} ${allowUnsafe ? "'unsafe-inline'" : ""
      };
					script-src 'nonce-${nonce}' ${allowUnsafe ? "'unsafe-eval'" : ""};
          connect-src ${this._webviewPanel.webview.cspSource} ;
					frame-src *;
					">

				${headerHtml}

				<link rel="stylesheet" type="text/css" href="${mainCss}">
        <style type="text/css">
        @font-face {
          font-family: "codicon";
          font-display: block;
          src: url("${codiconsFontUri}?939d3cf562f2f1379a18b5c3113b59cd") format("truetype");
        }
        </style>
				<link rel="stylesheet" type="text/css" href="${codiconsUri}">
			</head>
			<body>
				${bodyHtml}
				${jsHtml}
			</body>
			</html>`;
  }

  protected extensionResourceUrl(parts: string[]): Uri {
    return this._webviewPanel.webview.asWebviewUri(
      Uri.joinPath(this.context.extensionUri, ...parts)
    );
  }

  protected escapeAttribute(value: string | Uri): string {
    return value.toString().replace(/"/g, "&quot;");
  }

}
