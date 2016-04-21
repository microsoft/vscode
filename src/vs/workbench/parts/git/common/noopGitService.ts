/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import git = require('vs/workbench/parts/git/common/git');
import { TPromise } from 'vs/base/common/winjs.base';
import Event, { Emitter } from 'vs/base/common/event';

export class NoOpGitService implements git.IRawGitService {

	private _onOutput = new Emitter<string>();
	get onOutput(): Event<string> { return this._onOutput.event; }

	private static STATUS:git.IRawStatus = {
		repositoryRoot: null,
		state: git.ServiceState.NotAWorkspace,
		status: [],
		HEAD: null,
		heads: [],
		tags: [],
		remotes: []
	};

	getVersion(): TPromise<string> {
		return TPromise.as(null);
	}

	serviceState(): TPromise<git.RawServiceState> {
		return TPromise.as(git.RawServiceState.OK);
	}

	status(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	init(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	add(filesPaths?: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	stage(filePath: string, content: string): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	branch(name: string, checkout?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	checkout(treeish?: string, filePaths?: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	clean(filePaths: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	undo(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	reset(treeish: string, hard?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	revertFiles(treeish: string, filePaths?: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	fetch(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	pull(rebase?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	push(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	sync(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	commit(message: string, amend?: boolean, stage?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	detectMimetypes(path: string, treeish?: string): TPromise<string[]> {
		return TPromise.as([]);
	}

	show(path: string, treeish?: string): TPromise<string> {
		return TPromise.as(null);
	}
}