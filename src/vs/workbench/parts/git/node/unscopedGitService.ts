/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';
import { IRawGitService, IRawStatus, ServiceState, RawServiceState, ICommit } from 'vs/workbench/parts/git/common/git';
import { TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import Event, { Emitter } from 'vs/base/common/event';
import uri from 'vs/base/common/uri';
import { Git } from './git.lib';

export class UnscopedGitService implements IRawGitService {

	private git: Git;

	private _onOutput = new Emitter<string>();
	get onOutput(): Event<string> { return this._onOutput.event; }

	private static STATUS: IRawStatus = {
		repositoryRoot: null,
		state: ServiceState.NotAWorkspace,
		status: [],
		HEAD: null,
		refs: [],
		remotes: []
	};

	constructor(gitPath: string, version: string, defaultEncoding: string, exePath: string) {
		const gitRootPath = uri.parse(require.toUrl('vs/workbench/parts/git/node')).fsPath;
		const bootstrapPath = `${uri.parse(require.toUrl('bootstrap')).fsPath}.js`;
		const env = assign({}, process.env, {
			GIT_ASKPASS: path.join(gitRootPath, 'askpass.sh'),
			VSCODE_GIT_ASKPASS_BOOTSTRAP: bootstrapPath,
			VSCODE_GIT_ASKPASS_NODE: exePath,
			VSCODE_GIT_ASKPASS_MODULE_ID: 'vs/workbench/parts/git/node/askpass'
		});

		this.git = new Git({ gitPath, version, defaultEncoding, env });
	}

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
		return TPromise.as(UnscopedGitService.STATUS);
	}

	init(): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	add(filesPaths?: string[]): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	stage(filePath: string, content: string): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	branch(name: string, checkout?: boolean): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	checkout(treeish?: string, filePaths?: string[]): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	clean(filePaths: string[]): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	undo(): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	reset(treeish: string, hard?: boolean): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	revertFiles(treeish: string, filePaths?: string[]): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	fetch(): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	pull(rebase?: boolean): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	push(): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	sync(): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	commit(message: string, amend?: boolean, stage?: boolean, signoff?: boolean): TPromise<IRawStatus> {
		return TPromise.as(UnscopedGitService.STATUS);
	}

	detectMimetypes(path: string, treeish?: string): TPromise<string[]> {
		return TPromise.as([]);
	}

	show(path: string, treeish?: string): TPromise<string> {
		return TPromise.as(null);
	}

	clone(url: string, parentPath: string): TPromise<string> {
		return this.git.clone(url, parentPath);
	}

	getCommitTemplate(): TPromise<string> {
		return TPromise.as(null);
	}

	getCommit(ref: string): TPromise<ICommit> {
		return TPromise.as(null);
	}
}