import * as vscode from 'vscode';
import { Thought, ThoughtsTracker } from './thoughtsTracker';

export class ThoughtsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'thoughtsTracker';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _thoughtsTracker: ThoughtsTracker
  ) { }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Update the webview when thoughts change
    this._thoughtsTracker.onThoughtsChanged(thoughts => {
      this._updateWebview(thoughts);
    });

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage(message => {
      switch (message.command) {
        case 'addThought':
          vscode.commands.executeCommand('datacurve-tracer.recordThought');
          break;
      }
    });

    // Initial update with existing thoughts
    this._updateWebview(this._thoughtsTracker.getThoughts());
  }

  private _updateWebview(thoughts: Thought[]) {
    if (this._view) {
      const currentThought = this._thoughtsTracker.getCurrentThought();
      const actionCount = this._thoughtsTracker.getActionsSinceLastThought();

      this._view.webview.postMessage({
        type: 'update',
        thoughts: thoughts,
        currentThought: currentThought,
        actionCount: actionCount
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-editor-foreground);
            padding: 10px;
            margin: 0;
            background-color: var(--vscode-editor-background);
          }

          .thoughts-container {
            display: flex;
            flex-direction: column;
            gap: 10px;
          }

          .thought-item {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            margin-bottom: 8px;
          }

          .thought-item.current {
            border-color: var(--vscode-focusBorder);
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
          }

          .thought-content {
            margin-bottom: 5px;
          }

          .thought-meta {
            display: flex;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            justify-content: space-between;
          }

          .action-count {
            margin-top: 15px;
            padding: 8px;
            border-radius: 4px;
            text-align: center;
            font-weight: bold;
            border: 1px solid var(--vscode-panel-border);
          }

          .action-count.warning {
            background-color: var(--vscode-inputValidation-warningBackground);
            border-color: var(--vscode-inputValidation-warningBorder);
            color: var(--vscode-inputValidation-warningForeground);
          }

          .add-thought-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 2px;
            cursor: pointer;
            margin-top: 10px;
            width: 100%;
          }

          .add-thought-button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }

          .empty-state {
            text-align: center;
            margin-top: 20px;
            color: var(--vscode-descriptionForeground);
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 5px;
          }

          .header h3 {
            margin: 0;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h3>Thoughts Tracker</h3>
        </div>

        <div id="action-count" class="action-count">
          Actions since last thought: 0
        </div>

        <button id="add-thought-btn" class="add-thought-button">Add New Thought</button>

        <div id="thoughts-container" class="thoughts-container">
          <div class="empty-state">No thoughts recorded yet</div>
        </div>

        <script>
          (function() {
            const vscode = acquireVsCodeApi();
            const thoughtsContainer = document.getElementById("thoughts-container");
            const actionCountElement = document.getElementById("action-count");
            const addThoughtButton = document.getElementById("add-thought-btn");

            // Handle messages from the extension
            window.addEventListener("message", event => {
              const message = event.data;

              switch (message.type) {
                case "update":
                  updateThoughtsList(message.thoughts, message.currentThought);
                  updateActionCount(message.actionCount);
                  break;
              }
            });

            addThoughtButton.addEventListener("click", () => {
              vscode.postMessage({
                command: "addThought"
              });
            });

            function updateThoughtsList(thoughts, currentThought) {
              thoughtsContainer.innerHTML = "";

              if (thoughts.length === 0) {
                thoughtsContainer.innerHTML = '<div class="empty-state">No thoughts recorded yet</div>';
                return;
              }

              // Sort thoughts by timestamp (newest first)
              thoughts.sort((a, b) => b.timestamp - a.timestamp);

              for (const thought of thoughts) {
                const isCurrentThought = currentThought && thought.id === currentThought.id;

                const thoughtElement = document.createElement("div");
                thoughtElement.classList.add("thought-item");
                if (isCurrentThought) {
                  thoughtElement.classList.add("current");
                }

                const formattedDate = new Date(thought.timestamp).toLocaleString();

                thoughtElement.innerHTML = \`
                  <div class="thought-content">\${thought.content}</div>
                  <div class="thought-meta">
                    <span>\${formattedDate}</span>
                    <span>Actions: \${thought.actionCount}</span>
                  </div>
                \`;

                thoughtsContainer.appendChild(thoughtElement);
              }
            }

            function updateActionCount(count) {
              actionCountElement.innerHTML = \`Actions since last thought: \${count}\`;

              if (count >= 40) {
                actionCountElement.classList.add("warning");
              } else {
                actionCountElement.classList.remove("warning");
              }
            }
          }());
        </script>
      </body>
      </html>`;
  }
}

export function activateThoughtsView(context: vscode.ExtensionContext, thoughtsTracker: ThoughtsTracker) {
  const thoughtsViewProvider = new ThoughtsViewProvider(context.extensionUri, thoughtsTracker);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ThoughtsViewProvider.viewType,
      thoughtsViewProvider
    )
  );
}
