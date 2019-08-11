/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorProgressService } from 'vs/platform/progress/common/progress';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ProgressBarIndicator } from 'vs/workbench/services/progress/browser/progressIndicator';

export class EditorProgressService extends ProgressBarIndicator {

	_serviceBrand!: ServiceIdentifier<IEditorProgressService>;
}
