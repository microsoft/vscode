// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CancellationToken, Uri } from 'vscode';
import { ResolvedEnvironment } from '../api/types';
import { IProcessService, IProcessServiceFactory, IPythonExecutionFactory } from '../common/process/types';
import { isCondaEnv, raceCancellationError } from './utils';
import { parsePipList } from './pipListUtils';
import { Conda } from '../pythonEnvironments/common/environmentManagers/conda';
import { traceError } from '../logging';

export async function getPythonPackagesResponse(
    environment: ResolvedEnvironment,
    pythonExecFactory: IPythonExecutionFactory,
    processServiceFactory: IProcessServiceFactory,
    resourcePath: Uri | undefined,
    token: CancellationToken,
): Promise<string> {
    const packages = isCondaEnv(environment)
        ? await raceCancellationError(
              listCondaPackages(
                  pythonExecFactory,
                  environment,
                  resourcePath,
                  await raceCancellationError(processServiceFactory.create(resourcePath), token),
              ),
              token,
          )
        : await raceCancellationError(listPipPackages(pythonExecFactory, resourcePath), token);

    if (!packages.length) {
        return 'No packages found';
    }
    // Installed Python packages, each in the format <name> or <name> (<version>). The version may be omitted if unknown. Returns an empty array if no packages are installed.
    const response = [
        'Below is a list of the Python packages, each in the format <name> or <name> (<version>). The version may be omitted if unknown: ',
    ];
    packages.forEach((pkg) => {
        const [name, version] = pkg;
        response.push(version ? `- ${name} (${version})` : `- ${name}`);
    });
    return response.join('\n');
}

async function listPipPackages(
    execFactory: IPythonExecutionFactory,
    resource: Uri | undefined,
): Promise<[string, string][]> {
    // Add option --format to subcommand list of pip  cache, with abspath choice to output the full path of a wheel file. (#8355)
    // Added in 2020. Thats almost 5 years ago. When Python 3.8 was released.
    const exec = await execFactory.createActivatedEnvironment({ allowEnvironmentFetchExceptions: true, resource });
    const output = await exec.execModule('pip', ['list'], { throwOnStdErr: false, encoding: 'utf8' });
    return parsePipList(output.stdout).map((pkg) => [pkg.name, pkg.version]);
}

async function listCondaPackages(
    execFactory: IPythonExecutionFactory,
    env: ResolvedEnvironment,
    resource: Uri | undefined,
    processService: IProcessService,
): Promise<[string, string][]> {
    const conda = await Conda.getConda();
    if (!conda) {
        traceError('Conda is not installed, falling back to pip packages');
        return listPipPackages(execFactory, resource);
    }
    if (!env.executable.uri) {
        traceError('Conda environment executable not found, falling back to pip packages');
        return listPipPackages(execFactory, resource);
    }
    const condaEnv = await conda.getCondaEnvironment(env.executable.uri.fsPath);
    if (!condaEnv) {
        traceError('Conda environment not found, falling back to pip packages');
        return listPipPackages(execFactory, resource);
    }
    const cmd = await conda.getListPythonPackagesArgs(condaEnv, true);
    if (!cmd) {
        traceError('Conda list command not found, falling back to pip packages');
        return listPipPackages(execFactory, resource);
    }
    const output = await processService.exec(cmd[0], cmd.slice(1), { shell: true });
    if (!output.stdout) {
        traceError('Unable to get conda packages, falling back to pip packages');
        return listPipPackages(execFactory, resource);
    }
    const content = output.stdout.split(/\r?\n/).filter((l) => !l.startsWith('#'));
    const packages: [string, string][] = [];
    content.forEach((l) => {
        const parts = l.split(' ').filter((p) => p.length > 0);
        if (parts.length >= 3) {
            packages.push([parts[0], parts[1]]);
        }
    });
    return packages;
}
