/* eslint-disable @typescript-eslint/no-explicit-any */
import { assert, expect } from 'chai';
import * as path from 'path';
import * as sinon from 'sinon';
import * as util from 'util';
import { eq } from 'semver';
import * as fs from '../../../../client/common/platform/fs-paths';
import * as platform from '../../../../client/common/utils/platform';
import { PythonEnvKind } from '../../../../client/pythonEnvironments/base/info';
import { getEnvs } from '../../../../client/pythonEnvironments/base/locatorUtils';
import * as externalDependencies from '../../../../client/pythonEnvironments/common/externalDependencies';
import * as windowsUtils from '../../../../client/pythonEnvironments/common/windowsUtils';
import { Conda, CondaInfo } from '../../../../client/pythonEnvironments/common/environmentManagers/conda';
import { CondaEnvironmentLocator } from '../../../../client/pythonEnvironments/base/locators/lowLevel/condaLocator';
import { createBasicEnv } from '../../base/common';
import { assertBasicEnvsEqual } from '../../base/locators/envTestUtils';
import { OUTPUT_MARKER_SCRIPT } from '../../../../client/common/process/internal/scripts';

suite('Conda and its environments are located correctly', () => {
    // getOSType() is stubbed to return this.
    let osType: platform.OSType;

    // getUserHomeDir() is stubbed to return this.
    let homeDir: string | undefined;

    // getRegistryInterpreters() is stubbed to return this.
    let registryInterpreters: windowsUtils.IRegistryInterpreterData[];

    // readdir() and readFile() are stubbed to present a dummy file system based on this
    // object graph. Keys are filenames. For each key, if the corresponding value is an
    // object, it's considered a subdirectory, otherwise it's a file with that value as
    // its contents.
    type Directory = { [fileName: string]: string | Directory | undefined };
    let files: Directory;

    function getFile(filePath: string): string | Directory | undefined;
    function getFile(filePath: string, throwIfMissing: 'throwIfMissing'): string | Directory;
    function getFile(filePath: string, throwIfMissing?: 'throwIfMissing') {
        const segments = filePath.split(/[\\/]/);
        let dir: Directory | string = files;
        let currentPath = '';
        for (const fileName of segments) {
            if (typeof dir === 'string') {
                throw new Error(`${currentPath} is not a directory`);
            } else if (fileName !== '') {
                const child: string | Directory | undefined = dir[fileName];
                if (child === undefined) {
                    if (throwIfMissing) {
                        const err: NodeJS.ErrnoException = new Error(`${currentPath} does not contain ${fileName}`);
                        err.code = 'ENOENT';
                        throw err;
                    } else {
                        return undefined;
                    }
                }
                dir = child;
                currentPath = `${currentPath}/${fileName}`;
            }
        }
        return dir;
    }

    // exec("command") is stubbed such that if either getFile(`${entry}/command`) or
    // getFile(`${entry}/command.exe`) returns a non-empty string, it succeeds with
    // that string as stdout. Otherwise, the exec stub throws. Empty strings can be
    // used to simulate files that are present but not executable.
    let execPath: string[];

    async function expectConda(expectedPath: string) {
        const expectedInfo = JSON.parse(getFile(expectedPath) as string);

        const conda = await Conda.getConda();
        expect(conda).to.not.equal(undefined, 'conda should not be missing');

        const info = await conda!.getInfo();
        expect(info).to.deep.equal(expectedInfo);
    }

    function condaInfo(condaVersion?: string): CondaInfo {
        return {
            conda_version: condaVersion,
            python_version: '3.9.0',
            'sys.version': '3.9.0',
            'sys.prefix': '/some/env',
            default_prefix: '/conda/base',
            envs: [],
        };
    }

    let getPythonSetting: sinon.SinonStub;
    let condaVersionOutput: string;

    setup(() => {
        osType = platform.OSType.Unknown;
        getPythonSetting = sinon.stub(externalDependencies, 'getPythonSetting');
        getPythonSetting.withArgs('condaPath').returns('conda');
        homeDir = undefined;
        execPath = [];
        files = {};
        registryInterpreters = [];

        sinon.stub(windowsUtils, 'getRegistryInterpreters').callsFake(async () => registryInterpreters);

        sinon.stub(platform, 'getOSType').callsFake(() => osType);

        sinon.stub(platform, 'getUserHomeDir').callsFake(() => homeDir);

        sinon.stub(fs, 'lstat').callsFake(async (filePath: fs.PathLike) => {
            if (typeof filePath !== 'string') {
                throw new Error(`expected filePath to be string, got ${typeof filePath}`);
            }
            const file = getFile(filePath, 'throwIfMissing');
            return {
                isDirectory: () => typeof file !== 'string',
            } as fs.Stats;
        });

        sinon.stub(fs, 'pathExists').callsFake(async (filePath: string | Buffer) => {
            if (typeof filePath !== 'string') {
                throw new Error(`expected filePath to be string, got ${typeof filePath}`);
            }
            try {
                getFile(filePath, 'throwIfMissing');
            } catch {
                return false;
            }
            return true;
        });

        sinon.stub(fs, 'readdir').callsFake(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (filePath: fs.PathLike, options?: { withFileTypes?: boolean }): Promise<any> => {
                if (typeof filePath !== 'string') {
                    throw new Error(`expected path to be string, got ${typeof path}`);
                }

                const dir = getFile(filePath, 'throwIfMissing');
                if (typeof dir === 'string') {
                    throw new Error(`${path} is not a directory`);
                }

                if (options === undefined) {
                    return (Object.keys(getFile(filePath, 'throwIfMissing')) as unknown) as fs.Dirent[];
                }

                const names = Object.keys(dir);
                if (!options?.withFileTypes) {
                    return names;
                }

                return names.map(
                    (name): fs.Dirent => {
                        const isFile = typeof dir[name] === 'string';
                        return {
                            name,
                            path: dir.name?.toString() ?? '',
                            isFile: () => isFile,
                            isDirectory: () => !isFile,
                            isBlockDevice: () => false,
                            isCharacterDevice: () => false,
                            isSymbolicLink: () => false,
                            isFIFO: () => false,
                            isSocket: () => false,
                            parentPath: '',
                        };
                    },
                );
            },
        );
        const readFileStub = async (
            filePath: fs.PathOrFileDescriptor,
            options: { encoding: BufferEncoding; flag?: string | undefined } | BufferEncoding,
        ): Promise<string> => {
            if (typeof filePath !== 'string') {
                throw new Error(`expected filePath to be string, got ${typeof filePath}`);
            } else if (typeof options === 'string') {
                if (options !== 'utf8') {
                    throw new Error(`Unsupported encoding ${options}`);
                }
            } else if ((options as any).encoding !== 'utf8') {
                throw new Error(`Unsupported encoding ${(options as any).encoding}`);
            }

            const contents = getFile(filePath);
            if (typeof contents !== 'string') {
                throw new Error(`${filePath} is not a file`);
            }

            return contents;
        };
        sinon.stub(fs, 'readFile' as any).callsFake(readFileStub as any);

        sinon.stub(externalDependencies, 'exec').callsFake(async (command: string, args: string[]) => {
            for (const prefix of ['', ...execPath]) {
                const contents = getFile(path.join(prefix, command));
                if (args[0] === 'info' && args[1] === '--json') {
                    if (typeof contents === 'string' && contents !== '') {
                        return { stdout: contents };
                    }
                } else if (args[0] === '--version') {
                    return { stdout: condaVersionOutput };
                } else {
                    throw new Error(`Invalid arguments: ${util.inspect(args)}`);
                }
            }
            throw new Error(`${command} is missing or is not executable`);
        });
    });

    teardown(() => {
        condaVersionOutput = '';
        sinon.restore();
    });

    suite('Conda binary is located correctly', () => {
        test('Must not find conda if it is missing', async () => {
            const conda = await Conda.getConda();
            expect(conda).to.equal(undefined, 'conda should be missing');
        });

        test('Must find conda using `python.condaPath` setting and prefer it', async () => {
            getPythonSetting.withArgs('condaPath').returns('condaPath/conda');

            files = {
                condaPath: {
                    conda: JSON.stringify(condaInfo('4.8.0')),
                },
            };
            await expectConda('/condaPath/conda');
        });

        test('Must find conda on PATH, and prefer it', async () => {
            osType = platform.OSType.Linux;
            execPath = ['/bin'];

            files = {
                bin: {
                    conda: JSON.stringify(condaInfo('4.8.0')),
                },
                opt: {
                    anaconda: {
                        bin: {
                            conda: JSON.stringify(condaInfo('4.8.1')),
                        },
                    },
                },
            };

            await expectConda('/bin/conda');
        });

        test('Use conda.bat when possible over conda.exe on windows', async () => {
            osType = platform.OSType.Windows;

            getPythonSetting.withArgs('condaPath').returns('bin/conda');
            files = {
                bin: {
                    conda: JSON.stringify(condaInfo('4.8.0')),
                },
                condabin: {
                    'conda.bat': JSON.stringify(condaInfo('4.8.0')),
                },
            };

            await expectConda('/condabin/conda.bat');
        });

        suite('Must find conda in well-known locations', () => {
            const condaDirNames = ['Anaconda', 'anaconda', 'Miniconda', 'miniconda'];

            condaDirNames.forEach((condaDirName) => {
                suite(`Must find conda in well-known locations on Linux with ${condaDirName} directory name`, () => {
                    setup(() => {
                        osType = platform.OSType.Linux;
                        homeDir = '/home/user';

                        files = {
                            home: {
                                user: {
                                    opt: {},
                                },
                            },
                            opt: {
                                homebrew: {
                                    bin: {},
                                },
                            },
                            usr: {
                                share: {
                                    doc: {},
                                },
                                local: {
                                    share: {
                                        doc: {},
                                    },
                                },
                            },
                        };
                    });

                    [
                        '/usr/share',
                        '/usr/local/share',
                        '/opt',
                        '/opt/homebrew/bin',
                        '/home/user',
                        '/home/user/opt',
                    ].forEach((prefix) => {
                        const condaPath = `${prefix}/${condaDirName}`;

                        test(`Must find conda in ${condaPath}`, async () => {
                            const prefixDir = getFile(prefix) as Directory;
                            prefixDir[condaDirName] = {
                                bin: {
                                    conda: JSON.stringify(condaInfo('4.8.0')),
                                },
                            };

                            await expectConda(`${condaPath}/bin/conda`);
                        });
                    });
                });

                suite(`Must find conda in well-known locations on Windows with ${condaDirName} directory name`, () => {
                    setup(() => {
                        osType = platform.OSType.Windows;
                        homeDir = 'E:\\Users\\user';

                        sinon
                            .stub(platform, 'getEnvironmentVariable')
                            .withArgs('PROGRAMDATA')
                            .returns('D:\\ProgramData')
                            .withArgs('LOCALAPPDATA')
                            .returns('F:\\Users\\user\\AppData\\Local');

                        files = {
                            'C:': {},
                            'D:': {
                                ProgramData: {},
                            },
                            'E:': {
                                Users: {
                                    user: {},
                                },
                            },
                            'F:': {
                                Users: {
                                    user: {
                                        AppData: {
                                            Local: {
                                                Continuum: {},
                                            },
                                        },
                                    },
                                },
                            },
                        };
                    });

                    // Drive letters are intentionally unusual to ascertain that locator doesn't hardcode paths.
                    ['D:\\ProgramData', 'E:\\Users\\user', 'F:\\Users\\user\\AppData\\Local\\Continuum'].forEach(
                        (prefix) => {
                            const condaPath = `${prefix}\\${condaDirName}`;

                            test(`Must find conda in ${condaPath}`, async () => {
                                const prefixDir = getFile(prefix) as Directory;
                                prefixDir[condaDirName] = {
                                    Scripts: {
                                        'conda.exe': JSON.stringify(condaInfo('4.8.0')),
                                    },
                                };

                                await expectConda(`${condaPath}\\Scripts\\conda.exe`);
                            });
                        },
                    );
                });
            });
        });

        suite('Must find conda in environments.txt', () => {
            test('Must find conda in environments.txt on Unix', async () => {
                osType = platform.OSType.Linux;
                homeDir = '/home/user';

                files = {
                    home: {
                        user: {
                            '.conda': {
                                'environments.txt': ['', '/missing', '', '# comment', '', '  /present  ', ''].join(
                                    '\n',
                                ),
                            },
                        },
                    },
                    present: {
                        bin: {
                            conda: JSON.stringify(condaInfo('4.8.0')),
                        },
                    },
                };

                await expectConda('/present/bin/conda');
            });

            test('Must find conda in environments.txt on Windows', async () => {
                osType = platform.OSType.Windows;
                homeDir = 'D:\\Users\\user';

                files = {
                    'D:': {
                        Users: {
                            user: {
                                '.conda': {
                                    'environments.txt': [
                                        '',
                                        'C:\\Missing',
                                        '',
                                        '# comment',
                                        '',
                                        '  E:\\Present  ',
                                        '',
                                    ].join('\r\n'),
                                },
                            },
                        },
                    },
                    'E:': {
                        Present: {
                            Scripts: {
                                'conda.exe': JSON.stringify(condaInfo('4.8.0')),
                            },
                        },
                    },
                };

                await expectConda('E:\\Present\\Scripts\\conda.exe');
            });
        });

        test('Must find conda in the registry', async () => {
            osType = platform.OSType.Windows;

            registryInterpreters = [
                {
                    interpreterPath: 'C:\\Python2\\python.exe',
                },
                {
                    interpreterPath: 'C:\\Anaconda2\\python.exe',
                    distroOrgName: 'ContinuumAnalytics',
                },
                {
                    interpreterPath: 'C:\\Python3\\python.exe',
                    distroOrgName: 'PythonCore',
                },
                {
                    interpreterPath: 'C:\\Anaconda3\\python.exe',
                    distroOrgName: 'ContinuumAnalytics',
                },
            ];

            files = {
                'C:': {
                    Python3: {
                        // Shouldn't be located because it's not a well-known conda path,
                        // and it's listed under PythonCore in the registry.
                        Scripts: {
                            'conda.exe': JSON.stringify(condaInfo('4.8.0')),
                        },
                    },
                    Anaconda2: {
                        // Shouldn't be located because it can't handle "conda info --json".
                        Scripts: {
                            'conda.exe': '',
                        },
                    },
                    Anaconda3: {
                        Scripts: {
                            'conda.exe': JSON.stringify(condaInfo('4.8.1')),
                        },
                    },
                },
            };

            await expectConda('C:\\Anaconda3\\Scripts\\conda.exe');
        });
    });

    test('Conda version returns version info using `conda info` command if applicable', async () => {
        files = {
            conda: JSON.stringify(condaInfo('4.8.0')),
        };
        const conda = await Conda.getConda();
        const version = await conda?.getCondaVersion();
        expect(version).to.not.equal(undefined);
        expect(eq(version!, '4.8.0')).to.equal(true);
    });

    test('Conda version returns version info using `conda --version` command otherwise', async () => {
        files = {
            conda: JSON.stringify(condaInfo()),
        };
        condaVersionOutput = 'conda 4.8.0';
        const conda = await Conda.getConda();
        const version = await conda?.getCondaVersion();
        expect(version).to.not.equal(undefined);
        expect(eq(version!, '4.8.0')).to.equal(true);
    });

    test('Conda version works for dev versions of conda', async () => {
        files = {
            conda: JSON.stringify(condaInfo('23.1.0.post7+d5281f611')),
        };
        condaVersionOutput = 'conda 23.1.0.post7+d5281f611';
        const conda = await Conda.getConda();
        const version = await conda?.getCondaVersion();
        expect(version).to.not.equal(undefined);
        expect(eq(version!, '23.1.0')).to.equal(true);
    });

    test('Conda run args returns `undefined` for conda version below 4.9.0', async () => {
        files = {
            conda: JSON.stringify(condaInfo('4.8.0')),
        };
        const conda = await Conda.getConda();
        const args = await conda?.getRunPythonArgs({ name: 'envName', prefix: 'envPrefix' });
        expect(args).to.equal(undefined);
    });

    test('Conda run args returns appropriate args for conda version starting with 4.9.0', async () => {
        files = {
            conda: JSON.stringify(condaInfo('4.9.0')),
        };
        const conda = await Conda.getConda();
        let args = await conda?.getRunPythonArgs({ name: 'envName', prefix: 'envPrefix' });
        expect(args).to.not.equal(undefined);
        assert.deepStrictEqual(
            args,
            ['conda', 'run', '-p', 'envPrefix', '--no-capture-output', 'python', OUTPUT_MARKER_SCRIPT],
            'Incorrect args for case 1',
        );

        args = await conda?.getRunPythonArgs({ name: '', prefix: 'envPrefix' });
        assert.deepStrictEqual(
            args,
            ['conda', 'run', '-p', 'envPrefix', '--no-capture-output', 'python', OUTPUT_MARKER_SCRIPT],
            'Incorrect args for case 2',
        );
    });

    suite('Conda env list is parsed correctly', () => {
        setup(() => {
            homeDir = '/home/user';
            files = {
                home: {
                    user: {
                        miniconda3: {
                            bin: {
                                python: '',
                                conda: JSON.stringify({
                                    conda_version: '4.8.0',
                                    python_version: '3.9.0',
                                    'sys.version': '3.9.0',
                                    'sys.prefix': '/some/env',
                                    root_prefix: '/home/user/miniconda3',
                                    default_prefix: '/home/user/miniconda3/envs/env1',
                                    envs_dirs: ['/home/user/miniconda3/envs', '/home/user/.conda/envs'],
                                    envs: [
                                        '/home/user/miniconda3',
                                        '/home/user/miniconda3/envs/env1',
                                        '/home/user/miniconda3/envs/env2',
                                        '/home/user/miniconda3/envs/dir/env3',
                                        '/home/user/.conda/envs/env4',
                                        '/home/user/.conda/envs/env5',
                                        '/env6',
                                    ],
                                }),
                            },
                            envs: {
                                env1: {
                                    bin: {
                                        python: '',
                                    },
                                },
                                dir: {
                                    env3: {
                                        bin: {
                                            python: '',
                                        },
                                    },
                                },
                            },
                        },
                        '.conda': {
                            envs: {
                                env4: {
                                    bin: {
                                        python: '',
                                    },
                                },
                            },
                        },
                    },
                },
                env6: {
                    bin: {
                        python: '',
                    },
                },
            };
            sinon.stub(externalDependencies, 'inExperiment').returns(false);
        });

        teardown(() => {
            sinon.restore();
        });

        test('Must compute conda environment name from prefix', async () => {
            const conda = new Conda('/home/user/miniconda3/bin/conda');
            const envs = await conda.getEnvList();

            expect(envs).to.have.deep.members([
                {
                    prefix: '/home/user/miniconda3',
                    name: 'base',
                },
                {
                    prefix: '/home/user/miniconda3/envs/env1',
                    name: 'env1',
                },
                {
                    prefix: '/home/user/miniconda3/envs/env2',
                    name: 'env2',
                },
                {
                    prefix: '/home/user/miniconda3/envs/dir/env3',
                    name: undefined, // because it's not directly under envsDirs
                },
                {
                    prefix: '/home/user/.conda/envs/env4',
                    name: 'env4',
                },
                {
                    prefix: '/home/user/.conda/envs/env5',
                    name: 'env5',
                },
                {
                    prefix: '/env6',
                    name: undefined, // because it's not directly under envsDirs
                },
            ]);
        });

        test('Must iterate conda environments correctly', async () => {
            const locator = new CondaEnvironmentLocator();
            const envs = await getEnvs(locator.iterEnvs());
            const expected = [
                '/home/user/miniconda3',
                '/home/user/miniconda3/envs/env1',
                '/home/user/miniconda3/envs/dir/env3',
                '/home/user/.conda/envs/env4',
                '/env6',
            ].map((envPath) =>
                createBasicEnv(PythonEnvKind.Conda, path.join(envPath, 'bin', 'python'), undefined, envPath),
            );
            expected.push(
                ...[
                    '/home/user/miniconda3/envs/env2', // Show env2 despite there's no bin/python* under it
                    '/home/user/.conda/envs/env5', // Show env5 despite there's no bin/python* under it
                ].map((envPath) => createBasicEnv(PythonEnvKind.Conda, 'python', undefined, envPath)),
            );
            assertBasicEnvsEqual(envs, expected);
        });
    });
});
