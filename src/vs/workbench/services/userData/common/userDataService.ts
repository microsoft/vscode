/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';

export const schme: string = 'vscode-userdata';
export const IUserDataService = createDecorator<IUserDataService>('userDataService');

export interface IUserDataChangesEvent {
	keys: string[];
	contains(keyOrSegment: string): boolean;
}

export interface IUserDataService {
	_serviceBrand: any;

	onDidChange: Event<IUserDataChangesEvent>;

	toResource(key: string): URI;

	toKey(resource: URI): string | undefined;

	read(key: string): Promise<string>;

	write(key: string, value: string): Promise<void>;
}

export const IUserDataEditorService = createDecorator<IUserDataEditorService>('userDataEditorService');

export interface IUserDataEditorService {
	_serviceBrand: any;

	openInEditor(key: string): Promise<void>;
}