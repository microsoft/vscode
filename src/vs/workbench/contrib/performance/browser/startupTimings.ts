/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ILifecycleService, StartupKind, StartupKindToString } from '../../../services/lifecycle/common/lifecycle.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import * as files from '../../files/common/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IWorkspaceTrustManagementService } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { ViewContainerLocation } from '../../../common/views.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IBrowserWorkbenchEnvironmentService } from '../../../services/environment/browser/environmentService.js';
import { ITimerService } from '../../../services/timer/browser/timerService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { posix } from '../../../../base/common/path.js';
import { hash } from '../../../../base/common/hash.js';

export abstract class StartupTimings {

	constructor(
		@IEditorService private readonly _editorService: IEditorService,
		@IPaneCompositePartService private readonly _paneCompositeService: IPaneCompositePartService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IUpdateService private readonly _updateService: IUpdateService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustService: IWorkspaceTrustManagementService
	) {
	}

	protected async _isStandardStartup(): Promise<string | undefined> {
		// check for standard startup:
		// * new window (no reload)
		// * workspace is trusted
		// * just one window
		// * explorer viewlet visible
		// * one text editor (not multiple, not webview, welcome etc...)
		// * cached data present (not rejected, not created)
		if (this._lifecycleService.startupKind !== StartupKind.NewWindow) {
			return StartupKindToString(this._lifecycleService.startupKind);
		}
		if (!this._workspaceTrustService.isWorkspaceTrusted()) {
			return 'Workspace not trusted';
		}
		const activeViewlet = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
		if (!activeViewlet || activeViewlet.getId() !== files.VIEWLET_ID) {
			return 'Explorer viewlet not visible';
		}
		const visibleEditorPanes = this._editorService.visibleEditorPanes;
		if (visibleEditorPanes.length !== 1) {
			return `Expected text editor count : 1, Actual : ${visibleEditorPanes.length}`;
		}
		if (!isCodeEditor(visibleEditorPanes[0].getControl())) {
			return 'Active editor is not a text editor';
		}
		const activePanel = this._paneCompositeService.getActivePaneComposite(ViewContainerLocation.Panel);
		if (activePanel) {
			return `Current active panel : ${this._paneCompositeService.getPaneComposite(activePanel.getId(), ViewContainerLocation.Panel)?.name}`;
		}
		const isLatestVersion = await this._updateService.isLatestVersion();
		if (isLatestVersion === false) {
			return 'Not on latest version, updates available';
		}
		return undefined;
	}
}

export class BrowserStartupTimings extends StartupTimings implements IWorkbenchContribution {

	constructor(
		@IEditorService editorService: IEditorService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IUpdateService updateService: IUpdateService,
		@IWorkspaceTrustManagementService workspaceTrustService: IWorkspaceTrustManagementService,
		@ITimerService private readonly timerService: ITimerService,
		@ILogService private readonly logService: ILogService,
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService private readonly productService: IProductService
	) {
		super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);

		this.logPerfMarks();
	}

	private async logPerfMarks(): Promise<void> {
		if (!this.environmentService.profDurationMarkers) {
			return;
		}

		await this.timerService.whenReady();

		const standardStartupError = await this._isStandardStartup();
		const perfBaseline = await this.timerService.perfBaseline;
		const [from, to] = this.environmentService.profDurationMarkers;
		const content = `${this.timerService.getDuration(from, to)}\t${this.productService.nameShort}\t${(this.productService.commit || '').slice(0, 10) || '0000000000'}\t${this.telemetryService.sessionId}\t${standardStartupError === undefined ? 'standard_start' : 'NO_standard_start : ' + standardStartupError}\t${String(perfBaseline).padStart(4, '0')}ms\n`;

		this.logService.info(`[prof-timers] ${content}`);
	}
}

export class BrowserResourcePerformanceMarks {

	constructor(
		@ITelemetryService telemetryService: ITelemetryService
	) {

		type Entry = {
			hosthash: string;
			name: string;
			duration: number;
		};
		type EntryClassifify = {
			owner: 'jrieken';
			comment: 'Resource performance numbers';
			hosthash: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Hash of the hostname' };
			name: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Resource basename' };
			duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Resource duration' };
		};
		for (const item of performance.getEntriesByType('resource')) {

			try {
				const url = new URL(item.name);
				const name = posix.basename(url.pathname);

				telemetryService.publicLog2<Entry, EntryClassifify>('startup.resource.perf', {
					hosthash: `H${hash(url.host).toString(16)}`,
					name,
					duration: item.duration
				});
			} catch {
				// ignore
			}
		}
	}
}
