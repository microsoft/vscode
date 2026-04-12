/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../nls.js';
import { clearConfiguredLanguageAssociations, registerConfiguredLanguageAssociation } from '../../../../editor/common/services/languagesAssociations.js';
import { joinPath } from '../../../../base/common/resources.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { LanguageService } from '../../../../editor/common/services/languageService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { FILES_ASSOCIATIONS_CONFIG } from '../../../../platform/files/common/files.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions } from '../../extensionManagement/common/extensionFeatures.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { index } from '../../../../base/common/arrays.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { isString } from '../../../../base/common/types.js';
export const languagesExtPoint = ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: 'languages',
    jsonSchema: {
        description: localize('vscode.extension.contributes.languages', 'Contributes language declarations.'),
        type: 'array',
        items: {
            type: 'object',
            defaultSnippets: [{ body: { id: '${1:languageId}', aliases: ['${2:label}'], extensions: ['${3:extension}'], configuration: './language-configuration.json' } }],
            properties: {
                id: {
                    description: localize('vscode.extension.contributes.languages.id', 'ID of the language.'),
                    type: 'string'
                },
                aliases: {
                    description: localize('vscode.extension.contributes.languages.aliases', 'Name aliases for the language.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                extensions: {
                    description: localize('vscode.extension.contributes.languages.extensions', 'File extensions associated to the language.'),
                    default: ['.foo'],
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                filenames: {
                    description: localize('vscode.extension.contributes.languages.filenames', 'File names associated to the language.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                filenamePatterns: {
                    description: localize('vscode.extension.contributes.languages.filenamePatterns', 'File name glob patterns associated to the language.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                mimetypes: {
                    description: localize('vscode.extension.contributes.languages.mimetypes', 'Mime types associated to the language.'),
                    type: 'array',
                    items: {
                        type: 'string'
                    }
                },
                firstLine: {
                    description: localize('vscode.extension.contributes.languages.firstLine', 'A regular expression matching the first line of a file of the language.'),
                    type: 'string'
                },
                configuration: {
                    description: localize('vscode.extension.contributes.languages.configuration', 'A relative path to a file containing configuration options for the language.'),
                    type: 'string',
                    default: './language-configuration.json'
                },
                icon: {
                    type: 'object',
                    description: localize('vscode.extension.contributes.languages.icon', 'A icon to use as file icon, if no icon theme provides one for the language.'),
                    properties: {
                        light: {
                            description: localize('vscode.extension.contributes.languages.icon.light', 'Icon path when a light theme is used'),
                            type: 'string'
                        },
                        dark: {
                            description: localize('vscode.extension.contributes.languages.icon.dark', 'Icon path when a dark theme is used'),
                            type: 'string'
                        }
                    }
                }
            }
        }
    },
    activationEventsGenerator: function* (languageContributions) {
        for (const languageContribution of languageContributions) {
            if (languageContribution.id && languageContribution.configuration) {
                yield `onLanguage:${languageContribution.id}`;
            }
        }
    }
});
class LanguageTableRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'table';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.languages;
    }
    render(manifest) {
        const contributes = manifest.contributes;
        const rawLanguages = contributes?.languages || [];
        const languages = [];
        for (const l of rawLanguages) {
            if (isValidLanguageExtensionPoint(l)) {
                languages.push({
                    id: l.id,
                    name: (l.aliases || [])[0] || l.id,
                    extensions: l.extensions || [],
                    hasGrammar: false,
                    hasSnippets: false
                });
            }
        }
        const byId = index(languages, l => l.id);
        const grammars = contributes?.grammars || [];
        grammars.forEach(grammar => {
            if (!isString(grammar.language)) {
                // ignore the grammars that are only used as includes in other grammars
                return;
            }
            let language = byId[grammar.language];
            if (language) {
                language.hasGrammar = true;
            }
            else {
                language = { id: grammar.language, name: grammar.language, extensions: [], hasGrammar: true, hasSnippets: false };
                byId[language.id] = language;
                languages.push(language);
            }
        });
        const snippets = contributes?.snippets || [];
        snippets.forEach(snippet => {
            if (!isString(snippet.language)) {
                // ignore invalid snippets
                return;
            }
            let language = byId[snippet.language];
            if (language) {
                language.hasSnippets = true;
            }
            else {
                language = { id: snippet.language, name: snippet.language, extensions: [], hasGrammar: false, hasSnippets: true };
                byId[language.id] = language;
                languages.push(language);
            }
        });
        if (!languages.length) {
            return { data: { headers: [], rows: [] }, dispose: () => { } };
        }
        const headers = [
            localize('language id', "ID"),
            localize('language name', "Name"),
            localize('file extensions', "File Extensions"),
            localize('grammar', "Grammar"),
            localize('snippets', "Snippets")
        ];
        const rows = languages.sort((a, b) => a.id.localeCompare(b.id))
            .map(l => {
            return [
                l.id, l.name,
                new MarkdownString().appendMarkdown(`${l.extensions.map(e => `\`${e}\``).join('&nbsp;')}`),
                l.hasGrammar ? '✔︎' : '\u2014',
                l.hasSnippets ? '✔︎' : '\u2014'
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
    id: 'languages',
    label: localize('languages', "Programming Languages"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(LanguageTableRenderer),
});
let WorkbenchLanguageService = class WorkbenchLanguageService extends LanguageService {
    constructor(extensionService, configurationService, environmentService, logService) {
        super(environmentService.verbose || environmentService.isExtensionDevelopment || !environmentService.isBuilt);
        this.logService = logService;
        this._configurationService = configurationService;
        this._extensionService = extensionService;
        languagesExtPoint.setHandler((extensions) => {
            const allValidLanguages = [];
            for (let i = 0, len = extensions.length; i < len; i++) {
                const extension = extensions[i];
                if (!Array.isArray(extension.value)) {
                    extension.collector.error(localize('invalid', "Invalid `contributes.{0}`. Expected an array.", languagesExtPoint.name));
                    continue;
                }
                for (let j = 0, lenJ = extension.value.length; j < lenJ; j++) {
                    const ext = extension.value[j];
                    if (isValidLanguageExtensionPoint(ext, extension.collector)) {
                        let configuration = undefined;
                        if (ext.configuration) {
                            configuration = joinPath(extension.description.extensionLocation, ext.configuration);
                        }
                        allValidLanguages.push({
                            id: ext.id,
                            extensions: ext.extensions,
                            filenames: ext.filenames,
                            filenamePatterns: ext.filenamePatterns,
                            firstLine: ext.firstLine,
                            aliases: ext.aliases,
                            mimetypes: ext.mimetypes,
                            configuration: configuration,
                            icon: ext.icon && {
                                light: joinPath(extension.description.extensionLocation, ext.icon.light),
                                dark: joinPath(extension.description.extensionLocation, ext.icon.dark)
                            }
                        });
                    }
                }
            }
            this._registry.setDynamicLanguages(allValidLanguages);
        });
        this.updateMime();
        this._register(this._configurationService.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
                this.updateMime();
            }
        }));
        this._extensionService.whenInstalledExtensionsRegistered().then(() => {
            this.updateMime();
        });
        this._register(this.onDidRequestRichLanguageFeatures((languageId) => {
            // extension activation
            this._extensionService.activateByEvent(`onLanguage:${languageId}`);
            this._extensionService.activateByEvent(`onLanguage`);
        }));
    }
    updateMime() {
        const configuration = this._configurationService.getValue();
        // Clear user configured mime associations
        clearConfiguredLanguageAssociations();
        // Register based on settings
        if (configuration.files?.associations) {
            Object.keys(configuration.files.associations).forEach(pattern => {
                const langId = configuration.files.associations[pattern];
                if (typeof langId !== 'string') {
                    this.logService.warn(`Ignoring configured 'files.associations' for '${pattern}' because its type is not a string but '${typeof langId}'`);
                    return; // https://github.com/microsoft/vscode/issues/147284
                }
                const mimeType = this.getMimeType(langId) || `text/x-${langId}`;
                registerConfiguredLanguageAssociation({ id: langId, mime: mimeType, filepattern: pattern });
            });
        }
        this._onDidChange.fire();
    }
};
WorkbenchLanguageService = __decorate([
    __param(0, IExtensionService),
    __param(1, IConfigurationService),
    __param(2, IEnvironmentService),
    __param(3, ILogService)
], WorkbenchLanguageService);
export { WorkbenchLanguageService };
function isUndefinedOrStringArray(value) {
    if (typeof value === 'undefined') {
        return true;
    }
    if (!Array.isArray(value)) {
        return false;
    }
    return value.every(item => typeof item === 'string');
}
function isValidLanguageExtensionPoint(value, collector) {
    if (!value) {
        collector?.error(localize('invalid.empty', "Empty value for `contributes.{0}`", languagesExtPoint.name));
        return false;
    }
    if (typeof value.id !== 'string') {
        collector?.error(localize('require.id', "property `{0}` is mandatory and must be of type `string`", 'id'));
        return false;
    }
    if (!isUndefinedOrStringArray(value.extensions)) {
        collector?.error(localize('opt.extensions', "property `{0}` can be omitted and must be of type `string[]`", 'extensions'));
        return false;
    }
    if (!isUndefinedOrStringArray(value.filenames)) {
        collector?.error(localize('opt.filenames', "property `{0}` can be omitted and must be of type `string[]`", 'filenames'));
        return false;
    }
    if (typeof value.firstLine !== 'undefined' && typeof value.firstLine !== 'string') {
        collector?.error(localize('opt.firstLine', "property `{0}` can be omitted and must be of type `string`", 'firstLine'));
        return false;
    }
    if (typeof value.configuration !== 'undefined' && typeof value.configuration !== 'string') {
        collector?.error(localize('opt.configuration', "property `{0}` can be omitted and must be of type `string`", 'configuration'));
        return false;
    }
    if (!isUndefinedOrStringArray(value.aliases)) {
        collector?.error(localize('opt.aliases', "property `{0}` can be omitted and must be of type `string[]`", 'aliases'));
        return false;
    }
    if (!isUndefinedOrStringArray(value.mimetypes)) {
        collector?.error(localize('opt.mimetypes', "property `{0}` can be omitted and must be of type `string[]`", 'mimetypes'));
        return false;
    }
    if (typeof value.icon !== 'undefined') {
        if (typeof value.icon !== 'object' || typeof value.icon.light !== 'string' || typeof value.icon.dark !== 'string') {
            collector?.error(localize('opt.icon', "property `{0}` can be omitted and must be of type `object` with properties `{1}` and `{2}` of type `string`", 'icon', 'light', 'dark'));
            return false;
        }
    }
    return true;
}
registerSingleton(ILanguageService, WorkbenchLanguageService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2xhbmd1YWdlL2NvbW1vbi9sYW5ndWFnZVNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxxQ0FBcUMsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQ3pKLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUVoRSxPQUFPLEVBQTJCLGdCQUFnQixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDNUcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3hGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx5QkFBeUIsRUFBdUIsTUFBTSw0Q0FBNEMsQ0FBQztBQUM1RyxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUMxRSxPQUFPLEVBQTZCLGtCQUFrQixFQUF3QyxNQUFNLCtDQUErQyxDQUFDO0FBQ3BKLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUUvRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLEVBQW1HLE1BQU0sdURBQXVELENBQUM7QUFDcEwsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9B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