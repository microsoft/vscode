import * as vscode from 'vscode';

/**
 * ExportNotifier manages timed notifications to remind users to export their traces
 * at specific intervals (10min, 20min, 30min, then every 30min after that)
 */
export class ExportNotifier {
	private timers: NodeJS.Timeout[] = [];
	private lastNotificationTime: number = 0;
	private isActive: boolean = false;

	/**
	 * Creates a new ExportNotifier
	 * @param context The extension context for registering disposables
	 */
	constructor(private context: vscode.ExtensionContext) {
		// Register the notifier to be disposed when the extension is deactivated
		context.subscriptions.push({
			dispose: () => this.dispose(),
		});
	}

	/**
	 * Starts the notification schedule
	 */
	public start(): void {
		if (this.isActive) {
			return; // Already running
		}

		this.isActive = true;
		this.lastNotificationTime = Date.now();

		// Schedule notifications at 10, 20, and 30 minutes
		//this.scheduleNotification(10);
		//this.scheduleNotification(20);
		//this.scheduleNotification(30);

		// Then schedule a repeating notification every 30 minutes after that
		//this.scheduleRepeatingNotification(30);
	}

	/**
	 * Stops all scheduled notifications
	 */
	public stop(): void {
		this.clearTimers();
		this.isActive = false;
	}

	/**
	 * Schedules a one-time notification after the specified number of minutes
	 * @param minutes Minutes to wait before showing the notification
	 */
	private scheduleNotification(minutes: number): void {
		const delay = minutes * 60 * 1000; // Convert minutes to milliseconds

		const timer = setTimeout(() => {
			this.triggerExport(minutes);
		}, delay);

		this.timers.push(timer);
	}

	/**
	 * Schedules a notification that repeats at the specified interval
	 * @param intervalMinutes Minutes between each notification
	 */
	private scheduleRepeatingNotification(intervalMinutes: number): void {
		const interval = intervalMinutes * 60 * 1000; // Convert minutes to milliseconds

		const timer = setInterval(() => {
			// Calculate minutes since the start
			const minutesSinceStart =
				Math.floor((Date.now() - this.lastNotificationTime) / 60000) +
				30;
			this.triggerExport(minutesSinceStart);
		}, interval);

		this.timers.push(timer);
	}

	/**
	 * Automatically triggers the export command
	 * @param minutes Minutes since development started
	 */
	private triggerExport(minutes: number): void {
		// Log the auto-export event to console
		console.log(`Auto-exporting traces at ${minutes} minutes`);

		// inform the user they must now export their traces
		vscode.window
			.showWarningMessage(
				`It's been ${minutes} minutes since you started developing. ` +
				`Please export your traces to avoid losing data.`,
				{ modal: true, detail: 'You must export your traces now.' },
				{ title: 'Export Now', isCloseAffordance: true },
			)
			.then((selection) => {
				// THEY WILL EXPORT WHETHER THEY LIKE IT OR NOT
				if (selection?.title === 'Export Now') {
					vscode.commands.executeCommand(
						'datacurve-tracer.exportTraces',
					);
				} else {
					vscode.commands.executeCommand(
						'datacurve-tracer.exportTraces',
					);
				}
			});
	}

	/**
	 * Clears all scheduled timers
	 */
	private clearTimers(): void {
		this.timers.forEach((timer) => {
			clearTimeout(timer);
			clearInterval(timer);
		});
		this.timers = [];
	}

	/**
	 * Disposes of the notifier and cleans up resources
	 */
	public dispose(): void {
		this.clearTimers();
	}
}
