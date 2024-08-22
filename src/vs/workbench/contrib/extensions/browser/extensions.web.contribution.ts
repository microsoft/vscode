/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls';
import { Registry } from '../../../../platform/registry/common/platform';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor';
import { RuntimeExtensionsEditor } from './browserRuntimeExtensionsEditor';
import { RuntimeExtensionsInput } from '../common/runtimeExtensionsInput';
import { EditorExtensions } from '../../../common/editor';

// Running Extensions
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(RuntimeExtensionsEditor, RuntimeExtensionsEditor.ID, localize('runtimeExtension', "Running Extensions")),
	[new SyncDescriptor(RuntimeExtensionsInput)]
);
