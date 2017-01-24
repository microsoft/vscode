/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { WalkThroughInput } from 'vs/workbench/parts/walkThrough/node/walkThroughInput';
import { WalkThroughPart } from 'vs/workbench/parts/walkThrough/electron-browser/walkThroughPart';
import { WalkThroughContentProvider, WalkThroughSnippetContentProvider } from 'vs/workbench/parts/walkThrough/node/walkThroughContentProvider';
import { EditorWalkThroughAction } from 'vs/workbench/parts/walkThrough/electron-browser/editor/editorWalkThrough';
import { Registry } from 'vs/platform/platform';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { isWelcomePageEnabled } from 'vs/platform/telemetry/common/telemetryUtils';

if (isWelcomePageEnabled()) {
	Registry.as<IEditorRegistry>(EditorExtensions.Editors)
		.registerEditor(new EditorDescriptor(WalkThroughPart.ID,
			localize('walkThrough.editor.label', "Walk-Through"),
			'vs/workbench/parts/walkThrough/electron-browser/walkThroughPart',
			'WalkThroughPart'),
		[new SyncDescriptor(WalkThroughInput)]);

	Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
		.registerWorkbenchAction(
		new SyncActionDescriptor(EditorWalkThroughAction, EditorWalkThroughAction.ID, EditorWalkThroughAction.LABEL),
		'Help: Editor Walk-Through', localize('help', "Help"));

	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
		.registerWorkbenchContribution(WalkThroughContentProvider);

	Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
		.registerWorkbenchContribution(WalkThroughSnippetContentProvider);
}
