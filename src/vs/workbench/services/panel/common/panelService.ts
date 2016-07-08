/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import {IPanel} from 'vs/workbench/common/panel';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';

export var IPanelService = createDecorator<IPanelService>('panelService');

export interface IPanelService {
	_serviceBrand : ServiceIdentifier<any>;

	/**
	 * Opens a panel with the given identifier and pass keyboard focus to it if specified.
	 */
	openPanel(id: string, focus?: boolean): TPromise<IPanel>;

	/**
	 * Returns the current active panel or null if none
	 */
	getActivePanel(): IPanel;
}
