"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NumberPolicy = void 0;
const basePolicy_1 = require("./basePolicy");
const render_1 = require("./render");
const types_1 = require("./types");
class NumberPolicy extends basePolicy_1.BasePolicy {
    defaultValue;
    static from(category, policy) {
        const { type, default: defaultValue, name, minimumVersion, localization } = policy;
        if (type !== 'number') {
            return undefined;
        }
        if (typeof defaultValue !== 'number') {
            throw new Error(`Missing required 'default' property.`);
        }
        return new NumberPolicy(name, { moduleName: '', name: { nlsKey: category.name.key, value: category.name.value } }, minimumVersion, { nlsKey: localization.description.key, value: localization.description.value }, '', defaultValue);
    }
    constructor(name, category, minimumVersion, description, moduleName, defaultValue) {
        super(types_1.PolicyType.Number, name, category, minimumVersion, description, moduleName);
        this.defaultValue = defaultValue;
    }
    renderADMXElements() {
        return [
            `<decimal id="${this.name}" valueName="${this.name}" />`
            // `<decimal id="Quarantine_PurgeItemsAfterDelay" valueName="PurgeItemsAfterDelay" minValue="0" maxValue="10000000" />`
        ];
    }
    renderADMLPresentationContents() {
        return `<decimalTextBox refId="${this.name}" defaultValue="${this.defaultValue}">${this.name}</decimalTextBox>`;
    }
    renderJsonValue() {
        return this.defaultValue;
    }
    renderProfileValue() {
        return `<integer>${this.defaultValue}</integer>`;
    }
    renderProfileManifestValue(translations) {
        return `<key>pfm_default</key>
<integer>${this.defaultValue}</integer>
<key>pfm_description</key>
<string>${(0, render_1.renderProfileString)(this.name, this.moduleName, this.description, translations)}</string>
<key>pfm_name</key>
<string>${this.name}</string>
<key>pfm_title</key>
<string>${this.name}</string>
<key>pfm_type</key>
<string>integer</string>`;
    }
}
exports.NumberPolicy = NumberPolicy;
//# sourceMappingURL=numberPolicy.js.map