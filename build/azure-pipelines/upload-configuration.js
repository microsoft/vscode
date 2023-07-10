"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettingsSearchBuildId = exports.shouldSetupSettingsSearch = void 0;
const path = require("path");
const os = require("os");
const cp = require("child_process");
const vfs = require("vinyl-fs");
const util = require("../lib/util");
const identity_1 = require("@azure/identity");
const azure = require('gulp-azure-storage');
const packageJson = require("../../package.json");
const commit = process.env['BUILD_SOURCEVERSION'];
function generateVSCodeConfigurationTask() {
    return new Promise((resolve, reject) => {
        const buildDir = process.env['AGENT_BUILDDIRECTORY'];
        if (!buildDir) {
            return reject(new Error('$AGENT_BUILDDIRECTORY not set'));
        }
        if (!shouldSetupSettingsSearch()) {
            console.log(`Only runs on main and release branches, not ${process.env.BUILD_SOURCEBRANCH}`);
            return resolve(undefined);
        }
        if (process.env.VSCODE_QUALITY !== 'insider' && process.env.VSCODE_QUALITY !== 'stable') {
            console.log(`Only runs on insider and stable qualities, not ${process.env.VSCODE_QUALITY}`);
            return resolve(undefined);
        }
        const result = path.join(os.tmpdir(), 'configuration.json');
        const userDataDir = path.join(os.tmpdir(), 'tmpuserdata');
        const extensionsDir = path.join(os.tmpdir(), 'tmpextdir');
        const arch = process.env['VSCODE_ARCH'];
        const appRoot = path.join(buildDir, `VSCode-darwin-${arch}`);
        const appName = process.env.VSCODE_QUALITY === 'insider' ? 'Visual\\ Studio\\ Code\\ -\\ Insiders.app' : 'Visual\\ Studio\\ Code.app';
        const appPath = path.join(appRoot, appName, 'Contents', 'Resources', 'app', 'bin', 'code');
        const codeProc = cp.exec(`${appPath} --export-default-configuration='${result}' --wait --user-data-dir='${userDataDir}' --extensions-dir='${extensionsDir}'`, (err, stdout, stderr) => {
            clearTimeout(timer);
            if (err) {
                console.log(`err: ${err} ${err.message} ${err.toString()}`);
                reject(err);
            }
            if (stdout) {
                console.log(`stdout: ${stdout}`);
            }
            if (stderr) {
                console.log(`stderr: ${stderr}`);
            }
            resolve(result);
        });
        const timer = setTimeout(() => {
            codeProc.kill();
            reject(new Error('export-default-configuration process timed out'));
        }, 60 * 1000);
        codeProc.on('error', err => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
function shouldSetupSettingsSearch() {
    const branch = process.env.BUILD_SOURCEBRANCH;
    return !!(branch && (/\/main$/.test(branch) || branch.indexOf('/release/') >= 0));
}
exports.shouldSetupSettingsSearch = shouldSetupSettingsSearch;
function getSettingsSearchBuildId(packageJson) {
    try {
        const branch = process.env.BUILD_SOURCEBRANCH;
        const branchId = branch.indexOf('/release/') >= 0 ? 0 :
            /\/main$/.test(branch) ? 1 :
                2; // Some unexpected branch
        const out = cp.execSync(`git rev-list HEAD --count`);
        const count = parseInt(out.toString());
        // <version number><commit count><branchId (avoid unlikely conflicts)>
        // 1.25.1, 1,234,567 commits, main = 1250112345671
        return util.versionStringToNumber(packageJson.version) * 1e8 + count * 10 + branchId;
    }
    catch (e) {
        throw new Error('Could not determine build number: ' + e.toString());
    }
}
exports.getSettingsSearchBuildId = getSettingsSearchBuildId;
async function main() {
    const configPath = await generateVSCodeConfigurationTask();
    if (!configPath) {
        return;
    }
    const settingsSearchBuildId = getSettingsSearchBuildId(packageJson);
    if (!settingsSearchBuildId) {
        throw new Error('Failed to compute build number');
    }
    const credential = new identity_1.ClientSecretCredential(process.env['AZURE_TENANT_ID'], process.env['AZURE_CLIENT_ID'], process.env['AZURE_CLIENT_SECRET']);
    return new Promise((c, e) => {
        vfs.src(configPath)
            .pipe(azure.upload({
            account: process.env.AZURE_STORAGE_ACCOUNT,
            credential,
            container: 'configuration',
            prefix: `${settingsSearchBuildId}/${commit}/`
        }))
            .on('end', () => c())
            .on('error', (err) => e(err));
    });
}
if (require.main === module) {
    main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLWNvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1cGxvYWQtY29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyw2QkFBNkI7QUFDN0IseUJBQXlCO0FBQ3pCLG9DQUFvQztBQUNwQyxnQ0FBZ0M7QUFDaEMsb0NBQW9DO0FBQ3BDLDhDQUF5RDtBQUN6RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUM1QyxrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0FBRWxELFNBQVMsK0JBQStCO0lBQ3ZDLE9BQU8sSUFBSSxPQUFPLENBQUMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDdEMsTUFBTSxRQUFRLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3JELElBQUksQ0FBQyxRQUFRLEVBQUU7WUFDZCxPQUFPLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQywrQkFBK0IsQ0FBQyxDQUFDLENBQUM7U0FDMUQ7UUFFRCxJQUFJLENBQUMseUJBQXlCLEVBQUUsRUFBRTtZQUNqQyxPQUFPLENBQUMsR0FBRyxDQUFDLCtDQUErQyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQztZQUM3RixPQUFPLE9BQU8sQ0FBQyxTQUFTLENBQUMsQ0FBQztTQUMxQjtRQUVELElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEtBQUssU0FBUyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxLQUFLLFFBQVEsRUFBRTtZQUN4RixPQUFPLENBQUMsR0FBRyxDQUFDLGtEQUFrRCxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7WUFDNUYsT0FBTyxPQUFPLENBQUMsU0FBUyxDQUFD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