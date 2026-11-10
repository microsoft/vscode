/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../chat/common/automations/automation.js';
import { AutomationCatalogueState, IAutomationProviderDescriptor, IAutomationRunRequestResult, IAutomationService, IGuardedAutomationUpdateResult } from '../../../chat/common/automations/automationService.js';
import { ICustomViewDescriptor, ICustomViewOpenRequest, ICustomViewService } from '../customView.js';
import { IPinnedCanvas, IPinnedCanvasService } from '../pinnedCanvases.js';

function notAvailable(): Promise<never> {
	return Promise.reject(new Error('Automations are not available in this window'));
}

/**
 * The custom views of an editor window with the Sessions view: it shows none, so the sessions list offers none of the
 * entries that open one, such as Automations.
 */
export class AgentsViewCustomViewService implements ICustomViewService {

	declare readonly _serviceBrand: undefined;

	readonly activeCustomView: IObservable<ICustomViewDescriptor | undefined> = constObservable(undefined);
	readonly activeCustomViewOpen: IObservable<ICustomViewOpenRequest | undefined> = constObservable(undefined);

	registerCustomView(): IDisposable {
		return Disposable.None;
	}

	showCustomView(): void { }

	hideCustomView(): void { }
}

/** The automations of an editor window with the Sessions view: it has none, so the sessions list shows no Automations entry. */
export class AgentsViewAutomationService implements IAutomationService {

	declare readonly _serviceBrand: undefined;

	readonly unavailableProviders: IObservable<readonly IAutomationProviderDescriptor[]> = constObservable([]);
	readonly availableProviders: IObservable<readonly IAutomationProviderDescriptor[]> = constObservable([]);
	readonly catalogueState: IObservable<AutomationCatalogueState> = constObservable('unavailable');
	readonly automations: IObservable<readonly IAutomationDescriptor[]> = constObservable([]);
	readonly runs: IObservable<readonly IAutomationRun[]> = constObservable([]);

	canCreateAutomation(): boolean { return false; }
	getAutomation(): IAutomationDescriptor | undefined { return undefined; }
	runsFor(): IObservable<readonly IAutomationRun[]> { return this.runs; }
	createAutomation(): Promise<IAutomationDescriptor> { return notAvailable(); }
	updateAutomation(): Promise<IAutomationDescriptor> { return notAvailable(); }
	updateAutomationIfUnchanged(): Promise<IGuardedAutomationUpdateResult> { return notAvailable(); }
	deleteAutomation(): Promise<void> { return notAvailable(); }
	runAutomation(): Promise<IAutomationRunRequestResult> { return notAvailable(); }
	getActiveRunFor(): IAutomationRun | undefined { return undefined; }
	canRunAutomation(): boolean { return false; }
	canUpdateAutomation(): boolean { return false; }
	canDeleteAutomation(): boolean { return false; }
}

/** The pinned canvases of an editor window with the Sessions view: it has none, so the sessions list shows none. */
export class AgentsViewPinnedCanvasService implements IPinnedCanvasService {

	declare readonly _serviceBrand: undefined;

	readonly enabled: IObservable<boolean> = constObservable(false);
	readonly entries: IObservable<readonly IPinnedCanvas[]> = constObservable([]);
	readonly selected: IObservable<IPinnedCanvas | undefined> = constObservable(undefined);

	getEntry(): IPinnedCanvas | undefined { return undefined; }
	isPinned(): boolean { return false; }
	isShown(): boolean { return false; }
	getTrackedCanvas(): undefined { return undefined; }
	pin(): boolean { return false; }
	unpin(): void { }
	async show(): Promise<void> { }
	reconnect(): void { }
	async goToChat(): Promise<void> { }
	async closeCanvas(): Promise<void> { }
}
