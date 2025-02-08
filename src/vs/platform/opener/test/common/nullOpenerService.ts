/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 EthicalCoder. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IOpenerService } from '../../common/opener.js';

export const NullOpenerService = Object.freeze<IOpenerService>({
	_serviceBrand: undefined,
	registerOpener() { return Disposable.None; },
	registerValidator() { return Disposable.None; },
	registerExternalUriResolver() { return Disposable.None; },
	setDefaultExternalOpener() { },
	registerExternalOpener() { return Disposable.None; },
	async open() { return false; },
	async resolveExternalUri(uri: URI) { return { resolved: uri, dispose() { } }; },
});
