/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IDiffEditorOptionsService = createDecorator<IDiffEditorOptionsService>('diffEditorOptionsService');

export interface IDiffEditorOptionsService {
	readonly _serviceBrand: undefined;
	readonly renderSideBySide: IObservable<boolean>;
	toggleRenderSideBySide(): void;
}

export const SessionsDiffRenderSideBySideContext = new RawContextKey<boolean>('sessionsDiffRenderSideBySide', true, localize('sessionsDiffRenderSideBySide', "Whether Agents window diffs prefer side-by-side layout"));
