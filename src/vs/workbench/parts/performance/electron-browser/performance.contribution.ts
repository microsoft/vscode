/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import product from 'vs/platform/node/product';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService } from 'vs/platform/message/common/message';
import { ILifecycleService, LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ReportPerformanceIssueAction } from 'vs/workbench/electron-browser/actions';
import { TPromise } from 'vs/base/common/winjs.base';
import { join } from 'path';
import { localize } from 'vs/nls';
import { toPromise, filterEvent } from 'vs/base/common/event';
import { platform, Platform } from 'vs/base/common/platform';
import { readdir } from 'vs/base/node/pfs';
import { release } from 'os';
import { stopProfiling } from 'vs/base/node/profiler';
import { virtualMachineHint } from 'vs/base/node/id';

class ProfilingHint implements IWorkbenchContribution {

	// p95 to p95 by os&release
	static readonly _percentiles: { [key: string]: [number, number] } = {
		['Windows_6.3.9600']: [35782, 35782],
		['Windows_6.1.7601']: [11160, 18366],
		['Windows_10.0.16199']: [10423, 17222],
		['Windows_10.0.16193']: [7503, 11033],
		['Windows_10.0.16188']: [8544, 8807],
		['Windows_10.0.15063']: [11085, 16837],
		['Windows_10.0.14393']: [12585, 32662],
		['Windows_10.0.10586']: [7047, 10944],
		['Windows_10.0.10240']: [16176, 16176],
		['Mac_16.7.0']: [2192, 4050],
		['Mac_16.6.0']: [8043, 10608],
		['Mac_16.5.0']: [4912, 11348],
		['Mac_16.4.0']: [3900, 4200],
		['Mac_16.3.0']: [7327, 7327],
		['Mac_16.1.0']: [6090, 6555],
		['Mac_16.0.0']: [32574, 32574],
		['Mac_15.6.0']: [16082, 17469],
		['Linux_4.9.0-3-amd64']: [2092, 2197],
		['Linux_4.9.0-2-amd64']: [9779, 9779],
		['Linux_4.8.0-52-generic']: [12803, 13257],
		['Linux_4.8.0-51-generic']: [2670, 2797],
		['Linux_4.8.0-040800-generic']: [3954, 3954],
		['Linux_4.4.0-78-generic']: [4218, 5891],
		['Linux_4.4.0-77-generic']: [6166, 6166],
		['Linux_4.11.2']: [1323, 1323],
		['Linux_4.10.15-200.fc25.x86_64']: [9270, 9480],
		['Linux_4.10.13-1-ARCH']: [7116, 8511],
		['Linux_4.10.11-100.fc24.x86_64']: [1845, 1845],
		['Linux_4.10.0-21-generic']: [14805, 16050],
		['Linux_3.19.0-84-generic']: [4840, 4840],
		['Linux_3.11.10-29-desktop']: [1637, 2891],
	};

	private static readonly _myPercentiles = ProfilingHint._percentiles[`${Platform[platform]}_${release()}`];

	constructor(
		@IWindowsService private readonly _windowsService: IWindowsService,
		@ITimerService private readonly _timerService: ITimerService,
		@IMessageService private readonly _messageService: IMessageService,
		@IEnvironmentService private readonly _envService: IEnvironmentService,
		@IStorageService private readonly _storageService: IStorageService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {

		setTimeout(() => this._checkTimersAndSuggestToProfile(), 5000);
	}

	getId(): string {
		return 'performance.ProfilingHint';
	}

	private _checkTimersAndSuggestToProfile() {

		// Only initial startups, not when already profiling
		if (!this._timerService.isInitialStartup || this._envService.args['prof-startup']) {
			return;
		}

		// Check that we have some data about this
		// OS version to which we can compare this startup.
		// Then only go for startups between the 90 and
		// 95th percentile.
		if (!Array.isArray(ProfilingHint._myPercentiles)) {
			return;
		}
		const [p80, p90] = ProfilingHint._myPercentiles;
		const { ellapsed } = this._timerService.startupMetrics;
		if (ellapsed < p80 || ellapsed > p90) {
			return;
		}

		// Ignore virtual machines and only ask users
		// to profile with a certain propability
		if (virtualMachineHint.value() >= .5 || Math.ceil(Math.random() * 1000) !== 1) {
			return;
		}

		// Don't ask for the stable version, only
		// ask once per version/build
		if (this._envService.appQuality === 'stable') {
			// don't ask in stable
			return;
		}
		const mementoKey = `performance.didPromptToProfile.${product.commit}`;
		const value = this._storageService.get(mementoKey, StorageScope.GLOBAL, undefined);
		if (value !== undefined) {
			// only ask once per version
			return;
		}

		const profile = this._messageService.confirm({
			type: 'info',
			message: localize('slow', "Slow startup detected"),
			detail: localize('slow.detail', "Sorry that you just had a slow startup. Please restart '{0}' with profiling enabled, share the profiles with us, and we will work hard to make startup great again.", this._envService.appNameLong),
			primaryButton: 'Restart and profile'
		});

		this._telemetryService.publicLog('profileStartupInvite', {
			acceptedInvite: profile
		});

		if (profile) {
			this._storageService.store(mementoKey, 'didProfile', StorageScope.GLOBAL);
			this._windowsService.relaunch({ addArgs: ['--prof-startup'] });
		} else {
			this._storageService.store(mementoKey, 'didReject', StorageScope.GLOBAL);
		}
	}
}

class StartupProfiler implements IWorkbenchContribution {

	constructor(
		@IWindowsService private readonly _windowsService: IWindowsService,
		@IMessageService private readonly _messageService: IMessageService,
		@IEnvironmentService private readonly _environmentService: IEnvironmentService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IExtensionService extensionService: IExtensionService,
	) {
		// wait for everything to be ready
		TPromise.join<any>([
			extensionService.onReady(),
			toPromise(filterEvent(lifecycleService.onDidChangePhase, phase => phase === LifecyclePhase.Running)),
		]).then(() => {
			this._stopProfiling();
		});
	}

	getId(): string {
		return 'performance.StartupProfiler';
	}

	private _stopProfiling(): void {

		const { profileStartup } = this._environmentService;
		if (!profileStartup) {
			return;
		}

		stopProfiling(profileStartup.dir, profileStartup.prefix).then(() => {
			readdir(profileStartup.dir).then(files => {
				return files.filter(value => value.indexOf(profileStartup.prefix) === 0);
			}).then(files => {
				const profileFiles = files.reduce((prev, cur) => `${prev}${join(profileStartup.dir, cur)}\n`, '\n');

				const primaryButton = this._messageService.confirm({
					type: 'info',
					message: localize('prof.message', "Successfully created profiles."),
					detail: localize('prof.detail', "Please create an issue and manually attach the following files:\n{0}", profileFiles),
					primaryButton: localize('prof.restartAndFileIssue', "Create Issue and Restart"),
					secondaryButton: localize('prof.restart', "Restart")
				});

				if (primaryButton) {
					const action = this._instantiationService.createInstance(ReportPerformanceIssueAction, ReportPerformanceIssueAction.ID, ReportPerformanceIssueAction.LABEL);
					TPromise.join<any>([
						this._windowsService.showItemInFolder(join(profileStartup.dir, files[0])),
						action.run(`:warning: Make sure to **attach** these files from your *home*-directory: :warning:\n${files.map(file => `-\`${file}\``).join('\n')}`)
					]).then(() => {
						// keep window stable until restart is selected
						this._messageService.confirm({
							type: 'info',
							message: localize('prof.thanks', "Thanks for helping us."),
							detail: localize('prof.detail.restart', "A final restart is required to continue to use '{0}'. Again, thank you for your contribution.", this._environmentService.appNameLong),
							primaryButton: localize('prof.restart', "Restart"),
							secondaryButton: null
						});
						// now we are ready to restart
						this._windowsService.relaunch({ removeArgs: ['--prof-startup'] });
					});

				} else {
					// simply restart
					this._windowsService.relaunch({ removeArgs: ['--prof-startup'] });
				}
			});
		});
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(ProfilingHint);
registry.registerWorkbenchContribution(StartupProfiler);
