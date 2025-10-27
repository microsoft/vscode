/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMouseEvent } from '../../../../../../base/browser/mouseEvent.js';
import { Event } from '../../../../../../base/common/event.js';
import { IObservable } from '../../../../../../base/common/observable.js';
import { Command, InlineCompletionCommand } from '../../../../../common/languages.js';
import { InlineSuggestHint } from '../../model/inlineSuggestionItem.js';
import { InlineEditWithChanges } from './inlineEditWithChanges.js';

export enum InlineEditTabAction {
	Jump = 'jump',
	Accept = 'accept',
	Inactive = 'inactive'
}

export interface IInlineEditsView {
	isHovered: IObservable<boolean>;
	minEditorScrollHeight?: IObservable<number>;
	readonly onDidClick: Event<IMouseEvent>;
}

export interface IInlineEditHost {
	readonly onDidAccept: Event<void>;
	inAcceptFlow: IObservable<boolean>;
}

export interface IInlineEditModel {
	displayName: string;
	action: Command | undefined;
	extensionCommands: InlineCompletionCommand[];
	isInDiffEditor: boolean;
	inlineEdit: InlineEditWithChanges;
	tabAction: IObservable<InlineEditTabAction>;
	showCollapsed: IObservable<boolean>;
	displayLocation: InlineSuggestHint | undefined;

	handleInlineEditShown(viewKind: string, viewData?: InlineCompletionViewData): void;
	accept(): void;
	jump(): void;
}

// TODO: Move this out of here as it is also includes ghosttext
export enum InlineCompletionViewKind {
	GhostText = 'ghostText',
	Custom = 'custom',
	SideBySide = 'sideBySide',
	Deletion = 'deletion',
	InsertionInline = 'insertionInline',
	InsertionMultiLine = 'insertionMultiLine',
	WordReplacements = 'wordReplacements',
	LineReplacement = 'lineReplacement',
	Collapsed = 'collapsed'
}

export type InlineCompletionViewData = {
	cursorColumnDistance: number;
	cursorLineDistance: number;
	lineCountOriginal: number;
	lineCountModified: number;
	characterCountOriginal: number;
	characterCountModified: number;
	disjointReplacements: number;
	sameShapeReplacements?: boolean;
};
