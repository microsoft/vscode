import * as vscode from "vscode";
import { IRecorder } from "../types";
import { Tracer } from "./tracer";
import { fileExplorer } from "../fileExplorer";
import { clipRangeToLimits } from "../utils/limits";
import { ThoughtsTracker } from "./thoughtsTracker";

/**
 * Traces editor actions and sends them to the recorder.
 * Implements debouncing for selection and visible ranges events.
 */
export class EditorTracer extends Tracer {
	/**
	 * Debounce interval for selection change events in milliseconds.
	 */
	private selectionDebounceInterval: number;

	/**
	 * Timer for debouncing selection change events.
	 */
	private selectionDebounceTimer: NodeJS.Timeout | null = null;

	/**
	 * Stores the most recent selection change event during debounce period.
	 */
	private pendingSelectionEvent: vscode.TextEditorSelectionChangeEvent | null =
		null;

	/**
	 * Debounce interval for visible ranges change events in milliseconds.
	 */
	private visibleRangesDebounceInterval: number;

	/**
	 * Timer for debouncing visible ranges change events.
	 */
	private visibleRangesDebounceTimer: NodeJS.Timeout | null = null;

	/**
	 * Stores the most recent visible ranges change event during debounce period.
	 */
	private pendingVisibleRangesEvent: vscode.TextEditorVisibleRangesChangeEvent | null =
		null;

	/**
	 * Maximum length for text content
	 */
	private maxTextLength: number;

	/**
	 * Creates a new EditorTracer.
	 *
	 * @param context The VS Code extension context
	 * @param traceRecorder The recorder to send trace events to
	 * @param thoughtsTracker Optional ThoughtsTracker instance
	 */
	constructor(
		context: vscode.ExtensionContext,
		traceRecorder: IRecorder,
		thoughtsTracker?: ThoughtsTracker,
	) {
		super(context, traceRecorder, thoughtsTracker);

		// Load configuration settings
		const config = vscode.workspace.getConfiguration("datacurve-tracer.editor");
		this.selectionDebounceInterval = config.get(
			"selectionDebounceInterval",
			250,
		);
		this.visibleRangesDebounceInterval = config.get(
			"visibleRangesDebounceInterval",
			100,
		);
		this.maxTextLength = config.get("maxTextLength", 1024 * 1024);

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration(
			(e) => {
				if (e.affectsConfiguration("datacurve-tracer.editor")) {
					const newConfig = vscode.workspace.getConfiguration(
						"datacurve-tracer.editor",
					);
					this.selectionDebounceInterval = newConfig.get(
						"selectionDebounceInterval",
						250,
					);
					this.visibleRangesDebounceInterval = newConfig.get(
						"visibleRangesDebounceInterval",
						100,
					);
					this.maxTextLength = newConfig.get("maxTextLength", 1024 * 1024);
				}
			},
			null,
			this.disposables,
		);
	}

	/**
	 * Initializes all disposables for the editor events.
	 */
	initializeDisposables() {
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor((editor) =>
				this.onDidChangeActiveTextEditor(editor),
			),
			vscode.window.onDidChangeTextEditorSelection((event) =>
				this.onDidChangeTextEditorSelection(event),
			),
			vscode.window.onDidChangeTextEditorVisibleRanges((event) =>
				this.onDidChangeTextEditorVisibleRanges(event),
			),
			vscode.window.onDidChangeTextEditorViewColumn((event) =>
				this.onDidChangeTextEditorViewColumn(event),
			),
			vscode.window.onDidChangeVisibleTextEditors((editors) =>
				this.onDidChangeVisibleTextEditors(editors),
			),
		);
	}

	/**
	 * Handles active text editor change events.
	 *
	 * @param editor The new active text editor or undefined
	 */
	private onDidChangeActiveTextEditor(
		editor: vscode.TextEditor | undefined,
	): void {
		if (editor) {
			fileExplorer.expandPathToFile(editor?.document.uri.fsPath);
		}

		// Record the action
		const actionId = "editorDidChangeActiveTextEditor";
		this.traceRecorder.record({
			action_id: actionId,
			event: { editor: editor },
		});
	}

	/**
	 * Handles text editor selection change events.
	 * Implements debouncing to avoid excessive event processing.
	 *
	 * @param event The selection change event
	 */
	private onDidChangeTextEditorSelection(
		event: vscode.TextEditorSelectionChangeEvent,
	): void {
		// Store the latest event
		this.pendingSelectionEvent = event;

		// If there's already a timer, clear it
		if (this.selectionDebounceTimer) {
			clearTimeout(this.selectionDebounceTimer);
		}

		// Set a new timer
		this.selectionDebounceTimer = setTimeout(() => {
			this.processSelectionEvent();
		}, this.selectionDebounceInterval);
	}

	/**
	 * Process the latest selection event after debounce interval.
	 * Extracts selected text and records the event.
	 */
	private processSelectionEvent(): void {
		try {
			// Clear the timer reference
			this.selectionDebounceTimer = null;

			// Get the latest event (which should be set by onDidChangeTextEditorSelection)
			const event = this.pendingSelectionEvent;
			if (!event) {
				return;
			}

			const selections = event.selections;
			const document = event.textEditor.document;

			const selectedTexts = [];
			let totalLength = 0;

			for (const selection of selections) {
				const sanitizedSelection = clipRangeToLimits(
					selection,
					this.maxTextLength,
				);
				const text = document.getText(sanitizedSelection);

				// Check if adding this text would exceed the limit
				if (totalLength + text.length <= this.maxTextLength) {
					selectedTexts.push(text);
					totalLength += text.length;
				} else {
					// Only add part of the text to reach the limit
					const remainingSpace = this.maxTextLength - totalLength;
					if (remainingSpace > 0) {
						selectedTexts.push(
							text.substring(0, remainingSpace) + "... [truncated]",
						);
					}
					break; // Stop processing more selections
				}
			}
			if (totalLength > 0) {
				const actionId = "editorDidChangeTextEditorSelection";
				this.traceRecorder.record({
					action_id: actionId,
					event: {
						event: event,
						selection: selections,
						selectedText: selectedTexts,
						workspace: fileExplorer.getState(),
					},
				});
				// Signal to the ThoughtsTracker
				this.signalAction(actionId, document);
			}

			// Clear the pending event after processing
			this.pendingSelectionEvent = null;
		} catch (error) {
			console.error("Failed to record selection trace:", error);
			this.pendingSelectionEvent = null;
		}
	}

	/**
	 * Handles text editor visible ranges change events.
	 * Implements debouncing to avoid excessive event processing.
	 *
	 * @param event The visible ranges change event
	 */
	private onDidChangeTextEditorVisibleRanges(
		event: vscode.TextEditorVisibleRangesChangeEvent,
	): void {
		// Store the latest event
		this.pendingVisibleRangesEvent = event;

		// If there's already a timer, clear it
		if (this.visibleRangesDebounceTimer) {
			clearTimeout(this.visibleRangesDebounceTimer);
		}

		// Set a new timer
		this.visibleRangesDebounceTimer = setTimeout(() => {
			this.processVisibleRangesEvent();
		}, this.visibleRangesDebounceInterval);
	}

	/**
	 * Process the latest visible ranges event after debounce interval.
	 * Extracts visible text and records the event.
	 */
	private processVisibleRangesEvent(): void {
		try {
			// Clear the timer reference
			this.visibleRangesDebounceTimer = null;

			// Get the latest event
			const event = this.pendingVisibleRangesEvent;
			if (!event) {
				return;
			}

			const visibleText = event.textEditor.visibleRanges.map((range) =>
				event.textEditor.document.getText(range),
			);

			// Store visible range in memento
			const filePath = event.textEditor.document.uri.fsPath;
			const visibleRangesState = this.context.workspaceState.get(
				"visibleRanges",
				{},
			) as Record<string, any>;
			visibleRangesState[filePath] = {
				start: {
					line: event.textEditor.visibleRanges[0].start.line,
					character: event.textEditor.visibleRanges[0].start.character,
				},
				end: {
					line: event.textEditor.visibleRanges[0].end.line,
					character: event.textEditor.visibleRanges[0].end.character,
				},
			};
			this.context.workspaceState.update("visibleRanges", visibleRangesState);

			const actionId = "editorDidChangeTextEditorVisibleRanges";
			this.traceRecorder.record({
				action_id: actionId,
				event: {
					event: event,
					visibleRange: visibleText,
					//workspace: fileExplorer.getState(),
				},
			});

			// Clear the pending event after processing
			this.pendingVisibleRangesEvent = null;
		} catch (error) {
			console.error("Failed to record visible ranges trace:", error);
			this.pendingVisibleRangesEvent = null;
		}
	}

	/**
	 * Handles text editor view column change events.
	 *
	 * @param event The view column change event
	 */
	private onDidChangeTextEditorViewColumn(
		event: vscode.TextEditorViewColumnChangeEvent,
	): void {
		const actionId = "editorDidChangeTextEditorViewColumn";
		this.traceRecorder.record({
			action_id: actionId,
			event: { event: event },
		});
	}

	/**
	 * Handles visible text editors change events.
	 *
	 * @param editors The array of visible text editors
	 */
	private onDidChangeVisibleTextEditors(
		editors: readonly vscode.TextEditor[],
	): void {
		const actionId = "editorDidChangeVisibleTextEditors";
		this.traceRecorder.record({
			action_id: actionId,
			event: { editors: editors },
		});
	}

	/**
	 * Disposes all resources used by the tracer.
	 */
	dispose(): void {
		// Clear any pending debounce timers
		if (this.selectionDebounceTimer) {
			clearTimeout(this.selectionDebounceTimer);
			this.selectionDebounceTimer = null;
		}

		if (this.visibleRangesDebounceTimer) {
			clearTimeout(this.visibleRangesDebounceTimer);
			this.visibleRangesDebounceTimer = null;
		}

		this.disposeDisposables();
		this.traceRecorder.dispose();
	}
}
