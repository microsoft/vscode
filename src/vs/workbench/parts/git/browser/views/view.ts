/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as Lifecycle from 'vs/base/common/lifecycle';
import * as WinJS from 'vs/base/common/winjs.base';
import * as EventEmitter from 'vs/base/common/eventEmitter';
import * as Builder from 'vs/base/browser/builder';
import * as Actions from 'vs/base/common/actions';
import {ISelection} from 'vs/platform/selection/common/selection';

export interface IView extends Lifecycle.IDisposable {
	ID: string;
	element: HTMLElement;
	focus(): void;
	layout(dimension:Builder.Dimension): void;
	setVisible(visible:boolean): WinJS.Promise;
	getSelection(): ISelection;
	getControl(): EventEmitter.IEventEmitter;
	getActions(): Actions.IAction[];
	getSecondaryActions(): Actions.IAction[];
}

export interface IController {
	setView(id: string): WinJS.Promise;
}
