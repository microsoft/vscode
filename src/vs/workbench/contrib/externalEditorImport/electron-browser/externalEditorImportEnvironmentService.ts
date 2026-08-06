/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IExternalEditorImportEnvironmentService, ExternalEditorImportEnvironmentService } from '../common/externalEditorImportEnvironment.js';
import { IShellEnvironmentService } from '../../../services/environment/electron-browser/shellEnvironmentService.js';

export class NativeExternalEditorImportEnvironmentService extends ExternalEditorImportEnvironmentService {
	constructor(
		@IShellEnvironmentService private readonly shellEnvironmentService: IShellEnvironmentService,
	) {
		super();
	}

	override async getApplicationDataHome(home: URI): Promise<URI | undefined> {
		const environment = await this.shellEnvironmentService.getShellEnv();
		if (isWindows && environment.APPDATA) {
			return URI.file(environment.APPDATA);
		}
		if (isLinux && environment.XDG_CONFIG_HOME) {
			return URI.file(environment.XDG_CONFIG_HOME);
		}
		return super.getApplicationDataHome(home);
	}
}

registerSingleton(IExternalEditorImportEnvironmentService, NativeExternalEditorImportEnvironmentService, InstantiationType.Delayed);