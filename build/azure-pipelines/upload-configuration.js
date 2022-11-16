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
const commit = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBsb2FkLWNvbmZpZ3VyYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ1cGxvYWQtY29uZmlndXJhdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7OztnR0FHZ0c7OztBQUVoRyw2QkFBNkI7QUFDN0IseUJBQXlCO0FBQ3pCLG9DQUFvQztBQUNwQyxnQ0FBZ0M7QUFDaEMsb0NBQW9DO0FBQ3BDLDhDQUF5RDtBQUN6RCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQztBQUM1QyxrREFBa0Q7QUFFbEQsTUFBTSxNQUFNLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUV6RixTQUFTLCtCQUErQjtJQUN2QyxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1FBQ3RDLE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNyRCxJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2QsT0FBTyxNQUFNLENBQUMsSUFBSSxLQUFLLENBQUMsK0JBQStCLENBQUMsQ0FBQyxDQUFDO1NBQzFEO1FBRUQsSUFBSSxDQUFDLHlCQUF5QixFQUFFLEVBQUU7WUFDakMsT0FBTyxDQUFDLEdBQUcsQ0FBQywrQ0FBK0MsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDLENBQUM7WUFDN0YsT0FBTyxPQUFPLENBQUMsU0FBUyxDQUFDLENBQUM7U0FDMUI7UUFFRCxJQUFJLE9BQU8sQ0FBQyxHQUFHLENBQUMsY0FBYyxLQUFLLFNBQVMsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLGNBQWMsS0FBSyxRQUFRLEVBQUU7WUFDeEYsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrREFBa0QsT0FBTyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FB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