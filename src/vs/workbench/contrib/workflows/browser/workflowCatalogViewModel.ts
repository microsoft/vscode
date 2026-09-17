/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IAICustomizationWorkspaceService } from '../../chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService } from '../../chat/common/customizationHarnessService.js';
import { IWorkflowCatalogService, WorkflowCatalog } from '../common/workflowCatalog.js';

export class WorkflowCatalogViewModel extends Disposable {
	private readonly change = this._register(new Emitter<void>());
	readonly onDidChange = this.change.event;
	private readonly watcher = this._register(new MutableDisposable());
	private readonly refreshScheduler = this._register(new RunOnceScheduler(() => void this.refresh(), 150));
	private generation = 0;
	catalog: WorkflowCatalog = { workflows: [], checkpointTypes: [], diagnostics: [] };
	workspace: URI | undefined;
	loading = true;
	error: string | undefined;

	constructor(
		@IWorkflowCatalogService private readonly catalogService: IWorkflowCatalogService,
		@IAICustomizationWorkspaceService workspaceService: IAICustomizationWorkspaceService,
		@ICustomizationHarnessService private readonly harnessService: ICustomizationHarnessService,
	) {
		super();
		this._register(catalogService.onDidChange(() => this.refreshScheduler.schedule()));
		this._register(autorun(reader => {
			this.generation++;
			this.workspace = workspaceService.activeProjectRoot.read(reader);
			harnessService.activeHarness.read(reader);
			harnessService.availableHarnesses.read(reader);
			this.watcher.value = catalogService.watch(this.workspace);
			this.catalog = { workflows: [], checkpointTypes: [], diagnostics: [] };
			this.loading = true;
			this.error = undefined;
			this.change.fire();
			this.refreshScheduler.schedule(0);
		}));
	}

	getCount(): number { return this.catalog.workflows.length; }

	async refresh(): Promise<void> {
		this.refreshScheduler.cancel();
		const generation = ++this.generation;
		this.loading = true;
		this.change.fire();
		try {
			const catalog = await this.catalogService.getCatalog(this.workspace);
			if (generation !== this.generation || this._store.isDisposed) {
				return;
			}
			const sources = this.harnessService.getActiveDescriptor().workflowSources;
			const visible = (source: 'builtin' | 'extension' | 'workspace' | 'user') => !sources || sources.includes(source === 'workspace' ? 'local' : source);
			this.catalog = { ...catalog, workflows: catalog.workflows.filter(entry => visible(entry.source.kind)), checkpointTypes: catalog.checkpointTypes.filter(entry => visible(entry.source.kind)) };
			this.error = undefined;
		} catch (error) {
			if (generation !== this.generation || this._store.isDisposed) {
				return;
			}
			this.error = String(error);
		}
		this.loading = false;
		this.change.fire();
	}
}
