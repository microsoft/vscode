/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import winjs = require('vs/base/common/winjs.base');
import lifecycle = require('vs/base/common/lifecycle');
import async = require('vs/base/common/async');
import WorkbenchEditorCommon = require('vs/workbench/common/editor');
import stringei = require('vs/workbench/browser/parts/editor/stringEditorInput');
import diffei = require('vs/workbench/browser/parts/editor/diffEditorInput');
import git = require('vs/workbench/parts/git/common/git');
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IEditorInput} from 'vs/platform/editor/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

import IGitService = git.IGitService;

export interface IEditorInputWithStatus {
	getFileStatus():git.IFileStatus;
}

export function isGitEditorInput(input: IEditorInput): boolean {
	return input instanceof GitDiffEditorInput || input instanceof NativeGitIndexStringEditorInput;
}

export class GitDiffEditorInput
	extends diffei.DiffEditorInput
	implements IEditorInputWithStatus
{
	private status: git.IFileStatus;

	constructor(name:string, description:string, originalInput:WorkbenchEditorCommon.EditorInput, modifiedInput:WorkbenchEditorCommon.EditorInput, status:git.IFileStatus) {
		super(name, description, originalInput, modifiedInput);

		this.status = status;
	}

	public getId(): string {
		throw new Error('To implement.');
	}

	public getFileStatus():git.IFileStatus {
		return this.status;
	}

	public contains(otherInput: any): boolean {
		if (this.matches(otherInput)) {
			return true;
		}

		var originalInput = this.getOriginalInput();
		if (originalInput && originalInput.matches(otherInput)) {
			return true;
		}

		var modifiedInput = this.getModifiedInput();
		if (modifiedInput && modifiedInput.matches(otherInput)) {
			return true;
		}

		return false;
	}
}

export class GitWorkingTreeDiffEditorInput extends GitDiffEditorInput {

	static ID = 'Monaco.IDE.UI.Viewlets.GitViewlet.GitWorkingTreeDiffEditorInput';

	constructor(name:string, description:string, originalInput:WorkbenchEditorCommon.EditorInput, modifiedInput:WorkbenchEditorCommon.EditorInput, status:git.IFileStatus) {
		super(name, description, originalInput, modifiedInput, status);
	}

	public getId(): string {
		return GitWorkingTreeDiffEditorInput.ID;
	}
}

export class GitIndexDiffEditorInput extends GitDiffEditorInput {

	static ID:string = 'Monaco.IDE.UI.Viewlets.GitViewlet.GitIndexDiffEditorInput';

	constructor(name:string, description:string, originalInput:WorkbenchEditorCommon.EditorInput, modifiedInput:WorkbenchEditorCommon.EditorInput, status:git.IFileStatus) {
		super(name, description, originalInput, modifiedInput, status);
	}

	public getId(): string {
		return GitIndexDiffEditorInput.ID;
	}
}

export class NativeGitIndexStringEditorInput
	extends stringei.StringEditorInput
	implements IEditorInputWithStatus
{
	public static ID = 'Monaco.IDE.UI.Viewlets.GitViewlet.NativeGitIndexStringEditorInput';

	private gitService: IGitService;
	private editorService: IWorkbenchEditorService;
	private status: git.IFileStatus;
	private path: string;
	private treeish: string;
	private delayer: async.ThrottledDelayer<WorkbenchEditorCommon.EditorModel>;
	private toDispose: lifecycle.IDisposable[];

	constructor(name: any, description: string, mime: string, status: git.IFileStatus, path: string, treeish: string,
		@IGitService gitService: IGitService,
		@IWorkbenchEditorService editorService: IWorkbenchEditorService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(name, description, null, mime, false, instantiationService);

		this.gitService = gitService;
		this.editorService = editorService;
		this.status = status;
		this.path = path;
		this.treeish = treeish;
		this.delayer = new async.ThrottledDelayer<WorkbenchEditorCommon.EditorModel>(1000);

		this.toDispose = [];
		this.toDispose.push(this.gitService.addListener2(git.ServiceEvents.STATE_CHANGED, () => this.onGitServiceStateChange()));
		this.toDispose.push(this.gitService.addListener2(git.ServiceEvents.OPERATION_END, () => this.onGitServiceStateChange()));
	}

	public getId(): string {
		return NativeGitIndexStringEditorInput.ID;
	}

	public getFileStatus(): git.IFileStatus {
		return this.status;
	}

	public resolve(refresh?:boolean):winjs.TPromise<WorkbenchEditorCommon.EditorModel> {
		if (refresh || !this.getValue()) {
			return this.gitService.buffer(this.path, this.treeish).then(contents => {
				if (this.getValue() !== contents) {
					this.setValue(contents);
				}

				return super.resolve(refresh);
			});
		} else {
			return super.resolve(refresh);
		}
	}

	private onGitServiceStateChange(): void {
		var isVisible = this.editorService.isVisible(this, true);
		if (!isVisible) {
			return;
		}

		this.delayer.trigger(() => this.resolve(true));
	}

	public dispose():void {
		if (this.delayer) {
			this.delayer.cancel();
			this.delayer = null;
		}

		this.toDispose = lifecycle.disposeAll(this.toDispose);
		super.dispose();
	}
}
