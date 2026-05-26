/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from '../../../common/contributions.js';
import { localize } from '../../../../nls.js';
import { MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { LifecyclePhase } from '../../../services/lifecycle/common/lifecycle.js';
import { IQuickDiffService } from '../common/quickDiff.js';
import { QuickDiffService } from '../common/quickDiffService.js';
import { QuickDiffWorkbenchController } from './quickDiffDecorator.js';
import { IQuickDiffModelService, QuickDiffModelService } from './quickDiffModel.js';
import { QuickDiffEditorController } from './quickDiffWidget.js';

MenuRegistry.appendMenuItem(MenuId.EditorLineNumberContext, {
	title: localize('quickDiffDecoration', "Diff Decorations"),
	submenu: MenuId.SCMQuickDiffDecorations,
	when: ContextKeyExpr.or(
		ContextKeyExpr.equals('config.scm.diffDecorations', 'all'),
		ContextKeyExpr.equals('config.scm.diffDecorations', 'gutter')),
	group: '9_quickDiffDecorations'
});

Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench)
	.registerWorkbenchContribution(QuickDiffWorkbenchController, LifecyclePhase.Restored);

registerEditorContribution(QuickDiffEditorController.ID,
	QuickDiffEditorController, EditorContributionInstantiation.AfterFirstRender);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'scm',
	order: 5,
	title: localize('scmConfigurationTitle', "Source Control"),
	type: 'object',
	scope: ConfigurationScope.RESOURCE,
	properties: {
		'scm.diffDecorations': {
			type: 'string',
			enum: ['all', 'gutter', 'overview', 'minimap', 'none'],
			enumDescriptions: [
				localize('scm.diffDecorations.all', "Show the diff decorations in all available locations."),
				localize('scm.diffDecorations.gutter', "Show the diff decorations only in the editor gutter."),
				localize('scm.diffDecorations.overviewRuler', "Show the diff decorations only in the overview ruler."),
				localize('scm.diffDecorations.minimap', "Show the diff decorations only in the minimap."),
				localize('scm.diffDecorations.none', "Do not show the diff decorations.")
			],
			default: 'all',
			description: localize('diffDecorations', "Controls diff decorations in the editor.")
		},
		'scm.diffDecorationsGutterWidth': {
			type: 'number',
			enum: [1, 2, 3, 4, 5],
			default: 3,
			description: localize('diffGutterWidth', "Controls the width(px) of diff decorations in gutter (added & modified).")
		},
		'scm.diffDecorationsGutterVisibility': {
			type: 'string',
			enum: ['always', 'hover'],
			enumDescriptions: [
				localize('scm.diffDecorationsGutterVisibility.always', "Show the diff decorator in the gutter at all times."),
				localize('scm.diffDecorationsGutterVisibility.hover', "Show the diff decorator in the gutter only on hover.")
			],
			description: localize('scm.diffDecorationsGutterVisibility', "Controls the visibility of the Source Control diff decorator in the gutter."),
			default: 'always'
		},
		'scm.diffDecorationsGutterAction': {
			type: 'string',
			enum: ['diff', 'none'],
			enumDescriptions: [
				localize('scm.diffDecorationsGutterAction.diff', "Show the inline diff Peek view on click."),
				localize('scm.diffDecorationsGutterAction.none', "Do nothing.")
			],
			description: localize('scm.diffDecorationsGutterAction', "Controls the behavior of Source Control diff gutter decorations."),
			default: 'diff'
		},
		'scm.diffDecorationsGutterPattern': {
			type: 'object',
			description: localize('diffGutterPattern', "Controls whether a pattern is used for the diff decorations in gutter."),
			additionalProperties: false,
			properties: {
				'added': {
					type: 'boolean',
					description: localize('diffGutterPatternAdded', "Use pattern for the diff decorations in gutter for added lines."),
				},
				'modified': {
					type: 'boolean',
					description: localize('diffGutterPatternModifed', "Use pattern for the diff decorations in gutter for modified lines."),
				},
			},
			default: {
				'added': false,
				'modified': true
			}
		},
		'scm.diffDecorationsIgnoreTrimWhitespace': {
			type: 'string',
			enum: ['true', 'false', 'inherit'],
			enumDescriptions: [
				localize('scm.diffDecorationsIgnoreTrimWhitespace.true', "Ignore leading and trailing whitespace."),
				localize('scm.diffDecorationsIgnoreTrimWhitespace.false', "Do not ignore leading and trailing whitespace."),
				localize('scm.diffDecorationsIgnoreTrimWhitespace.inherit', "Inherit from `diffEditor.ignoreTrimWhitespace`.")
			],
			description: localize('diffDecorationsIgnoreTrimWhitespace', "Controls whether leading and trailing whitespace is ignored in Source Control diff gutter decorations."),
			default: 'false'
		}
	}
});

registerSingleton(IQuickDiffService, QuickDiffService, InstantiationType.Delayed);
registerSingleton(IQuickDiffModelService, QuickDiffModelService, InstantiationType.Delayed);
