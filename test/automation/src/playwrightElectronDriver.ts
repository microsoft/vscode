/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from '@playwright/test';
import { IDriver, IDisposable } from './driver';
import type { LaunchOptions } from './code';
import { PlaywrightDriver } from './playwrightBrowserDriver';
import { IElectronConfiguration, resolveElectronConfiguration } from './electronDriver';
import { measureAndLog } from './logger';

export async function launch(options: LaunchOptions): Promise<{ client: IDisposable; driver: IDriver }> {

	// Resolve electron config and update
	const { electronPath, args, env } = await resolveElectronConfiguration(options);
	args.push('--enable-smoke-test-driver', 'true');

	// Launch electron via playwright
	const { electron, context, page } = await launchElectron({ electronPath, args, env }, options);

	return {
		client: {
			dispose: () => { /* there is no client to dispose for electron, teardown is triggered via exitApplication call */ }
		},
		driver: new PlaywrightDriver(electron, context, page, undefined /* no server */, options)
	};
}

async function launchElectron(configuration: IElectronConfiguration, options: LaunchOptions) {
	const { logger, tracing } = options;

	const electron = await measureAndLog(playwright._electron.launch({
		executablePath: configuration.electronPath,
		args: configuration.args,
		env: configuration.env as { [key: string]: string }
	}), 'playwright-electron#launch', logger);

	const window = await measureAndLog(electron.firstWindow(), 'playwright-electron#firstWindow', logger);

	const context = window.context();

	if (tracing) {
		try {
			await measureAndLog(context.tracing.start({ screenshots: true, /* remaining options are off for perf reasons */ }), 'context.tracing.start()', logger);
		} catch (error) {
			logger.log(`Failed to start playwright tracing: ${error}`); // do not fail the build when this fails
		}
	}

	window.on('pageerror', async (error) => logger.log(`Playwright ERROR: page error: ${error}`));
	window.on('crash', () => logger.log('Playwright ERROR: page crash'));
	window.on('close', () => logger.log('Playwright: page close'));
	window.on('response', async (response) => {
		if (response.status() >= 400) {
			logger.log(`Playwright ERROR: HTTP status ${response.status()} for ${response.url()}`);
		}
	});

	return { electron, context, page: window };
}
