/*
 * preview-webview.ts
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
  env,
  Uri,
  window,
  ColorThemeKind,
  ExtensionContext,
} from "vscode";
import { QuartoWebview, QuartoWebviewManager } from "../webview";
import { HostWebviewPanel } from "../../host";

const kQuarotPreviewZoomLevel = "quartoPreviewZoomLevel";

export interface QuartoPreviewState {
  url: string;
  zoomLevel?: "auto" | number;
  slideIndex?: number;
}

export class QuartoPreviewWebviewManager extends QuartoWebviewManager<
  QuartoPreviewWebview,
  QuartoPreviewState
> {
  public clear() {
    if (this.activeView_) {
      this.activeView_.clear();
    }
  }
  public setSlideIndex(slideIndex?: number) {
    if (this.activeView_) {
      this.activeView_.setSlideIndex(slideIndex);
    }
  }
  public setOnError(handler: () => void) {
    if (this.activeView_) {
      this.activeView_.setOnError(handler);
    }
  }
  public getZoomLevelConfig(): "auto" | number {
    return this.context.globalState.get<"auto" | number>(kQuarotPreviewZoomLevel, "auto");
  }
}

export class QuartoPreviewWebview extends QuartoWebview<QuartoPreviewState> {
  public constructor(
    context: ExtensionContext,
    state: QuartoPreviewState,
    webviewPanel: HostWebviewPanel
  ) {
    super(context, state, webviewPanel);

    this._register(
      this._webviewPanel.webview.onDidReceiveMessage((e) => {
        switch (e.type) {
          case "openExternal":
            try {
              const url = Uri.parse(e.url);
              env.openExternal(url);
            } catch {
              // Noop
            }
            break;
          case "previewError":
            if (this.onError_) {
              this.onError_();
            }
            break;
          case "zoomLevelChanged":
            context.globalState.update(kQuarotPreviewZoomLevel, e.msg);
            break;
        }
      })
    );

    this._register(
      window.onDidChangeActiveColorTheme((_e) => {
        this._webviewPanel.webview.postMessage({
          type: "didChangeActiveColorTheme",
          theme:
            window.activeColorTheme.kind === ColorThemeKind.Light
              ? "light"
              : "dark",
        });
      })
    );
  }

  public setOnError(handler: () => void) {
    this.onError_ = handler;
  }

  public clear() {
    this._webviewPanel.webview.postMessage({
      type: "clear",
    });
  }

  public setSlideIndex(slideIndex?: number) {
    this._webviewPanel.webview.postMessage({
      type: "setSlideIndex",
      index: slideIndex,
    });
  }

  protected getHtml(state: QuartoPreviewState): string {

    const headerHtml = `
    <meta id="simple-browser-settings" data-settings="${this.escapeAttribute(
      JSON.stringify({
        url: state.url,
        zoomLevel: state.zoomLevel,
        slideIndex: state.slideIndex
      })
    )}">
    `;

    const bodyHtml = `
    <header class="header">
      <nav class="controls">
        <button
          title="Back"
          class="back-button icon"><i class="codicon codicon-arrow-left"></i></button>

        <button
          title="Forward"
          class="forward-button icon"><i class="codicon codicon-arrow-right"></i></button>

        <button
          title="Reload"
          class="reload-button icon"><i class="codicon codicon-refresh"></i></button>
      </nav>

      <input class="url-input" type="text">

      <nav class="controls">
        <select id="zoom">
          <option value="auto">Zoom: (Auto)</option>
          <option value="70">Zoom: 70%</option>
          <option value="80">Zoom: 80%</option>
          <option value="90">Zoom: 90%</option>
          <option value="100">Zoom: 100%</option>
        </select>
        <button
          title="Open in browser"
          class="open-external-button icon"><i class="codicon codicon-link-external"></i></button>
      </nav>
    </header>
    <div class="content">
      <iframe sandbox="allow-scripts allow-forms allow-same-origin allow-pointer-lock allow-downloads"></iframe>
    </div>
    `;

    return this.webviewHTML(
      [this.assetPath("index.js")],
      this.assetPath("main.css"),
      headerHtml,
      bodyHtml,
      true
    );
  }

  private assetPath(asset: string) {
    return ["assets", "www", "preview", asset];
  }

  private onError_: (() => void) | undefined;
}
