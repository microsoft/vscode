/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import git = require('vs/workbench/parts/git/common/git');
import { Promise, TPromise } from 'vs/base/common/winjs.base';

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

	getVersion(): TPromise<string> {
		return TPromise.as(null);
	}

	public serviceState(): TPromise<git.RawServiceState> {
		return TPromise.as(git.RawServiceState.OK);
	}

	public status(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public init(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public add(filesPaths?: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public stage(filePath: string, content: string): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public branch(name: string, checkout?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public checkout(treeish?: string, filePaths?: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public clean(filePaths: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public undo(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public reset(treeish: string, hard?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public revertFiles(treeish: string, filePaths?: string[]): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public fetch(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public pull(rebase?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public push(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public sync(): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public commit(message: string, amend?: boolean, stage?: boolean): TPromise<git.IRawStatus> {
		return TPromise.as(NoOpGitService.STATUS);
	}

	public detectMimetypes(path: string, treeish?: string): TPromise<string[]> {
		return TPromise.as([]);
	}

	public show(path: string, treeish?: string): TPromise<string> {
		return TPromise.as(null);
	}

	public onOutput(): Promise {
		return TPromise.as(() => null);
	}
}