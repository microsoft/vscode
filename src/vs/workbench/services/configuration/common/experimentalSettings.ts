/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { RunOnceScheduler } from '../../../../base/common/async.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';

export const IExperimentalSettingsService = createDecorator<IExperimentalSettingsService>('experimentalSettingsService');

/** Tracks real assignments, including default-equal values that have no experiment default override. */
export interface IExperimentalSettingsService {
	readonly _serviceBrand: undefined;
	/** Coalesces changes until the next event-loop turn, including treatments resolved across microtasks. */
	readonly onDidChangeAssignments: Event<ReadonlySet<string>>;

	/** Whether this window resolved a real ExP assignment for the setting, independent of its effective value. */
	hasAssignment(setting: string): boolean;

	/** Published by the configuration experiment contribution, including its startup latching semantics. */
	setAssignment(setting: string, assigned: boolean): void;
}

export class ExperimentalSettingsService extends Disposable implements IExperimentalSettingsService {
	declare readonly _serviceBrand: undefined;

	private readonly assignments = new Set<string>();
	private pendingChanges = new Set<string>();
	private readonly _onDidChangeAssignments = this._register(new Emitter<ReadonlySet<string>>());
	readonly onDidChangeAssignments = this._onDidChangeAssignments.event;
	private readonly changeScheduler = this._register(new RunOnceScheduler(() => {
		const changes = this.pendingChanges;
		this.pendingChanges = new Set();
		this._onDidChangeAssignments.fire(changes);
	}, 0));

	hasAssignment(setting: string): boolean {
		return this.assignments.has(setting);
	}

	setAssignment(setting: string, assigned: boolean): void {
		if (this.assignments.has(setting) === assigned) {
			return;
		}
		if (assigned) {
			this.assignments.add(setting);
		} else {
			this.assignments.delete(setting);
		}
		this.pendingChanges.add(setting);
		if (!this.changeScheduler.isScheduled()) {
			this.changeScheduler.schedule();
		}
	}
}

registerSingleton(IExperimentalSettingsService, ExperimentalSettingsService, InstantiationType.Delayed);
