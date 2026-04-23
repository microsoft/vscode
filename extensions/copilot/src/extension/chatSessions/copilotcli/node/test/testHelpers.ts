/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { SessionOptions, SweCustomAgent } from '@github/copilot/sdk';
import type { CancellationToken, Uri } from 'vscode';
import { Event } from '../../../../../util/vs/base/common/event';
import { Disposable, IDisposable } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { generateUuid } from '../../../../../util/vs/base/common/uuid';
import { CLIAgentInfo, CopilotCLIModelInfo, ICopilotCLIAgents, ICopilotCLIModels } from '../copilotCli';
import { ICopilotCLIImageSupport } from '../copilotCLIImageSupport';
import { ICopilotCLISkills } from '../copilotCLISkills';
import { ICopilotCLIMCPHandler } from '../mcpHandler';

export class MockCliSdkSession {
	public emittedEvents: { event: string; content: string | undefined }[] = [];
	public aborted = false;
	public messages: {}[] = [];
	public events: {}[] = [];
	public title: string | undefined;
	public name: string | undefined;
	public readonly renameSession = async (name: string): Promise<void> => {
		this.title = name;
		this.name = name;
		this.summary = name;
	};
	public readonly updateSessionSummary = async (summary: string): Promise<void> => {
		if (!this.name) {
			this.title = summary;
		}
		this.summary = summary;
	};
	public summary?: string;
	constructor(public readonly sessionId: string, public readonly startTime: Date) { }
	getChatContextMessages(): Promise<{}[]> { return Promise.resolve(this.messages); }
	getEvents(): {}[] { return this.events; }
	getSelectedModel(): Promise<string | undefined> { return Promise.resolve(undefined); }
	isAbortable(): boolean { return !this.aborted; }
	abort(): Promise<void> {
		this.aborted = true;
		return Promise.resolve();
	}
	emit(event: string, args: { content: string | undefined }): void {
		this.emittedEvents.push({ event, content: args.content });
	}
	clearCustomAgent() {
		return;
	}
}

export class MockSkillLocations implements ICopilotCLISkills {
	declare _serviceBrand: undefined;
	private readonly locations: Uri[];
	constructor(locations: Uri[] = []) {
		this.locations = locations;
	}
	async getSkillsLocations(_token: CancellationToken): Promise<Uri[]> {
		return this.locations;
	}
}

export class MockCliSdkSessionManager {
	public sessions = new Map<string, MockCliSdkSession>();
	constructor(_opts: {}) { }
	createSession(_options: SessionOptions & { sessionId?: string }) {
		const id = _options.sessionId ?? `sess_${generateUuid()}`;
		const s = new MockCliSdkSession(id, new Date());
		this.sessions.set(id, s);
		return Promise.resolve(s);
	}
	getSession(opts: SessionOptions & { sessionId: string }, _writable: boolean) {
		if (opts && opts.sessionId && this.sessions.has(opts.sessionId)) {
			return Promise.resolve(this.sessions.get(opts.sessionId));
		}
		return Promise.resolve(undefined);
	}
	listSessions() {
		return Promise.resolve(Array.from(this.sessions.values()).map(s => ({ sessionId: s.sessionId, startTime: s.startTime, modifiedTime: s.startTime, summary: s.summary, name: s.name })));
	}
	getSessionMetadata({ sessionId }: { sessionId: string }) {
		const session = this.sessions.get(sessionId);
		return Promise.resolve(session ? { sessionId: session.sessionId, startTime: session.startTime, modifiedTime: session.startTime, summary: session.summary, name: session.name, isRemote: false } : undefined);
	}
	deleteSession(id: string) { this.sessions.delete(id); return Promise.resolve(); }
	closeSession(_id: string) { return Promise.resolve(); }
	forkSession(sourceId: string, _toEventId?: string): Promise<{ sessionId: string }> {
		const newId = `${sourceId}-fork-${generateUuid()}`;
		const source = this.sessions.get(sourceId);
		const s = new MockCliSdkSession(newId, source?.startTime ?? new Date());
		this.sessions.set(newId, s);
		return Promise.resolve({ sessionId: newId });
	}
}

export class NullCopilotCLIAgents implements ICopilotCLIAgents {
	_serviceBrand: undefined;
	readonly onDidChangeAgents: Event<void> = Event.None;
	async getAgents(): Promise<readonly CLIAgentInfo[]> {
		return [];
	}
	async getSessionAgent(_sessionId: string): Promise<string | undefined> {
		return undefined;
	}
	resolveAgent(_agentId: string): Promise<SweCustomAgent | undefined> {
		return Promise.resolve(undefined);
	}
}

export class NullICopilotCLIImageSupport implements ICopilotCLIImageSupport {
	_serviceBrand: undefined;
	storeImage(_imageData: Uint8Array, _mimeType: string): Promise<URI> {
		return Promise.resolve(URI.file('/dev/null'));
	}
	isTrustedImage(_imageUri: URI): boolean {
		return false;
	}
}

export class NullCopilotCLIMCPHandler implements ICopilotCLIMCPHandler {
	_serviceBrand: undefined;
	async loadMcpConfig(_resource: URI): Promise<{ mcpConfig: Record<string, NonNullable<SessionOptions['mcpServers']>[string]> | undefined; disposable: IDisposable }> {
		return { mcpConfig: undefined, disposable: Disposable.None };
	}
}

export class NullCopilotCLIModels implements ICopilotCLIModels {
	_serviceBrand: undefined;
	async resolveModel(_modelId: string): Promise<string | undefined> { return undefined; }
	async getDefaultModel(): Promise<string | undefined> { return undefined; }
	async setDefaultModel(_modelId: string | undefined): Promise<void> { return; }
	async getModels(): Promise<CopilotCLIModelInfo[]> { return []; }
	registerLanguageModelChatProvider(): void { return; }
}
