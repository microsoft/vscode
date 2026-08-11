/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { makeMcpServerCustomization, normalizeMcpServerConfiguration, readJsonFile, resolveMcpServersMap, type IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import type { IFileService } from '../../../files/common/files.js';

export class SessionMcpDiscovery extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<readonly IMcpServerDefinition[]>());
	readonly onDidChange: Event<readonly IMcpServerDefinition[]> = this._onDidChange.event;

	private readonly _sequencer = new Sequencer();
	private readonly _definitionUris: readonly URI[];
	private _definitions: readonly IMcpServerDefinition[] = [];
	private _signature = '';
	private _initialized = false;

	get definitions(): readonly IMcpServerDefinition[] {
		return this._definitions;
	}

	constructor(
		private readonly _workingDirectories: readonly URI[],
		private readonly _fileService: IFileService,
	) {
		super();
		this._definitionUris = _workingDirectories.map(root => URI.joinPath(root, '.mcp.json'));
		for (let index = 0; index < _workingDirectories.length; index++) {
			const definitionUri = this._definitionUris[index];
			const watcher = this._register(_fileService.createWatcher(_workingDirectories[index], { recursive: false, excludes: [] }));
			this._register(watcher.onDidChange(event => {
				if (event.affects(definitionUri)) {
					void this.refresh();
				}
			}));
		}
	}

	refresh(): Promise<readonly IMcpServerDefinition[]> {
		return this._sequencer.queue(async () => {
			const definitions = await this._scan();
			const signature = JSON.stringify(definitions.map(definition => ({
				name: definition.name,
				configuration: definition.configuration,
				defaultCwd: definition.defaultCwd?.toString(),
				uri: definition.uri.toString(),
			})));
			if (!this._initialized) {
				this._initialized = true;
				this._signature = signature;
				this._definitions = definitions;
				return this._definitions;
			}
			if (signature !== this._signature) {
				this._signature = signature;
				this._definitions = definitions;
				this._onDidChange.fire(definitions);
			}
			return this._definitions;
		});
	}

	private async _scan(): Promise<readonly IMcpServerDefinition[]> {
		const definitions = new Map<string, IMcpServerDefinition>();
		for (let index = 0; index < this._workingDirectories.length; index++) {
			const root = this._workingDirectories[index];
			const definitionUri = this._definitionUris[index];
			const raw = resolveMcpServersMap(await readJsonFile(definitionUri, this._fileService));
			if (!raw) {
				continue;
			}
			for (const [name, value] of Object.entries(raw)) {
				if (definitions.has(name)) {
					continue;
				}
				const configuration = normalizeMcpServerConfiguration(value);
				if (configuration) {
					definitions.set(name, {
						name,
						configuration,
						defaultCwd: root,
						uri: definitionUri,
						customization: makeMcpServerCustomization(definitionUri, name),
					});
				}
			}
		}
		return [...definitions.values()];
	}
}
