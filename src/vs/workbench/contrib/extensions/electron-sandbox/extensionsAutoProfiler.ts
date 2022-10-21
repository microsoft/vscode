/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IExtensionService, IResponsiveStateChangeEvent, IExtensionHostProfile, ProfileSession, ExtensionHostKind } from 'vs/workbench/services/extensions/common/extensions';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IDisposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { onUnexpectedError } from 'vs/base/common/errors';
import { joinPath } from 'vs/base/common/resources';
import { IExtensionHostProfileService } from 'vs/workbench/contrib/extensions/electron-sandbox/runtimeExtensionsEditor';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/common/runtimeExtensionsInput';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { createSlowExtensionAction } from 'vs/workbench/contrib/extensions/electron-sandbox/extensionsSlowActions';
import { ExtensionHostProfiler } from 'vs/workbench/services/extensions/electron-sandbox/extensionHostProfiler';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { IFileService } from 'vs/platform/files/common/files';
import { VSBuffer } from 'vs/base/common/buffer';
import { timeout } from 'vs/base/common/async';
import { bottomUp, buildModel } from 'vs/platform/profiling/common/profilingModel';
import { TernarySearchTree } from 'vs/base/common/ternarySearchTree';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { reportSample } from 'vs/platform/profiling/common/profilingTelemetrySpec';
import { generateUuid } from 'vs/base/common/uuid';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class ExtensionsAutoProfiler implements IWorkbenchContribution {

	private readonly _blame = new Set<string>();

	private _session: CancellationTokenSource | undefined;
	private _unresponsiveListener: IDisposable | undefined;
	private _perfBaseline: number = -1;

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IExtensionHostProfileService private readonly _extensionProfileService: IExtensionHostProfileService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IEditorService private readonly _editorService: IEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@INativeWorkbenchEnvironmentService private readonly _environmentServie: INativeWorkbenchEnvironmentService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IFileService private readonly _fileService: IFileService,
		@ITimerService timerService: ITimerService
	) {

		timerService.perfBaseline.then(value => {
			if (value < 0) {
				return; // too slow for profiling
			}
			this._perfBaseline = value;
			this._unresponsiveListener = _extensionService.onDidChangeResponsiveChange(this._onDidChangeResponsiveChange, this);
		});
	}

	dispose(): void {
		this._unresponsiveListener?.dispose();
		this._session?.dispose(true);
	}

	private async _onDidChangeResponsiveChange(event: IResponsiveStateChangeEvent): Promise<void> {
		if (event.extensionHostKind !== ExtensionHostKind.LocalProcess) {
			return;
		}

		const port = await this._extensionService.getInspectPort(event.extensionHostId, true);

		if (!port) {
			return;
		}

		if (event.isResponsive && this._session) {
			// stop profiling when responsive again
			this._session.cancel();
			this._logService.info('UNRESPONSIVE extension host: received responsive event and cancelling profiling session');


		} else if (!event.isResponsive && !this._session) {
			// start profiling if not yet profiling
			const cts = new CancellationTokenSource();
			this._session = cts;


			let session: ProfileSession;
			try {
				session = await this._instantiationService.createInstance(ExtensionHostProfiler, port).start();

			} catch (err) {
				this._session = undefined;
				// fail silent as this is often
				// caused by another party being
				// connected already
				return;
			}
			this._logService.info('UNRESPONSIVE extension host: starting to profile NOW');

			// wait 5 seconds or until responsive again
			try {
				await timeout(5e3, cts.token);
			} catch {
				// can throw cancellation error. that is
				// OK, we stop profiling and analyse the
				// profile anyways
			}

			try {
				// stop profiling and analyse results
				this._processCpuProfile(await session.stop());
			} catch (err) {
				onUnexpectedError(err);
			} finally {
				this._session = undefined;
			}
		}
	}

	private async _processCpuProfile(profile: IExtensionHostProfile) {

		// get all extensions
		await this._extensionService.whenInstalledExtensionsRegistered();
		const extensions = this._extensionService.extensions;
		const searchTree = TernarySearchTree.forUris<IExtensionDescription>();
		for (const extension of extensions) {
			if (extension.extensionLocation.scheme === Schemas.file) {
				searchTree.set(URI.file(extension.extensionLocation.fsPath), extension);
			}
		}

		// associate extensions to profile node
		const model = buildModel(profile.data);
		const extensionTimes = new Map<string, number>();
		for (const node of model.nodes) {
			const loc = model.locations[node.locationId];
			let extension: IExtensionDescription | undefined;
			try {
				extension = searchTree.findSubstr(URI.parse(loc.callFrame.url));
			} catch {
				// ignore
			}
			if (extension) {
				const key = ExtensionIdentifier.toKey(extension.identifier);
				const value = extensionTimes.get(key) ?? 0;
				extensionTimes.set(key, value + node.selfTime);
			}
		}

		// find max
		let top: string = '';
		let topAggregation = -1;
		for (const [id, aggregated] of extensionTimes) {
			if (aggregated > topAggregation) {
				topAggregation = aggregated;
				top = id;
			}
		}
		const topPercentage = topAggregation / (model.duration / 100);


		const extension = await this._extensionService.getExtension(top);
		if (!extension) {
			// not an extension => idle, gc, self?
			return;
		}


		const sessionId = generateUuid();

		// print message to log
		const path = joinPath(this._environmentServie.tmpDir, `exthost-${Math.random().toString(16).slice(2, 8)}.cpuprofile`);
		await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(profile.data)));
		this._logService.warn(`UNRESPONSIVE extension host: '${top}' took ${topPercentage}% of ${topAggregation / 1e3}ms, saved PROFILE here: '${path}'`);

		type UnresponsiveData = {
			duration: number;
			sessionId: string;
			data: string[];
			id: string;
		};
		type UnresponsiveDataClassification = {
			owner: 'jrieken';
			comment: 'Profiling data that was collected while the extension host was unresponsive';
			sessionId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Identifier of a profiling session' };
			duration: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Duration for which the extension host was unresponsive' };
			data: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Extensions ids and core parts that were active while the extension host was frozen' };
			id: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Top extensions id that took most of the duration' };
		};
		this._telemetryService.publicLog2<UnresponsiveData, UnresponsiveDataClassification>('exthostunresponsive', {
			sessionId,
			duration: model.duration,
			data: Array.from(extensionTimes.keys()),
			id: ExtensionIdentifier.toKey(extension.identifier),
		});

		// send heavy samples
		if (this._configService.getValue('application.experimental.rendererProfiling')) {
			const samples = bottomUp(model, 5, false);
			for (const sample of samples) {
				reportSample(
					{ sample, perfBaseline: this._perfBaseline, source: searchTree.findSubstr(URI.parse(sample.url))?.identifier.value ?? '<<not-found>>' },
					this._telemetryService,
					this._logService
				);
			}
		}

		// add to running extensions view
		this._extensionProfileService.setUnresponsiveProfile(extension.identifier, profile);

		// prompt: when really slow/greedy
		if (!(topPercentage >= 95 && topAggregation >= 5e6)) {
			return;
		}

		const action = await this._instantiationService.invokeFunction(createSlowExtensionAction, extension, profile);

		if (!action) {
			// cannot report issues against this extension...
			return;
		}

		// only blame once per extension, don't blame too often
		if (this._blame.has(ExtensionIdentifier.toKey(extension.identifier)) || this._blame.size >= 3) {
			return;
		}
		this._blame.add(ExtensionIdentifier.toKey(extension.identifier));

		type UnresponsivePromptData = {
			id: string;
		};
		type UnresponsivePromptDataClassification = {
			owner: 'digitarald';
			comment: 'Users got a warning about an extension hanging the extension process';
			expiration: '1.73';
			id: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Extension id that froze the extension process' };
		};
		this._telemetryService.publicLog2<UnresponsivePromptData, UnresponsivePromptDataClassification>('exthostunresponsiveprompt', {
			id: ExtensionIdentifier.toKey(extension.identifier),
		});

		// user-facing message when very bad...
		this._notificationService.prompt(
			Severity.Warning,
			localize(
				'unresponsive-exthost',
				"The extension '{0}' took a very long time to complete its last operation and it has prevented other extensions from running.",
				extension.displayName || extension.name
			),
			[{
				label: localize('show', 'Show Extensions'),
				run: () => this._editorService.openEditor(RuntimeExtensionsInput.instance, { pinned: true })
			},
				action
			],
			{ silent: true }
		);
	}
}
