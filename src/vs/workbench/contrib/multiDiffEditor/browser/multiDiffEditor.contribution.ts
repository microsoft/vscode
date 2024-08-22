/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls';
import { registerAction2 } from '../../../../platform/actions/common/actions';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors';
import { Registry } from '../../../../platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../browser/editor';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../common/editor';
import { MultiDiffEditor } from './multiDiffEditor';
import { MultiDiffEditorInput, MultiDiffEditorResolverContribution, MultiDiffEditorSerializer } from './multiDiffEditorInput';
import { CollapseAllAction, ExpandAllAction, GoToFileAction } from './actions';
import { IMultiDiffSourceResolverService, MultiDiffSourceResolverService } from './multiDiffSourceResolverService';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { OpenScmGroupAction, ScmMultiDiffSourceResolverContribution } from './scmMultiDiffSourceResolver';

registerAction2(GoToFileAction);
registerAction2(CollapseAllAction);
registerAction2(ExpandAllAction);

Registry.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		properties: {
			'multiDiffEditor.experimental.enabled': {
				type: 'boolean',
				default: true,
				description: 'Enable experimental multi diff editor.',
			},
		}
	});

registerSingleton(IMultiDiffSourceResolverService, MultiDiffSourceResolverService, InstantiationType.Delayed);

// Editor Integration
registerWorkbenchContribution2(MultiDiffEditorResolverContribution.ID, MultiDiffEditorResolverContribution, WorkbenchPhase.BlockStartup /* only registering an editor resolver */);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane)
	.registerEditorPane(
		EditorPaneDescriptor.create(MultiDiffEditor, MultiDiffEditor.ID, localize('name', "Multi Diff Editor")),
		[new SyncDescriptor(MultiDiffEditorInput)]
	);

Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory)
	.registerEditorSerializer(MultiDiffEditorInput.ID, MultiDiffEditorSerializer);

// SCM integration
registerAction2(OpenScmGroupAction);
registerWorkbenchContribution2(ScmMultiDiffSourceResolverContribution.ID, ScmMultiDiffSourceResolverContribution, WorkbenchPhase.BlockStartup /* only registering an editor resolver  */);
