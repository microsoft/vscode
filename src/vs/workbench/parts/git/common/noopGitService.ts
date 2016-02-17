/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import git = require('vs/workbench/parts/git/common/git');
import winjs = require('vs/base/common/winjs.base');

export class NoOpGitService implements git.IRawGitService {
	private static STATUS:git.IRawStatus = {
		repositoryRoot: null,
		state: git.ServiceState.NotAWorkspace,
		status: [],
		HEAD: null,
		heads: [],
		tags: [],
		remotes: []
	};

	public serviceState(): winjs.TPromise<git.RawServiceState> {
		return winjs.TPromise.as(git.RawServiceState.OK);
	}

	public status(): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public init(): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public add(filesPaths?: string[]): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public stage(filePath: string, content: string): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public branch(name: string, checkout?: boolean): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public checkout(treeish?: string, filePaths?: string[]): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public clean(filePaths: string[]): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public undo(): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public reset(treeish: string, hard?: boolean): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public revertFiles(treeish: string, filePaths?: string[]): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public fetch(): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public pull(rebase?: boolean): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public push(): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public sync(): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public commit(message: string, amend?: boolean, stage?: boolean): winjs.TPromise<git.IRawStatus> {
		return winjs.TPromise.as(NoOpGitService.STATUS);
	}

	public detectMimetypes(path: string, treeish?: string): winjs.TPromise<string[]> {
		return winjs.TPromise.as([]);
	}

	public show(path: string, treeish?: string): winjs.TPromise<string> {
		return winjs.TPromise.as(null);
	}

	public onOutput(): winjs.Promise {
		return winjs.TPromise.as(()=><any>null);
	}
}