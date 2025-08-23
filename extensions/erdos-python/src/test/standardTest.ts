import { spawnSync } from 'child_process';
import * as fs from '../client/common/platform/fs-paths';
import * as os from 'os';
import * as path from 'path';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath, runTests } from '@vscode/test-electron';
import { JUPYTER_EXTENSION_ID, PYLANCE_EXTENSION_ID } from '../client/common/constants';
import { EXTENSION_ROOT_DIR_FOR_TESTS } from './constants';
import { getChannel } from './utils/vscode';
import { TestOptions } from '@vscode/test-electron/out/runTest';

// If running smoke tests, we don't have access to this.
if (process.env.TEST_FILES_SUFFIX !== 'smoke.test') {
    const logger = require('./testLogger');
    logger.initializeLogger();
}
function requiresJupyterExtensionToBeInstalled() {
    return process.env.INSTALL_JUPYTER_EXTENSION === 'true';
}
function requiresPylanceExtensionToBeInstalled() {
    return process.env.INSTALL_PYLANCE_EXTENSION === 'true';
}

process.env.IS_CI_SERVER_TEST_DEBUGGER = '';
process.env.VSC_PYTHON_CI_TEST = '1';
const workspacePath = process.env.CODE_TESTS_WORKSPACE
    ? process.env.CODE_TESTS_WORKSPACE
    : path.join(__dirname, '..', '..', 'src', 'test');
const extensionDevelopmentPath = process.env.CODE_EXTENSIONS_PATH
    ? process.env.CODE_EXTENSIONS_PATH
    : EXTENSION_ROOT_DIR_FOR_TESTS;

/**
 * Smoke tests & tests running in VSCode require Jupyter extension to be installed.
 */
async function installJupyterExtension(vscodeExecutablePath: string) {
    if (!requiresJupyterExtensionToBeInstalled()) {
        console.info('Jupyter Extension not required');
        return;
    }
    console.info('Installing Jupyter Extension');
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath, os.platform());

    // For now install Jupyter from the marketplace
    spawnSync(cliPath, ['--install-extension', JUPYTER_EXTENSION_ID], {
        encoding: 'utf-8',
        stdio: 'inherit',
    });
}

async function installPylanceExtension(vscodeExecutablePath: string) {
    if (!requiresPylanceExtensionToBeInstalled()) {
        console.info('Pylance Extension not required');
        return;
    }
    console.info('Installing Pylance Extension');
    const cliPath = resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath, os.platform());

    // For now install pylance from the marketplace
    spawnSync(cliPath, ['--install-extension', PYLANCE_EXTENSION_ID], {
        encoding: 'utf-8',
        stdio: 'inherit',
    });

    // Make sure to enable it by writing to our workspace path settings
    await fs.ensureDir(path.join(workspacePath, '.vscode'));
    const settingsPath = path.join(workspacePath, '.vscode', 'settings.json');
    if (await fs.pathExists(settingsPath)) {
        let settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
        settings = { ...settings, 'python.languageServer': 'Pylance' };
        await fs.writeFile(settingsPath, JSON.stringify(settings));
    } else {
        const settings = `{ "python.languageServer": "Pylance" }`;
        await fs.writeFile(settingsPath, settings);
    }
}

async function start() {
    console.log('*'.repeat(100));
    console.log('Start Standard tests');
    const channel = getChannel();
    console.log(`Using ${channel} build of VS Code.`);
    const vscodeExecutablePath = await downloadAndUnzipVSCode(channel);
    const baseLaunchArgs =
        requiresJupyterExtensionToBeInstalled() || requiresPylanceExtensionToBeInstalled()
            ? []
            : ['--disable-extensions'];
    await installJupyterExtension(vscodeExecutablePath);
    await installPylanceExtension(vscodeExecutablePath);
    console.log('VS Code executable', vscodeExecutablePath);
    const launchArgs = baseLaunchArgs
        .concat([workspacePath])
        .concat(channel === 'insiders' ? ['--enable-proposed-api'] : [])
        .concat(['--timeout', '5000']);
    console.log(`Starting vscode ${channel} with args ${launchArgs.join(' ')}`);
    const options: TestOptions = {
        extensionDevelopmentPath: extensionDevelopmentPath,
        extensionTestsPath: path.join(EXTENSION_ROOT_DIR_FOR_TESTS, 'out', 'test'),
        launchArgs,
        version: channel,
        extensionTestsEnv: { ...process.env, UITEST_DISABLE_INSIDERS: '1' },
    };
    await runTests(options);
}
start().catch((ex) => {
    console.error('End Standard tests (with errors)', ex);
    process.exit(1);
});
