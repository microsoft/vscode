/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Menus } from '../../../browser/menus.js';
import { ModelPicker, ModelPickerActionViewItem } from './modelPicker.js';

/** Creates the provider/model toolbar shared by New Session configuration surfaces. */
export function createNewSessionConfigToolbar(container: HTMLElement, instantiationService: IInstantiationService, compactModelPicker: IObservable<boolean>): MenuWorkbenchToolBar {
	return instantiationService.createInstance(MenuWorkbenchToolBar, container, Menus.NewSessionConfig, {
		hiddenItemStrategy: HiddenItemStrategy.NoHide,
		actionViewItemProvider: action => {
			if (action.id === 'sessions.modelPicker') {
				const picker = instantiationService.createInstance(ModelPicker, compactModelPicker);
				return new ModelPickerActionViewItem(picker);
			}
			return undefined;
		},
	});
}

/** Creates the provider-owned control toolbar shared by New Session configuration surfaces. */
export function createNewSessionControlToolbar(container: HTMLElement, instantiationService: IInstantiationService): MenuWorkbenchToolBar {
	return instantiationService.createInstance(MenuWorkbenchToolBar, container, Menus.NewSessionControl, {
		hiddenItemStrategy: HiddenItemStrategy.NoHide,
	});
}
