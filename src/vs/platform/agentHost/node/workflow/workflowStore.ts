/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IWorkflowStore, WorkflowRun } from '../../../workflow/common/workflow.js';
import { validateWorkflowRun } from '../../../workflow/common/workflowValidation.js';
import type { IAgentCreateSessionConfig } from '../../common/agent.js';
import type { IAgentHostWorkflowStartContext } from '../../common/agentHostWorkflow.js';
import type { SessionSummary } from '../../common/state/sessionState.js';

export interface IWorkflowInitialSession extends Pick<IAgentHostWorkflowStartContext, 'model' | 'agent'> {
	readonly summary: SessionSummary;
	readonly config?: IAgentCreateSessionConfig['config'];
}

export interface IAgentHostWorkflowStore extends IWorkflowStore {
	createRun(workflow: WorkflowRun, context?: IAgentHostWorkflowStartContext, initialSession?: IWorkflowInitialSession): Promise<void>;
	getInitialSession(session: string): Promise<IWorkflowInitialSession | undefined>;
	listInitialSessions(): Promise<readonly IWorkflowInitialSession[]>;
	updateInitialSession(initial: IWorkflowInitialSession): Promise<boolean>;
	discardInitialSession(session: string): Promise<void>;
	claimStartContext(runId: string, turnId: string): Promise<IAgentHostWorkflowStartContext | undefined>;
	releaseStartContext(runId: string, turnId: string): Promise<void>;
}

/** The workflow facet shares the orchestrator's connection and transaction ordering. */
export interface IWorkflowDatabaseConnection {
	get(sql: string, parameters: readonly unknown[]): Promise<Record<string, unknown> | undefined>;
	all(sql: string, parameters: readonly unknown[]): Promise<Record<string, unknown>[]>;
	run(sql: string, parameters: readonly unknown[]): Promise<number>;
}

const runColumns = 'run_id, session_uri, chat_uri, revision, next_wake_at, data';

export class WorkflowStore implements IAgentHostWorkflowStore {
	constructor(private readonly _database: IWorkflowDatabaseConnection) { }

	async getRun(id: string): Promise<WorkflowRun | undefined> {
		return this._read(await this._database.get(`SELECT ${runColumns} FROM workflow_runs WHERE run_id = ?`, [id]));
	}

	async getSessionRun(session: string): Promise<WorkflowRun | undefined> {
		return this._read(await this._database.get(`SELECT ${runColumns} FROM workflow_runs WHERE session_uri = ?`, [session]));
	}

	async listRuns(): Promise<readonly WorkflowRun[]> {
		return (await this._database.all(`SELECT ${runColumns} FROM workflow_runs ORDER BY run_id`, [])).map(row => this._read(row)!);
	}

	async listDueRuns(now: number, limit: number): Promise<readonly WorkflowRun[]> {
		if (!Number.isFinite(now) || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) {
			throw new Error('Invalid workflow wake query');
		}
		return (await this._database.all(
			`SELECT ${runColumns} FROM workflow_runs WHERE next_wake_at <= ? ORDER BY next_wake_at, run_id LIMIT ?`,
			[now, limit],
		)).map(row => this._read(row)!);
	}

	async createRun(workflow: WorkflowRun, context?: IAgentHostWorkflowStartContext, initialSession?: IWorkflowInitialSession): Promise<void> {
		const data = this._serialize(workflow);
		const initialContext = context === undefined && initialSession === undefined ? null
			: JSON.stringify(context ?? { model: initialSession?.model, agent: initialSession?.agent });
		if (initialContext !== null) {
			this._readStartContext(initialContext);
		}
		const initialState = initialSession === undefined ? null : JSON.stringify(initialSession);
		if (initialState !== null) {
			this._readInitialSession({ initial_session: initialState, session_uri: workflow.session });
		}
		const changes = await this._database.run(
			`INSERT INTO workflow_runs (run_id, session_uri, chat_uri, revision, next_wake_at, data, initial_context, initial_session)
				SELECT ?, ?, ?, ?, ?, ?, ?, ?
				WHERE EXISTS (SELECT 1 FROM sessions WHERE session_uri = ?)
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')`,
			[workflow.id, workflow.session, workflow.chat, workflow.revision, workflow.nextWakeAt ?? null, data, initialContext, initialState, workflow.session, `sessionTombstone:${workflow.session}`],
		);
		if (changes !== 1) {
			throw new Error('Cannot start a workflow for a missing or deleted session');
		}
	}

	async getInitialSession(session: string): Promise<IWorkflowInitialSession | undefined> {
		const row = await this._database.get(
			'SELECT session_uri, initial_session FROM workflow_runs WHERE session_uri = ? AND initial_session IS NOT NULL AND initial_turn_id IS NULL',
			[session],
		);
		return row ? this._readInitialSession(row) : undefined;
	}

	async listInitialSessions(): Promise<readonly IWorkflowInitialSession[]> {
		return (await this._database.all(
			'SELECT session_uri, initial_session FROM workflow_runs WHERE initial_session IS NOT NULL AND initial_turn_id IS NULL',
			[],
		)).map(row => this._readInitialSession(row));
	}

	async updateInitialSession(initial: IWorkflowInitialSession): Promise<boolean> {
		const data = JSON.stringify(initial);
		this._readInitialSession({ initial_session: data, session_uri: initial.summary.resource });
		return await this._database.run(
			'UPDATE workflow_runs SET initial_session = ? WHERE session_uri = ? AND initial_session IS NOT NULL AND initial_turn_id IS NULL',
			[data, initial.summary.resource],
		) === 1;
	}

	async discardInitialSession(session: string): Promise<void> {
		await this._database.run('UPDATE workflow_runs SET initial_session = NULL WHERE session_uri = ?', [session]);
	}

	async claimStartContext(runId: string, turnId: string): Promise<IAgentHostWorkflowStartContext | undefined> {
		const changes = await this._database.run(
			`UPDATE workflow_runs SET initial_turn_id = ?
				WHERE run_id = ? AND initial_context IS NOT NULL
					AND (initial_turn_id IS NULL OR initial_turn_id = ?)`,
			[turnId, runId, turnId],
		);
		if (changes !== 1) {
			return undefined;
		}
		const row = await this._database.get('SELECT initial_context FROM workflow_runs WHERE run_id = ? AND initial_turn_id = ?', [runId, turnId]);
		return row ? this._readStartContext(row.initial_context) : undefined;
	}

	async releaseStartContext(runId: string, turnId: string): Promise<void> {
		await this._database.run('UPDATE workflow_runs SET initial_turn_id = NULL WHERE run_id = ? AND initial_turn_id = ?', [runId, turnId]);
	}

	async updateRun(workflow: WorkflowRun, expectedRevision: number): Promise<boolean> {
		if (!Number.isSafeInteger(expectedRevision) || workflow.revision !== expectedRevision + 1) {
			throw new Error('Workflow writes must advance the expected revision exactly once');
		}
		// One guarded statement atomically commits proof, progress and the next dispatch intent.
		return await this._database.run(
			`UPDATE workflow_runs SET revision = ?, next_wake_at = ?, data = ?
				WHERE run_id = ? AND session_uri = ? AND chat_uri = ? AND revision = ?
					AND EXISTS (SELECT 1 FROM sessions WHERE session_uri = ?)
					AND NOT EXISTS (SELECT 1 FROM metadata WHERE key = ? AND value = 'true')`,
			[workflow.revision, workflow.nextWakeAt ?? null, this._serialize(workflow), workflow.id, workflow.session, workflow.chat, expectedRevision, workflow.session, `sessionTombstone:${workflow.session}`],
		) === 1;
	}

	async deleteSession(session: string): Promise<void> {
		await this._database.run('DELETE FROM workflow_runs WHERE session_uri = ?', [session]);
	}

	private _serialize(workflow: WorkflowRun): string {
		validateWorkflowRun(workflow);
		return JSON.stringify(workflow);
	}

	private _readInitialSession(row: Record<string, unknown>): IWorkflowInitialSession {
		if (typeof row.initial_session !== 'string') {
			throw new Error('Corrupt initial workflow session');
		}
		const value = JSON.parse(row.initial_session) as IWorkflowInitialSession | null;
		const summary = value?.summary;
		if (!value || !summary || summary.resource !== row.session_uri || typeof summary.provider !== 'string'
			|| typeof summary.title !== 'string' || !Number.isSafeInteger(summary.status)
			|| typeof summary.createdAt !== 'string' || !Number.isFinite(Date.parse(summary.createdAt))
			|| typeof summary.modifiedAt !== 'string' || !Number.isFinite(Date.parse(summary.modifiedAt))
			|| summary.workingDirectories !== undefined && (!Array.isArray(summary.workingDirectories) || !summary.workingDirectories.every(directory => typeof directory === 'string'))
			|| summary.project !== undefined && (!summary.project || typeof summary.project.uri !== 'string' || typeof summary.project.displayName !== 'string')
			|| summary._meta !== undefined && (!summary._meta || typeof summary._meta !== 'object' || Array.isArray(summary._meta))
			|| value.config !== undefined && (!value.config || typeof value.config !== 'object' || Array.isArray(value.config))) {
			throw new Error('Invalid initial workflow session');
		}
		this._readStartContext(JSON.stringify({ model: value.model, agent: value.agent }));
		return value;
	}

	private _readStartContext(data: unknown): IAgentHostWorkflowStartContext {
		if (typeof data !== 'string') {
			throw new Error('Corrupt workflow start context');
		}
		const value: unknown = JSON.parse(data);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			throw new Error('Invalid workflow start context');
		}
		const context = value as IAgentHostWorkflowStartContext;
		if (context.model !== undefined && (!context.model || typeof context.model.id !== 'string' || !context.model.id)
			|| context.agent !== undefined && (!context.agent || typeof context.agent.uri !== 'string' || !context.agent.uri)
			|| context.attachments !== undefined && (!Array.isArray(context.attachments) || !context.attachments.every(attachment =>
				attachment && typeof attachment === 'object' && typeof attachment.type === 'string' && typeof attachment.label === 'string'))) {
			throw new Error('Invalid workflow start context');
		}
		const config = context.model?.config;
		if (config !== undefined && (!config || typeof config !== 'object' || Array.isArray(config)
			|| !Object.values(config).every(value => value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)))) {
			throw new Error('Invalid workflow model configuration');
		}
		return context;
	}

	private _read(row: Record<string, unknown> | undefined): WorkflowRun | undefined {
		if (!row) {
			return undefined;
		}
		if (typeof row.data !== 'string') {
			throw new Error('Corrupt workflow record');
		}
		const value: unknown = JSON.parse(row.data);
		validateWorkflowRun(value);
		if (value.id !== row.run_id || value.session !== row.session_uri || value.chat !== row.chat_uri || value.revision !== row.revision
			|| (value.nextWakeAt ?? null) !== row.next_wake_at) {
			throw new Error(`Corrupt workflow record: ${String(row.run_id)}`);
		}
		return value;
	}
}
