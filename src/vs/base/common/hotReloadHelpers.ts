/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isHotReloadEnabled, registerHotReloadHandler } from 'vs/base/common/hotReload';
import { IReader, observableSignalFromEvent } from 'vs/base/common/observable';

export function readHotReloadableExport<T>(value: T, reader: IReader | undefined): T {
	observeHotReloadableExports([value], reader);
	return value;
}

export function observeHotReloadableExports(values: any[], reader: IReader | undefined): void {
	if (isHotReloadEnabled()) {
		const o = observableSignalFromEvent(
			'reload',
			event => registerHotReloadHandler(({ oldExports }) => {
				if (![...Object.values(oldExports)].some(v => values.includes(v))) {
					return undefined;
				}
				return (_newExports) => {
					event(undefined);
					return true;
				};
			})
		);
		o.read(reader);
	}
}
