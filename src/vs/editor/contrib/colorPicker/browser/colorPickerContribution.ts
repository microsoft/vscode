/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { illegalArgument } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { IColorPresentation } from '../../../common/languages.js';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes.js';
import { _findColorData, _setupColorCommand, ColorPresentationsCollector, ExtColorDataCollector, IExtColorData } from './color.js';
import { ColorDetector } from './colorDetector.js';
import { DefaultDocumentColorProviderFeature } from './defaultDocumentColorProvider.js';
import { HoverColorPickerContribution } from './hoverColorPicker/hoverColorPickerContribution.js';
import { HoverColorPickerParticipant } from './hoverColorPicker/hoverColorPickerParticipant.js';
import { HideStandaloneColorPicker, InsertColorWithStandaloneColorPicker, ShowOrFocusStandaloneColorPicker } from './standaloneColorPicker/standaloneColorPickerActions.js';
import { StandaloneColorPickerController } from './standaloneColorPicker/standaloneColorPickerController.js';
import { Range } from '../../../common/core/range.js';

registerEditorAction(HideStandaloneColorPicker);
registerEditorAction(InsertColorWithStandaloneColorPicker);
registerAction2(ShowOrFocusStandaloneColorPicker);

registerEditorContribution(HoverColorPickerContribution.ID, HoverColorPickerContribution, EditorContributionInstantiation.BeforeFirstInteraction);
registerEditorContribution(StandaloneColorPickerController.ID, StandaloneColorPickerController, EditorContributionInstantiation.AfterFirstRender);
registerEditorContribution(ColorDetector.ID, ColorDetector, EditorContributionInstantiation.AfterFirstRender);
registerEditorFeature(DefaultDocumentColorProviderFeature);

HoverParticipantRegistry.register(HoverColorPickerParticipant);

CommandsRegistry.registerCommand('_executeDocumentColorProvider', function (accessor, ...args) {
	const [resource] = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}
	const { model, colorProviderRegistry, defaultColorDecoratorsEnablement } = _setupColorCommand(accessor, resource);
	return _findColorData<IExtColorData>(new ExtColorDataCollector(), colorProviderRegistry, model, CancellationToken.None, defaultColorDecoratorsEnablement);
});

CommandsRegistry.registerCommand('_executeColorPresentationProvider', function (accessor, ...args) {
	const [color, context] = args;
	if (!context) {
		return;
	}

	const { uri, range } = context as { uri?: unknown; range?: unknown };
	if (!(uri instanceof URI) || !Array.isArray(color) || color.length !== 4 || !Range.isIRange(range)) {
		throw illegalArgument();
	}
	const { model, colorProviderRegistry, defaultColorDecoratorsEnablement } = _setupColorCommand(accessor, uri);
	const [red, green, blue, alpha] = color;
	return _findColorData<IColorPresentation>(new ColorPresentationsCollector({ range: range, color: { red, green, blue, alpha } }), colorProviderRegistry, model, CancellationToken.None, defaultColorDecoratorsEnablement);
});
