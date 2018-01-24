/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IModelDecorationOptions } from 'vs/editor/common/model';
import { IDecorationRenderOptions } from 'vs/editor/common/editorCommon';
import { AbstractCodeEditorService } from 'vs/editor/browser/services/abstractCodeEditorService';

export class TestCodeEditorService extends AbstractCodeEditorService {
	public registerDecorationType(key: string, options: IDecorationRenderOptions, parentTypeKey?: string): void { }
	public removeDecorationType(key: string): void { }
	public resolveDecorationOptions(decorationTypeKey: string, writable: boolean): IModelDecorationOptions { return null; }
}
