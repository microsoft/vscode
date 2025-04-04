// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { loadServerDefaults } from './common/setup';
import { registerLogger, traceInfo } from './common/logging';
import { TerminalTracer } from './tracers/terminalTracer';
import { FileSystemTracer } from './tracers/filesystemTracer';
import { EditorTracer } from './tracers/editorTracer';
import { ClipboardTracer } from './tracers/clipboardTracer';
import { WorkspaceTracer } from './tracers/workspaceTracer';
import { StateTracer } from './tracers/stateTracer';
import { isConfigured } from './api/project';
import WorkerFileRecorder from './recorders/workerFileRecorder';
import { ExportNotifier } from './notifier';
import { registerCommands } from './commands';
import { ThoughtsTracker } from './tracers/thoughtsTracker';
import { activateThoughtsView } from './tracers/thoughtsView';

// set of tracers to be used
const tracers = [
  FileSystemTracer,
  EditorTracer,
  TerminalTracer,
  ClipboardTracer,
  StateTracer,
  WorkspaceTracer
];



// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  const serverInfo = loadServerDefaults();
  const serverName = serverInfo.name;

  const outputChannel = vscode.window.createOutputChannel(serverName, {
    log: true,
  });
  context.subscriptions.push(outputChannel, registerLogger(outputChannel));

  // Create the recorder
  const recorder = new WorkerFileRecorder(context);

  // Initialize thoughts tracker
  const thoughtsTracker = new ThoughtsTracker(recorder, context);

  const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (rootPath) {
    //activateSearchReplace(context, recorder);

    // Activate thoughts view
    activateThoughtsView(context, thoughtsTracker);

    // prompt to create plan if no thoughts have been recorded
    if (!thoughtsTracker.hasThoughts()) {
      vscode.window.showWarningMessage('No thoughts recorded. Please create a plan',
        { modal: true, detail: 'You must create a plan.' },
        { title: 'Create Plan', isCloseAffordance: true })
        .then((selection) => {
          if (selection?.title === 'Create Plan') {
            // User clicked 'Export Now'
            thoughtsTracker.openThoughtEditor();
          } else {
            thoughtsTracker.openThoughtEditor();
          }
        });
    }

    // initialize tracers
    const fsTracer = new FileSystemTracer(context, recorder, thoughtsTracker);
    fsTracer.register();

    const editorTracer = new EditorTracer(context, recorder, thoughtsTracker);
    editorTracer.register();

    const terminalTracer = new TerminalTracer(context, recorder, thoughtsTracker);
    terminalTracer.register();

    const clipboardTracer = new ClipboardTracer(context, recorder, thoughtsTracker);
    clipboardTracer.register();

    const workspaceTracer = new WorkspaceTracer(context, recorder, thoughtsTracker);
    workspaceTracer.register();

    // const stateTracer = new StateTracer(context, recorder, thoughtsTracker);
    // stateTracer.register();

    // Register URI handler for external linking with project_id
    // supports url's vscode://datacurve.datacurve-tracer/project?product_id=123456&jwt=eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDExMUFBQSIsImtpZCI6Imluc18yYUlGT0hNUE9jN0cyYUh2MXlzSzhWRUVaTUYiLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJjb21wbGV0ZWRBc3Nlc3NtZW50IjpudWxsLCJlbWFpbEFkZHJlc3MiOiJuYXRoYS5wYXF1ZXR0ZUBnbWFpbC5jb20iLCJleHAiOjE3NDEyNzYwNzksImZ1bGxOYW1lIjoibmF0aGEgcGFxdWV0dGUiLCJmdmEiOls3MDUsLTFdLCJpYXQiOjE3NDEyNzYwMTksImlzcyI6Imh0dHBzOi8vdGVuZGVyLXdhaG9vLTUuY2xlcmsuYWNjb3VudHMuZGV2IiwianRpIjoiMWIxNDA0MzE0OThmZWFjMjFmNmQiLCJuYmYiOjE3NDEyNzYwMDksInByb3Zpc2lvbmVkIjpudWxsLCJzaWQiOiJzZXNzXzJ0dlhrWklnWDFiU0dZdm5FQkdVUHJtdXJBdSIsInN1YiI6InVzZXJfMnRzOU5ZSmdpQjN0dTgwQ2pmUUxzY3VWSWozIn0.Hh-dwCv_44ylP3leJXXIPQwZRYV6vC8ITuqws_xj3KKN8xgnZc5pa6jdSjueHPZyNNZRWAYgAVrqo4GJEWAFTEDl1Le5UAzCLtSd8kwsKkmyPtKx7DGU7FBZy6fLyvKOUrkIUjHoTsbVrWOxudILbqfw9WvGWQwGV_CaNAEm94Mx7EU4GTUE3IrPJ6IJVb8Z2WhmAl0ENXneH87Evn1gzci3sHzFeUWln4n5lQ-hnEEuv24s-3KcszOhUmGFju5WSK_BPBWj_kFTgxGUC2ybCw9oXY9pfs1tHfwDfRH-IFg7YNXfyPc1zoN95EmyHnEuDV4e6yDz9z6GbMzmBBwtZg
    const uriHandler = vscode.window.registerUriHandler({
      handleUri(uri: vscode.Uri): void {
        if (isConfigured(context)) {
          vscode.window.showErrorMessage('New projects must be created in a new workspace.');
          return;
        }

        // Parse the URI query parameters
        const queryParams = new URLSearchParams(uri.query);
        const projectId = queryParams.get('project_id');
        const jwt = queryParams.get('jwt');
        const solutionId = queryParams.get('solution_id');
        if (jwt) {
          const secrets = context['secrets'];
          secrets.store('shipd-jwt', jwt as unknown as string);
        }

        if (projectId) {
          traceInfo(`Received project_id: ${projectId}`);
          // Store the project_id in extension state
          context.workspaceState.update('datacurve-project-id', projectId);
          vscode.window.showInformationMessage(`Project ID set to: ${projectId}`);

          context.workspaceState.update('datacurve-solution-id', solutionId);
          vscode.window.showInformationMessage(`Solution ID set to: ${solutionId}`);

          // Additional actions with project_id could be added here
          // For example, automatically download project files
        } else {
          vscode.window.showWarningMessage('No project_id provided in the URI');
        }
      }
    });

    // Add URI handler to subscriptions
    context.subscriptions.push(uriHandler);

    // Register commands
    registerCommands(context, recorder, thoughtsTracker);

    // Create and start the export notifier
    const exportNotifier = new ExportNotifier(context);
    exportNotifier.start();

    // Add the notifier to subscriptions so it gets disposed properly
    context.subscriptions.push({
      dispose: () => exportNotifier.dispose()
    });
  }
}
// This method is called when your extension is deactivated
export function deactivate() { }
