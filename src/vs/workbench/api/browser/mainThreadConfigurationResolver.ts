/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IExtHostContext, MainContext, MainThreadConfigurationResolverShape } from 'vs/workbench/api/common/extHost.protocol';
import { extHostNamedCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { URI, UriComponents } from 'vs/base/common/uri';
import { EditorResourceAccessor } from 'vs/workbench/common/editor';

@extHostNamedCustomer(MainContext.MainThreadConfigurationResolver)
export class MainThreadConfigurationResolver implements MainThreadConfigurationResolverShape {

	constructor(
		_extHostContext: IExtHostContext,
		@IEditorService private readonly _editorService: IEditorService
	) {
	}

	async $getOriginalUri(uri: UriComponents): Promise<UriComponents> {
		const editor = this._editorService.findEditors(URI.revive(uri));
		let originalUri: UriComponents | undefined;
		if (editor.length > 0) {
			originalUri = EditorResourceAccessor.getOriginalUri(editor[0].editor);
		}
		return originalUri ?? uri;
	}

	dispose() {

	}
}
