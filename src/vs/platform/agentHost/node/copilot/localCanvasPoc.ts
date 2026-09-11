/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { lstatSync, realpathSync } from 'fs';
import type { CopilotClientOptions } from '@github/copilot-sdk';
import { isAbsolute, join, parse, resolve } from '../../../../base/common/path.js';
import { Schemas } from '../../../../base/common/network.js';
import { isWindows } from '../../../../base/common/platform.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { AgentHostLaunchKind, AgentHostLaunchKindEnvVar } from '../../common/agentHostTelemetry.js';
import { localCanvasPocWorkspaceMessage } from '../../common/localCanvasPoc.js';

export const LocalCanvasPocRootEnvVar = 'VSCODE_LOCAL_CANVAS_POC_ROOT';

/** A fork-only environment; the caller's UI process environment is never modified. */
export function createLocalCanvasPocHostEnvironment(isBuilt: boolean, environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
	const result = { ...environment };
	LocalCanvasPoc.forHost(isBuilt, result)?.applyEnvironment(result);
	return result;
}

/** A reviewed, fixture-owned development home, not an arbitrary-extension trust boundary. */
export class LocalCanvasPoc {
	private constructor(
		readonly root: string,
		readonly home: string,
		readonly copilotHome: string,
		readonly workspace: URI,
	) { }

	get clientOptions(): Pick<CopilotClientOptions, 'workingDirectory' | 'baseDirectory'> {
		return { workingDirectory: this.workspace.fsPath, baseDirectory: this.copilotHome };
	}

	static forCurrentHost(environment: NodeJS.ProcessEnv = process.env): LocalCanvasPoc | undefined {
		return LocalCanvasPoc.forHost(!environment.VSCODE_DEV, environment);
	}

	static forHost(isBuilt: boolean, environment: NodeJS.ProcessEnv): LocalCanvasPoc | undefined {
		if (isBuilt || environment[AgentHostLaunchKindEnvVar] !== AgentHostLaunchKind.VSCodeMainProcess || !environment[LocalCanvasPocRootEnvVar]) {
			return undefined;
		}
		const poc = LocalCanvasPoc.read(false, environment);
		if (!poc) {
			throw new Error('The local canvas demo root is invalid; refusing to run sessions in this dedicated process.');
		}
		return poc;
	}

	static read(isBuilt: boolean, environment: NodeJS.ProcessEnv = process.env): LocalCanvasPoc | undefined {
		const root = environment[LocalCanvasPocRootEnvVar];
		if (isBuilt || environment[AgentHostLaunchKindEnvVar] !== AgentHostLaunchKind.VSCodeMainProcess || !root || !isAbsolute(root) || root === parse(root).root) {
			return undefined;
		}
		const home = join(root, 'home');
		const copilotHome = join(root, 'copilot-home');
		const workspace = join(root, 'workspace');
		try {
			for (const directory of [root, home, join(home, '.config'), copilotHome, join(copilotHome, 'extensions'), workspace]) {
				if (!lstatSync(directory).isDirectory() || realpathSync(directory) !== resolve(directory)) {
					return undefined;
				}
			}
		} catch {
			return undefined;
		}
		return new LocalCanvasPoc(root, home, copilotHome, URI.file(workspace));
	}

	allows(workingDirectory: URI | undefined, additionalDirectories?: readonly URI[]): boolean {
		if (!workingDirectory || workingDirectory.scheme !== Schemas.file || !isEqual(workingDirectory, this.workspace) || additionalDirectories?.length) {
			return false;
		}
		try {
			return realpathSync(workingDirectory.fsPath) === this.workspace.fsPath;
		} catch {
			return false;
		}
	}

	assertWorkingDirectories(workingDirectories: readonly URI[] | undefined): void {
		if (!this.allows(workingDirectories?.[0], workingDirectories?.slice(1))) {
			throw new Error(localCanvasPocWorkspaceMessage(this.workspace, workingDirectories));
		}
	}

	applyEnvironment(environment: Record<string, string | undefined>): void {
		const overrides: Record<string, string> = {
			HOME: this.home,
			USERPROFILE: this.home,
			COPILOT_HOME: this.copilotHome,
			XDG_CONFIG_HOME: join(this.home, '.config'),
			XDG_DATA_HOME: join(this.home, '.local', 'share'),
			XDG_CACHE_HOME: join(this.home, '.cache'),
			XDG_STATE_HOME: join(this.home, '.local', 'state'),
			APPDATA: join(this.home, 'AppData', 'Roaming'),
			LOCALAPPDATA: join(this.home, 'AppData', 'Local'),
			GH_CONFIG_DIR: join(this.home, '.config', 'gh'),
			COPILOT_DISABLE_KEYTAR: '1',
			...(isWindows ? { HOMEDRIVE: this.home.slice(0, 2), HOMEPATH: this.home.slice(2).replace(/\//g, '\\') } : {}),
		};
		for (const key of Object.keys(environment)) {
			if (Object.hasOwn(overrides, key.toUpperCase())) {
				delete environment[key];
			}
		}
		Object.assign(environment, overrides);
	}
}
