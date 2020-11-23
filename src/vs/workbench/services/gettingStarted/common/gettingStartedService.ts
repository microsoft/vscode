/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IGettingStartedTask, GettingStartedRegistry, IGettingStartedCategory, } from 'vs/workbench/services/gettingStarted/common/gettingStartedRegistry';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';

export const IGettingStartedService = createDecorator<IGettingStartedService>('gettingStartedService');

type TaskProgress = { done: boolean; };
export interface IGettingStartedTaskWithProgress extends IGettingStartedTask, TaskProgress { }

export interface IGettingStartedCategoryWithProgress extends Omit<IGettingStartedCategory, 'tasks'> {
	done: boolean;
	stepsComplete: number
	stepsTotal: number
	tasks: readonly IGettingStartedTaskWithProgress[]
}

export interface IGettingStartedService {
	_serviceBrand: undefined,

	readonly onDidAddTask: Event<IGettingStartedTaskWithProgress>
	readonly onDidAddCategory: Event<IGettingStartedCategoryWithProgress>

	readonly onDidProgressTask: Event<IGettingStartedTaskWithProgress>

	getCategories(): IGettingStartedCategoryWithProgress[]

	progressTask(task: IGettingStartedTask): void;
}

export class GettingStartedService implements IGettingStartedService {
	declare readonly _serviceBrand: undefined;

	private readonly _onDidAddTask = new Emitter<IGettingStartedTaskWithProgress>();
	onDidAddTask: Event<IGettingStartedTaskWithProgress> = this._onDidAddTask.event;
	private readonly _onDidAddCategory = new Emitter<IGettingStartedCategoryWithProgress>();
	onDidAddCategory: Event<IGettingStartedCategoryWithProgress> = this._onDidAddCategory.event;

	private readonly _onDidProgressTask = new Emitter<IGettingStartedTaskWithProgress>();
	onDidProgressTask: Event<IGettingStartedTaskWithProgress> = this._onDidProgressTask.event;

	private registry = GettingStartedRegistry;
	private memento: Memento;
	private taskProgress: Record<string, TaskProgress>;

	constructor(@IStorageService private readonly storageService: IStorageService) {
		this.memento = new Memento('gettingStartedService', this.storageService);
		this.taskProgress = this.memento.getMemento(StorageScope.GLOBAL, StorageTarget.USER);
		this.registry.onDidAddCategory(category => this._onDidAddCategory.fire(this.getCategoryProgress(category)));
		this.registry.onDidAddTask(task => this._onDidAddTask.fire(this.getTaskProgress(task)));
	}

	getCategories(): IGettingStartedCategoryWithProgress[] {
		const registeredCategories = this.registry.getCategories();
		const categoriesWithCompletion = registeredCategories
			.filter(category => category.tasks.length)
			.map(category => this.getCategoryProgress(category))
			.sort((a, b) => a.priority - b.priority);
		return categoriesWithCompletion;
	}

	private getCategoryProgress(category: IGettingStartedCategory): IGettingStartedCategoryWithProgress {

		const tasks = category.tasks
			.map(task => this.getTaskProgress(task))
			.sort((a, b) => a.order - b.order);

		const tasksComplete = tasks.filter(task => task.done);
		return {
			...category,
			stepsComplete: tasksComplete.length,
			stepsTotal: tasks.length,
			tasks,
			done: tasksComplete.length === tasks.length
		};
	}

	private getTaskProgress(task: IGettingStartedTask): IGettingStartedTaskWithProgress {
		return {
			...task,
			...this.taskProgress[this.getTaskStorageKey(task)]
		};
	}

	progressTask(task: IGettingStartedTask): void {
		const oldProgress = this.taskProgress[this.getTaskStorageKey(task)];
		if (!oldProgress || oldProgress.done !== true) {
			this.taskProgress[this.getTaskStorageKey(task)] = { done: true };
			this.memento.saveMemento();
			this._onDidProgressTask.fire(this.getTaskProgress(task));
		}
	}

	private getTaskStorageKey(task: IGettingStartedTask): string {
		return `taskID:${task.id};;categoryID:${task.category}`;
	}
}

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'resetGettingStartedProgress',
			category: 'Getting Started',
			title: 'Reset Progress',
			f1: true
		});
	}

	run(accessor: ServicesAccessor) {
		const memento = new Memento('gettingStartedService', accessor.get(IStorageService));
		const record = memento.getMemento(StorageScope.GLOBAL, StorageTarget.USER);
		for (const key in record) {
			if (Object.prototype.hasOwnProperty.call(record, key)) {
				delete record[key];
			}
		}
		memento.saveMemento();
	}
});

registerSingleton(IGettingStartedService, GettingStartedService);
