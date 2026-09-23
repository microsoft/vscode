/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeHex, encodeHex, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, type IReference } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { ITextModelService, type ITextModelContentProvider } from '../../../../../../editor/common/services/resolverService.js';
import type { ITextModel } from '../../../../../../editor/common/model.js';
import { IAgentHostConnectionsService } from '../../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { TerminalState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { IChatService } from '../../../common/chatService/chatService.js';

export namespace ChatTerminalOutputResource {
	export const scheme = Schemas.vscodeChatTerminalOutput;

	export function create(sessionResource: URI, toolCallId: string, terminal: URI, displayName: string): URI {
		const name = displayName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^[.-]+/, '').slice(0, 64) || 'terminal-output.txt';
		return URI.from({
			scheme,
			authority: encodeHex(VSBuffer.fromString(sessionResource.toString())),
			path: `/terminal/${encodeURIComponent(toolCallId)}/${name}`,
			query: new URLSearchParams({ terminal: terminal.toString() }).toString(),
		});
	}

	export function parse(resource: URI): { readonly sessionResource: URI; readonly terminal: URI } | undefined {
		const parts = resource.path.split('/');
		const terminal = new URLSearchParams(resource.query).get('terminal');
		if (resource.scheme !== scheme || parts.length !== 4 || parts[1] !== 'terminal' || !parts[2] || !parts[3] || !terminal) {
			return undefined;
		}
		try {
			return {
				sessionResource: URI.parse(decodeHex(resource.authority).toString()),
				terminal: URI.parse(terminal),
			};
		} catch {
			return undefined;
		}
	}
}

export const IChatTerminalOutputTextModelService = createDecorator<IChatTerminalOutputTextModelService>('chatTerminalOutputTextModelService');

export interface IChatTerminalOutputTextModelService extends ITextModelContentProvider {
	readonly _serviceBrand: undefined;
	canResolve(resource: URI): Promise<boolean>;
}

function getTerminalText(state: TerminalState): string {
	return state.content
		.map(part => part.type === 'command' ? part.output : part.value)
		.join('')
		.replace(/\r\n?|\n/g, '\n');
}

function updateModel(model: ITextModel, value: string): void {
	const current = model.getValue();
	if (current === value) {
		return;
	}
	let prefixLength = 0;
	const maxPrefixLength = Math.min(current.length, value.length);
	while (prefixLength < maxPrefixLength && current.charCodeAt(prefixLength) === value.charCodeAt(prefixLength)) {
		prefixLength++;
	}
	let currentSuffixStart = current.length;
	let valueSuffixStart = value.length;
	while (currentSuffixStart > prefixLength
		&& valueSuffixStart > prefixLength
		&& current.charCodeAt(currentSuffixStart - 1) === value.charCodeAt(valueSuffixStart - 1)) {
		currentSuffixStart--;
		valueSuffixStart--;
	}
	model.applyEdits([{
		range: Range.fromPositions(model.getPositionAt(prefixLength), model.getPositionAt(currentSuffixStart)),
		text: value.slice(prefixLength, valueSuffixStart),
	}]);
}

export class ChatTerminalOutputTextModelService extends Disposable implements IChatTerminalOutputTextModelService {
	declare readonly _serviceBrand: undefined;

	private readonly _modelStores = this._register(new DisposableMap<ITextModel>());

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@IChatService private readonly _chatService: IChatService,
		@IAgentHostConnectionsService private readonly _agentHostConnectionsService: IAgentHostConnectionsService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async canResolve(resource: URI): Promise<boolean> {
		let subscription: IReference<IAgentSubscription<TerminalState>> | undefined;
		try {
			subscription = await this._acquireSubscription(resource);
			return (await this._waitForState(subscription.object)).isPty === false;
		} catch (error) {
			this._logService.trace(`[ChatTerminalOutputTextModelService] Terminal output is unavailable: ${error instanceof Error ? error.message : String(error)}`);
			return false;
		} finally {
			subscription?.dispose();
		}
	}

	async provideTextContent(resource: URI): Promise<ITextModel | null> {
		const existing = this._modelService.getModel(resource);
		if (existing) {
			return existing;
		}
		const subscription = await this._acquireSubscription(resource);
		try {
			const state = await this._waitForState(subscription.object);
			if (state.isPty !== false) {
				subscription.dispose();
				return null;
			}
			const model = this._modelService.createModel(getTerminalText(state), this._languageService.createById('plaintext'), resource);
			const store = new DisposableStore();
			store.add(subscription);
			store.add(subscription.object.onDidChange(next => updateModel(model, getTerminalText(next))));
			if (subscription.object.onDidError) {
				store.add(subscription.object.onDidError(error => this._logService.error(`[ChatTerminalOutputTextModelService] Terminal subscription failed: ${error.message}`)));
			}
			const latest = subscription.object.value;
			if (latest && !(latest instanceof Error)) {
				updateModel(model, getTerminalText(latest));
			}
			store.add(Event.once(model.onWillDispose)(() => this._modelStores.deleteAndDispose(model)));
			this._modelStores.set(model, store);
			return model;
		} catch (error) {
			subscription.dispose();
			throw error;
		}
	}

	private async _acquireSubscription(resource: URI): Promise<IReference<IAgentSubscription<TerminalState>>> {
		const parsed = ChatTerminalOutputResource.parse(resource);
		if (!parsed) {
			throw new Error(`Invalid terminal output resource: ${resource.toString()}`);
		}
		let sessionReference: IReference<unknown> | undefined;
		if (!this._chatService.getSession(parsed.sessionResource)) {
			sessionReference = await this._chatService.acquireOrLoadSession(
				parsed.sessionResource,
				ChatAgentLocation.Chat,
				CancellationToken.None,
				'ChatTerminalOutputTextModelService#acquireSubscription',
			);
			if (!sessionReference) {
				throw new Error(`Chat session is unavailable: ${parsed.sessionResource.toString()}`);
			}
		}
		try {
			const resolved = this._agentHostConnectionsService.resolveSessionResource(parsed.sessionResource);
			if (!resolved) {
				throw new Error(`Agent Host connection is unavailable: ${parsed.sessionResource.toString()}`);
			}
			return resolved.connection.getSubscription(StateComponents.Terminal, parsed.terminal, 'ChatTerminalOutputTextModelService');
		} finally {
			sessionReference?.dispose();
		}
	}

	private _waitForState(subscription: IAgentSubscription<TerminalState>): Promise<TerminalState> {
		const current = subscription.value;
		if (current instanceof Error) {
			return Promise.reject(current);
		}
		if (current) {
			return Promise.resolve(current);
		}
		return new Promise<TerminalState>((resolve, reject) => {
			const store = new DisposableStore();
			store.add(Event.once(subscription.onDidChange)(state => {
				store.dispose();
				resolve(state);
			}));
			if (subscription.onDidError) {
				store.add(Event.once(subscription.onDidError)(error => {
					store.dispose();
					reject(error);
				}));
			}
		});
	}
}

export class ChatTerminalOutputTextModelWorkbenchContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'chatTerminalOutputTextModelWorkbenchContribution';

	constructor(
		@IChatTerminalOutputTextModelService provider: IChatTerminalOutputTextModelService,
		@ITextModelService textModelService: ITextModelService,
	) {
		super();
		this._register(textModelService.registerTextModelContentProvider(ChatTerminalOutputResource.scheme, provider));
	}
}
