/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { ISCMResourceGroup } from 'vs/workbench/services/scm/common/scm';
import { SCMProvider } from 'vs/workbench/services/scm/common/scmProvider';

export class GitSCMProvider extends SCMProvider {

	private mergeGroup: ISCMResourceGroup;
	private indexGroup: ISCMResourceGroup;
	private workingTreeGroup: ISCMResourceGroup;

	constructor(
	) {
		super('git', 'Git');

		this.mergeGroup = this.createResourceGroup('merge', localize('conflict changes', "Conflict Changes"));
		this.indexGroup = this.createResourceGroup('index', localize('staged changes', "Staged Changes"));
		this.workingTreeGroup = this.createResourceGroup('workingtree', localize('changes', "Changes"));

		this.indexGroup.set(
			{ uri: URI.parse('file:///Users/joao/hello.ts') },
			{ uri: URI.parse('file:///Users/joao/cool.ts') },
			{ uri: URI.parse('file:///Users/joao/works.ts') }
		);

		this.workingTreeGroup.set(
			{ uri: URI.parse('file:///Users/joao/works.ts') },
			{ uri: URI.parse('file:///Users/joao/monkey.ts') }
		);
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