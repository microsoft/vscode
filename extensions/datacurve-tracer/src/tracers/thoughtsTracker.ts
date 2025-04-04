import * as vscode from 'vscode';
import WorkerFileRecorder from '../recorders/workerFileRecorder';
import { createThoughtNewThoughtAction } from '../utils/typedTracers';
import * as path from 'path';

// Define the subset of actions that should be counted toward the thought threshold
export const COUNTABLE_ACTIONS = [
  // File system actions that represent meaningful user activity
  'fileDidChangeTextDocument',
  'fileDidCreateFiles',
  'fileDidDeleteFiles',
  'fileDidRenameFiles',
  'fileDidSaveTextDocument',
  'fileDidCreateFilesCustom',
  'fileDidCreateFolderCustom',
  'fileDidDeleteFilesCustom',
  'fileDidRenameFilesCustom',
  'fileDidOpenTextDocument',
  'fileDidCloseTextDocument',

  // Editor actions that represent significant changes
  'editorDidChangeTextEditorSelection',

  // Terminal actions
  'terminalBeginShellExecution',
  'terminalEndShellExecution',

  // User-initiated actions
  'idea',
  'search',
  'thoughts.newThought',
];

export interface Thought {
  id: string;
  content: string;
  timestamp: number;
  actionCount: number;
}

// Storage keys
const STORAGE_KEYS = {
  THOUGHTS: 'thoughts-data',
  CURRENT_THOUGHT_ID: 'current-thought-id',
  ACTIONS_SINCE_LAST_THOUGHT: 'actions-since-last-thought'
};

export class ThoughtsTracker {
  private _onThoughtsChanged = new vscode.EventEmitter<Thought[]>();

  // Track the thought editor document to ignore actions within it
  private thoughtEditorDocument: vscode.TextDocument | null = null;

  // Default action threshold
  private currentActionThreshold: number;

  // base action threshold
  private baseActionThreshold: number = 50;

  public readonly onThoughtsChanged = this._onThoughtsChanged.event;

  constructor(
    private readonly recorder: WorkerFileRecorder,
    private readonly context: vscode.ExtensionContext
  ) {
    // Load configuration settings
    const config = vscode.workspace.getConfiguration(
      'datacurve-tracer.thoughts'
    );
    this.baseActionThreshold = config.get('actionThreshold', 50);
    this.currentActionThreshold = this.baseActionThreshold;

    // Listen for configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('datacurve-tracer.thoughts')) {
        const newConfig = vscode.workspace.getConfiguration(
          'datacurve-tracer.thoughts'
        );
        this.currentActionThreshold = newConfig.get('actionThreshold', 50);
      }
    });
  }

  /**
   * Check if there are any thoughts recorded
   * @returns True if there are thoughts, false otherwise
   */
  public hasThoughts(): boolean {
    const thoughts = this.getThoughtsFromStorage();
    return thoughts.length > 0;
  }

  /**
   * Get thoughts from storage
   */
  private getThoughtsFromStorage(): Thought[] {
    const storedThoughts = this.context.workspaceState.get<Thought[]>(STORAGE_KEYS.THOUGHTS);
    return storedThoughts || [];
  }

  /**
   * Save thoughts to storage
   */
  private saveThoughtsToStorage(thoughts: Thought[]): void {
    this.context.workspaceState.update(STORAGE_KEYS.THOUGHTS, thoughts);
  }

  /**
   * Get current thought ID from storage
   */
  private getCurrentThoughtIdFromStorage(): string | null {
    return this.context.workspaceState.get<string | null>(STORAGE_KEYS.CURRENT_THOUGHT_ID, null);
  }

  /**
   * Save current thought ID to storage
   */
  private saveCurrentThoughtIdToStorage(thoughtId: string | null): void {
    this.context.workspaceState.update(STORAGE_KEYS.CURRENT_THOUGHT_ID, thoughtId);
  }

  /**
   * Get actions since last thought from storage
   */
  private getActionsSinceLastThoughtFromStorage(): number {
    return this.context.workspaceState.get<number>(STORAGE_KEYS.ACTIONS_SINCE_LAST_THOUGHT, 0);
  }

  /**
   * Save actions since last thought to storage
   */
  private saveActionsSinceLastThoughtToStorage(count: number): void {
    this.context.workspaceState.update(STORAGE_KEYS.ACTIONS_SINCE_LAST_THOUGHT, count);
  }

  /**
   * Add a new thought to the tracker
   * @param content The content of the thought
   * @returns The created thought
   */
  public addThought(content: string): Thought {
    const id = Date.now().toString();
    const thought: Thought = {
      id,
      content,
      timestamp: Date.now(),
      actionCount: 0,
    };

    const thoughts = this.getThoughtsFromStorage();
    thoughts.push(thought);
    this.saveThoughtsToStorage(thoughts);
    this.saveCurrentThoughtIdToStorage(id);
    this.saveActionsSinceLastThoughtToStorage(0);

    // Record the thought in the trace system using type-safe action creator
    this.recorder.record(createThoughtNewThoughtAction(thought));

    this._onThoughtsChanged.fire(thoughts);
    return thought;
  }

  /**
   * Check if the given document is the thought editor document
   * @param document The document to check
   * @returns True if this is the thought editor document
   */
  public isThoughtEditorDocument(document?: vscode.TextDocument): boolean {
    if (!document || !this.thoughtEditorDocument) { return false; }
    return document === this.thoughtEditorDocument;
  }

  /**
   * Record a user action
   * @param actionId The ID of the action being recorded
   * @param document Optional document associated with the action
   */
  public recordAction(actionId?: string, document?: vscode.TextDocument): void {
    // Skip recording if this action is from the thought editor
    if (this.isThoughtEditorDocument(document)) {
      return;
    }

    // Only increment if the action is in the countable subset
    if (actionId && COUNTABLE_ACTIONS.includes(actionId)) {
      let actionsSinceLastThought = this.getActionsSinceLastThoughtFromStorage();
      actionsSinceLastThought++;
      this.saveActionsSinceLastThoughtToStorage(actionsSinceLastThought);

      const currentThoughtId = this.getCurrentThoughtIdFromStorage();
      if (currentThoughtId) {
        // Update the action count for the current thought
        const thoughts = this.getThoughtsFromStorage();
        const thought = thoughts.find(t => t.id === currentThoughtId);
        console.log(
          `Thought ID: ${currentThoughtId}, Action Count: ${actionsSinceLastThought} for action ID: ${actionId}`
        );
        if (thought) {
          thought.actionCount++;
          this.saveThoughtsToStorage(thoughts);
          this._onThoughtsChanged.fire(thoughts);
        }
      }
      // prompt for new thought if threshold is reached
      this.promptForNewThought(this.currentActionThreshold);
    }
  }

  /**
   * Get the current action count since the last thought
   */
  public getActionsSinceLastThought(): number {
    return this.getActionsSinceLastThoughtFromStorage();
  }

  /**
   * Get all thoughts
   */
  public getThoughts(): Thought[] {
    return [...this.getThoughtsFromStorage()];
  }

  /**
   * Get the current thought
   */
  public getCurrentThought(): Thought | undefined {
    const currentThoughtId = this.getCurrentThoughtIdFromStorage();
    if (!currentThoughtId) { return undefined; }

    const thoughts = this.getThoughtsFromStorage();
    return thoughts.find((t) => t.id === currentThoughtId);
  }

  /**
   * Open a text editor for the user to document their thoughts
   * This provides a richer editing experience than a simple input box
   */
  public async openThoughtEditor(): Promise<void> {
    // Get workspace root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder found. Please open a folder first.');
      return;
    }

    // Create the file path for our temporary file
    const filePath = path.join(workspaceFolder.uri.fsPath, 'datacurve-trace-plan-tmp.md');

    // Create the improved template with instructions
    const templateContent = `# Current Thought
Write your current thoughts and planning for the problem here.

## What I'm working on
*

## My approach
*

## Next steps
*

------
## How to use this thought tracker:

1. Add your thoughts in the sections above
2. When you're finished, just close this file
3. You'll be asked if you want to save this thought
4. Select 'Save Thought' to record it or 'Discard' to cancel

You've performed ${this.getActionsSinceLastThought()} actions since your last recorded thought.
Documenting your thoughts helps track your coding process and decision making.
`;

    try {
      // Create and write to the file
      const fileUri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(templateContent, 'utf8'));
      console.log('Temporary thought file created:', filePath);

      // Open the file in the editor
      const document = await vscode.workspace.openTextDocument(fileUri);
      this.thoughtEditorDocument = document;

      // Set up listener for document closing based on visibility changes
      const closeListener = vscode.window.onDidChangeVisibleTextEditors(
        async (editors: readonly vscode.TextEditor[]) => {
          // Check if our document is no longer visible in any editor
          const isStillVisible = editors.some(editor => editor.document === document);
          if (!isStillVisible && this.thoughtEditorDocument === document) {
            const content = document.getText();

            // Only save non-empty content that differs from the template
            if (content.trim() !== '' && content !== templateContent) {
              const response = await vscode.window.showInformationMessage(
                'Do you want to save your thought?',
                { modal: true },
                'Save Thought',
                'Discard'
              );

              if (response === 'Save Thought') {
                this.addThought(content);
                vscode.window.showInformationMessage('Thought saved successfully!');
              }
            }

            // Clean up - delete the temporary file
            try {
              await vscode.workspace.fs.delete(fileUri);
            } catch (error) {
              console.error('Failed to delete temporary thought file:', error);
            }

            // Clean up the listener and references
            closeListener.dispose();
            this.thoughtEditorDocument = null;
            console.log('Temporary thought file deleted:', filePath);
          }
        }
      );

      this.context.subscriptions.push(closeListener);

      await vscode.window.showTextDocument(document);
      console.log('Thought editor opened:', filePath);

    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open thought editor: ${error}`);
    }


  }

  /**
   * Prompt the user to create a new thought
   * @param threshold The action threshold (optional, overrides configured value)
   */
  public async promptForNewThought(threshold?: number): Promise<void> {
    const actionThreshold = threshold || this.currentActionThreshold;
    const actionsSinceLastThought = this.getActionsSinceLastThoughtFromStorage();

    if (actionsSinceLastThought >= actionThreshold) {
      const response = await vscode.window.showInformationMessage(
        `You've performed ${actionsSinceLastThought} actions since your last recorded thought. Would you like to create a new thought?`,
        { modal: true },
        'Yes',
        'No'
      );

      if (response === 'Yes') {
        this.currentActionThreshold = actionThreshold + 10; // Increase the threshold to avoid immediate prompts if there were already pending actions
        vscode.commands.executeCommand('datacurve-tracer.recordThought');
        this.currentActionThreshold = this.baseActionThreshold; // Reset to base threshold
      } else if (response === 'No') {
        this.currentActionThreshold += 10; // Increase the threshold to avoid immediate prompts
      }
    }
  }
  /**
   * Clear all thoughts
   */
  public clear(): void {
    this.saveThoughtsToStorage([]);
    this.saveCurrentThoughtIdToStorage(null);
    this.saveActionsSinceLastThoughtToStorage(0);
    this._onThoughtsChanged.fire([]);
  }
}
