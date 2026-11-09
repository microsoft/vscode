/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { ISelection } from '../../../../editor/common/core/selection.js';
import { ITextModel } from '../../../../editor/common/model.js';

export interface ICustomTextEditorNavigation extends IDisposable {
	readonly model: ITextModel;
	readonly selection: ISelection | undefined;
	readonly onDidChangeSelection: Event<void>;
	readonly onDidDispose: Event<void>;
	revealRange(range: IRange, selection: ISelection | undefined, preserveFocus: boolean, token: CancellationToken): Promise<void>;
	captureViewState(): IDisposable;
}
