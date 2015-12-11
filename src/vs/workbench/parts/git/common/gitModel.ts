/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Lifecycle = require('vs/base/common/lifecycle');
import Strings = require('vs/base/common/strings');
import EventEmitter = require('vs/base/common/eventEmitter');
import Git = require('vs/workbench/parts/git/common/git');

export class FileStatus implements Git.IFileStatus {

	private id: string;
	private pathComponents: string[];

	constructor(
		private path: string,
		private mimetype: string,
		private status: Git.Status,
		private rename?: string,
		isModifiedInIndex?: boolean
	) {
		this.id = FileStatus.typeOf(status) + ':' + path + (rename ? ':' + rename : '') + (isModifiedInIndex ? '$' : '');
		this.pathComponents = path.split('/');
	}

	public getPath(): string {
		return this.path;
	}

	public getPathComponents(): string[] {
		return this.pathComponents.slice(0);
	}

	public getMimetype(): string {
		return this.mimetype;
	}

	public getStatus(): Git.Status {
		return this.status;
	}

	public getRename(): string {
		return this.rename;
	}

	public getId(): string {
		return this.id;
	}

	public getType(): Git.StatusType {
		switch (FileStatus.typeOf(this.status)) {
			case 'index': return Git.StatusType.INDEX;
			case 'workingTree': return Git.StatusType.WORKING_TREE;
			default: return Git.StatusType.MERGE;
		}
	}

	public clone(): Git.IFileStatus {
		return new FileStatus(this.path, this.mimetype, this.status, this.rename);
	}

	public update(other: FileStatus): void {
		this.status = other.getStatus();
		this.rename = other.getRename();
	}

	static typeOf(s: Git.Status): string {
		switch (s) {
			case Git.Status.INDEX_MODIFIED:
			case Git.Status.INDEX_ADDED:
			case Git.Status.INDEX_DELETED:
			case Git.Status.INDEX_RENAMED:
			case Git.Status.INDEX_COPIED:
				return 'index';

			case Git.Status.MODIFIED:
			case Git.Status.DELETED:
			case Git.Status.UNTRACKED:
			case Git.Status.IGNORED:
				return 'workingTree';

			default:
				return 'merge';
		}
	}
}

interface IStatusSet {
	[path: string]: Git.IFileStatus;
}

export class StatusGroup extends EventEmitter.EventEmitter implements Git.IStatusGroup {

	private type: Git.StatusType;
	private statusSet: IStatusSet;
	private statusList: Git.IFileStatus[];
	private statusByName: IStatusSet;
	private statusByRename: IStatusSet;

	constructor(type: Git.StatusType) {
		super();

		this.type = type;
		this.statusSet = Object.create(null);
		this.statusList = [];
		this.statusByName = Object.create(null);
		this.statusByRename = Object.create(null);
	}

	public getType(): Git.StatusType {
		return this.type;
	}

	public update(statusList: FileStatus[]): void {
		var toDelete: IStatusSet = Object.create(null);

		var id: string, path: string, rename: string;
		var status: Git.IFileStatus;

		for (id in this.statusSet) {
			toDelete[id] = this.statusSet[id];
		}

		for (var i = 0; i < statusList.length; i++) {
			status = statusList[i];
			id = status.getId();
			path = status.getPath();
			rename = status.getRename();

			if (toDelete[id]) {
				this.statusSet[id].update(status);
				toDelete[id] = null;

			} else {
				this.statusSet[id] = status;
			}
		}

		for (id in toDelete) {
			if (status = toDelete[id]) {
				this.emit('fileStatus:dispose', status);
				delete this.statusSet[id];
			}
		}

		this.statusList = [];
		this.statusByName = Object.create(null);
		this.statusByRename = Object.create(null);

		for (id in this.statusSet) {
			status = this.statusSet[id];
			this.statusList.push(status);

			if (status.getRename()) {
				this.statusByRename[status.getPath()] = status;
			} else {
				this.statusByName[status.getPath()] = status;
			}
		}
	}

	public all(): Git.IFileStatus[] {
		return this.statusList;
	}

	public find(path: string): Git.IFileStatus {
		return this.statusByName[path] || this.statusByRename[path] || null;
	}

	public dispose(): void {
		this.type = null;
		this.statusSet = null;
		this.statusList = null;
		this.statusByName = null;
		this.statusByRename = null;

		super.dispose();
	}
}

export class StatusModel extends EventEmitter.EventEmitter implements Git.IStatusModel {

	private indexStatus: StatusGroup;
	private workingTreeStatus: StatusGroup;
	private mergeStatus: StatusGroup;
	private toDispose: Lifecycle.IDisposable[];

	constructor() {
		super();

		this.indexStatus = new StatusGroup(Git.StatusType.INDEX);
		this.workingTreeStatus = new StatusGroup(Git.StatusType.WORKING_TREE);
		this.mergeStatus = new StatusGroup(Git.StatusType.MERGE);

		this.toDispose = [
			this.addEmitter2(this.indexStatus),
			this.addEmitter2(this.workingTreeStatus),
			this.addEmitter2(this.mergeStatus)
		];
	}

	public getSummary(): Git.IStatusSummary {
		return {
			hasWorkingTreeChanges: this.getWorkingTreeStatus().all().length > 0,
			hasIndexChanges: this.getIndexStatus().all().length > 0,
			hasMergeChanges: this.getMergeStatus().all().length > 0
		};
	}

	public update(status: Git.IRawFileStatus[]): void {
		var index: FileStatus[] = [];
		var workingTree: FileStatus[] = [];
		var merge: FileStatus[] = [];

		status.forEach(raw => {
			switch(raw.x + raw.y) {
				case '??': return workingTree.push(new FileStatus(raw.path, raw.mimetype, Git.Status.UNTRACKED));
				case '!!': return workingTree.push(new FileStatus(raw.path, raw.mimetype, Git.Status.IGNORED));
				case 'DD': return merge.push(new FileStatus(raw.path, raw.mimetype, Git.Status.BOTH_DELETED));
				case 'AU': return merge.push(new FileStatus(raw.path, raw.mimetype, Git.Status.ADDED_BY_US));
				case 'UD': return merge.push(new FileStatus(raw.path, raw.mimetype, Git.Status.DELETED_BY_THEM));
				case 'UA': return merge.push(new FileStatus(raw.path, raw.mimetype, Git.Status.ADDED_BY_THEM));
				case 'DU': return merge.push(new FileStatus(raw.path, raw.mimetype, Git.Status.DELETED_BY_US));
				case 'AA': return merge.push(new FileStatus(raw.path, raw.mimetype, Git.Status.BOTH_ADDED));
				case 'UU': return merge.push(new FileStatus(raw.path, raw.mimetype, Git.Status.BOTH_MODIFIED));
			}

			let isModifiedInIndex = false;

			switch (raw.x) {
				case 'M': index.push(new FileStatus(raw.path, raw.mimetype, Git.Status.INDEX_MODIFIED)); isModifiedInIndex = true; break;
				case 'A': index.push(new FileStatus(raw.path, raw.mimetype, Git.Status.INDEX_ADDED)); break;
				case 'D': index.push(new FileStatus(raw.path, raw.mimetype, Git.Status.INDEX_DELETED)); break;
				case 'R': index.push(new FileStatus(raw.path, raw.mimetype, Git.Status.INDEX_RENAMED, raw.rename)); break;
				case 'C': index.push(new FileStatus(raw.path, raw.mimetype, Git.Status.INDEX_COPIED)); break;
			}

			switch (raw.y) {
				case 'M': workingTree.push(new FileStatus(raw.path, raw.mimetype, Git.Status.MODIFIED, raw.rename, isModifiedInIndex)); break;
				case 'D': workingTree.push(new FileStatus(raw.path, raw.mimetype, Git.Status.DELETED, raw.rename)); break;
			}
		});

		this.indexStatus.update(index);
		this.workingTreeStatus.update(workingTree);
		this.mergeStatus.update(merge);

		this.emit(Git.ModelEvents.STATUS_MODEL_UPDATED);
	}

	public getIndexStatus(): Git.IStatusGroup {
		return this.indexStatus;
	}

	public getWorkingTreeStatus(): Git.IStatusGroup {
		return this.workingTreeStatus;
	}

	public getMergeStatus(): Git.IStatusGroup {
		return this.mergeStatus;
	}

	public getGroups(): Git.IStatusGroup[] {
		return [ this.mergeStatus, this.indexStatus, this.workingTreeStatus ];
	}

	public find(path: string, type: Git.StatusType): Git.IFileStatus {
		var group: Git.IStatusGroup;

		switch (type) {
			case Git.StatusType.INDEX:
				group = this.indexStatus; break;
			case Git.StatusType.WORKING_TREE:
				group = this.workingTreeStatus; break;
			case Git.StatusType.MERGE:
				group = this.mergeStatus; break;
			default:
				return null;
		}

		return group.find(path);
	}

	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);

		if (this.indexStatus) {
			this.indexStatus.dispose();
			this.indexStatus = null;
		}

		if (this.workingTreeStatus) {
			this.workingTreeStatus.dispose();
			this.workingTreeStatus = null;
		}

		if (this.mergeStatus) {
			this.mergeStatus.dispose();
			this.mergeStatus = null;
		}

		super.dispose();
	}
}

export class Model extends EventEmitter.EventEmitter implements Git.IModel {

	private repositoryRoot: string;
	private status: Git.IStatusModel;
	private HEAD: Git.IBranch;
	private heads: Git.IBranch[];
	private tags: Git.ITag[];
	private remotes: Git.IRemote[];
	private toDispose: Lifecycle.IDisposable[];

	constructor() {
		super();

		this.toDispose = [];

		this.repositoryRoot = null;
		this.status = new StatusModel();
		this.toDispose.push(this.addEmitter2(this.status));

		this.HEAD = null;
		this.heads = [];
		this.tags = [];
		this.remotes = [];
	}

	public getRepositoryRoot(): string {
		return this.repositoryRoot;
	}

	public getStatus(): Git.IStatusModel {
		return this.status;
	}

	public getHEAD(): Git.IBranch {
		return this.HEAD;
	}

	public getHeads(): Git.IBranch[] {
		return this.heads;
	}

	public getTags(): Git.ITag[] {
		return this.tags;
	}

	public getRemotes(): Git.IRemote[] {
		return this.remotes;
	}

	public update(status: Git.IRawStatus): void {
		if (!status) {
			status = {
				repositoryRoot: null,
				status: [],
				HEAD: null,
				heads: [],
				tags: [],
				remotes: []
			};
		}

		this.repositoryRoot = status.repositoryRoot;
		this.status.update(status.status);

		this.HEAD = status.HEAD;
		this.emit(Git.ModelEvents.HEAD_UPDATED);

		this.heads = status.heads;
		this.emit(Git.ModelEvents.HEADS_UPDATED);

		this.tags = status.tags;
		this.emit(Git.ModelEvents.TAGS_UPDATED);

		this.remotes = status.remotes;
		this.emit(Git.ModelEvents.REMOTES_UPDATED);

		this.emit(Git.ModelEvents.MODEL_UPDATED);
	}

	public getStatusSummary(): Git.IStatusSummary {
		var status = this.getStatus();

		return {
			hasWorkingTreeChanges: status.getWorkingTreeStatus().all().length > 0,
			hasIndexChanges: status.getIndexStatus().all().length > 0,
			hasMergeChanges: status.getMergeStatus().all().length > 0
		};
	}

	public getPS1(): string {
		if (!this.HEAD) {
			return '';
		}

		var label = this.HEAD.name || this.HEAD.commit.substr(0, 8);
		var statusSummary = this.getStatus().getSummary();

		return Strings.format('{0}{1}{2}{3}',
			label,
			statusSummary.hasWorkingTreeChanges ? '*' : '',
			statusSummary.hasIndexChanges ? '+' : '',
			statusSummary.hasMergeChanges ? '!' : ''
		);
	}

	public dispose(): void {
		this.toDispose = Lifecycle.disposeAll(this.toDispose);
		super.dispose();
	}
}
