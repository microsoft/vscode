/*
 * diagram-webview.ts
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

import debounce from "lodash.debounce";
import {
  ExtensionContext,
  window,
  Position,
  ViewColumn,
} from "vscode";

import { DiagramState, languageDiagramEngine } from "../../types/local-types";
import { isGraphvizDoc, isMermaidDoc, isQuartoDoc } from "../../core/doc";
import { MarkdownEngine } from "../../markdown/engine";
import { QuartoWebview, QuartoWebviewManager } from "../webview";
import { isDiagram, languageBlockAtPosition, languageNameFromBlock } from "quarto-core";
import { ExtensionHost, HostWebviewPanel } from "../../host";

const kDiagramViewId = "quarto.diagramView";

export class QuartoDiagramWebviewManager extends QuartoWebviewManager<
  QuartoDiagramWebview,
  null
> {
  constructor(
    context: ExtensionContext,
    host: ExtensionHost,
    private readonly engine_: MarkdownEngine
  ) {
    super(context, host, kDiagramViewId, "Quarto: Diagram", QuartoDiagramWebview);

    window.onDidChangeActiveTextEditor(
      () => {
        this.updatePreview();
      },
      null,
      this.disposables_
    );

    window.onDidChangeTextEditorSelection(
      debounce(() => {
        this.updatePreview();
      }, 500),
      null,
      this.disposables_
    );
  }

  public showDiagram(state?: DiagramState, activate = true) {

    if (!this.activeView_ && !activate) {
      return;
    }

    this.setOnShow(() => {
      this.updatePreview(state);
    });
    if (this.activeView_) {
      this.revealWebview();
    } else {
      this.lastState_ = undefined;
      this.showWebview(null, {
        preserveFocus: true,
        viewColumn: ViewColumn.Beside,
      });
    }
  }

  protected override onViewStateChanged(): void {
    this.updatePreview(this.lastState_);
  }


  private async updatePreview(state?: DiagramState) {

    if (this.isVisible()) {
      // see if there is an explcit state update (otherwise inspect hte active editor)
      if (state) {

        this.updateViewState(state);

        // inspect the active editor for a diagram
      } else if (window.activeTextEditor) {
        const doc = window.activeTextEditor.document;
        if (isQuartoDoc(doc) && window.activeTextEditor.selection) {
          // if we are in a diagram block then send its contents
          const tokens = this.engine_.parse(doc);
          const line = window.activeTextEditor.selection.start.line;
          const block = languageBlockAtPosition(tokens, new Position(line, 0));
          if (block && isDiagram(block)) {
            const language = languageNameFromBlock(block);
            const engine = languageDiagramEngine(language);
            if (engine) {
              this.updateViewState({ engine, src: block.data });
            }
          }
        } else if (isMermaidDoc(doc)) {
          this.updateViewState({
            engine: "mermaid",
            src: doc.getText(),
          });
        } else if (isGraphvizDoc(doc)) {
          this.updateViewState({
            engine: "graphviz",
            src: doc.getText(),
          });
        }
      }
    }
  }

  private updateViewState(state: DiagramState) {
    this.lastState_ = state;
    this.activeView_?.update(state);
  }

  private lastState_: DiagramState | undefined;
}

class QuartoDiagramWebview extends QuartoWebview<null> {
  public constructor(
    context: ExtensionContext,
    state: null,
    webviewPanel: HostWebviewPanel
  ) {
    super(context, state, webviewPanel);

    this._register(
      this._webviewPanel.webview.onDidReceiveMessage((e) => {
        switch (e.type) {
          case "initialized": {
            this.initialized_ = true;
            if (this.pendingState_) {
              this.flushPendingState();
            }
            break;
          }
          case "render-begin": {
            this.rendering_ = true;
            break;
          }
          case "render-end": {
            this.rendering_ = false;
            if (this.pendingState_) {
              this.flushPendingState();
            }
            break;
          }
        }
      })
    );
  }

  public update(state?: DiagramState) {
    if (!this.initialized_ || this.rendering_) {
      this.pendingState_ = state;
    } else if (state) {
      this._webviewPanel.webview.postMessage({
        type: "render",
        ...state,
      });
    } else {
      this._webviewPanel.webview.postMessage({
        type: "clear",
      });
    }
  }

  protected getHtml(_state: null): string {
    const headerHtml = ``;

    const bodyHtml = `
      <div id="no-preview"></div>
      <div id="preview-error" class="hidden">
        <pre id="preview-error-message">
        </pre>
      </div>
      <div id="mermaid-preview" class="diagram-preview"></div>
      <div id="graphviz-preview" class="diagram-preview"></div>
    `;

    return this.webviewHTML(
      [
        this.assetPath("lodash.min.js"),
        this.assetPath("mermaid.min.js"),
        this.assetPath("d3.v5.min.js"),
        this.assetPath("graphviz.min.js"),
        this.assetPath("d3-graphviz.js"),
        this.assetPath("diagram.js"),
      ],
      this.assetPath("diagram.css"),
      headerHtml,
      bodyHtml,
      true
    );
  }

  private flushPendingState() {
    const state = this.pendingState_;
    this.pendingState_ = undefined;
    this.update(state);
  }

  private assetPath(asset: string) {
    return ["assets", "www", "diagram", asset];
  }

  private initialized_ = false;
  private rendering_ = false;
  private pendingState_: DiagramState | undefined;
}
