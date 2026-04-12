/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import * as types from '../../../../base/common/types.js';
import * as resources from '../../../../base/common/resources.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { ExtensionData, migrateThemeSettingsId } from './workbenchThemeService.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { Extensions } from '../../extensionManagement/common/extensionFeatures.js';
import { MarkdownString } from '../../../../base/common/htmlContent.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { ThemeTypeSelector } from '../../../../platform/theme/common/theme.js';
export function registerColorThemeExtensionPoint() {
    return ExtensionsRegistry.registerExtensionPoint({
        extensionPoint: 'themes',
        jsonSchema: {
            description: nls.localize('vscode.extension.contributes.themes', 'Contributes textmate color themes.'),
            type: 'array',
            items: {
                type: 'object',
                defaultSnippets: [{ body: { label: '${1:label}', id: '${2:id}', uiTheme: ThemeTypeSelector.VS_DARK, path: './themes/${3:id}.tmTheme.' } }],
                properties: {
                    id: {
                        description: nls.localize('vscode.extension.contributes.themes.id', 'Id of the color theme as used in the user settings.'),
                        type: 'string'
                    },
                    label: {
                        description: nls.localize('vscode.extension.contributes.themes.label', 'Label of the color theme as shown in the UI.'),
                        type: 'string'
                    },
                    uiTheme: {
                        markdownDescription: nls.localize('vscode.extension.contributes.themes.uiTheme', 'Base theme defining the colors around the editor: `vs` is the light color theme, `vs-dark` is the dark color theme. `hc-black` is the dark high contrast theme, `hc-light` is the light high contrast theme.'),
                        enum: [ThemeTypeSelector.VS, ThemeTypeSelector.VS_DARK, ThemeTypeSelector.HC_BLACK, ThemeTypeSelector.HC_LIGHT]
                    },
                    path: {
                        markdownDescription: nls.localize('vscode.extension.contributes.themes.path', 'Path of the tmTheme file. The path is relative to the extension folder and is typically `./colorthemes/awesome-color-theme.json`.'),
                        type: 'string'
                    }
                },
                required: ['path', 'uiTheme']
            }
        }
    });
}
export function registerFileIconThemeExtensionPoint() {
    return ExtensionsRegistry.registerExtensionPoint({
        extensionPoint: 'iconThemes',
        jsonSchema: {
            description: nls.localize('vscode.extension.contributes.iconThemes', 'Contributes file icon themes.'),
            type: 'array',
            items: {
                type: 'object',
                defaultSnippets: [{ body: { id: '${1:id}', label: '${2:label}', path: './fileicons/${3:id}-icon-theme.json' } }],
                properties: {
                    id: {
                        description: nls.localize('vscode.extension.contributes.iconThemes.id', 'Id of the file icon theme as used in the user settings.'),
                        type: 'string'
                    },
                    label: {
                        description: nls.localize('vscode.extension.contributes.iconThemes.label', 'Label of the file icon theme as shown in the UI.'),
                        type: 'string'
                    },
                    path: {
                        description: nls.localize('vscode.extension.contributes.iconThemes.path', 'Path of the file icon theme definition file. The path is relative to the extension folder and is typically \'./fileicons/awesome-icon-theme.json\'.'),
                        type: 'string'
                    }
                },
                required: ['path', 'id']
            }
        }
    });
}
export function registerProductIconThemeExtensionPoint() {
    return ExtensionsRegistry.registerExtensionPoint({
        extensionPoint: 'productIconThemes',
        jsonSchema: {
            description: nls.localize('vscode.extension.contributes.productIconThemes', 'Contributes product icon themes.'),
            type: 'array',
            items: {
                type: 'object',
                defaultSnippets: [{ body: { id: '${1:id}', label: '${2:label}', path: './producticons/${3:id}-product-icon-theme.json' } }],
                properties: {
                    id: {
                        description: nls.localize('vscode.extension.contributes.productIconThemes.id', 'Id of the product icon theme as used in the user settings.'),
                        type: 'string'
                    },
                    label: {
                        description: nls.localize('vscode.extension.contributes.productIconThemes.label', 'Label of the product icon theme as shown in the UI.'),
                        type: 'string'
                    },
                    path: {
                        description: nls.localize('vscode.extension.contributes.productIconThemes.path', 'Path of the product icon theme definition file. The path is relative to the extension folder and is typically \'./producticons/awesome-product-icon-theme.json\'.'),
                        type: 'string'
                    }
                },
                required: ['path', 'id']
            }
        }
    });
}
class ThemeDataRenderer extends Disposable {
    constructor() {
        super(...arguments);
        this.type = 'markdown';
    }
    shouldRender(manifest) {
        return !!manifest.contributes?.themes || !!manifest.contributes?.iconThemes || !!manifest.contributes?.productIconThemes;
    }
    render(manifest) {
        const markdown = new MarkdownString();
        if (manifest.contributes?.themes) {
            markdown.appendMarkdown(`### ${nls.localize('color themes', "Color Themes")}\n\n`);
            for (const theme of manifest.contributes.themes) {
                markdown.appendMarkdown(`- ${theme.label}\n`);
            }
        }
        if (manifest.contributes?.iconThemes) {
            markdown.appendMarkdown(`### ${nls.localize('file icon themes', "File Icon Themes")}\n\n`);
            for (const theme of manifest.contributes.iconThemes) {
                markdown.appendMarkdown(`- ${theme.label}\n`);
            }
        }
        if (manifest.contributes?.productIconThemes) {
            markdown.appendMarkdown(`### ${nls.localize('product icon themes', "Product Icon Themes")}\n\n`);
            for (const theme of manifest.contributes.productIconThemes) {
                markdown.appendMarkdown(`- ${theme.label}\n`);
            }
        }
        return {
            data: markdown,
            dispose: () => { }
        };
    }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
    id: 'themes',
    label: nls.localize('themes', "Themes"),
    access: {
        canToggle: false
    },
    renderer: new SyncDescriptor(ThemeDataRenderer),
});
export class ThemeRegistry {
    constructor(themesExtPoint, create, idRequired = false, builtInTheme = undefined) {
        this.themesExtPoint = themesExtPoint;
        this.create = create;
        this.idRequired = idRequired;
        this.builtInTheme = builtInTheme;
        this.onDidChangeEmitter = new Emitter();
        this.onDidChange = this.onDidChangeEmitter.event;
        this.extensionThemes = [];
        this.initialize();
    }
    dispose() {
        this.themesExtPoint.setHandler(() => { });
        this.onDidChangeEmitter.dispose();
    }
    initialize() {
        this.themesExtPoint.setHandler((extensions, delta) => {
            const previousIds = {};
            const added = [];
            for (const theme of this.extensionThemes) {
                previousIds[theme.id] = theme;
            }
            this.extensionThemes.length = 0;
            for (const ext of extensions) {
                const extensionData = ExtensionData.fromName(ext.description.publisher, ext.description.name, ext.description.isBuiltin);
                this.onThemes(extensionData, ext.description.extensionLocation, ext.value, this.extensionThemes, ext.collector);
            }
            for (const theme of this.extensionThemes) {
                if (!previousIds[theme.id]) {
                    added.push(theme);
                }
                else {
                    delete previousIds[theme.id];
                }
            }
            const removed = Object.values(previousIds);
            this.onDidChangeEmitter.fire({ themes: this.extensionThemes, added, removed });
        });
    }
    onThemes(extensionData, extensionLocation, themeContributions, resultingThemes = [], log) {
        if (!Array.isArray(themeContributions)) {
            log?.error(nls.localize('reqarray', "Extension point `{0}` must be an array.", this.themesExtPoint.name));
            return resultingThemes;
        }
        themeContributions.forEach(theme => {
            if (!theme.path || !types.isString(theme.path)) {
                log?.error(nls.localize('reqpath', "Expected string in `contributes.{0}.path`. Provided value: {1}", this.themesExtPoint.name, String(theme.path)));
                return;
            }
            if (this.idRequired && (!theme.id || !types.isString(theme.id))) {
                log?.error(nls.localize('reqid', "Expected string in `contributes.{0}.id`. Provided value: {1}", this.themesExtPoint.name, String(theme.id)));
                return;
            }
            const themeLocation = resources.joinPath(extensionLocation, theme.path);
            if (!resources.isEqualOrParent(themeLocation, extensionLocation)) {
                log?.warn(nls.localize('invalid.path.1', "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", this.themesExtPoint.name, themeLocation.path, extensionLocation.path));
            }
            const themeData = this.create(theme, themeLocation, extensionData);
            resultingThemes.push(themeData);
        });
        return resultingThemes;
    }
    findThemeById(themeId) {
        if (this.builtInTheme && this.builtInTheme.id === themeId) {
            return this.builtInTheme;
        }
        const allThemes = this.getThemes();
        for (const t of allThemes) {
            if (t.id === themeId) {
                return t;
            }
        }
        return undefined;
    }
    findThemeBySettingsId(settingsId, defaultSettingsId) {
        const migratedId = settingsId ? migrateThemeSettingsId(settingsId) : settingsId;
        if (this.builtInTheme && this.builtInTheme.settingsId === migratedId) {
            return this.builtInTheme;
        }
        const allThemes = this.getThemes();
        let defaultTheme = undefined;
        for (const t of allThemes) {
            if (t.settingsId === migratedId) {
                return t;
            }
            if (t.settingsId === defaultSettingsId) {
                defaultTheme = t;
            }
        }
        return defaultTheme;
    }
    findThemeByExtensionLocation(extLocation) {
        if (extLocation) {
            return this.getThemes().filter(t => t.location && resources.isEqualOrParent(t.location, extLocation));
        }
        return [];
    }
    getThemes() {
        return this.extensionThemes;
    }
    getMarketplaceThemes(manifest, extensionLocation, extensionData) {
        const themes = manifest?.contributes?.[this.themesExtPoint.name];
        if (Array.isArray(themes)) {
            return this.onThemes(extensionData, extensionLocation, themes);
        }
        return [];
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhlbWVFeHRlbnNpb25Qb2ludHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvdGhlbWVzL2NvbW1vbi90aGVtZUV4dGVuc2lvblBvaW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBRTFDLE9BQU8sS0FBSyxLQUFLLE1BQU0sa0NBQWtDLENBQUM7QUFDMUQsT0FBTyxLQUFLLFNBQVMsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQThDLGtCQUFrQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFDL0gsT0FBTyxFQUFFLGFBQWEsRUFBd0Isc0JBQXNCLEVBQUUsTUFBTSw0QkFBNEIsQ0FBQztBQUV6RyxPQUFPLEVBQVMsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbEUsT0FBTyxFQUFFLFVBQVUsRUFBZSxNQUFNLHNDQUFzQyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxVQUFVLEVBQWdGLE1BQU0sdURBQXVELENBQUM7QUFFakssT0FBTyxFQUFtQixjQUFjLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUN6RixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDNUUsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDBEQUEwRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBRS9FLE1BQU0sVUFBVSxnQ0FBZ0M7SUFDL0MsT0FBTyxrQkFBa0IsQ0FBQyxzQkFBc0IsQ0FBeUI7UUFDeEUsY0FBYyxFQUFFLFFBQVE7UUFDeEIsVUFBVSxFQUFFO1lBQ1gsV0FBVyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMscUNBQXFDLEVBQUUsb0NBQW9DLENBQUM7WUFDdEcsSUFBSSxF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