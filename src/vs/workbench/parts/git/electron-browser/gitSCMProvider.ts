/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { SCMProvider } from 'vs/workbench/services/scm/common/scmProvider';

export class GitSCMProvider extends SCMProvider {

	constructor(
	) {
		super('git', 'Git');
	}

	commit(message: string): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	click(uri: URI): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	drag(from: URI, to: URI): TPromise<void> {
		return TPromise.wrapError<void>('not implemented');
	}

	getOriginalResource(uri: URI): TPromise<URI> {
		return TPromise.wrapError('not implemented');
	}
}