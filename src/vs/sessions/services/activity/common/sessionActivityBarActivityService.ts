/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IActivity } from '../../../../workbench/services/activity/common/activity.js';

export const ISessionActivityBarActivityService = createDecorator<ISessionActivityBarActivityService>('sessionActivityBarActivityService');

/**
 * Shows activity, such as a badge, on the entries of the Session Activity Bar,
 * like the workbench `IActivityService` does for the activity bar's view
 * containers. Entries are identified by the id of the command they run.
 */
export interface ISessionActivityBarActivityService {

	readonly _serviceBrand: undefined;

	/** Emitted with the command id whose activity changed. */
	readonly onDidChangeActivity: Event<string>;

	/** Shows `activity` on the entry running `commandId` until the returned disposable is disposed. */
	showActivity(commandId: string, activity: IActivity): IDisposable;

	/** The activities shown on the entry running `commandId`, most recent last. */
	getActivity(commandId: string): readonly IActivity[];
}

export class SessionActivityBarActivityService extends Disposable implements ISessionActivityBarActivityService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeActivity = this._register(new Emitter<string>());
	readonly onDidChangeActivity = this._onDidChangeActivity.event;

	private readonly _activities = new Map<string, IActivity[]>();

	showActivity(commandId: string, activity: IActivity): IDisposable {
		let activities = this._activities.get(commandId);
		if (!activities) {
			activities = [];
			this._activities.set(commandId, activities);
		}
		activities.push(activity);
		this._onDidChangeActivity.fire(commandId);
		return toDisposable(() => {
			const current = this._activities.get(commandId);
			const index = current?.indexOf(activity) ?? -1;
			if (!current || index === -1) {
				return;
			}
			current.splice(index, 1);
			if (current.length === 0) {
				this._activities.delete(commandId);
			}
			this._onDidChangeActivity.fire(commandId);
		});
	}

	getActivity(commandId: string): readonly IActivity[] {
		return this._activities.get(commandId) ?? [];
	}
}

registerSingleton(ISessionActivityBarActivityService, SessionActivityBarActivityService, InstantiationType.Delayed);
