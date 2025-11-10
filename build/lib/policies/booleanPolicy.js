"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.BooleanPolicy = void 0;
const basePolicy_1 = require("./basePolicy");
const render_1 = require("./render");
const types_1 = require("./types");
class BooleanPolicy extends basePolicy_1.BasePolicy {
    static from(category, policy) {
        const { name, minimumVersion, localization, type } = policy;
        if (type !== 'boolean') {
            return undefined;
        }
        return new BooleanPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '');
    }
    constructor(name, category, minimumVersion, description, moduleName) {
        super(types_1.PolicyType.Boolean, name, category, minimumVersion, description, moduleName);
    }
    renderADMXElements() {
        return [
            `<boolean id="${this.name}" valueName="${this.name}">`,
            `	<trueValue><decimal value="1" /></trueValue><falseValue><decimal value="0" /></falseValue>`,
            `</boolean>`
        ];
    }
    renderADMLPresentationContents() {
        return `<checkBox refId="${this.name}">${this.name}</checkBox>`;
    }
    renderJsonValue() {
        return false;
    }
    renderProfileValue() {
        return `<false/>`;
    }
    renderProfileManifestValue(translations) {
        return `<key>pfm_default</key>
<false/>
<key>pfm_description</key>
<string>${(0, render_1.renderProfileString)(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>boolean</string>`;
    }
}
exports.BooleanPolicy = BooleanPolicy;
//# sourceMappingURL=booleanPolicy.js.map