/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { EditorDescriptor, IEditorRegistry } from 'vs/workbench/browser/editor';
import { RuntimeExtensionsEditor } from 'vs/workbench/contrib/extensions/browser/browserRuntimeExtensionsEditor';
import { RuntimeExtensionsInput } from 'vs/workbench/contrib/extensions/common/runtimeExtensionsInput';
import { Extensions } from 'vs/workbench/services/editor/common/editorOverrideService';

// Running Extensions
Registry.as<IEditorRegistry>(Extensions.Editors).registerEditor(
	EditorDescriptor.create(RuntimeExtensionsEditor, RuntimeExtensionsEditor.ID, localize('runtimeExtension', "Running Extensions")),
	[new SyncDescriptor(RuntimeExtensionsInput)]
);
