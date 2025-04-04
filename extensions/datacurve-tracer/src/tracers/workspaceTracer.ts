import * as vscode from 'vscode';
import { IRecorder } from '../types';
import { Tracer } from './tracer';
import { ThoughtsTracker } from './thoughtsTracker';
import { fileExplorer } from '../fileExplorer';
/**
 * WorkspaceTracer class is responsible for recording workspace related events.
 *
 */
export class WorkspaceTracer extends Tracer {
	private baselineMap: Map<string, string>;
	private backgroundInterval: NodeJS.Timeout | undefined; // new member
	/**
	 * Refresh interval for workspace state in milliseconds
	 */
	private refreshInterval: number;

	constructor(
		context: vscode.ExtensionContext,
		traceRecorder: IRecorder,
		thoughtsTracker?: ThoughtsTracker
	) {
		super(context, traceRecorder, thoughtsTracker);
		this.baselineMap = new Map<string, string>();

		// Load configuration settings
		const config = vscode.workspace.getConfiguration('datacurve-tracer.workspace');
		this.refreshInterval = config.get('refreshInterval', 2000);

		// Listen for configuration changes
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('datacurve-tracer.workspace')) {
				const newConfig = vscode.workspace.getConfiguration('datacurve-tracer.workspace');
				this.refreshInterval = newConfig.get('refreshInterval', 2000);
			}
		}, null, this.disposables);
	}

	initializeDisposables() {
		this.disposables.push(
			vscode.workspace.onDidChangeWorkspaceFolders((event) =>
				this.onDidChangeWorkspaceFolders(event),
			),
		);
		// this.startBackgroundTask(); // start background task
	}

	private startBackgroundTask() {
		// new method
		this.backgroundInterval = setInterval(() => {
			const folders = vscode.workspace.workspaceFolders;
			this.traceRecorder.record({
				action_id: 'listWorkspaceFolders',
				event: {
					folders: folders
						? folders.map((folder) => folder.uri.toString())
						: [],
				},
			});
		}, this.refreshInterval);
	}

	private onDidChangeWorkspaceFolders(
		event: vscode.WorkspaceFoldersChangeEvent,
	): void {
		this.traceRecorder.record({
			action_id: 'workspaceDidChangeWorkspaceFolders',
			event: event,
		});
	}

	/**
	 * Initializes scheduled events
	 */
	private initializeScheduledEvents(): void {
		// Schedule regular workspace state captures
		setInterval(() => {
			// Capture the workspace state at regular intervals
			this.traceRecorder.record({
				action_id: 'workspaceStateCapture',
				event: {}
			});
		}, this.refreshInterval);
	}

	dispose(): void {
		if (this.backgroundInterval) {
			clearInterval(this.backgroundInterval); // clear background task
		}
		this.disposeDisposables();
		this.traceRecorder.dispose();
	}
}
