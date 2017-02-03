/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { format } from 'vs/base/common/strings';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import {
	IStatusModel, IStatusSummary, IRawFileStatus, ModelEvents,
	IFileStatus, IStatusGroup, Status, StatusType,
	IBranch, IRef, IRemote, IModel, IRawStatus, RefType
} from 'vs/workbench/parts/git/common/git';

export class FileStatus implements IFileStatus {

	private id: string;
	private pathComponents: string[];

	constructor(
		private path: string,
		private mimetype: string,
		private status: Status,
		private rename?: string,
		isModifiedInIndex?: boolean
	) {
		this.id = FileStatus.typeOf(status) + ':' + path + (rename ? ':' + rename : '') + (isModifiedInIndex ? '$' : '');
		this.pathComponents = path.split('/');
	}

	getPath(): string {
		return this.path;
	}

	getPathComponents(): string[] {
		return this.pathComponents.slice(0);
	}

	getMimetype(): string {
		return this.mimetype;
	}

	getStatus(): Status {
		return this.status;
	}

	getRename(): string {
		return this.rename;
	}

	getId(): string {
		return this.id;
	}

	getType(): StatusType {
		switch (FileStatus.typeOf(this.status)) {
			case 'index': return StatusType.INDEX;
			case 'workingTree': return StatusType.WORKING_TREE;
			default: return StatusType.MERGE;
		}
	}

	clone(): IFileStatus {
		return new FileStatus(this.path, this.mimetype, this.status, this.rename);
	}

	update(other: FileStatus): void {
		this.status = other.getStatus();
		this.rename = other.getRename();
	}

	static typeOf(s: Status): string {
		switch (s) {
			case Status.INDEX_MODIFIED:
			case Status.INDEX_ADDED:
			case Status.INDEX_DELETED:
			case Status.INDEX_RENAMED:
			case Status.INDEX_COPIED:
				return 'index';

			case Status.MODIFIED:
			case Status.DELETED:
			case Status.UNTRACKED:
			case Status.IGNORED:
				return 'workingTree';

			default:
				return 'merge';
		}
	}
}

interface IStatusSet {
	[path: string]: IFileStatus;
}

export class StatusGroup extends EventEmitter implements IStatusGroup {

	private type: StatusType;
	private statusSet: IStatusSet;
	private statusList: IFileStatus[];
	private statusByName: IStatusSet;
	private statusByRename: IStatusSet;

	constructor(type: StatusType) {
		super();

		this.type = type;
		this.statusSet = Object.create(null);
		this.statusList = [];
		this.statusByName = Object.create(null);
		this.statusByRename = Object.create(null);
	}

	getType(): StatusType {
		return this.type;
	}

	update(statusList: FileStatus[]): void {
		const toDelete: IStatusSet = Object.create(null);

		let id: string, path: string, rename: string;
		let status: IFileStatus;

		for (id in this.statusSet) {
			toDelete[id] = this.statusSet[id];
		}

		for (let i = 0; i < statusList.length; i++) {
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

	all(): IFileStatus[] {
		return this.statusList;
	}

	find(path: string): IFileStatus {
		return this.statusByName[path] || this.statusByRename[path] || null;
	}

	dispose(): void {
		this.type = null;
		this.statusSet = null;
		this.statusList = null;
		this.statusByName = null;
		this.statusByRename = null;

		super.dispose();
	}
}

export class StatusModel extends EventEmitter implements IStatusModel {

	private indexStatus: StatusGroup;
	private workingTreeStatus: StatusGroup;
	private mergeStatus: StatusGroup;
	private toDispose: IDisposable[];

	constructor() {
		super();

		this.indexStatus = new StatusGroup(StatusType.INDEX);
		this.workingTreeStatus = new StatusGroup(StatusType.WORKING_TREE);
		this.mergeStatus = new StatusGroup(StatusType.MERGE);

		this.toDispose = [
			this.addEmitter2(this.indexStatus),
			this.addEmitter2(this.workingTreeStatus),
			this.addEmitter2(this.mergeStatus)
		];
	}

	getSummary(): IStatusSummary {
		return {
			hasWorkingTreeChanges: this.getWorkingTreeStatus().all().length > 0,
			hasIndexChanges: this.getIndexStatus().all().length > 0,
			hasMergeChanges: this.getMergeStatus().all().length > 0
		};
	}

	update(status: IRawFileStatus[]): void {
		const index: FileStatus[] = [];
		const workingTree: FileStatus[] = [];
		const merge: FileStatus[] = [];

		status.forEach(raw => {
			switch (raw.x + raw.y) {
				case '??': return workingTree.push(new FileStatus(raw.path, raw.mimetype, Status.UNTRACKED));
				case '!!': return workingTree.push(new FileStatus(raw.path, raw.mimetype, Status.IGNORED));
				case 'DD': return merge.push(new FileStatus(raw.path, raw.mimetype, Status.BOTH_DELETED));
				case 'AU': return merge.push(new FileStatus(raw.path, raw.mimetype, Status.ADDED_BY_US));
				case 'UD': return merge.push(new FileStatus(raw.path, raw.mimetype, Status.DELETED_BY_THEM));
				case 'UA': return merge.push(new FileStatus(raw.path, raw.mimetype, Status.ADDED_BY_THEM));
				case 'DU': return merge.push(new FileStatus(raw.path, raw.mimetype, Status.DELETED_BY_US));
				case 'AA': return merge.push(new FileStatus(raw.path, raw.mimetype, Status.BOTH_ADDED));
				case 'UU': return merge.push(new FileStatus(raw.path, raw.mimetype, Status.BOTH_MODIFIED));
			}

			let isModifiedInIndex = false;

			switch (raw.x) {
				case 'M': index.push(new FileStatus(raw.path, raw.mimetype, Status.INDEX_MODIFIED)); isModifiedInIndex = true; break;
				case 'A': index.push(new FileStatus(raw.path, raw.mimetype, Status.INDEX_ADDED)); break;
				case 'D': index.push(new FileStatus(raw.path, raw.mimetype, Status.INDEX_DELETED)); break;
				case 'R': index.push(new FileStatus(raw.path, raw.mimetype, Status.INDEX_RENAMED, raw.rename)); break;
				case 'C': index.push(new FileStatus(raw.path, raw.mimetype, Status.INDEX_COPIED)); break;
			}

			switch (raw.y) {
				case 'M': workingTree.push(new FileStatus(raw.path, raw.mimetype, Status.MODIFIED, raw.rename, isModifiedInIndex)); break;
				case 'D': workingTree.push(new FileStatus(raw.path, raw.mimetype, Status.DELETED, raw.rename)); break;
			}

			return undefined;
		});

		this.indexStatus.update(index);
		this.workingTreeStatus.update(workingTree);
		this.mergeStatus.update(merge);

		this.emit(ModelEvents.STATUS_MODEL_UPDATED);
	}

	getIndexStatus(): IStatusGroup {
		return this.indexStatus;
	}

	getWorkingTreeStatus(): IStatusGroup {
		return this.workingTreeStatus;
	}

	getMergeStatus(): IStatusGroup {
		return this.mergeStatus;
	}

	getGroups(): IStatusGroup[] {
		return [this.mergeStatus, this.indexStatus, this.workingTreeStatus];
	}

	find(path: string, type: StatusType): IFileStatus {
		switch (type) {
			case StatusType.INDEX:
				return this.indexStatus.find(path);
			case StatusType.WORKING_TREE:
				return this.workingTreeStatus.find(path);
			case StatusType.MERGE:
				return this.mergeStatus.find(path);
			default:
				return null;
		}
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);

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

export class Model extends EventEmitter implements IModel {

	private repositoryRoot: string;
	private status: IStatusModel;
	private HEAD: IBranch;
	private refs: IRef[];
	private remotes: IRemote[];
	private toDispose: IDisposable[];

	constructor() {
		super();

		this.toDispose = [];

		this.repositoryRoot = null;
		this.status = new StatusModel();
		this.toDispose.push(this.addEmitter2(this.status));

		this.HEAD = null;
		this.refs = [];
		this.remotes = [];
	}

	getRepositoryRoot(): string {
		return this.repositoryRoot;
	}

	getStatus(): IStatusModel {
		return this.status;
	}

	getHEAD(): IBranch {
		return this.HEAD;
	}

	getRefs(): IRef[] {
		return this.refs;
	}

	getRemotes(): IRemote[] {
		return this.remotes;
	}

	update(status: IRawStatus): void {
		if (!status) {
			status = {
				repositoryRoot: null,
				status: [],
				HEAD: null,
				refs: [],
				remotes: []
			};
		}

		this.repositoryRoot = status.repositoryRoot;
		this.status.update(status.status);

		this.HEAD = status.HEAD;
		this.emit(ModelEvents.HEAD_UPDATED);

		this.refs = status.refs;
		this.emit(ModelEvents.REFS_UPDATED);

		this.remotes = status.remotes;
		this.emit(ModelEvents.REMOTES_UPDATED);

		this.emit(ModelEvents.MODEL_UPDATED);
	}

	getStatusSummary(): IStatusSummary {
		const status = this.getStatus();

		return {
			hasWorkingTreeChanges: status.getWorkingTreeStatus().all().length > 0,
			hasIndexChanges: status.getIndexStatus().all().length > 0,
			hasMergeChanges: status.getMergeStatus().all().length > 0
		};
	}

	getPS1(): string {
		if (!this.HEAD) {
			return '';
		}

		const tag = this.getRefs().filter(iref => iref.type === RefType.Tag && iref.commit === this.HEAD.commit)[0];
		const tagName = tag && tag.name;
		const head = this.HEAD.name || tagName || this.HEAD.commit.substr(0, 8);

		const statusSummary = this.getStatus().getSummary();

		return format('{0}{1}{2}{3}',
			head,
			statusSummary.hasWorkingTreeChanges ? '*' : '',
			statusSummary.hasIndexChanges ? '+' : '',
			statusSummary.hasMergeChanges ? '!' : ''
		);
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}
