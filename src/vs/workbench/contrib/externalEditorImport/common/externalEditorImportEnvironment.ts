/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinux, isMacintosh, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IExternalEditorImportEnvironmentService = createDecorator<IExternalEditorImportEnvironmentService>('externalEditorImportEnvironmentService');

export interface IExternalEditorImportEnvironmentService {
	readonly _serviceBrand: undefined;

	getApplicationDataHome(home: URI): Promise<URI | undefined>;
}

export class ExternalEditorImportEnvironmentService implements IExternalEditorImportEnvironmentService {
	declare readonly _serviceBrand: undefined;

	getApplicationDataHome(home: URI): Promise<URI | undefined> {
		if (isWindows) {
			return Promise.resolve(URI.joinPath(home, 'AppData', 'Roaming'));
		}
		if (isMacintosh) {
			return Promise.resolve(URI.joinPath(home, 'Library', 'Application Support'));
		}
		if (isLinux) {
			return Promise.resolve(URI.joinPath(home, '.config'));
		}
		return Promise.resolve(undefined);
	}
}