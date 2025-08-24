/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as erdos from 'erdos';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { currentRBinary, makeMetadata, rRuntimeDiscoverer } from './provider';
import { RInstallation, RMetadataExtra, ReasonDiscovered, friendlyReason } from './r-installation';
import { RSession, createJupyterKernelExtra } from './session';
import { createJupyterKernelSpec } from './kernel-spec';
import { LOGGER } from './extension';
import { ERDOS_R_INTERPRETERS_DEFAULT_SETTING_KEY } from './constants';
import { getDefaultInterpreterPath } from './interpreter-settings.js';
import { dirname } from 'path';

export class RRuntimeManager implements erdos.LanguageRuntimeManager {

	private readonly onDidDiscoverRuntimeEmitter = new vscode.EventEmitter<erdos.LanguageRuntimeMetadata>();

	constructor(private readonly _context: vscode.ExtensionContext) {
		this.onDidDiscoverRuntime = this.onDidDiscoverRuntimeEmitter.event;
	}

	onDidDiscoverRuntime: vscode.Event<erdos.LanguageRuntimeMetadata>;

	discoverAllRuntimes(): AsyncGenerator<erdos.LanguageRuntimeMetadata> {
		return rRuntimeDiscoverer();
	}

	registerLanguageRuntime(runtime: erdos.LanguageRuntimeMetadata): void {
		this.onDidDiscoverRuntimeEmitter.fire(runtime);
	}

	async recommendedWorkspaceRuntime(): Promise<erdos.LanguageRuntimeMetadata | undefined> {
		const defaultInterpreterPath = getDefaultInterpreterPath();
		if (defaultInterpreterPath) {
			if (fs.existsSync(defaultInterpreterPath)) {
				LOGGER.info(`[recommendedWorkspaceRuntime] Recommending R runtime from '${ERDOS_R_INTERPRETERS_DEFAULT_SETTING_KEY}' setting: ${defaultInterpreterPath}`);
				const inst = new RInstallation(defaultInterpreterPath, undefined, [ReasonDiscovered.userSetting]);
				return makeMetadata(inst, erdos.LanguageRuntimeStartupBehavior.Implicit);
			} else {
				LOGGER.info(`[recommendedWorkspaceRuntime] Path from '${ERDOS_R_INTERPRETERS_DEFAULT_SETTING_KEY}' setting does not exist: ${defaultInterpreterPath}...cannot recommend R runtime`);
			}
		} else {
			LOGGER.debug(`[recommendedWorkspaceRuntime] '${ERDOS_R_INTERPRETERS_DEFAULT_SETTING_KEY}' setting not set...cannot recommend R runtime`);
		}
		return undefined;
	}

	createSession(
		runtimeMetadata: erdos.LanguageRuntimeMetadata,
		sessionMetadata: erdos.RuntimeSessionMetadata): Thenable<erdos.LanguageRuntimeSession> {

		const metadataExtra = runtimeMetadata.extraRuntimeData as RMetadataExtra;
		const kernelExtra = createJupyterKernelExtra();
		const kernelSpec = createJupyterKernelSpec(
			metadataExtra.homepath,
			runtimeMetadata.runtimeName,
			sessionMetadata.sessionMode);
		const session = new RSession(runtimeMetadata,
			sessionMetadata,
			kernelSpec,
			kernelExtra);

		this.updateEnvironment(runtimeMetadata);

		return Promise.resolve(session);
	}

	updateEnvironment(metadata: erdos.LanguageRuntimeMetadata) {
		const collection = this._context.environmentVariableCollection;

		const metadataExtra = metadata.extraRuntimeData as RMetadataExtra;
		if (!metadataExtra || !metadataExtra.scriptpath) {
			return;
		}

		const currentQuartoR = collection.get('QUARTO_R');
		const scriptPath = dirname(metadataExtra.scriptpath);
		if (currentQuartoR?.value !== scriptPath) {
			collection.replace('QUARTO_R', scriptPath);
			LOGGER.debug(`Updated QUARTO_R environment variable to ${scriptPath}`);
		}
	}

	async validateMetadata(metadata: erdos.LanguageRuntimeMetadata): Promise<erdos.LanguageRuntimeMetadata> {
		const metadataExtra = metadata.extraRuntimeData as RMetadataExtra;

		if (!metadataExtra) {
			throw new Error('R metadata is missing extra fields needed for validation');
		}
		if (!metadataExtra.homepath) {
			throw new Error('R metadata is missing home path');
		}
		if (!metadataExtra.binpath) {
			throw new Error('R metadata is missing bin path');
		}

		const curBin = await currentRBinary();

		let inst: RInstallation;
		if (curBin && metadataExtra.current) {
			curBin.reasons.unshift(ReasonDiscovered.affiliated);
			inst = new RInstallation(curBin.path, true, curBin.reasons);
		} else {
			inst = new RInstallation(metadataExtra.binpath, curBin?.path === metadataExtra.binpath, [ReasonDiscovered.affiliated]);
		}

		if (!inst.usable) {
			throw new Error(`R installation at ${metadataExtra.binpath} is not usable. Reason: ${friendlyReason(inst.reasonRejected)}`);
		}

		return Promise.resolve(makeMetadata(inst, erdos.LanguageRuntimeStartupBehavior.Immediate));
	}

	async validateSession(sessionId: string): Promise<boolean> {
		const ext = vscode.extensions.getExtension('erdos.erdos-supervisor');
		if (!ext) {
			throw new Error('Erdos Supervisor extension not found');
		}
		if (!ext.isActive) {
			await ext.activate();
		}
		return ext.exports.validateSession(sessionId);
	}

	restoreSession(
		runtimeMetadata: erdos.LanguageRuntimeMetadata,
		sessionMetadata: erdos.RuntimeSessionMetadata,
		sessionName: string): Thenable<erdos.LanguageRuntimeSession> {

		const session = new RSession(runtimeMetadata, sessionMetadata, undefined, undefined, sessionName);

		this.updateEnvironment(runtimeMetadata);

		return Promise.resolve(session);
	}
}
