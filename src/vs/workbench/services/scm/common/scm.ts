/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { Command } from 'vs/editor/common/modes';

export interface IBaselineResourceProvider {
	getBaselineResource(resource: URI): TPromise<URI>;
}

export const ISCMService = createDecorator<ISCMService>('scm');

export interface ISCMResourceDecorations {
	icon?: URI;
	iconDark?: URI;
	tooltip?: string;
	strikeThrough?: boolean;
	faded?: boolean;
}

export interface ISCMResourceSplice {
	start: number;
	deleteCount: number;
	resources: ISCMResource[];
}

export interface ISCMResourceCollection {
	readonly resources: ISCMResource[];
	readonly onDidSplice: Event<ISCMResourceSplice>;
}

export interface ISCMResource {
	readonly resourceGroup: ISCMResourceGroup;
	readonly sourceUri: URI;
	readonly decorations: ISCMResourceDecorations;
	open(): TPromise<void>;
}

export interface ISCMResourceGroup {
	readonly provider: ISCMProvider;
	readonly label: string;
	readonly id: string;
	readonly resourceCollection: ISCMResourceCollection;
	readonly hideWhenEmpty: boolean;
}

export interface ISCMProvider extends IDisposable {
	readonly label: string;
	readonly id: string;
	readonly contextValue: string;

	readonly resources: ISCMResourceGroup[];
	readonly onDidChangeResources: Event<void>;

	readonly rootUri?: URI;
	readonly count?: number;
	readonly commitTemplate?: string;
	readonly onDidChangeCommitTemplate?: Event<string>;
	readonly acceptInputCommand?: Command;
	readonly statusBarCommands?: Command[];
	readonly onDidChange: Event<void>;

	getOriginalResource(uri: URI): TPromise<URI>;
}

export interface ISCMInput {
	value: string;
	readonly onDidChange: Event<string>;
}

export interface ISCMRepository extends IDisposable {
	readonly onDidFocus: Event<void>;
	readonly provider: ISCMProvider;
	readonly input: ISCMInput;
	focus(): void;
}

export interface ISCMService {

	readonly _serviceBrand: any;
	readonly onDidAddRepository: Event<ISCMRepository>;
	readonly onDidRemoveRepository: Event<ISCMRepository>;
	readonly onDidChangeRepository: Event<ISCMRepository>;

	readonly repositories: ISCMRepository[];

	registerSCMProvider(provider: ISCMProvider): ISCMRepository;
}