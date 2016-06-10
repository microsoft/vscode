/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IRawGitService, IRawStatus, ServiceState, RawServiceState } from 'vs/workbench/parts/git/common/git';
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';

export class NoOpGitService implements IRawGitService {

	private _onOutput = new Emitter<string>();
	get onOutput(): Event<string> { return this._onOutput.event; }

	private static STATUS:IRawStatus = {
		repositoryRoot: null,
		state: ServiceState.NotAWorkspace,
		status: [],
		HEAD: null,
		refs: [],
		remotes: []
	};

	getVersion(): TPromise<string> {
		return TPromise.as(null);
	}

	serviceState(): TPromise<RawServiceState> {
		return TPromise.as(RawServiceState.OK);
	}

	statusCount(): TPromise<number> {
		return TPromise.as(0);
	}

	status(): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	init(): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	add(filesPaths?: string[]): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	stage(filePath: string, content: string): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	branch(name: string, checkout?: boolean): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	clean(filePaths: string[]): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	undo(): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	reset(treeish: string, hard?: boolean): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	fetch(): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	pull(rebase?: boolean): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	push(): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	sync(): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	commit(message: string, amend?: boolean, stage?: boolean): TPromise<IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	detectMimetypes(path: string, treeish?: string): TPromise<string[]> {
		return TPromise.as([]);
	}

	show(path: string, treeish?: string): TPromise<string> {
		return TPromise.as(null);
	}
}