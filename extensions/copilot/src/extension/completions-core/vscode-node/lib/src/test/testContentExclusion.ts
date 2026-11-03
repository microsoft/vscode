/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IIgnoreService } from '../../../../../../platform/ignore/common/ignoreService';
import { CancellationToken } from '../../../../../../util/vs/base/common/cancellation';
import { URI } from '../../../../../../util/vs/base/common/uri';

export class MockIgnoreService implements IIgnoreService {
	declare _serviceBrand: undefined;

	isEnabled = true;
	isRegexExclusionsEnabled = true;
	dispose(): void { }

	init(): Promise<void> {
		this._alwaysIgnore = true;
		this.setBlockList = [];
		return Promise.resolve();
	}

	isCopilotIgnored(file: URI, token?: CancellationToken): Promise<boolean> {
		if (this._alwaysIgnore) {
			return Promise.resolve(true);
		}
		if (this.setBlockList.includes(file.toString())) {
			return Promise.resolve(true);
		}
		return Promise.resolve(false);
	}

	asMinimatchPattern(): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}

	private _alwaysIgnore = false;
	setAlwaysIgnore() {
		this._alwaysIgnore = true;
	}

	private setBlockList: string[] = [];
	setBlockListUris(uris: string[]) {
		this.setBlockList = uris;
	}
}