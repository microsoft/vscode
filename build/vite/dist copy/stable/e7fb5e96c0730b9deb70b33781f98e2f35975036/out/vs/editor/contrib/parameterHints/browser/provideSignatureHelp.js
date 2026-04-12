/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { assertType } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { Position } from '../../../common/core/position.js';
import * as languages from '../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { ITextModelService } from '../../../common/services/resolverService.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
export const Context = {
    Visible: new RawContextKey('parameterHintsVisible', false),
    MultipleSignatures: new RawContextKey('parameterHintsMultipleSignatures', false),
};
export async function provideSignatureHelp(registry, model, position, context, token) {
    const supports = registry.ordered(model);
    for (const support of supports) {
        try {
            const result = await support.provideSignatureHelp(model, position, token, context);
            if (result) {
                return result;
            }
        }
        catch (err) {
            onUnexpectedExternalError(err);
        }
    }
    return undefined;
}
CommandsRegistry.registerCommand('_executeSignatureHelpProvider', async (accessor, ...args) => {
    const [uri, position, triggerCharacter] = args;
    assertType(URI.isUri(uri));
    assertType(Position.isIPosition(position));
    assertType(typeof triggerCharacter === 'string' || !triggerCharacter);
    const languageFeaturesService = accessor.get(ILanguageFeaturesService);
    const ref = await accessor.get(ITextModelService).createModelReference(uri);
    try {
        const result = await provideSignatureHelp(languageFeaturesService.signatureHelpProvider, ref.object.textEditorModel, Position.lift(position), {
            triggerKind: languages.SignatureHelpTriggerKind.Invoke,
            isRetrigger: false,
            triggerCharacter,
        }, CancellationToken.None);
        if (!result) {
            return undefined;
        }
        setTimeout(() => result.dispose(), 0);
        return result.value;
    }
    finally {
        ref.dispose();
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvdmlkZVNpZ25hdHVyZUhlbHAuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9wYXJhbWV0ZXJIaW50cy9icm93c2VyL3Byb3ZpZGVTaWduYXR1cmVIZWxwLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzlFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFhLFFBQVEsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBRXZFLE9BQU8sS0FBSyxTQUFTLE1BQU0sOEJBQThCLENBQUM7QUFFMUQsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDeEYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDaEYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDcEYsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBRXJGLE1BQU0sQ0FBQyxNQUFNLE9BQU8sR0FBRztJQUN0QixPQUFPLEVBQUUsSUFBSSxhQUFhLENBQVUsdUJBQXVCLEVBQUUsS0FBSyxDQUFDO0lBQ25FLGtCQUFrQixFQUFFLElBQUksYUFBYSxDQUFVLGtDQUFrQyxFQUFFLEtBQUssQ0FBQztDQUN6RixDQUFDO0FBRUYsTUFBTSxDQUFDLEtBQUssVUFBVSxvQkFBb0IsQ0FDekMsUUFBa0UsRUFDbEUsS0FBaUIsRUFDakIsUUFBa0IsRUFDbEIsT0FBdUMsRUFDdkMsS0FBd0I7SUFHeEIsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUV6QyxLQUFLLE1BQU0sT0FBTyxJQUFJLFFBQVEsRUFBRSxDQUFDO1FBQ2hDLElBQUksQ0FBQztZQUNKLE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxDQUFDLG9CQUFvQixDQUFDLEtBQUssRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ25GLElBQUksTUFBTSxFQUFFLENBQUM7Z0JBQ1osT0FBTyxNQUFNLENBQUM7WUFDZixDQUFDO1FBQ0YsQ0FBQztRQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7WUFDZCx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoQyxDQUFDO0lBQ0YsQ0FBQztJQUNELE9BQU8sU0FBUyxDQUFDO0FBQ2xCLENBQUM7QUFFRCxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsK0JBQStCLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxHQUFHLElBQStCLEVBQUUsRUFBRTtJQUN4SCxNQUFNLENBQUMsR0FBRyxFQUFFLFFBQVEsRUFBRSxnQkFBZ0IsQ0FBQyxHQUFHLElBQUksQ0FBQztJQUMvQyxVQUFVLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0lBQzNCLFVBQVUsQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7SUFDM0MsVUFBVSxDQUFDLE9BQU8sZ0JBQWdCLEtBQUssUUFBUSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUV0RSxNQUFNLHVCQUF1QixHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsd0JBQXdCLENBQUMsQ0FBQztJQUV2RSxNQUFNLEdBQUcsR0FBRyxNQUFNLFFBQVEsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUM1RSxJQUFJLENBQUM7UUFFSixNQUFNLE1BQU0sR0FBRyxNQUFNLG9CQUFvQixDQUFDLHVCQUF1QixDQUFDLHFCQUFxQixFQUFFLEdBQUcsQ0FBQyxNQUFNLENBQUMsZUFBZSxFQUFFLFFBQVEsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDN0ksV0FBVyxFQUFFLFNBQVMsQ0FBQyx3QkFBd0IsQ0FBQyxNQUFNO1lBQ3RELFdBQVcsRUFBRSxLQUFLO1lBQ2xCLGdCQUFnQjtTQUNoQixFQUFFLGlCQUFpQixDQUFDLElBQUksQ0FBQyxDQUFDO1FBRTNCLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNiLE9BQU8sU0FBUyxDQUFDO1FBQ2xCLENBQUM7UUFFRCxVQUFVLENBQUMsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3RDLE9BQU8sTUFBTSxDQUFDLEtBQUssQ0FBQztJQUVyQixDQUFDO1lBQVMsQ0FBQztRQUNWLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNmLENBQUM7QUFDRixDQUFDLENBQUMsQ0FBQyJ9