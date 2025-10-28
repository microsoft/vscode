"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const minimist_1 = __importDefault(require("minimist"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const JSONC = __importStar(require("jsonc-parser"));
const booleanPolicy_1 = require("./booleanPolicy");
const numberPolicy_1 = require("./numberPolicy");
const objectPolicy_1 = require("./objectPolicy");
const stringEnumPolicy_1 = require("./stringEnumPolicy");
const stringPolicy_1 = require("./stringPolicy");
const types_1 = require("./types");
const render_1 = require("./render");
const product = require('../../../product.json');
const packageJson = require('../../../package.json');
async function getSpecificNLS(resourceUrlTemplate, languageId, version) {
    const resource = {
        publisher: 'ms-ceintl',
        name: `vscode-language-pack-${languageId}`,
        version: `${version[0]}.${version[1]}.${version[2]}`,
        path: 'extension/translations/main.i18n.json'
    };
    const url = resourceUrlTemplate.replace(/\{([^}]+)\}/g, (_, key) => resource[key]);
    const res = await fetch(url);
    if (res.status !== 200) {
        throw new Error(`[${res.status}] Error downloading language pack ${languageId}@${version}`);
    }
    const { contents: result } = await res.json();
    // TODO: support module namespacing
    // Flatten all moduleName keys to empty string
    const flattened = { '': {} };
    for (const moduleName in result) {
        for (const nlsKey in result[moduleName]) {
            flattened[''][nlsKey] = result[moduleName][nlsKey];
        }
    }
    return flattened;
}
function parseVersion(version) {
    const [, major, minor, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    return [parseInt(major), parseInt(minor), parseInt(patch)];
}
function compareVersions(a, b) {
    if (a[0] !== b[0]) {
        return a[0] - b[0];
    }
    if (a[1] !== b[1]) {
        return a[1] - b[1];
    }
    return a[2] - b[2];
}
async function queryVersions(serviceUrl, languageId) {
    const res = await fetch(`${serviceUrl}/extensionquery`, {
        method: 'POST',
        headers: {
            'Accept': 'application/json;api-version=3.0-preview.1',
            'Content-Type': 'application/json',
            'User-Agent': 'VS Code Build',
        },
        body: JSON.stringify({
            filters: [{ criteria: [{ filterType: 7, value: `ms-ceintl.vscode-language-pack-${languageId}` }] }],
            flags: 0x1
        })
    });
    if (res.status !== 200) {
        throw new Error(`[${res.status}] Error querying for extension: ${languageId}`);
    }
    const result = await res.json();
    return result.results[0].extensions[0].versions.map(v => parseVersion(v.version)).sort(compareVersions);
}
async function getNLS(extensionGalleryServiceUrl, resourceUrlTemplate, languageId, version) {
    const versions = await queryVersions(extensionGalleryServiceUrl, languageId);
    const nextMinor = [version[0], version[1] + 1, 0];
    const compatibleVersions = versions.filter(v => compareVersions(v, nextMinor) < 0);
    const latestCompatibleVersion = compatibleVersions.at(-1); // order is newest to oldest
    if (!latestCompatibleVersion) {
        throw new Error(`No compatible language pack found for ${languageId} for version ${version}`);
    }
    return await getSpecificNLS(resourceUrlTemplate, languageId, latestCompatibleVersion);
}
// TODO: add more policy types
const PolicyTypes = [
    booleanPolicy_1.BooleanPolicy,
    numberPolicy_1.NumberPolicy,
    stringEnumPolicy_1.StringEnumPolicy,
    stringPolicy_1.StringPolicy,
    objectPolicy_1.ObjectPolicy
];
async function parsePolicies(policyDataFile) {
    const contents = JSONC.parse(await fs_1.promises.readFile(policyDataFile, { encoding: 'utf8' }));
    const categories = new Map();
    for (const category of contents.categories) {
        categories.set(category.key, category);
    }
    const policies = [];
    for (const policy of contents.policies) {
        const category = categories.get(policy.category);
        if (!category) {
            throw new Error(`Unknown category: ${policy.category}`);
        }
        let result;
        for (const policyType of PolicyTypes) {
            if (result = policyType.from(category, policy)) {
                break;
            }
        }
        if (!result) {
            throw new Error(`Unsupported policy type: ${policy.type} for policy ${policy.name}`);
        }
        policies.push(result);
    }
    // Sort policies first by category name, then by policy name
    policies.sort((a, b) => {
        const categoryCompare = a.category.name.value.localeCompare(b.category.name.value);
        if (categoryCompare !== 0) {
            return categoryCompare;
        }
        return a.name.localeCompare(b.name);
    });
    return policies;
}
async function getTranslations() {
    const extensionGalleryServiceUrl = product.extensionsGallery?.serviceUrl;
    if (!extensionGalleryServiceUrl) {
        console.warn(`Skipping policy localization: No 'extensionGallery.serviceUrl' found in 'product.json'.`);
        return [];
    }
    const resourceUrlTemplate = product.extensionsGallery?.resourceUrlTemplate;
    if (!resourceUrlTemplate) {
        console.warn(`Skipping policy localization: No 'resourceUrlTemplate' found in 'product.json'.`);
        return [];
    }
    const version = parseVersion(packageJson.version);
    const languageIds = Object.keys(types_1.Languages);
    return await Promise.all(languageIds.map(languageId => getNLS(extensionGalleryServiceUrl, resourceUrlTemplate, languageId, version)
        .then(languageTranslations => ({ languageId, languageTranslations }))));
}
async function windowsMain(policies, translations) {
    const root = '.build/policies/win32';
    const { admx, adml } = (0, render_1.renderGP)(product, policies, translations);
    await fs_1.promises.rm(root, { recursive: true, force: true });
    await fs_1.promises.mkdir(root, { recursive: true });
    await fs_1.promises.writeFile(path_1.default.join(root, `${product.win32RegValueName}.admx`), admx.replace(/\r?\n/g, '\n'));
    for (const { languageId, contents } of adml) {
        const languagePath = path_1.default.join(root, languageId === 'en-us' ? 'en-us' : types_1.Languages[languageId]);
        await fs_1.promises.mkdir(languagePath, { recursive: true });
        await fs_1.promises.writeFile(path_1.default.join(languagePath, `${product.win32RegValueName}.adml`), contents.replace(/\r?\n/g, '\n'));
    }
}
async function darwinMain(policies, translations) {
    const bundleIdentifier = product.darwinBundleIdentifier;
    if (!bundleIdentifier || !product.darwinProfilePayloadUUID || !product.darwinProfileUUID) {
        throw new Error(`Missing required product information.`);
    }
    const root = '.build/policies/darwin';
    const { profile, manifests } = (0, render_1.renderMacOSPolicy)(product, policies, translations);
    await fs_1.promises.rm(root, { recursive: true, force: true });
    await fs_1.promises.mkdir(root, { recursive: true });
    await fs_1.promises.writeFile(path_1.default.join(root, `${bundleIdentifier}.mobileconfig`), profile.replace(/\r?\n/g, '\n'));
    for (const { languageId, contents } of manifests) {
        const languagePath = path_1.default.join(root, languageId === 'en-us' ? 'en-us' : types_1.Languages[languageId]);
        await fs_1.promises.mkdir(languagePath, { recursive: true });
        await fs_1.promises.writeFile(path_1.default.join(languagePath, `${bundleIdentifier}.plist`), contents.replace(/\r?\n/g, '\n'));
    }
}
async function linuxMain(policies) {
    const root = '.build/policies/linux';
    const policyFileContents = JSON.stringify((0, render_1.renderJsonPolicies)(policies), undefined, 4);
    await fs_1.promises.rm(root, { recursive: true, force: true });
    await fs_1.promises.mkdir(root, { recursive: true });
    const jsonPath = path_1.default.join(root, `policy.json`);
    await fs_1.promises.writeFile(jsonPath, policyFileContents.replace(/\r?\n/g, '\n'));
}
async function main() {
    const args = (0, minimist_1.default)(process.argv.slice(2));
    if (args._.length !== 2) {
        console.error(`Usage: node build/lib/policies <policy-data-file> <darwin|win32|linux>`);
        process.exit(1);
    }
    const policyDataFile = args._[0];
    const platform = args._[1];
    const [policies, translations] = await Promise.all([parsePolicies(policyDataFile), getTranslations()]);
    if (platform === 'darwin') {
        await darwinMain(policies, translations);
    }
    else if (platform === 'win32') {
        await windowsMain(policies, translations);
    }
    else if (platform === 'linux') {
        await linuxMain(policies);
    }
    else {
        console.error(`Usage: node build/lib/policies <policy-data-file> <darwin|win32|linux>`);
        process.exit(1);
    }
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=policyGenerator.js.map