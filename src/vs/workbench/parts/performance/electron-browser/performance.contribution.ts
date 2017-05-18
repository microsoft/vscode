/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { virtualMachineHint } from 'vs/base/node/id';
import { Registry } from 'vs/platform/platform';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IMessageService } from 'vs/platform/message/common/message';
import { ITimerService } from 'vs/workbench/services/timer/common/timerService';
import { IWorkbenchContributionsRegistry, IWorkbenchContribution, Extensions } from 'vs/workbench/common/contributions';
import product from 'vs/platform/node/product';
import { platform, Platform } from 'vs/base/common/platform';
import { release } from 'os';


class ProfilingHint implements IWorkbenchContribution {

	// p80 to p90 by os&release
	static readonly _percentiles: { [key: string]: [number, number] } = {
		['Linux_4.10.0-20-generic']: [3474, 6300],
		['Linux_4.10.0-21-generic']: [5342, 12022],
		['Linux_4.10.13-1-ARCH']: [3047, 4248],
		['Linux_4.10.13-200.fc25.x86_64']: [2380, 2895],
		['Linux_4.10.14-200.fc25.x86_64']: [5164, 14042],
		['Linux_4.4.0-21-generic']: [3777, 8160],
		['Linux_4.4.0-72-generic']: [6173, 10730],
		['Linux_4.4.0-75-generic']: [4769, 8560],
		['Linux_4.4.0-77-generic']: [3834, 7343],
		['Linux_4.4.0-78-generic']: [3115, 7078],
		['Linux_4.8.0-49-generic']: [7174, 10362],
		['Linux_4.8.0-51-generic']: [3906, 7385],
		['Linux_4.8.0-52-generic']: [6757, 13741],
		['Linux_4.9.0-2-amd64']: [4348, 8754],
		['Mac_14.5.0']: [4403, 7216],
		['Mac_15.4.0']: [3831, 4946],
		['Mac_15.5.0']: [5080, 8296],
		['Mac_15.6.0']: [4621, 7160],
		['Mac_16.0.0']: [4748, 11248],
		['Mac_16.1.0']: [4309, 6106],
		['Mac_16.3.0']: [2756, 3674],
		['Mac_16.4.0']: [3625, 5463],
		['Mac_16.5.0']: [3617, 5288],
		['Mac_16.6.0']: [3655, 5279],
		['Mac_16.7.0']: [4415, 6624],
		['Windows_10.0.10240']: [8284, 14438],
		['Windows_10.0.10586']: [5903, 9224],
		['Windows_10.0.14393']: [6065, 10567],
		['Windows_10.0.15063']: [5521, 8696],
		['Windows_10.0.16184']: [5604, 10671],
		['Windows_10.0.16188']: [7028, 12852],
		['Windows_10.0.16193']: [6431, 9628],
		['Windows_6.1.7601']: [7794, 15194],
		['Windows_6.3.9600']: [6129, 10188],
	};

	private static readonly _myPercentiles = ProfilingHint._percentiles[`${Platform[platform]}_${release()}`];

	constructor(
		@IWindowsService private _windowsService: IWindowsService,
		@ITimerService private _timerService: ITimerService,
		@IMessageService private _messageService: IMessageService,
		@IEnvironmentService private _envService: IEnvironmentService,
		@IStorageService private _storageService: IStorageService
	) {

		setTimeout(() => this._checkTimersAndSuggestToProfile(), 5000);
	}

	getId(): string {
		return 'performance';
	}

	private _checkTimersAndSuggestToProfile() {

		// Only initial startups, not when already profiling
		if (!this._timerService.isInitialStartup || this._envService.args['prof-startup']) {
			return;
		}

		// Check that we have some data about this
		// OS version to which we can compare this startup.
		// Then only go for startups between the 80th and
		// 90th percentile.
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
		if (virtualMachineHint.value() >= .5 || Math.ceil(Math.random() * 50) !== 1) {
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

		if (profile) {
			this._storageService.store(mementoKey, 'didProfile', StorageScope.GLOBAL);
			this._windowsService.relaunch({ addArgs: ['--prof-startup'] });
		} else {
			this._storageService.store(mementoKey, 'didReject', StorageScope.GLOBAL);
		}
	}
}

const registry = Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench);
registry.registerWorkbenchContribution(ProfilingHint);
