/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Sequencer } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { makeMcpServerCustomization, normalizeMcpServerConfiguration, readJsonFile, resolveMcpServersMap, type IMcpServerDefinition } from '../../../agentPlugins/common/pluginParsers.js';
import type { IFileService } from '../../../files/common/files.js';

class RootMcpDiscovery extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private readonly _sequencer = new Sequencer();
	private readonly _definitionUri: URI;
	private _definitions: readonly IMcpServerDefinition[] = [];
	private _signature = '';
	private _initialized = false;

	get definitions(): readonly IMcpServerDefinition[] {
		return this._definitions;
	}

	constructor(
		private readonly _root: URI,
		private readonly _fileService: IFileService,
	) {
		super();
		this._definitionUri = URI.joinPath(_root, '.mcp.json');
		const watcher = this._register(_fileService.createWatcher(_root, { recursive: false, excludes: [] }));
		this._register(watcher.onDidChange(event => {
			if (event.affects(this._definitionUri)) {
				void this.refresh(true);
			}
		}));
	}

	refresh(force = false): Promise<readonly IMcpServerDefinition[]> {
		return this._sequencer.queue(async () => {
			if (this._initialized && !force) {
				return this._definitions;
			}
			const definitions = await this._scan();
			const signature = serializeDefinitions(definitions);
			if (!this._initialized) {
				this._initialized = true;
				this._signature = signature;
				this._definitions = definitions;
				return definitions;
			}
			if (signature !== this._signature) {
				this._signature = signature;
				this._definitions = definitions;
				this._onDidChange.fire();
			}
			return this._definitions;
		});
	}

	private async _scan(): Promise<readonly IMcpServerDefinition[]> {
		const definitions: IMcpServerDefinition[] = [];
		const raw = resolveMcpServersMap(await readJsonFile(this._definitionUri, this._fileService));
		if (!raw) {
			return definitions;
		}
		for (const [name, value] of Object.entries(raw)) {
			const configuration = normalizeMcpServerConfiguration(value);
			if (configuration) {
				definitions.push({
					name,
					configuration,
					defaultCwd: this._root,
					uri: this._definitionUri,
					customization: makeMcpServerCustomization(this._definitionUri, name),
				});
			}
		}
		return definitions;
	}
}

interface ISharedRootMcpDiscovery {
	readonly discovery: RootMcpDiscovery;
	refCount: number;
}

const sharedRootDiscoveries = new WeakMap<IFileService, ResourceMap<ISharedRootMcpDiscovery>>();

function acquireRootMcpDiscovery(root: URI, fileService: IFileService): { readonly discovery: RootMcpDiscovery; dispose(): void } {
	let byRoot = sharedRootDiscoveries.get(fileService);
	if (!byRoot) {
		byRoot = new ResourceMap();
		sharedRootDiscoveries.set(fileService, byRoot);
	}
	let entry = byRoot.get(root);
	if (!entry) {
		entry = { discovery: new RootMcpDiscovery(root, fileService), refCount: 0 };
		byRoot.set(root, entry);
	}
	entry.refCount++;
	let isDisposed = false;
	return {
		discovery: entry.discovery,
		dispose: () => {
			if (isDisposed) {
				return;
			}
			isDisposed = true;
			if (--entry.refCount === 0) {
				byRoot.delete(root);
				entry.discovery.dispose();
				if (byRoot.size === 0) {
					sharedRootDiscoveries.delete(fileService);
				}
			}
		},
	};
}

export class SessionMcpDiscovery extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<readonly IMcpServerDefinition[]>());
	readonly onDidChange: Event<readonly IMcpServerDefinition[]> = this._onDidChange.event;

	private readonly _sequencer = new Sequencer();
	private readonly _roots: readonly { readonly root: URI; readonly discovery: RootMcpDiscovery }[];
	private _definitions: readonly IMcpServerDefinition[] = [];
	private _signature = '';
	private _initialized = false;

	get definitions(): readonly IMcpServerDefinition[] {
		return this._definitions;
	}

	constructor(
		workingDirectories: readonly URI[],
		fileService: IFileService,
	) {
		super();
		this._roots = workingDirectories.map(root => {
			const acquired = this._register(acquireRootMcpDiscovery(root, fileService));
			this._register(acquired.discovery.onDidChange(() => {
				void this._refreshFromSnapshots();
			}));
			return { root, discovery: acquired.discovery };
		});
	}

	async refresh(): Promise<readonly IMcpServerDefinition[]> {
		await Promise.all(this._roots.map(root => root.discovery.refresh()));
		return this._refreshFromSnapshots();
	}

	private _refreshFromSnapshots(): Promise<readonly IMcpServerDefinition[]> {
		return this._sequencer.queue(async () => {
			const definitions = this._mergeRootDefinitions();
			const signature = serializeDefinitions(definitions);
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

	private _mergeRootDefinitions(): readonly IMcpServerDefinition[] {
		const definitions = new Map<string, IMcpServerDefinition>();
		for (const root of this._roots) {
			for (const definition of root.discovery.definitions) {
				const name = definition.name;
				if (definitions.has(name)) {
					continue;
				}
				definitions.set(name, definition);
			}
		}
		return [...definitions.values()];
	}
}

function serializeDefinitions(definitions: readonly IMcpServerDefinition[]): string {
	return JSON.stringify(definitions.map(definition => ({
		name: definition.name,
		configuration: definition.configuration,
		defaultCwd: definition.defaultCwd?.toString(),
		uri: definition.uri.toString(),
	})));
}
