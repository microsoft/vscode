/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { INotification, INotificationHandle, INotificationService, INotificationSource, INotificationSourceFilter, IPromptChoice, IPromptOptions, IStatusMessageOptions, NoOpNotification, Severity } from 'vs/platform/notification/common/notification';

export class TestNotificationService implements INotificationService {

	readonly onDidAddNotification: Event<INotification> = Event.None;

	readonly onDidRemoveNotification: Event<INotification> = Event.None;

	readonly onDidChangeGlobalDoNotDisturbMode: Event<void> = Event.None;

	readonly onDidChangePerSourceDoNotDisturbMode = Event.None;

	declare readonly _serviceBrand: undefined;

	isGlobalDoNotDisturbMode: boolean = false;

	private static readonly NO_OP: INotificationHandle = new NoOpNotification();

	info(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Info, message });
	}

	warn(message: string): INotificationHandle {
		return this.notify({ severity: Severity.Warning, message });
	}

	error(error: string | Error): INotificationHandle {
		return this.notify({ severity: Severity.Error, message: error });
	}

	notify(notification: INotification): INotificationHandle {
		return TestNotificationService.NO_OP;
	}

	prompt(severity: Severity, message: string, choices: IPromptChoice[], options?: IPromptOptions): INotificationHandle {
		return TestNotificationService.NO_OP;
	}

	status(message: string | Error, options?: IStatusMessageOptions): IDisposable {
		return Disposable.None;
	}

	setGlobalDoNotDisturbMode(mode: boolean): void {
		this.isGlobalDoNotDisturbMode = mode;
	}

	isSourceDoNotDisturb(source: INotificationSource): boolean {
		return false;
	}

	setSourceDoNotDisturb(source: INotificationSource, mode: boolean): void { }

	getSourcesDoNotDisturb(): INotificationSourceFilter[] {
		return [];
	}
}
