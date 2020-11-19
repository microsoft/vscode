/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Emitter, Event } from 'vs/base/common/event';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IGettingStartedTask, GettingStartedRegistry, IGettingStartedCategory, } from 'vs/workbench/services/gettingStarted/common/gettingStartedRegistry';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { Memento } from 'vs/workbench/common/memento';

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
	readonly onDidAddTask: Event<IGettingStartedTaskWithProgress>
	readonly onDidAddCategory: Event<IGettingStartedCategoryWithProgress>

	readonly onDidProgressTask: Event<IGettingStartedTaskWithProgress>

	getCategories(): IGettingStartedCategoryWithProgress[]

	setTaskProgress(task: IGettingStartedTask, progress: TaskProgress): void;
}

export class GettingStartedService implements IGettingStartedService {
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
		const categoriesWithCompletion = registeredCategories.map(category => this.getCategoryProgress(category));
		return categoriesWithCompletion;
	}

	private getCategoryProgress(category: IGettingStartedCategory): IGettingStartedCategoryWithProgress {
		const tasks = category.tasks.map(task => this.getTaskProgress(task));
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

	setTaskProgress(task: IGettingStartedTask, progress: TaskProgress): void {
		this.taskProgress[this.getTaskStorageKey(task)] = progress;
		this.memento.saveMemento();
		this._onDidProgressTask.fire(this.getTaskProgress(task));
	}

	private getTaskStorageKey(task: IGettingStartedTask): string {
		return `taskID:${task.id};;categoryID:${task.category}`;
	}
}

registerSingleton(IGettingStartedService, GettingStartedService);
