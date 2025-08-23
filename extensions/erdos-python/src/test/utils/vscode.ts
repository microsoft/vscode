import * as path from 'path';
import * as fs from '../../client/common/platform/fs-paths';
import { EXTENSION_ROOT_DIR } from '../../client/common/constants';

const insidersVersion = /^\^(\d+\.\d+\.\d+)-(insider|\d{8})$/;

export function getChannel(): string {
    if (process.env.VSC_PYTHON_CI_TEST_VSC_CHANNEL) {
        return process.env.VSC_PYTHON_CI_TEST_VSC_CHANNEL;
    }
    const packageJsonPath = path.join(EXTENSION_ROOT_DIR, 'package.json');
    if (fs.pathExistsSync(packageJsonPath)) {
        const packageJson = fs.readJSONSync(packageJsonPath);
        const engineVersion = packageJson.engines.vscode;
        if (insidersVersion.test(engineVersion)) {
            // Can't pass in the version number for an insiders build;
            // https://github.com/microsoft/vscode-test/issues/176
            return 'insiders';
        }
        return engineVersion.replace('^', '');
    }
    return 'stable';
}
