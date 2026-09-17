/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type tt from 'typescript/lib/tsserverlibrary';

let _ts: typeof tt | undefined;

function TS(): typeof tt {
	if (_ts === undefined) {
		throw new Error('tsserverlibrary not loaded yet');
	}
	return _ts;
}
namespace TS {
	export function install(ts: typeof tt) {
		_ts = ts;
	}
}
export default TS;