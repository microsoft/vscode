/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotClient, RuntimeConnection } from '@github/copilot-sdk';
import * as os from 'os';
import { resolve } from '../../../../base/common/path.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { getCopilotHomePath } from '../../../environment/common/copilotHome.js';
import { ConsoleLogger, LogLevel } from '../../../log/common/log.js';
import { LogService } from '../../../log/common/logService.js';
import { getAppNodeModulesUri } from '../appNodeModules.js';
import { resolveCopilotRuntimePaths } from './copilotRuntimePaths.js';
import { CopilotSandboxCertificate } from './copilotSandboxCertificate.js';

type CertificateCommand = 'create' | 'trust' | 'remove' | 'status';

/** Executes one certificate RPC without creating a chat, and always stops its owned runtime. */
export async function executeCopilotCertificateCommand(
	command: CertificateCommand,
	client: Pick<CopilotClient, 'start' | 'stop' | 'rpc'>,
	certificates: CopilotSandboxCertificate,
	write: (message: string) => void,
): Promise<number> {
	let code = 1;
	let output: string | undefined;
	const errors: unknown[] = [];
	try {
		await client.start();
		const rpc = client.rpc.sandbox.proxyCa;
		switch (command) {
			case 'create':
				output = (await certificates.createForHost(rpc)).certificatePath;
				code = 0;
				break;
			case 'trust':
				await certificates.trustForHost(rpc);
				output = localize('copilot.sandboxCertificate.cliTrusted', "The sandbox certificate is trusted. Restart affected tools. Select Refresh in the remote chat's certificate notice. If Refresh is unavailable, restart the agent host and reconnect.");
				code = 0;
				break;
			case 'remove':
				await certificates.removeForHost(rpc);
				output = localize('copilot.sandboxCertificate.cliRemoved', "The sandbox certificate was removed from OS trust. The stored CA and private key were retained. Restart affected tools. Select Refresh in the remote chat's certificate notice. If Refresh is unavailable, restart the agent host and reconnect.");
				code = 0;
				break;
			case 'status': {
				const status = await certificates.getStatusForHost(rpc);
				output = status.detail ? `${status.state}: ${status.detail}` : status.state;
				switch (status.state) {
					case 'installed': code = status.detail === undefined ? 0 : 5; break;
					case 'notInstalled': code = status.detail === undefined ? 3 : 5; break;
					case 'unsupported': code = 4; break;
					default: code = 1;
				}
				break;
			}
		}
	} catch (error) {
		errors.push(error);
	} finally {
		try {
			errors.push(...await client.stop());
		} catch (error) {
			errors.push(error);
		}
	}
	if (errors.length) {
		throw new AggregateError(errors, errors.map(getErrorMessage).join('\n'));
	}
	if (output !== undefined) {
		write(output);
	}
	return code;
}

/** One-shot local CLI entry point; no AHP listener or persistent supervisor is started. */
export async function runAgentHostCertificateCommand(command: string, confirmed: boolean): Promise<number> {
	if (command !== 'create' && command !== 'trust' && command !== 'remove' && command !== 'status') {
		throw new Error(localize('copilot.sandboxCertificate.cliInvalid', "Expected a certificate command: create, trust, remove, or status."));
	}
	if (command === 'trust' && !confirmed) {
		throw new Error(localize('copilot.sandboxCertificate.cliConsent', "Certificate trust requires explicit confirmation."));
	}
	if (command === 'remove' && !confirmed) {
		throw new Error(localize('copilot.sandboxCertificate.cliRemoveConsent', "Certificate removal requires explicit confirmation."));
	}

	const home = resolve(getCopilotHomePath(os.homedir(), process.env));
	console.error(localize('copilot.sandboxCertificate.cliHome', "Using Copilot home on this computer: {0}", home));
	const { runtimePath } = await resolveCopilotRuntimePaths(getAppNodeModulesUri());
	const store = new DisposableStore();
	try {
		const logService = store.add(new LogService(store.add(new ConsoleLogger(LogLevel.Warning))));
		const certificates = new CopilotSandboxCertificate(logService);
		const client = new CopilotClient({
			connection: RuntimeConnection.forStdio({ path: runtimePath }),
			baseDirectory: home,
			workingDirectory: os.homedir(),
			mode: 'empty',
			useLoggedInUser: false,
		});
		return await executeCopilotCertificateCommand(command, client, certificates, message => console.log(message));
	} catch (error) {
		console.error(getErrorMessage(error));
		return 1;
	} finally {
		store.dispose();
	}
}
