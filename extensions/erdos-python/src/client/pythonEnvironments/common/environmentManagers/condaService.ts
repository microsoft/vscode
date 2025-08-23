import { inject, injectable } from 'inversify';
import * as path from 'path';
import { SemVer } from 'semver';
import { IFileSystem, IPlatformService } from '../../../common/platform/types';
import { traceVerbose } from '../../../logging';
import { cache } from '../../../common/utils/decorators';
import { ICondaService } from '../../../interpreter/contracts';
import { traceDecoratorVerbose } from '../../../logging';
import { Conda, CondaEnvironmentInfo, CondaInfo } from './conda';

/**
 * Injectable version of Conda utility.
 */
@injectable()
export class CondaService implements ICondaService {
    private isAvailable: boolean | undefined;

    constructor(
        @inject(IPlatformService) private platform: IPlatformService,
        @inject(IFileSystem) private fileSystem: IFileSystem,
    ) {}

    public async getActivationScriptFromInterpreter(
        interpreterPath?: string,
        envName?: string,
    ): Promise<{ path: string | undefined; type: 'local' | 'global' } | undefined> {
        traceVerbose(`Getting activation script for interpreter ${interpreterPath}, env ${envName}`);
        const condaPath = await this.getCondaFileFromInterpreter(interpreterPath, envName);
        traceVerbose(`Found conda path: ${condaPath}`);

        const activatePath = (condaPath
            ? path.join(path.dirname(condaPath), 'activate')
            : 'activate'
        ).fileToCommandArgumentForPythonExt(); // maybe global activate?
        traceVerbose(`Using activate path: ${activatePath}`);

        // try to find the activate script in the global conda root prefix.
        if (this.platform.isLinux || this.platform.isMac) {
            const condaInfo = await this.getCondaInfo();
            // eslint-disable-next-line camelcase
            if (condaInfo?.root_prefix) {
                const globalActivatePath = path
                    // eslint-disable-next-line camelcase
                    .join(condaInfo.root_prefix, this.platform.virtualEnvBinName, 'activate')
                    .fileToCommandArgumentForPythonExt();

                if (activatePath === globalActivatePath || !(await this.fileSystem.fileExists(activatePath))) {
                    traceVerbose(`Using global activate path: ${globalActivatePath}`);
                    return {
                        path: globalActivatePath,
                        type: 'global',
                    };
                }
            }
        }

        return { path: activatePath, type: 'local' }; // return the default activate script wether it exists or not.
    }

    /**
     * Return the path to the "conda file".
     */

    // eslint-disable-next-line class-methods-use-this
    public async getCondaFile(forShellExecution?: boolean): Promise<string> {
        return Conda.getConda().then((conda) => {
            const command = forShellExecution ? conda?.shellCommand : conda?.command;
            return command ?? 'conda';
        });
    }

    // eslint-disable-next-line class-methods-use-this
    public async getInterpreterPathForEnvironment(condaEnv: CondaEnvironmentInfo): Promise<string | undefined> {
        const conda = await Conda.getConda();
        return conda?.getInterpreterPathForEnvironment({ name: condaEnv.name, prefix: condaEnv.path });
    }

    /**
     * Is there a conda install to use?
     */
    public async isCondaAvailable(): Promise<boolean> {
        if (typeof this.isAvailable === 'boolean') {
            return this.isAvailable;
        }
        return this.getCondaVersion()

            .then((version) => (this.isAvailable = version !== undefined)) // eslint-disable-line no-return-assign
            .catch(() => (this.isAvailable = false)); // eslint-disable-line no-return-assign
    }

    /**
     * Return the conda version.
     */
    // eslint-disable-next-line class-methods-use-this
    public async getCondaVersion(): Promise<SemVer | undefined> {
        return Conda.getConda().then((conda) => conda?.getCondaVersion());
    }

    /**
     * Get the conda exe from the path to an interpreter's python. This might be different than the
     * globally registered conda.exe.
     *
     * The value is cached for a while.
     * The only way this can change is if user installs conda into this same environment.
     * Generally we expect that to happen the other way, the user creates a conda environment with conda in it.
     */
    @traceDecoratorVerbose('Get Conda File from interpreter')
    @cache(120_000)
    public async getCondaFileFromInterpreter(interpreterPath?: string, envName?: string): Promise<string | undefined> {
        const condaExe = this.platform.isWindows ? 'conda.exe' : 'conda';
        const scriptsDir = this.platform.isWindows ? 'Scripts' : 'bin';
        const interpreterDir = interpreterPath ? path.dirname(interpreterPath) : '';

        // Might be in a situation where this is not the default python env, but rather one running
        // from a virtualenv
        const envsPos = envName ? interpreterDir.indexOf(path.join('envs', envName)) : -1;
        if (envsPos > 0) {
            // This should be where the original python was run from when the environment was created.
            const originalPath = interpreterDir.slice(0, envsPos);
            let condaPath1 = path.join(originalPath, condaExe);

            if (await this.fileSystem.fileExists(condaPath1)) {
                return condaPath1;
            }

            // Also look in the scripts directory here too.
            condaPath1 = path.join(originalPath, scriptsDir, condaExe);
            if (await this.fileSystem.fileExists(condaPath1)) {
                return condaPath1;
            }
        }

        let condaPath2 = path.join(interpreterDir, condaExe);
        if (await this.fileSystem.fileExists(condaPath2)) {
            return condaPath2;
        }
        // Conda path has changed locations, check the new location in the scripts directory after checking
        // the old location
        condaPath2 = path.join(interpreterDir, scriptsDir, condaExe);
        if (await this.fileSystem.fileExists(condaPath2)) {
            return condaPath2;
        }

        return this.getCondaFile();
    }

    /**
     * Return the info reported by the conda install.
     * The result is cached for 30s.
     */

    // eslint-disable-next-line class-methods-use-this
    @cache(60_000)
    public async getCondaInfo(): Promise<CondaInfo | undefined> {
        const conda = await Conda.getConda();
        return conda?.getInfo();
    }
}
