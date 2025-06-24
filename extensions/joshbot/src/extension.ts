/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

class JoshBotProvider implements vscode.RemoteCodingAgentProvider {
	private readonly _onDidChangeJobs = new vscode.EventEmitter<vscode.RemoteCodingJobsChangeEvent>();
	readonly onDidChangeJobs = this._onDidChangeJobs.event;

	private jobs: Map<string, vscode.RemoteCodingAgentJob> = new Map();
	private jobCounter = 0;

	readonly id = 'devbox';
	readonly displayName = 'Dev Box';
	readonly description = 'Iterate on your project backed by the Visual Studio toolchain';
	readonly codicon = 'terminalCmd';

	constructor() {
		// Create some initial demo jobs after a short delay
		setTimeout(() => {
			this.createInitialJobs();
		}, 2000);
	}

	private static takeXWords(text: string, x: number, dotdotdot = true): string {
		const words = text.split(/\s+/);
		const result = words.slice(0, x).join(' ');
		if (dotdotdot && words.length > x) {
			return result + '...';
		}
		return result;
	}

	async provideJobCreation(prompt: string, token: vscode.CancellationToken): Promise<vscode.RemoteCodingAgentJob | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		const jobId = `devbox-job-${++this.jobCounter}`;

		// Add some mock git metadata for demonstration
		const hasGitMetadata = Math.random() > 0.5; // 50% chance of having git metadata
		const metadata = hasGitMetadata ? {
			git: {
				additions: Math.floor(Math.random() * 100) + 1, // 1-100 additions
				deletions: Math.floor(Math.random() * 50) // 0-49 deletions
			}
		} : undefined;

		const job: vscode.RemoteCodingAgentJob = {
			id: jobId,
			name: JoshBotProvider.takeXWords(prompt, 3),
			status: vscode.AgentStatus.InProgress,
			agentId: this.id,
			prompt,
			metadata
		};

		this.jobs.set(jobId, job);

		// Fire event for new job
		this._onDidChangeJobs.fire({
			added: [job],
			changed: [],
			removed: []
		});

		// Simulate AI processing work (3-6 seconds)
		setTimeout(() => {
			if (this.jobs.has(jobId)) {
				job.status = vscode.AgentStatus.ReadyForReview;
				this._onDidChangeJobs.fire({
					added: [],
					changed: [job],
					removed: []
				});
			}
		}, 3 + Math.random() * 6000);

		return job;
	}

	async provideJobs(token: vscode.CancellationToken): Promise<vscode.RemoteCodingAgentJob[]> {
		if (token.isCancellationRequested) {
			return [];
		}

		return Array.from(this.jobs.values());
	}

	async provideJobOperation(jobId: string, operation: string, token: vscode.CancellationToken): Promise<void> {
		if (token.isCancellationRequested) {
			return;
		}

		const job = this.jobs.get(jobId);
		if (!job) {
			throw new Error(`Job ${jobId} not found`);
		}

		const oldJob = { ...job };

		switch (operation) {
			case 'approve':
				if (job.status === vscode.AgentStatus.ReadyForReview) {
					job.status = vscode.AgentStatus.Completed;
				}
				break;
			case 'reject':
				if (job.status === vscode.AgentStatus.ReadyForReview) {
					job.status = vscode.AgentStatus.InProgress;
					job.prompt = '(trying again) ' + job.prompt;
				}
				// Simulated requeue
				setTimeout(() => {
					job.status = vscode.AgentStatus.ReadyForReview;
					this._onDidChangeJobs.fire({
						added: [],
						changed: [job],
						removed: []
					});
				}, 5000 + Math.random() * 5000);


				break;
			case 'cancel':
				this.jobs.delete(jobId);
				this._onDidChangeJobs.fire({
					added: [],
					changed: [],
					removed: [oldJob]
				});
				return;
			default:
				vscode.window.showErrorMessage(`Unknown operation: ${operation}`);
				return;
		}

		// Fire event for changed job
		this._onDidChangeJobs.fire({
			added: [],
			changed: [job],
			removed: []
		});
	}

	async provideAvailableOperations(status: vscode.AgentStatus, token: vscode.CancellationToken): Promise<string[] | undefined> {
		if (token.isCancellationRequested) {
			return undefined;
		}

		switch (status) {
			case vscode.AgentStatus.InProgress:
				return ['cancel'];
			case vscode.AgentStatus.ReadyForReview:
				return ['approve', 'reject'];
			case vscode.AgentStatus.Completed:
				return []; // No operations available for completed jobs
			default:
				return [];
		}
	}

	private createInitialJobs(): void {
		// Create some initial demo jobs with varying metadata
		const demoJobs = [
			{
				prompt: 'Create a TypeScript interface for user data',
				metadata: {
					git: {
						additions: 25,
						deletions: 3
					}
				}
			},
			{
				prompt: 'Generate unit tests for the auth module',
				metadata: {
					git: {
						additions: 87,
						deletions: 12
					}
				}
			},
			{
				prompt: 'Optimize database queries for better performance',
				metadata: undefined // No metadata for this one
			}
		];

		for (const demo of demoJobs) {
			const jobId = `devbox-job-${++this.jobCounter}`;
			const job: vscode.RemoteCodingAgentJob = {
				id: jobId,
				name: JoshBotProvider.takeXWords(demo.prompt, 3),
				status: vscode.AgentStatus.InProgress,
				agentId: this.id,
				prompt: demo.prompt,
				metadata: demo.metadata
			};

			this.jobs.set(jobId, job);

			// Fire event for new job
			this._onDidChangeJobs.fire({
				added: [job],
				changed: [],
				removed: []
			});

			// Simulate AI processing work (3-6 seconds)
			setTimeout(() => {
				if (this.jobs.has(jobId)) {
					job.status = vscode.AgentStatus.ReadyForReview;
					this._onDidChangeJobs.fire({
						added: [],
						changed: [job],
						removed: []
					});
				}
			}, 3000 + Math.random() * 6000);
		}
	}
}

let joshBotProvider: JoshBotProvider;

export function activate(context: vscode.ExtensionContext) {
	console.log('JoshBot extension is now active!');

	joshBotProvider = new JoshBotProvider();

	// Register the provider using the proposed API
	const providerDisposable = vscode.remoteCodingAgents.registerRemoteCodingAgentProvider(joshBotProvider);
	context.subscriptions.push(providerDisposable);
}

export function deactivate() {
	console.log('JoshBot extension is now deactivated. Good night and sweet dreams.');
}
