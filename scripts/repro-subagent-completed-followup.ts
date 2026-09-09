/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fsSync: typeof import('node:fs') = require('node:fs');
const fs: typeof import('node:fs/promises') = require('node:fs/promises');
const os: typeof import('node:os') = require('node:os');
const path: typeof import('node:path') = require('node:path');
const sdk: typeof import('@github/copilot-sdk') = require('@github/copilot-sdk');
const { existsSync } = fsSync;
const { mkdtemp, rm } = fs;
const { tmpdir } = os;
const { join } = path;
const { approveAll, CopilotClient, RuntimeConnection } = sdk;

type CopilotSession = import('@github/copilot-sdk').CopilotSession;
type SessionEvent = import('@github/copilot-sdk').SessionEvent;
type SessionEventPayload<T extends SessionEvent['type']> = import('@github/copilot-sdk').SessionEventPayload<T>;

const timeoutMs = 180_000;
const relevantEventTypes = new Set<SessionEvent['type']>([
	'user.message',
	'assistant.turn_start',
	'assistant.turn_end',
	'subagent.started',
	'subagent.configured',
	'subagent.completed',
	'subagent.failed',
	'hook.start',
	'hook.end',
	'session.background_tasks_changed',
]);

function resolveCopilotCliPath(): string {
	const packageScopeDirectory = path.resolve(path.dirname(require.resolve('@github/copilot-sdk')), '../../..');
	const platformPackages = process.platform === 'linux'
		? [`copilot-linux-${process.arch}`, `copilot-linuxmusl-${process.arch}`]
		: [`copilot-${process.platform}-${process.arch}`];
	const candidates = platformPackages.map(packageName => join(packageScopeDirectory, packageName, 'index.js'));
	const cliPath = candidates.find(candidate => existsSync(candidate));
	if (!cliPath) {
		throw new Error(`Unable to resolve the VS Code-pinned Copilot CLI. Tried: ${candidates.join(', ')}`);
	}
	return cliPath;
}

function eventAgentId(event: SessionEvent): string | undefined {
	if (typeof event.agentId === 'string') {
		return event.agentId;
	}
	if (event.type !== 'hook.start') {
		return undefined;
	}
	const input = event.data.input;
	if (input === null || typeof input !== 'object' || Array.isArray(input)) {
		return undefined;
	}
	return typeof input.agentId === 'string' ? input.agentId : undefined;
}

function completionsFor(events: readonly SessionEvent[], agentId: string): SessionEventPayload<'subagent.completed'>[] {
	return events.filter((event): event is SessionEventPayload<'subagent.completed'> =>
		event.type === 'subagent.completed' && event.agentId === agentId
	);
}

async function sendAndWait(session: CopilotSession, prompt: string): Promise<void> {
	const response = await session.sendAndWait({ prompt }, timeoutMs);
	if (!response) {
		throw new Error('The parent session became idle without an assistant response.');
	}
}

async function main(): Promise<void> {
	const gitHubToken = process.env.GITHUB_TOKEN;
	if (!gitHubToken) {
		throw new Error('Set GITHUB_TOKEN before running, for example: GITHUB_TOKEN="$(gh auth token)" node scripts/repro-subagent-completed-followup.ts');
	}

	const workspace = await mkdtemp(join(tmpdir(), 'copilot-sdk-subagent-completed-'));
	const client = new CopilotClient({
		connection: RuntimeConnection.forStdio({ path: resolveCopilotCliPath() }),
		workingDirectory: workspace,
		baseDirectory: join(workspace, '.copilot'),
		logLevel: 'debug',
		gitHubToken,
		env: {
			COPILOT_EXP_COPILOT_CLI_SESSION_BASED_SUBAGENTS: 'true',
		},
	});
	let session: CopilotSession | undefined;
	let shuttingDown = false;

	try {
		await client.start();
		session = await client.createSession({
			enableExperimentalMode: true,
			onPermissionRequest: approveAll,
			availableTools: ['task', 'read_agent', 'write_agent'],
		});

		const events: SessionEvent[] = [];
		session.on(event => {
			events.push(event);
			if (relevantEventTypes.has(event.type)) {
				console.log(JSON.stringify(event));
			}
			if (event.type === 'session.background_tasks_changed') {
				void session?.rpc.tasks.list().then(result => {
					console.log(JSON.stringify({
						type: 'tasks.list',
						tasks: result.tasks.filter(task => task.type === 'agent'),
					}));
				}).catch(error => {
					if (!shuttingDown) {
						console.error('Failed to read background task state:', error);
					}
				});
			}
		});

		await sendAndWait(session, [
			'Use the task tool exactly once to start a general-purpose subagent in background mode.',
			'Tell it to reply exactly FIRST_DONE and not to use tools.',
			'Wait for its completion notification, then call read_agent once to read the result.',
			'Do not stop or delete the subagent. Reply exactly PARENT_FIRST_DONE.',
		].join(' '));

		const started = events.find((event): event is SessionEventPayload<'subagent.started'> =>
			event.type === 'subagent.started' && typeof event.agentId === 'string'
		);
		if (!started?.agentId) {
			throw new Error('No addressable subagent.started event was observed.');
		}

		const agentId = started.agentId;
		const configured = events.find((event): event is SessionEventPayload<'subagent.configured'> =>
			event.type === 'subagent.configured' && event.agentId === agentId
		);
		if (!configured?.data.multiTurn) {
			throw new Error(`Subagent ${agentId} was not configured for follow-up turns.`);
		}

		const initialCompletionCount = completionsFor(events, agentId).length;
		if (initialCompletionCount !== 1) {
			throw new Error(`Expected one initial subagent.completed event, observed ${initialCompletionCount}.`);
		}

		const followupStart = events.length;
		await sendAndWait(session, [
			`Use write_agent with agent_id "${agentId}" to send this exact follow-up: "Reply exactly SECOND_DONE."`,
			'Wait for the subagent completion notification, then call read_agent once to read the result.',
			'Reply exactly PARENT_SECOND_DONE.',
		].join(' '));

		const followupEvents = events.slice(followupStart);
		const followupRan = followupEvents.some(event =>
			eventAgentId(event) === agentId
			&& (event.type === 'user.message' || event.type === 'assistant.turn_start' || event.type === 'hook.start')
		);
		if (!followupRan) {
			throw new Error(`No follow-up activity was observed for subagent ${agentId}.`);
		}

		const followupCompletionCount = completionsFor(followupEvents, agentId).length;
		console.log(JSON.stringify({
			agentId,
			initialCompletionCount,
			followupCompletionCount,
		}, undefined, '\t'));

		if (followupCompletionCount === 0) {
			console.error('REPRODUCED: the resumed subagent finished without another subagent.completed event.');
			process.exitCode = 1;
		} else {
			console.log('NOT REPRODUCED: the resumed subagent emitted subagent.completed.');
		}
	} finally {
		shuttingDown = true;
		if (session) {
			await session.disconnect();
		}
		const stopErrors = await client.stop();
		if (stopErrors.length > 0) {
			for (const error of stopErrors) {
				console.error('Copilot client shutdown error:', error);
			}
			process.exitCode = 2;
		}
		await rm(workspace, { recursive: true, force: true });
	}
}

main().catch(error => {
	console.error(error);
	process.exitCode = 2;
});
