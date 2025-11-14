"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasePolicy = void 0;
const render_1 = require("./render");
class BasePolicy {
    type;
    name;
    category;
    minimumVersion;
    description;
    moduleName;
    constructor(type, name, category, minimumVersion, description, moduleName) {
        this.type = type;
        this.name = name;
        this.category = category;
        this.minimumVersion = minimumVersion;
        this.description = description;
        this.moduleName = moduleName;
    }
    renderADMLString(nlsString, translations) {
        return (0, render_1.renderADMLString)(this.name, this.moduleName, nlsString, translations);
    }
    renderADMX(regKey) {
        return [
            `<policy name="${this.name}" class="Both" displayName="$(string.${this.name})" explainText="$(string.${this.name}_${this.description.nlsKey.replace(/\./g, '_')})" key="Software\\Policies\\Microsoft\\${regKey}" presentation="$(presentation.${this.name})">`,
            `	<parentCategory ref="${this.category.name.nlsKey}" />`,
            `	<supportedOn ref="Supported_${this.minimumVersion.replace(/\./g, '_')}" />`,
            `	<elements>`,
            ...this.renderADMXElements(),
            `	</elements>`,
            `</policy>`
        ];
    }
    renderADMLStrings(translations) {
        return [
            `<string id="${this.name}">${this.name}</string>`,
            this.renderADMLString(this.description, translations)
        ];
    }
    renderADMLPresentation() {
        return `<presentation id="${this.name}">${this.renderADMLPresentationContents()}</presentation>`;
    }
    renderProfile() {
        return [`<key>${this.name}</key>`, this.renderProfileValue()];
    }
    renderProfileManifest(translations) {
        return `<dict>
${this.renderProfileManifestValue(translations)}
</dict>`;
    }
}
exports.BasePolicy = BasePolicy;
//# sourceMappingURL=basePolicy.js.map