/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { onUnexpectedError } from 'vs/base/common/errors';
import { assign, clone } from 'vs/base/common/objects';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { crashReporter } from 'electron';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';
import * as os from 'os';
import { ICrashReporterService, TELEMETRY_SECTION_ID, ICrashReporterConfig } from "vs/workbench/services/crashReporter/common/crashReporterService";
import { isWindows, isMacintosh, isLinux } from "vs/base/common/platform";

export class CrashReporterService implements ICrashReporterService {

	public _serviceBrand: any;

	private options: Electron.CrashReporterStartOptions;

	constructor(
		@ITelemetryService private telemetryService: ITelemetryService,
		@IWindowsService private windowsService: IWindowsService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		const config = configurationService.getConfiguration<ICrashReporterConfig>(TELEMETRY_SECTION_ID);
		if (config.enableCrashReporter) {
			this.startCrashReporter();
		}
	}

	private startCrashReporter(): void {

		// base options
		this.options = {
			companyName: product.crashReporter.companyName,
			productName: product.crashReporter.productName,
			submitURL: this.getSubmitURL()
		};

		// mixin telemetry info and product info
		this.telemetryService.getTelemetryInfo()
			.then(info => {
				assign(this.options, {
					extra: {
						vscode_sessionId: info.sessionId,
						vscode_version: pkg.version,
						vscode_commit: product.commit,
						vscode_machineId: info.machineId
					}
				});

				// start crash reporter right here
				crashReporter.start(clone(this.options));

				// start crash reporter in the main process
				return this.windowsService.startCrashReporter(this.options);
			})
			.done(null, onUnexpectedError);
	}

	private getSubmitURL(): string {
		let submitURL: string;
		if (isWindows) {
			submitURL = product.hockeyApp[`win32-${process.arch}`];
		} else if (isMacintosh) {
			submitURL = product.hockeyApp.darwin;
		} else if (isLinux) {
			submitURL = product.hockeyApp[`linux-${process.arch}`];
		}

		return submitURL;
	}

	public getChildProcessStartOptions(name: string): Electron.CrashReporterStartOptions {

		// Experimental attempt on Mac only for now
		if (isMacintosh) {
			const childProcessOptions = clone(this.options);
			childProcessOptions.extra.processName = name;
			childProcessOptions.crashesDirectory = os.tmpdir();
			return childProcessOptions;
		}

		return void 0;
	}
}