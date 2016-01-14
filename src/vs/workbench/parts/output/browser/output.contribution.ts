/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Registry} from 'vs/platform/platform';
import {registerMode} from 'vs/editor/common/modes/modesRegistry';
import {OutputService} from 'vs/workbench/parts/output/common/outputServices';
import {OUTPUT_MIME, OUTPUT_MODE_ID, OUTPUT_EDITOR_INPUT_ID, IOutputService} from 'vs/workbench/parts/output/common/output';
import {OutputEditorInput} from 'vs/workbench/parts/output/common/outputEditorInput';
import {IEditorRegistry, Extensions, IEditorInputFactory} from 'vs/workbench/browser/parts/editor/baseEditor';
import {EditorInput} from 'vs/workbench/common/editor';
import {IInstantiationService, INullService} from 'vs/platform/instantiation/common/instantiation';
import {registerSingleton} from 'vs/platform/instantiation/common/extensions';

// Register Editor Input Factory
class OutputInputFactory implements IEditorInputFactory {

	constructor(@INullService ns) {}

	public serialize(editorInput: EditorInput): string {
		let outputEditoInput = <OutputEditorInput>editorInput;

		return outputEditoInput.getChannel(); // use the channel to distinguish different output editor inputs
	}

	public deserialize(instantiationService: IInstantiationService, channel: string): EditorInput {
		return OutputEditorInput.getInstance(instantiationService, channel);
	}
}

// Register Service
registerSingleton(IOutputService, OutputService);

// Register Output Input Factory
(<IEditorRegistry>Registry.as(Extensions.Editors)).registerEditorInputFactory(OUTPUT_EDITOR_INPUT_ID, OutputInputFactory);

// Register Output Mode
registerMode({
	id: OUTPUT_MODE_ID,
	extensions: [],
	aliases: [null],
	mimetypes: [OUTPUT_MIME],
	moduleId: 'vs/workbench/parts/output/common/outputMode',
	ctorName: 'OutputMode'
});
