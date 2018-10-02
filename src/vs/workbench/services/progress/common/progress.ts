/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProgress } from 'vs/platform/progress/common/progress';
import { ViewContainer } from 'vs/workbench/common/views';

export const enum ProgressLocation {
	Explorer = 1,
	Scm = 3,
	Extensions = 5,
	Window = 10,
	Notification = 15
}

export interface IProgressOptions {
	location: ProgressLocation | ViewContainer;
	title?: string;
	source?: string;
	total?: number;
	cancellable?: boolean;
}

export interface IProgressStep {
	message?: string;
	increment?: number;
}

export const IProgressService2 = createDecorator<IProgressService2>('progressService2');

export interface IProgressService2 {

	_serviceBrand: any;

	withProgress<P extends Thenable<R>, R=any>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => P, onDidCancel?: () => void): P;
}