/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { getTokenClassificationRegistry, typeAndModifierIdPattern } from '../../../../platform/theme/common/tokenClassificationRegistry.js';
const tokenClassificationRegistry = getTokenClassificationRegistry();
const tokenTypeExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'semanticTokenTypes',
    jsonSchema: {
        description: nls.localize('contributes.semanticTokenTypes', 'Contributes semantic token types.'),
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: nls.localize('contributes.semanticTokenTypes.id', 'The identifier of the semantic token type'),
                    pattern: typeAndModifierIdPattern,
                    patternErrorMessage: nls.localize('contributes.semanticTokenTypes.id.format', 'Identifiers should be in the form letterOrDigit[_-letterOrDigit]*'),
                },
                superType: {
                    type: 'string',
                    description: nls.localize('contributes.semanticTokenTypes.superType', 'The super type of the semantic token type'),
                    pattern: typeAndModifierIdPattern,
                    patternErrorMessage: nls.localize('contributes.semanticTokenTypes.superType.format', 'Super types should be in the form letterOrDigit[_-letterOrDigit]*'),
                },
                description: {
                    type: 'string',
                    description: nls.localize('contributes.color.description', 'The description of the semantic token type'),
                }
            }
        }
    }
});
const tokenModifierExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'semanticTokenModifiers',
    jsonSchema: {
        description: nls.localize('contributes.semanticTokenModifiers', 'Contributes semantic token modifiers.'),
        type: 'array',
        items: {
            type: 'object',
            properties: {
                id: {
                    type: 'string',
                    description: nls.localize('contributes.semanticTokenModifiers.id', 'The identifier of the semantic token modifier'),
                    pattern: typeAndModifierIdPattern,
                    patternErrorMessage: nls.localize('contributes.semanticTokenModifiers.id.format', 'Identifiers should be in the form letterOrDigit[_-letterOrDigit]*')
                },
                description: {
                    description: nls.localize('contributes.semanticTokenModifiers.description', 'The description of the semantic token modifier')
                }
            }
        }
    }
});
const tokenStyleDefaultsExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'semanticTokenScopes',
    jsonSchema: {
        description: nls.localize('contributes.semanticTokenScopes', 'Contributes semantic token scope maps.'),
        type: 'array',
        items: {
            type: 'object',
            properties: {
                language: {
                    description: nls.localize('contributes.semanticTokenScopes.languages', 'Lists the languge for which the defaults are.'),
                    type: 'string'
                },
                scopes: {
                    description: nls.localize('contributes.semanticTokenScopes.scopes', 'Maps a semantic token (described by semantic token selector) to one or more textMate scopes used to represent that token.'),
                    type: 'object',
                    additionalProperties: {
                        type: 'array',
                        items: {
                            type: 'string'
                        }
                    }
                }
            }
        }
    }
});
export class TokenClassificationExtensionPoints {
    constructor() {
        function validateTypeOrModifier(contribution, extensionPoint, collector) {
            if (typeof contribution.id !== 'string' || contribution.id.length === 0) {
                collector.error(nls.localize('invalid.id', "'configuration.{0}.id' must be defined and can not be empty", extensionPoint));
                return false;
            }
            if (!contribution.id.match(typeAndModifierIdPattern)) {
                collector.error(nls.localize('invalid.id.format', "'configuration.{0}.id' must follow the pattern letterOrDigit[-_letterOrDigit]*", extensionPoint));
                return false;
            }
            const superType = contribution.superType;
            if (superType && !superType.match(typeAndModifierIdPattern)) {
                collector.error(nls.localize('invalid.superType.format', "'configuration.{0}.superType' must follow the pattern letterOrDigit[-_letterOrDigit]*", extensionPoint));
                return false;
            }
            if (typeof contribution.description !== 'string' || contribution.id.length === 0) {
                collector.error(nls.localize('invalid.description', "'configuration.{0}.description' must be defined and can not be empty", extensionPoint));
                return false;
            }
            return true;
        }
        tokenTypeExtPoint.setHandler((extensions, delta) => {
            for (const extension of delta.added) {
                const extensionValue = extension.value;
                const collector = extension.collector;
                if (!extensionValue || !Array.isArray(extensionValue)) {
                    collector.error(nls.localize('invalid.semanticTokenTypeConfiguration', "'configuration.semanticTokenType' must be an array"));
                    return;
                }
                for (const contribution of extensionValue) {
                    if (validateTypeOrModifier(contribution, 'semanticTokenType', collector)) {
                        tokenClassificationRegistry.registerTokenType(contribution.id, contribution.description, contribution.superType);
                    }
                }
            }
            for (const extension of delta.removed) {
                const extensionValue = extension.value;
                for (const contribution of extensionValue) {
                    tokenClassificationRegistry.deregisterTokenType(contribution.id);
                }
            }
        });
        tokenModifierExtPoint.setHandler((extensions, delta) => {
            for (const extension of delta.added) {
                const extensionValue = extension.value;
                const collector = extension.collector;
                if (!extensionValue || !Array.isArray(extensionValue)) {
                    collector.error(nls.localize('invalid.semanticTokenModifierConfiguration', "'configuration.semanticTokenModifier' must be an array"));
                    return;
                }
                for (const contribution of extensionValue) {
                    if (validateTypeOrModifier(contribution, 'semanticTokenModifier', collector)) {
                        tokenClassificationRegistry.registerTokenModifier(contribution.id, contribution.description);
                    }
                }
            }
            for (const extension of delta.removed) {
                const extensionValue = extension.value;
                for (const contribution of extensionValue) {
                    tokenClassificationRegistry.deregisterTokenModifier(contribution.id);
                }
            }
        });
        tokenStyleDefaultsExtPoint.setHandler((extensions, delta) => {
            for (const extension of delta.added) {
                const extensionValue = extension.value;
                const collector = extension.collector;
                if (!extensionValue || !Array.isArray(extensionValue)) {
                    collector.error(nls.localize('invalid.semanticTokenScopes.configuration', "'configuration.semanticTokenScopes' must be an array"));
                    return;
                }
                for (const contribution of extensionValue) {
                    if (contribution.language && typeof contribution.language !== 'string') {
                        collector.error(nls.localize('invalid.semanticTokenScopes.language', "'configuration.semanticTokenScopes.language' must be a string"));
                        continue;
                    }
                    if (!contribution.scopes || typeof contribution.scopes !== 'object') {
                        collector.error(nls.localize('invalid.semanticTokenScopes.scopes', "'configuration.semanticTokenScopes.scopes' must be defined as an object"));
                        continue;
                    }
                    for (const selectorString in contribution.scopes) {
                        const tmScopes = contribution.scopes[selectorString];
                        if (!Array.isArray(tmScopes) || tmScopes.some(l => typeof l !== 'string')) {
                            collector.error(nls.localize('invalid.semanticTokenScopes.scopes.value', "'configuration.semanticTokenScopes.scopes' values must be an array of strings"));
                            continue;
                        }
                        try {
                            const selector = tokenClassificationRegistry.parseTokenSelector(selectorString, contribution.language);
                            tokenClassificationRegistry.registerTokenStyleDefault(selector, { scopesToProbe: tmScopes.map(s => s.split(' ')) });
                        }
                        catch (e) {
                            collector.error(nls.localize('invalid.semanticTokenScopes.scopes.selector', "configuration.semanticTokenScopes.scopes': Problems parsing selector {0}.", selectorString));
                            // invalid selector, ignore
                        }
                    }
                }
            }
            for (const extension of delta.removed) {
                const extensionValue = extension.value;
                for (const contribution of extensionValue) {
                    for (const selectorString in contribution.scopes) {
                        const tmScopes = contribution.scopes[selectorString];
                        try {
                            const selector = tokenClassificationRegistry.parseTokenSelector(selectorString, contribution.language);
                            tokenClassificationRegistry.registerTokenStyleDefault(selector, { scopesToProbe: tmScopes.map(s => s.split(' ')) });
                        }
                        catch (e) {
                            // invalid selector, ignore
                        }
                    }
                }
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidG9rZW5DbGFzc2lmaWNhdGlvbkV4dGVuc2lvblBvaW50LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL3RoZW1lcy9jb21tb24vdG9rZW5DbGFzc2lmaWNhdGlvbkV4dGVuc2lvblBvaW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxHQUFHLE1BQU0sb0JBQW9CLENBQUM7QUFDMUMsT0FBTyxFQUFFLGtCQUFrQixFQUE2QixNQUFNLCtDQUErQyxDQUFDO0FBQzlHLE9BQU8sRUFBRSw4QkFBOEIsRUFBZ0Msd0JBQXdCLEVBQUUsTUFBTSxrRUFBa0UsQ0FBQztBQWtCMUssTUFBTSwyQkFBMkIsR0FBaUMsOEJBQThCLEVBQUUsQ0FBQztBQUVuRyxNQUFNLGlCQUFpQixHQUFHLGtCQUFrQixDQUFDLHNCQUFzQixDQUE2QjtJQUMvRixjQUFjLEVBQUUsb0JBQW9CO0lBQ3BDLFVBQVUsRUFBRTtRQUNYLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLG1DQUFtQyxDQUFDO1FBQ2hHLElBQUksRUFBRSxPQUFPO1FBQ2IsS0FBSyxFQUFFO1lBQ04sSUFBSSxFQUFFLFFBQVE7WUFDZCxVQUFVLEVBQUU7Z0JBQ1gsRUFBRSxFQUFFO29CQUNILElBQUksRUFBRSxRQUFRO29CQUNkLFdBQVcsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLDJDQUEyQyxDQUFDO29CQUMzRyxPQUFPLEVBQUUsd0JBQXdCO29CQUNqQyxtQkFBbUIsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLDBDQUEwQyxFQUFFLG1FQUFtRSxDQUFDO2lCQUNsSjtnQkFDRCxTQUFTLEVBQUU7b0JBQ1YsSUFBSSxFQUFFLFFBQVE7b0JBQ2QsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENB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