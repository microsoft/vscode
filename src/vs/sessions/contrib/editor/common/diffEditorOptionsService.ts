/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { DiffEditorViewMode } from '../../../../editor/common/config/editorOptions.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDiffEditorOptionsService = createDecorator<IDiffEditorOptionsService>('diffEditorOptionsService');

export const SESSIONS_EDITOR_WORD_WRAP_SETTING = 'sessions.editor.wordWrap';

export type SessionsEditorWordWrap = 'off' | 'on' | 'inherit';

export interface IDiffEditorOptionsService {
	readonly _serviceBrand: undefined;
	readonly viewMode: IObservable<DiffEditorViewMode>;
	readonly renderSideBySide: IObservable<boolean>;
	readonly wordWrap: IObservable<SessionsEditorWordWrap>;
	setViewMode(mode: DiffEditorViewMode): void;
	toggleRenderSideBySide(): void;
	setWordWrap(wordWrap: SessionsEditorWordWrap): Promise<void>;
}

export const SessionsDiffViewModeContext = new RawContextKey<DiffEditorViewMode>('sessionsDiffViewMode', 'automatic', localize('sessionsDiffViewMode', "The preferred layout mode for diffs in the Agents window"));
