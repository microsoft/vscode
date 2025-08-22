/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor.js';
import { EditorExtensions } from '../../../common/editor.js';
import { ErdosPlotsEditor } from './ErdosPlotsEditor.js';
import { ErdosPlotsEditorInput } from './ErdosPlotsEditorInput.js';

// Register the Erdos plots editor pane.
Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ErdosPlotsEditor,
		ErdosPlotsEditorInput.EditorID,
		localize('erdosPlotsEditor', "Erdos Plots Editor")
	),
	[
		new SyncDescriptor(ErdosPlotsEditorInput)
	]
);
