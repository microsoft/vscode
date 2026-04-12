/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ClearDisplayLanguageAction, ConfigureDisplayLanguageAction } from './localizationsActions.js';
import { Extensions } from '../../../services/extensionManagement/common/extensionFeatures.js';
import { ExtensionsRegistry } from '../../../services/extensions/common/extensionsRegistry.js';
export class BaseLocalizationWorkbenchContribution extends Disposable {
    constructor() {
        super();
        // Register action to configure locale and related settings
        registerAction2(ConfigureDisplayLanguageAction);
        registerAction2(ClearDisplayLanguageAction);
        ExtensionsRegistry.registerExtensionPoint({
            extensionPoint: 'localizations',
            defaultExtensionKind: ['ui', 'workspace'],
            jsonSchema: {
                description: localize('vscode.extension.contributes.localizations', "Contributes localizations to the editor"),
                type: 'array',
                default: [],
                items: {
                    type: 'object',
                    required: ['languageId', 'translations'],
                    defaultSnippets: [{ body: { languageId: '', languageName: '', localizedLanguageName: '', translations: [{ id: 'vscode', path: '' }] } }],
                    properties: {
                        languageId: {
                            description: localize('vscode.extension.contributes.localizations.languageId', 'Id of the language into which the display strings are translated.'),
                            type: 'string'
                        },
                        languageName: {
                            description: localize('vscode.extension.contributes.localizations.languageName', 'Name of the language in English.'),
                            type: 'string'
                        },
                        localizedLanguageName: {
                            description: localize('vscode.extension.contributes.localizations.languageNameLocalized', 'Name of the language in contributed language.'),
                            type: 'string'
                        },
                        translations: {
                            description: localize('vscode.extension.contributes.localizations.translations', 'List of translations associated to the language.'),
                            type: 'array',
                            default: [{ id: 'vscode', path: '' }],
                            items: {
                                type: 'object',
                                required: ['id', 'path'],
                                properties: {
                                    id: {
                                        type: 'string',
                                        description: localize('vscode.extension.contributes.localizations.translations.id', "Id of VS Code or Extension for which this translation is contributed to. Id of VS Code is always `vscode` and of extension should be in format `publisherId.extensionName`."),
                                        pattern: '^((vscode)|([a-z0-9A-Z][a-z0-9A-Z-]*)\\.([a-z0-9A-Z][a-z0-9A-Z-]*))$',
                                        patternErrorMessage: localize('vscode.extension.contributes.localizations.translations.id.pattern', "Id should be `vscode` or in format `publisherId.extensionName` for translating VS code or an extension respectively.")
                                    },
                                    path: {
                                        type: 'string',
                                        description: localize('vscode.extension.contributes.localizations.translations.path', "A relative path to a file containing translations for the language.")
                                    }
                                },
                                defaultSnippets: [{ body: { id: '', path: '' } }],
                            },
                        }
                    }
                }
            }
        });
    }
}
class LocalizationsDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.localizations;
    }
    render(manifest) {
        const localizations = manifest.contributes?.localizations || [];
        if (!localizations.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('language id', "Language ID"),
            localize('localizations language name', "Language Name"),
            localize('localizations localized language name', "Language Name (Localized)"),
        ];
        const rows = localizations
            .sort((a, b) => a.languageId.localeCompare(b.languageId))
            .map(localization => {
            return [
                localization.languageId,
                localization.languageName ?? '',
                localization.localizedLanguageName ?? ''
            ];
        });
        return {
            data: {
                headers,
                rows
            },
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'localizations',
    label: localize('localizations', "Language Packs"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(LocalizationsDataRenderer),
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxpemF0aW9uLmNvbnRyaWJ1dGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2xvY2FsaXphdGlvbi9jb21tb24vbG9jYWxpemF0aW9uLmNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUVqRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUYsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRTVFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSw4QkFBOEIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3ZHLE9BQU8sRUFBbUcsVUFBVSxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFDaE0sT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMkRBQTJELENBQUM7QUFFL0YsTUFBTSxPQUFPLHFDQUFzQyxTQUFRLFVBQVU7SUFDcEU7UUFDQyxLQUFLLEVBQUUsQ0FBQztRQUVSLDJEQUEyRDtRQUMzRCxlQUFlLENBQUMsOEJBQThCLENBQUMsQ0FBQztRQUNoRCxlQUFlLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUU1QyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBQztZQUN6QyxjQUFjLEVBQUUsZUFBZTtZQUMvQixvQkFBb0IsRUFBRSxDQUFDLElBQUksRUFBRSxXQUFXLENBQUM7WUFDekMsVUFBVSxFQUFFO2dCQUNYLFdBQVcsRUFBRSxRQUFRLENBQUMsNENBQTRDLEVBQUUseUNBQXlDLENBQUM7Z0JBQzlHLElBQUksRUFB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