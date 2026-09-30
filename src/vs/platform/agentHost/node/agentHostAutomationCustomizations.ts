/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { extUriBiasedIgnorePathCase, joinPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { localize } from '../../../nls.js';
import { parsePlugin } from '../../agentPlugins/common/pluginParsers.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { toAgentClientUri } from '../common/agentClientUri.js';
import type { AutomationEntry, AutomationSessionTemplate } from '../common/state/protocol/channels-automation/state.js';
import { CustomizationLoadStatus, CustomizationType, type AgentSelection, type ClientPluginCustomization, type PluginCustomization, type SessionActiveClient } from '../common/state/sessionState.js';
import { toChildCustomizations } from './copilot/copilotPluginConverters.js';

/** Static active-client identity used for captured automation plugins. */
export const AUTOMATION_ACTIVE_CLIENT_ID = 'vscode.automation';

/** Owns immutable automation plugin copies, independently of connected clients and the plugin cache. */
export class AgentHostAutomationCustomizations {
	private readonly _path: URI;
	/** Copies handed to run sessions in this process; those sessions keep using them in place for follow-up turns. */
	private readonly _usedByRuns = new Set<string>();

	constructor(
		hostPluginsPath: URI,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
		private readonly _userHome: URI,
	) {
		this._path = joinPath(hostPluginsPath, 'automations');
	}

	/** Captures changed references atomically for the caller, reusing unchanged entries without contacting their client. */
	async capture(clientId: string | undefined, next: readonly ClientPluginCustomization[] | undefined, previous: AutomationEntry | undefined): Promise<PluginCustomization[] | undefined> {
		if (!next?.length) {
			return undefined;
		}
		const ids = new Set<string>();
		for (const ref of next) {
			if (!ref.id.trim() || ids.has(ref.id)) {
				throw new Error('Automation customization ids must be non-empty and unique.');
			}
			ids.add(ref.id);
		}
		const captured: PluginCustomization[] = [];
		for (const ref of next) {
			const priorRef = previous?.definition.session.customizations?.find(candidate => candidate.id === ref.id);
			let copy = priorRef?.uri === ref.uri && priorRef.nonce === ref.nonce
				? previous?.customizations?.find(candidate => candidate.id === ref.id)
				: undefined;
			if (!copy) {
				if (!clientId) {
					throw new Error('Capturing automation customizations requires a dispatching client.');
				}
				const key = ref.nonce === undefined ? generateUuid() : createHash('sha256').update(`${ref.uri}\n${ref.nonce}`).digest('hex');
				const destination = joinPath(this._path, key);
				if (!await this._fileService.exists(destination)) {
					const staging = joinPath(this._path, `.staging-${generateUuid()}`);
					await this._fileService.copy(toAgentClientUri(URI.parse(ref.uri), clientId), staging);
					await this._fileService.move(staging, destination);
				}
				const parsed = await parsePlugin(destination, this._fileService, undefined, this._userHome, destination);
				copy = {
					type: CustomizationType.Plugin,
					id: ref.id,
					uri: destination.toString(),
					name: ref.name,
					children: toChildCustomizations([parsed]),
					load: { kind: CustomizationLoadStatus.Loaded },
				};
			}
			captured.push({
				...copy,
				name: ref.name,
				icons: ref.icons,
				range: ref.range,
				version: ref.version,
			});
		}
		return captured;
	}

	/** Seeds providers through their existing eager active-client customization path. */
	toRunActiveClient(entry: AutomationEntry): SessionActiveClient | undefined {
		const customizations = entry.definition.session.customizations?.map(ref => {
			const copy = entry.customizations?.find(candidate => candidate.id === ref.id);
			if (!copy) {
				throw new Error(`Missing captured automation customization: ${ref.id}`);
			}
			this._usedByRuns.add(copy.uri);
			return { ...ref, uri: copy.uri, clientId: AUTOMATION_ACTIVE_CLIENT_ID };
		});
		return customizations?.length ? {
			clientId: AUTOMATION_ACTIVE_CLIENT_ID,
			displayName: localize('automationActiveClient', "Automation"),
			tools: [],
			customizations,
		} : undefined;
	}

	/** Resolves bundled agent selections against the immutable captured directory. */
	resolveAgent(template: AutomationSessionTemplate, captured: readonly PluginCustomization[]): AgentSelection | undefined {
		if (!template.agent) {
			return undefined;
		}
		const agentUri = URI.parse(template.agent.uri);
		for (const ref of template.customizations ?? []) {
			const source = URI.parse(ref.uri);
			if (!extUriBiasedIgnorePathCase.isEqualOrParent(agentUri, source)) {
				continue;
			}
			const copy = captured.find(candidate => candidate.id === ref.id);
			if (!copy) {
				throw new Error(`Missing captured automation customization: ${ref.id}`);
			}
			const relative = extUriBiasedIgnorePathCase.relativePath(source, agentUri)!;
			return { ...template.agent, uri: joinPath(URI.parse(copy.uri), relative).with({ query: agentUri.query, fragment: agentUri.fragment }).toString() };
		}
		return template.agent;
	}

	/** Reclaims copies that no automation references and no run session in this process has used. */
	async collectGarbage(entries: readonly AutomationEntry[]): Promise<void> {
		try {
			if (!await this._fileService.exists(this._path)) {
				return;
			}
			const referenced = [
				...entries.flatMap(entry => entry.customizations?.map(copy => URI.parse(copy.uri)) ?? []),
				...[...this._usedByRuns].map(uri => URI.parse(uri)),
			];
			const directory = await this._fileService.resolve(this._path);
			for (const child of directory.children ?? []) {
				if (!referenced.some(uri => extUriBiasedIgnorePathCase.isEqualOrParent(uri, child.resource))) {
					try {
						await this._fileService.del(child.resource, { recursive: true });
					} catch (error) {
						this._logService.warn(`[AutomationCustomizations] Failed to delete ${child.resource.toString()}`, error);
					}
				}
			}
		} catch (error) {
			this._logService.warn('[AutomationCustomizations] Failed to collect unused plugins', error);
		}
	}
}
