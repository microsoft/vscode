/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { illegalArgument } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { registerEditorAction, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { registerEditorFeature } from '../../../common/editorFeatures.js';
import { HoverParticipantRegistry } from '../../hover/browser/hoverTypes.js';
import { _findColorData, _setupColorCommand, ColorPresentationsCollector, ExtColorDataCollector } from './color.js';
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
registerEditorContribution(HoverColorPickerContribution.ID, HoverColorPickerContribution, 2 /* EditorContributionInstantiation.BeforeFirstInteraction */);
registerEditorContribution(StandaloneColorPickerController.ID, StandaloneColorPickerController, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorContribution(ColorDetector.ID, ColorDetector, 1 /* EditorContributionInstantiation.AfterFirstRender */);
registerEditorFeature(DefaultDocumentColorProviderFeature);
HoverParticipantRegistry.register(HoverColorPickerParticipant);
CommandsRegistry.registerCommand('_executeDocumentColorProvider', function (accessor, ...args) {
    const [resource] = args;
    if (!(resource instanceof URI)) {
        throw illegalArgument();
    }
    const { model, colorProviderRegistry, defaultColorDecoratorsEnablement } = _setupColorCommand(accessor, resource);
    return _findColorData(new ExtColorDataCollector(), colorProviderRegistry, model, CancellationToken.None, defaultColorDecoratorsEnablement);
});
CommandsRegistry.registerCommand('_executeColorPresentationProvider', function (accessor, ...args) {
    const [color, context] = args;
    if (!context) {
        return;
    }
    const { uri, range } = context;
    if (!(uri instanceof URI) || !Array.isArray(color) || color.length !== 4 || !Range.isIRange(range)) {
        throw illegalArgument();
    }
    const { model, colorProviderRegistry, defaultColorDecoratorsEnablement } = _setupColorCommand(accessor, uri);
    const [red, green, blue, alpha] = color;
    return _findColorData(new ColorPresentationsCollector({ range: range, color: { red, green, blue, alpha } }), colorProviderRegistry, model, CancellationToken.None, defaultColorDecoratorsEnablement);
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29sb3JQaWNrZXJDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9jb2xvclBpY2tlci9icm93c2VyL2NvbG9yUGlja2VyQ29udHJpYnV0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwRSxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ2pGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQ3BGLE9BQU8sRUFBbUMsb0JBQW9CLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN6SSxPQUFPLEVBQUUscUJBQXFCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUUxRSxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLDJCQUEyQixFQUFFLHFCQUFxQixFQUFpQixNQUFNLFlBQVksQ0FBQztBQUNuSSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFDbkQsT0FBTyxFQUFFLG1DQUFtQyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDeEYsT0FBTyxFQUFFLDRCQUE0QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDbEcsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sbURBQW1ELENBQUM7QUFDaEcsT0FBTyxFQUFFLHlCQUF5QixFQUFFLG9DQUFvQyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0s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