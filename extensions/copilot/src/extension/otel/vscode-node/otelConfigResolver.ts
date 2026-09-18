/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace } from 'vscode';
import { IOTelConfigResolver, IResolvedOTelConfig, resolveOTelConfigFromSettings, snapshotOTelEnv } from '../../../platform/otel/common/otelConfigResolution';

export const OTEL_SETTINGS_SECTION = 'github.copilot.chat.otel';

export class VSCodeOTelConfigResolver implements IOTelConfigResolver {
	declare readonly _serviceBrand: undefined;
	private readonly _env: Record<string, string | undefined>;
	readonly activeResolution: IResolvedOTelConfig;

	constructor(
		env: Record<string, string | undefined>,
		private readonly _extensionVersion: string,
		private readonly _sessionId: string,
	) {
		this._env = snapshotOTelEnv(env);
		this.activeResolution = this.resolve();
	}

	resolve(): IResolvedOTelConfig {
		return resolveOTelConfigFromSettings(workspace.getConfiguration(OTEL_SETTINGS_SECTION), this._env, this._extensionVersion, this._sessionId);
	}
}
