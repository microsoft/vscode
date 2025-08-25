import { toLower, uniq, uniqBy } from 'lodash';
import { chain, iterable } from '../../../../common/utils/async';
import { getOSType, OSType } from '../../../../common/utils/platform';
import { PythonEnvKind, PythonEnvSource } from '../../info';
import { BasicEnvInfo, IPythonEnvsIterator } from '../../locator';
import { FSWatchingLocator } from './fsWatchingLocator';
import { findInterpretersInDir } from '../../../common/commonUtils';
import '../../../../common/extensions';
import { traceError, traceInfo, traceVerbose, traceWarn } from '../../../../logging';
import { StopWatch } from '../../../../common/utils/stopWatch';
import { getCustomEnvDirs } from '../../../../erdos/interpreterSettings';
import { getShortestString } from '../../../../common/stringUtils';
import { resolveSymbolicLink } from '../../../common/externalDependencies';

const DEFAULT_SEARCH_DEPTH = 2;

async function getUserSpecifiedEnvDirs(): Promise<string[]> {
    const envDirs = getCustomEnvDirs();
    return [OSType.Windows, OSType.OSX].includes(getOSType()) ? uniqBy(envDirs, toLower) : uniq(envDirs);
}

async function getVirtualEnvKind(_interpreterPath: string): Promise<PythonEnvKind> {
    return PythonEnvKind.Custom;
}

export class UserSpecifiedEnvironmentLocator extends FSWatchingLocator {
    public readonly providerId: string = 'user-specified-env';

    constructor(private readonly searchDepth?: number) {
        super(getUserSpecifiedEnvDirs, getVirtualEnvKind, {
            delayOnCreated: 1000,
        });
    }

    protected doIterEnvs(): IPythonEnvsIterator<BasicEnvInfo> {
        const searchDepth = this.searchDepth ?? DEFAULT_SEARCH_DEPTH;

        async function* iterator() {
            const stopWatch = new StopWatch();
            traceInfo('[UserSpecifiedEnvironmentLocator] Searching for user-specified environments');
            const envRootDirs = await getUserSpecifiedEnvDirs();
            const envGenerators = envRootDirs.map((envRootDir) => {
                async function* generator() {
                    traceVerbose(
                        `[UserSpecifiedEnvironmentLocator] Searching for user-specified envs in: ${envRootDir}`,
                    );

                    const executables = findInterpretersInDir(envRootDir, searchDepth, undefined, false);
                    const filenames: string[] = [];
                    for await (const entry of executables) {
                        filenames.push(entry.filename);
                    }
                    traceVerbose(
                        `[UserSpecifiedEnvironmentLocator] Found ${filenames.length} user-specified envs in: ${envRootDir}`,
                    );

                    if (filenames.length === 0) {
                        traceWarn(
                            `[UserSpecifiedEnvironmentLocator] No environments found in: ${envRootDir}. The directory may not contain Python installations or is an invalid path.`,
                        );
                        return;
                    }

                    const uniquePythonBins = await getUniquePythonBins(filenames);

                    for (const filename of uniquePythonBins) {
                        const kind = await getVirtualEnvKind(filename);
                        yield {
                            kind,
                            executablePath: filename,
                            source: [PythonEnvSource.UserSettings],
                            searchLocation: undefined,
                        };
                        traceVerbose(
                            `[UserSpecifiedEnvironmentLocator] User-specified Environment: [added] ${filename}`,
                        );
                        const skippedEnvs = filenames.filter((f) => f !== filename);
                        skippedEnvs.forEach((f) => {
                            traceVerbose(
                                `[UserSpecifiedEnvironmentLocator] User-specified Environment: [skipped] ${f}`,
                            );
                        });
                    }
                }
                return generator();
            });

            yield* iterable(chain(envGenerators));
            traceInfo(
                `[UserSpecifiedEnvironmentLocator] Finished searching for user-specified envs: ${stopWatch.elapsedTime} milliseconds`,
            );
        }

        return iterator();
    }
}

async function getUniquePythonBins(filenames: string[]): Promise<string[]> {
    const binToLinkMap = new Map<string, string[]>();
    for (const filepath of filenames) {
        try {
            traceVerbose(`Attempting to resolve symbolic link: ${filepath}`);
            const resolvedBin = await resolveSymbolicLink(filepath);
            if (binToLinkMap.has(resolvedBin)) {
                binToLinkMap.get(resolvedBin)?.push(filepath);
            } else {
                binToLinkMap.set(resolvedBin, [filepath]);
            }
            traceInfo(`Found: ${filepath} --> ${resolvedBin}`);
        } catch (ex) {
            traceError('Failed to resolve symbolic link: ', ex);
        }
    }
    const keys = Array.from(binToLinkMap.keys());
    const pythonPaths = keys.map((key) => getShortestString([key, ...(binToLinkMap.get(key) ?? [])]));
    return uniq(pythonPaths);
}