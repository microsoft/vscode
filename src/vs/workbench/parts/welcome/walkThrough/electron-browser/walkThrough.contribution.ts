/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { localize } from 'vs/nls';
import { WalkThroughInput } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughInput';
import { WalkThroughPart, WALK_THROUGH_FOCUS } from 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThroughPart';
import { WalkThroughArrowUpAction, WalkThroughArrowDownAction, WalkThroughPageUpAction, WalkThroughPageDownAction } from 'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThroughActions';
import { WalkThroughContentProvider, WalkThroughSnippetContentProvider } from 'vs/workbench/parts/welcome/walkThrough/node/walkThroughContentProvider';
import { EditorWalkThroughAction } from 'vs/workbench/parts/welcome/walkThrough/electron-browser/editor/editorWalkThrough';
import { Registry } from 'vs/platform/platform';
import { EditorDescriptor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IEditorRegistry, Extensions as EditorExtensions } from 'vs/workbench/common/editor';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IWorkbenchActionRegistry, Extensions } from 'vs/workbench/common/actionRegistry';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorContextKeys } from 'vs/editor/common/editorCommon';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';

Registry.as<IEditorRegistry>(EditorExtensions.Editors)
	.registerEditor(new EditorDescriptor(WalkThroughPart.ID,
		localize('walkThrough.editor.label', "Interactive Playground"),
		'vs/workbench/parts/welcome/walkThrough/electron-browser/walkThroughPart',
		'WalkThroughPart'),
	[new SyncDescriptor(WalkThroughInput)]);

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(
	new SyncActionDescriptor(EditorWalkThroughAction, EditorWalkThroughAction.ID, EditorWalkThroughAction.LABEL),
	'Help: Interactive Playground', localize('help', "Help"));

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WalkThroughContentProvider);

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(WalkThroughSnippetContentProvider);

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(WalkThroughArrowUpAction, WalkThroughArrowUpAction.ID, WalkThroughArrowUpAction.LABEL, { primary: KeyCode.UpArrow }, ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.TextFocus.toNegated())), 'Interactive Playground: Scroll Up (Line)', localize('interactivePlayground', "Interactive Playground"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(WalkThroughArrowDownAction, WalkThroughArrowDownAction.ID, WalkThroughArrowDownAction.LABEL, { primary: KeyCode.DownArrow }, ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.TextFocus.toNegated())), 'Interactive Playground: Scroll Down (Line)', localize('interactivePlayground', "Interactive Playground"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(WalkThroughPageUpAction, WalkThroughPageUpAction.ID, WalkThroughPageUpAction.LABEL, { primary: KeyCode.PageUp }, ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.TextFocus.toNegated())), 'Interactive Playground: Scroll Up (Page)', localize('interactivePlayground', "Interactive Playground"));

Registry.as<IWorkbenchActionRegistry>(Extensions.WorkbenchActions)
	.registerWorkbenchAction(new SyncActionDescriptor(WalkThroughPageDownAction, WalkThroughPageDownAction.ID, WalkThroughPageDownAction.LABEL, { primary: KeyCode.PageDown }, ContextKeyExpr.and(WALK_THROUGH_FOCUS, EditorContextKeys.TextFocus.toNegated())), 'Interactive Playground: Scroll Down (Page)', localize('interactivePlayground', "Interactive Playground"));
