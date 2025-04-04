import * as vscode from 'vscode';
import { IRecorder } from '../types';
import { Tracer } from './tracer';
import { fileExplorer } from '../fileExplorer';
import { clipStringToLimits } from '../utils/limits';
import { ThoughtsTracker } from './thoughtsTracker';
import {
  createFileChangeTextDocumentAction,
  createFileCreateFilesAction,
  createFileDeleteFilesAction,
  createFileRenameFilesAction,
  createFileOpenTextDocumentAction,
  createFileCloseTextDocumentAction,
  createFileWillSaveTextDocumentAction,
  createFileDidSaveTextDocumentAction
} from '../utils/typedTracers';

/**
 * FileSystemTracer class is responsible for recording file system related events.
 * It listens to the following events:
 * - onDidChangeTextDocument (when a text document is changed)
 * - onDidCreateFiles (when files are created)
 * - onDidDeleteFiles (when files are deleted)
 * - onDidRenameFiles (when files are renamed)
 * - onWillSaveTextDocument (before a text document is saved)*
 * - onDidSaveTextDocument (after a text document is saved)*
 * *Note: onWillSaveTextDocument and onDidSaveTextDocument are used to record the diff of the file before and after saving.
 */
export class FileSystemTracer extends Tracer {
  // Add these properties to manage debouncing
  private textChangeDebounceTime: number;
  private textChangeDebounceTimer: NodeJS.Timeout | null = null;
  private pendingTextChangeAction: { actionId: string; document: vscode.TextDocument } | null = null;

  constructor(
    context: vscode.ExtensionContext,
    traceRecorder: IRecorder,
    thoughtsTracker?: ThoughtsTracker
  ) {
    super(context, traceRecorder, thoughtsTracker);

    // Load configuration settings
    const config = vscode.workspace.getConfiguration('datacurve-tracer.filesystem');
    this.textChangeDebounceTime = config.get('textChangeDebounceTime', 30000);

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('datacurve-tracer.filesystem')) {
        const newConfig = vscode.workspace.getConfiguration('datacurve-tracer.filesystem');
        this.textChangeDebounceTime = newConfig.get('textChangeDebounceTime', 30000);
      }
    }, null, this.disposables);
  }

  // Add a debounced signalAction method specifically for text changes
  private debouncedSignalTextChange(actionId: string, document: vscode.TextDocument): void {
    // Store the pending action
    this.pendingTextChangeAction = { actionId, document };

    // Clear any existing timer
    if (this.textChangeDebounceTimer) {
      clearTimeout(this.textChangeDebounceTimer);
    }

    // Set a new timer
    this.textChangeDebounceTimer = setTimeout(() => {
      // When the timer fires, signal the action if we have a pending one
      if (this.pendingTextChangeAction) {
        super.signalAction(
          this.pendingTextChangeAction.actionId,
          this.pendingTextChangeAction.document
        );
        this.pendingTextChangeAction = null;
      }
      this.textChangeDebounceTimer = null;
    }, this.textChangeDebounceTime);
  }

  initializeDisposables() {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) =>
        this.onDidChangeTextDocument(event),
      ),
      vscode.workspace.onDidCreateFiles((event) =>
        this.onDidCreateFiles(event),
      ),
      vscode.workspace.onDidDeleteFiles((event) =>
        this.onDidDeleteFiles(event),
      ),
      vscode.workspace.onDidRenameFiles((event) =>
        this.onDidRenameFiles(event),
      ),
      vscode.workspace.onWillSaveTextDocument((event) =>
        this.onWillSaveTextDocument(event),
      ),
      vscode.workspace.onDidSaveTextDocument((document) =>
        this.onDidSaveTextDocument(document),
      ),
      vscode.workspace.onDidOpenTextDocument((document) =>
        this.onDidOpenTextDocument(document),
      ),
      vscode.workspace.onDidCloseTextDocument((document) => {
        this.onDidCloseTextDocument(document);
      }),
    );
  }

  private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
    // Record the change with typed action creator
    const action = createFileChangeTextDocumentAction(event);
    this.traceRecorder.record(action);

    // Use the debounced version for signaling text changes
    this.debouncedSignalTextChange(action.action_id, event.document);
  }

  private onDidCreateFiles(event: vscode.FileCreateEvent): void {
    const action = createFileCreateFilesAction(event);
    this.traceRecorder.record(action);

    // Signal to the ThoughtsTracker (use first file's document if available)
    this.signalAction(action.action_id);
  }

  private onDidDeleteFiles(event: vscode.FileDeleteEvent): void {
    const action = createFileDeleteFilesAction(event);
    this.traceRecorder.record(action);

    // Signal to the ThoughtsTracker
    this.signalAction(action.action_id);
  }

  private onDidRenameFiles(event: vscode.FileRenameEvent): void {
    // Finalize any edit sessions for renamed files and transfer to new URI
    fileExplorer.expandPathToFile(event.files[0].newUri.fsPath);

    const action = createFileRenameFilesAction(event);
    this.traceRecorder.record(action);

    // Signal to the ThoughtsTracker
    this.signalAction(action.action_id);
  }

  private onDidOpenTextDocument(document: vscode.TextDocument): void {
    fileExplorer.expandPathToFile(document.uri.fsPath);

    const action = createFileOpenTextDocumentAction(document);
    this.traceRecorder.record(action);

    // Signal to the ThoughtsTracker
    if (!document.fileName.endsWith('.git')) {
      this.signalAction(action.action_id, document);
    }
  }

  private onDidCloseTextDocument(document: vscode.TextDocument): void {
    fileExplorer.expandPathToFile(document.uri.fsPath);

    const action = createFileCloseTextDocumentAction(document);
    this.traceRecorder.record(action);

    // Signal to the ThoughtsTracker
    if (!document.fileName.endsWith('.git')) {
      this.signalAction(action.action_id, document);
    }
  }

  private onWillSaveTextDocument(
    event: vscode.TextDocumentWillSaveEvent,
  ): void {
    const action = createFileWillSaveTextDocumentAction(event);
    this.traceRecorder.record(action);

    // Signal to the ThoughtsTracker
    this.signalAction(action.action_id, event.document);
  }

  private onDidSaveTextDocument(document: vscode.TextDocument): void {
    const action = createFileDidSaveTextDocumentAction(document);
    this.traceRecorder.record(action);

    // Signal to the ThoughtsTracker
    this.signalAction(action.action_id, document);
  }

  dispose(): void {
    this.disposeDisposables();
    this.traceRecorder.dispose();
  }
}
