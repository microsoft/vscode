import { isTestExecution } from '../../../common/constants';
import { exec, pathExists } from '../externalDependencies';
import { traceVerbose } from '../../../logging';
import { cache } from '../../../common/utils/decorators';
import { getOSType, OSType } from '../../../common/utils/platform';

/** Wraps the "Hatch" utility, and exposes its functionality.
 */
export class Hatch {
    /**
     * Locating Hatch binary can be expensive, since it potentially involves spawning or
     * trying to spawn processes; so we only do it once per session.
     */
    private static hatchPromise: Map<string, Promise<Hatch | undefined>> = new Map<
        string,
        Promise<Hatch | undefined>
    >();

    /**
     * Creates a Hatch service corresponding to the corresponding "hatch" command.
     *
     * @param command - Command used to run hatch. This has the same meaning as the
     * first argument of spawn() - i.e. it can be a full path, or just a binary name.
     * @param cwd - The working directory to use as cwd when running hatch.
     */
    constructor(public readonly command: string, private cwd: string) {
        this.fixCwd();
    }

    /**
     * Returns a Hatch instance corresponding to the binary which can be used to run commands for the cwd.
     *
     * Every directory is a valid Hatch project, so this should always return a Hatch instance.
     */
    public static async getHatch(cwd: string): Promise<Hatch | undefined> {
        if (Hatch.hatchPromise.get(cwd) === undefined || isTestExecution()) {
            Hatch.hatchPromise.set(cwd, Hatch.locate(cwd));
        }
        return Hatch.hatchPromise.get(cwd);
    }

    private static async locate(cwd: string): Promise<Hatch | undefined> {
        // First thing this method awaits on should be hatch command execution,
        // hence perform all operations before that synchronously.
        const hatchPath = 'hatch';
        traceVerbose(`Probing Hatch binary ${hatchPath}`);
        const hatch = new Hatch(hatchPath, cwd);
        const virtualenvs = await hatch.getEnvList();
        if (virtualenvs !== undefined) {
            traceVerbose(`Found hatch binary ${hatchPath}`);
            return hatch;
        }
        traceVerbose(`Failed to find Hatch binary ${hatchPath}`);

        // Didn't find anything.
        traceVerbose(`No Hatch binary found`);
        return undefined;
    }

    /**
     * Retrieves list of Python environments known to Hatch for this working directory.
     * Returns `undefined` if we failed to spawn in some way.
     *
     * Corresponds to "hatch env show --json". Swallows errors if any.
     */
    public async getEnvList(): Promise<string[] | undefined> {
        return this.getEnvListCached(this.cwd);
    }

    /**
     * Method created to facilitate caching. The caching decorator uses function arguments as cache key,
     * so pass in cwd on which we need to cache.
     */
    @cache(30_000, true, 10_000)
    private async getEnvListCached(_cwd: string): Promise<string[] | undefined> {
        const envInfoOutput = await exec(this.command, ['env', 'show', '--json'], {
            cwd: this.cwd,
            throwOnStdErr: true,
        }).catch(traceVerbose);
        if (!envInfoOutput) {
            return undefined;
        }
        const envPaths = await Promise.all(
            Object.keys(JSON.parse(envInfoOutput.stdout)).map(async (name) => {
                const envPathOutput = await exec(this.command, ['env', 'find', name], {
                    cwd: this.cwd,
                    throwOnStdErr: true,
                }).catch(traceVerbose);
                if (!envPathOutput) return undefined;
                const dir = envPathOutput.stdout.trim();
                return (await pathExists(dir)) ? dir : undefined;
            }),
        );
        return envPaths.flatMap((r) => (r ? [r] : []));
    }

    /**
     * Due to an upstream hatch issue on Windows https://github.com/pypa/hatch/issues/1350,
     * 'hatch env find default' does not handle case-insensitive paths as cwd, which are valid on Windows.
     * So we need to pass the case-exact path as cwd.
     * It has been observed that only the drive letter in `cwd` is lowercased here. Unfortunately,
     * there's no good way to get case of the drive letter correctly without using Win32 APIs:
     * https://stackoverflow.com/questions/33086985/how-to-obtain-case-exact-path-of-a-file-in-node-js-on-windows
     * So we do it manually.
     */
    private fixCwd(): void {
        if (getOSType() === OSType.Windows) {
            if (/^[a-z]:/.test(this.cwd)) {
                // Replace first character by the upper case version of the character.
                const a = this.cwd.split(':');
                a[0] = a[0].toUpperCase();
                this.cwd = a.join(':');
            }
        }
    }
}
