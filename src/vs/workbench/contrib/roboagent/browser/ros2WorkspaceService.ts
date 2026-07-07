/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ISearchService } from '../../../services/search/common/search.js';
import { QueryBuilder } from '../../../services/search/common/queryBuilder.js';
import { parseCMakeLists } from '../common/parsers/cmakeListsParser.js';
import { classifyInterfaceFiles } from '../common/parsers/interfaceScanner.js';
import { parsePackageXml } from '../common/parsers/packageXmlParser.js';
import { parseSetupPy } from '../common/parsers/setupPyParser.js';
import {
	EMPTY_ROS2_GRAPH, Ros2BuildType, Ros2Interface, Ros2LaunchFile, Ros2LaunchFormat,
	Ros2Node, Ros2Package, Ros2Workspace, Ros2WorkspaceGraph
} from '../common/ros2WorkspaceModel.js';
import { IRos2WorkspaceService } from '../common/ros2WorkspaceService.js';

/** Directories inside a colcon workspace that never contain source packages. */
const IGNORED_DIR_SEGMENTS = ['/build/', '/install/', '/log/', '/.git/'];

const REINDEX_TRIGGER_FILES = ['package.xml', 'CMakeLists.txt', 'setup.py', 'setup.cfg'];

const LAUNCH_EXTENSIONS: ReadonlyMap<string, Ros2LaunchFormat> = new Map([
	['launch.py', 'python'],
	['launch.xml', 'xml'],
	['launch.yaml', 'yaml'],
	['launch.yml', 'yaml']
]);

export class Ros2WorkspaceService extends Disposable implements IRos2WorkspaceService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeGraph = this._register(new Emitter<void>());
	readonly onDidChangeGraph: Event<void> = this._onDidChangeGraph.event;

	private _graph: Ros2WorkspaceGraph = EMPTY_ROS2_GRAPH;
	private _isIndexing = false;
	private _pendingIndex: Promise<void> | undefined;

	private readonly _reindexScheduler = this._register(new RunOnceScheduler(() => this.indexWorkspace(), 750));

	constructor(
		@IWorkspaceContextService private readonly workspaceContextService: IWorkspaceContextService,
		@IFileService private readonly fileService: IFileService,
		@ISearchService private readonly searchService: ISearchService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		// Re-index when relevant build files or workspace folders change.
		this._register(this.fileService.onDidFilesChange(e => {
			const touched = [...e.rawAdded, ...e.rawUpdated, ...e.rawDeleted];
			if (touched.some(uri => REINDEX_TRIGGER_FILES.includes(basename(uri)))) {
				this._reindexScheduler.schedule();
			}
		}));
		this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this._reindexScheduler.schedule()));
	}

	get isIndexing(): boolean {
		return this._isIndexing;
	}

	getGraph(): Ros2WorkspaceGraph {
		return this._graph;
	}

	indexWorkspace(): Promise<void> {
		// Coalesce concurrent requests; if one is running, chain a fresh pass after it.
		if (this._pendingIndex) {
			return this._pendingIndex;
		}
		this._pendingIndex = this.doIndexWorkspace().finally(() => {
			this._pendingIndex = undefined;
		});
		return this._pendingIndex;
	}

	private async doIndexWorkspace(): Promise<void> {
		this._isIndexing = true;
		try {
			const folders = this.workspaceContextService.getWorkspace().folders;
			if (folders.length === 0) {
				this._graph = EMPTY_ROS2_GRAPH;
				this._onDidChangeGraph.fire();
				return;
			}

			const manifestUris = await this.findPackageManifests(folders.map(f => f.uri));
			const packages: Ros2Package[] = [];
			const nodes: Ros2Node[] = [];
			const interfaces: Ros2Interface[] = [];
			const launchFiles: Ros2LaunchFile[] = [];

			for (const manifestUri of manifestUris) {
				await this.indexPackage(manifestUri, packages, nodes, interfaces, launchFiles);
			}

			const workspaces: Ros2Workspace[] = folders
				.filter(f => packages.some(p => p.path.toString().startsWith(f.uri.toString())))
				.map(f => ({ rootUri: f.uri, name: f.name }));

			this._graph = {
				workspaces,
				packages: packages.sort((a, b) => a.name.localeCompare(b.name)),
				nodes,
				interfaces,
				launchFiles,
				indexedAt: Date.now()
			};
			this.logService.info(`[RoboAgent] Indexed ${packages.length} ROS2 package(s), ${nodes.length} node(s), ${interfaces.length} interface(s), ${launchFiles.length} launch file(s).`);
		} catch (err) {
			this.logService.error('[RoboAgent] ROS2 workspace indexing failed', err);
		} finally {
			this._isIndexing = false;
			this._onDidChangeGraph.fire();
		}
	}

	private async findPackageManifests(folderUris: URI[]): Promise<URI[]> {
		const queryBuilder = this.instantiationService.createInstance(QueryBuilder);
		const query = queryBuilder.file(folderUris, {
			filePattern: '**/package.xml',
			maxResults: 2048
		});
		const { results } = await this.searchService.fileSearch(query, CancellationToken.None);
		return results
			.map(r => r.resource)
			.filter(uri => !IGNORED_DIR_SEGMENTS.some(seg => uri.path.includes(seg)));
	}

	private async indexPackage(
		manifestUri: URI,
		packages: Ros2Package[],
		nodes: Ros2Node[],
		interfaces: Ros2Interface[],
		launchFiles: Ros2LaunchFile[]
	): Promise<void> {
		let manifestText: string;
		try {
			manifestText = (await this.fileService.readFile(manifestUri)).value.toString();
		} catch (err) {
			this.logService.warn(`[RoboAgent] Could not read ${manifestUri.toString()}`, err);
			return;
		}

		const parsed = parsePackageXml(manifestText);
		if (!parsed) {
			return; // not a real package manifest
		}

		const packageDir = dirname(manifestUri);
		const hasCMake = await this.fileService.exists(joinPath(packageDir, 'CMakeLists.txt'));
		const setupPyUri = joinPath(packageDir, 'setup.py');
		const hasSetupPy = await this.fileService.exists(setupPyUri);
		const setupCfgUri = joinPath(packageDir, 'setup.cfg');
		const hasSetupCfg = await this.fileService.exists(setupCfgUri);

		const buildType = parsed.buildType ?? this.inferBuildType(hasCMake, hasSetupPy);

		packages.push({
			name: parsed.name,
			version: parsed.version,
			description: parsed.description,
			maintainers: parsed.maintainers,
			buildType,
			path: packageDir,
			packageXmlUri: manifestUri,
			dependencies: parsed.dependencies,
			isInterfacePackage: parsed.isInterfacePackage
		});

		// Executable nodes from CMakeLists.txt (C++).
		if (hasCMake) {
			try {
				const cmakeText = (await this.fileService.readFile(joinPath(packageDir, 'CMakeLists.txt'))).value.toString();
				const cmake = parseCMakeLists(cmakeText);
				for (const exe of cmake.executables) {
					nodes.push({ name: exe, package: parsed.name, language: 'cpp' });
				}
			} catch (err) {
				this.logService.warn(`[RoboAgent] Could not parse CMakeLists.txt for ${parsed.name}`, err);
			}
		}

		// Console-script nodes from setup.py / setup.cfg (Python).
		for (const uri of [hasSetupPy ? setupPyUri : undefined, hasSetupCfg ? setupCfgUri : undefined]) {
			if (!uri) {
				continue;
			}
			try {
				const text = (await this.fileService.readFile(uri)).value.toString();
				for (const entry of parseSetupPy(text).consoleScripts) {
					nodes.push({ name: entry.executable, package: parsed.name, language: 'python', sourceHint: entry.target });
				}
			} catch (err) {
				this.logService.warn(`[RoboAgent] Could not parse ${basename(uri)} for ${parsed.name}`, err);
			}
		}

		await this.collectInterfaces(packageDir, parsed.name, interfaces);
		await this.collectLaunchFiles(packageDir, parsed.name, launchFiles);
	}

	private inferBuildType(hasCMake: boolean, hasSetupPy: boolean): Ros2BuildType {
		if (hasCMake) {
			return 'ament_cmake';
		}
		if (hasSetupPy) {
			return 'ament_python';
		}
		return 'unknown';
	}

	private async collectInterfaces(packageDir: URI, packageName: string, out: Ros2Interface[]): Promise<void> {
		for (const kindDir of ['msg', 'srv', 'action']) {
			const dirUri = joinPath(packageDir, kindDir);
			if (!(await this.fileService.exists(dirUri))) {
				continue;
			}
			try {
				const stat = await this.fileService.resolve(dirUri);
				const fileNames = (stat.children ?? []).filter(c => !c.isDirectory).map(c => c.name);
				for (const scanned of classifyInterfaceFiles(fileNames)) {
					out.push({ package: packageName, kind: scanned.kind, name: scanned.name, path: joinPath(dirUri, scanned.fileName) });
				}
			} catch (err) {
				this.logService.warn(`[RoboAgent] Could not scan ${kindDir}/ for ${packageName}`, err);
			}
		}
	}

	private async collectLaunchFiles(packageDir: URI, packageName: string, out: Ros2LaunchFile[]): Promise<void> {
		const launchDir = joinPath(packageDir, 'launch');
		if (!(await this.fileService.exists(launchDir))) {
			return;
		}
		try {
			const stat = await this.fileService.resolve(launchDir);
			for (const child of stat.children ?? []) {
				if (child.isDirectory) {
					continue;
				}
				const format = this.launchFormat(child.name);
				if (format) {
					out.push({ package: packageName, path: child.resource, format });
				}
			}
		} catch (err) {
			this.logService.warn(`[RoboAgent] Could not scan launch/ for ${packageName}`, err);
		}
	}

	private launchFormat(fileName: string): Ros2LaunchFormat | undefined {
		const lower = fileName.toLowerCase();
		for (const [suffix, format] of LAUNCH_EXTENSIONS) {
			if (lower.endsWith(suffix)) {
				return format;
			}
		}
		return undefined;
	}
}
