/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import Lifecycle = require('vs/base/common/lifecycle');
import WinJS = require('vs/base/common/winjs.base');
import EventEmitter = require('vs/base/common/eventEmitter');
import Builder = require('vs/base/browser/builder');
import Actions = require('vs/base/common/actions');
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
