/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { timeout } from 'vs/base/common/async';
import { onUnexpectedError } from 'vs/base/common/errors';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUpdateService } from 'vs/platform/update/common/update';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';
import { IFileService } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { VSBuffer } from 'vs/base/common/buffer';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { StartupTimings } from 'vs/workbench/contrib/performance/browser/startupTimings';

export class NativeStartupTimings extends StartupTimings implements IWorkbenchContribution {

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ITimerService private readonly _timerService: ITimerService,
		@INativeHostService private readonly _nativeHostService: INativeHostService,
		@IEditorService editorService: IEditorService,
		@IPaneCompositePartService paneCompositeService: IPaneCompositePartService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IUpdateService updateService: IUpdateService,
		@INativeWorkbenchEnvironmentService private readonly _environmentService: INativeWorkbenchEnvironmentService,
		@IProductService private readonly _productService: IProductService,
		@IWorkspaceTrustManagementService workspaceTrustService: IWorkspaceTrustManagementService,
	) {
		super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);

		this._report().catch(onUnexpectedError);
	}

	private async _report() {
		const standardStartupError = await this._isStandardStartup();
		this._appendStartupTimes(standardStartupError).catch(onUnexpectedError);
	}

	private async _appendStartupTimes(standardStartupError: string | undefined) {
		const appendTo = this._environmentService.args['prof-append-timers'];
		const durationMarkers = this._environmentService.args['prof-duration-markers'];
		const durationMarkersFile = this._environmentService.args['prof-duration-markers-file'];
		if (!appendTo && !durationMarkers) {
			// nothing to do
			return;
		}

		try {
			await Promise.all([
				this._timerService.whenReady(),
				timeout(15000), // wait: cached data creation, telemetry sending
			]);

			const perfBaseline = await this._timerService.perfBaseline;

			if (appendTo) {
				const { sessionId } = await this._telemetryService.getTelemetryInfo();
				const content = `${this._timerService.startupMetrics.ellapsed}\t${this._productService.nameShort}\t${(this._productService.commit || '').slice(0, 10) || '0000000000'}\t${sessionId}\t${standardStartupError === undefined ? 'standard_start' : 'NO_standard_start : ' + standardStartupError}\t${String(perfBaseline).padStart(4, '0')}ms\n`;
				await this.appendContent(URI.file(appendTo), content);
			}

			if (durationMarkers?.length) {
				const durations: string[] = [];
				for (const durationMarker of durationMarkers) {
					let duration: number = 0;
					if (durationMarker === 'ellapsed') {
						duration = this._timerService.startupMetrics.ellapsed;
					} else if (durationMarker.indexOf('-') !== -1) {
						const markers = durationMarker.split('-');
						if (markers.length === 2) {
							duration = this._timerService.getDuration(markers[0], markers[1]);
						}
					}
					if (duration) {
						durations.push(durationMarker);
						durations.push(`${duration}`);
					}
				}

				const durationsContent = `${durations.join('\t')}\n`;
				if (durationMarkersFile) {
					await this.appendContent(URI.file(durationMarkersFile), durationsContent);
				} else {
					console.log(durationsContent);
				}
			}

		} catch (err) {
			console.error(err);
		} finally {
			this._nativeHostService.exit(0);
		}
	}

	protected override async _isStandardStartup(): Promise<string | undefined> {
		const windowCount = await this._nativeHostService.getWindowCount();
		if (windowCount !== 1) {
			return `Expected window count : 1, Actual : ${windowCount}`;
		}
		return super._isStandardStartup();
	}

	private async appendContent(file: URI, content: string): Promise<void> {
		const chunks: VSBuffer[] = [];
		if (await this._fileService.exists(file)) {
			chunks.push((await this._fileService.readFile(file)).value);
		}
		chunks.push(VSBuffer.fromString(content));
		await this._fileService.writeFile(file, VSBuffer.concat(chunks));
	}
}
