/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IEditorPane } from 'vs/workbench/common/editor';

export const IOutlineService = createDecorator<IOutlineService>('IOutlineService');

export interface IOutlineService {
	_serviceBrand: undefined;

	createOutline(editor: IEditorPane): Promise<IOutline<any> | undefined>;

	registerOutlineCreator(creator: IOutlineCreator<any, any>): IDisposable;
}

export interface IOutlineCreator<P extends IEditorPane, E> {
	matches(candidate: IEditorPane): candidate is P;
	createOutline(editor: P): Promise<IOutline<E> | undefined>;
}


export interface IOutline<E> {

	dispose(): void;

	readonly onDidChange: Event<this>;

	readonly activeEntry: E | undefined;
	readonly onDidChangeActiveEntry: Event<this>

	revealInEditor(entry: E): Promise<void> | void;

	getParent(entry: E): E | undefined;
	// getChildren(parent: E): Iterable<E>
}
