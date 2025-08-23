import * as assert from 'assert';
import * as path from 'path';
import * as TypeMoq from 'typemoq';
import * as sinon from 'sinon';
import { FileSystemPaths, FileSystemPathUtils } from '../../../../client/common/platform/fs-paths';
import { IFileSystem, IPlatformService } from '../../../../client/common/platform/types';
import { CondaService } from '../../../../client/pythonEnvironments/common/environmentManagers/condaService';
import { Conda } from '../../../../client/pythonEnvironments/common/environmentManagers/conda';

suite('Interpreters Conda Service', () => {
    let platformService: TypeMoq.IMock<IPlatformService>;
    let condaService: CondaService;
    let fileSystem: TypeMoq.IMock<IFileSystem>;
    setup(async () => {
        platformService = TypeMoq.Mock.ofType<IPlatformService>();
        fileSystem = TypeMoq.Mock.ofType<IFileSystem>();

        fileSystem
            .setup((fs) => fs.arePathsSame(TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns((p1, p2) => {
                const utils = FileSystemPathUtils.withDefaults(
                    FileSystemPaths.withDefaults(platformService.object.isWindows),
                );
                return utils.arePathsSame(p1, p2);
            });

        condaService = new CondaService(platformService.object, fileSystem.object);
        sinon.stub(Conda, 'getConda').callsFake(() => Promise.resolve(undefined));
    });
    teardown(() => sinon.restore());

    type InterpreterSearchTestParams = {
        pythonPath: string;
        environmentName: string;
        isLinux: boolean;
        expectedCondaPath: string;
    };

    const testsForInterpreter: InterpreterSearchTestParams[] = [
        {
            pythonPath: path.join('users', 'foo', 'envs', 'test1', 'python'),
            environmentName: 'test1',
            isLinux: true,
            expectedCondaPath: path.join('users', 'foo', 'bin', 'conda'),
        },
        {
            pythonPath: path.join('users', 'foo', 'envs', 'test2', 'python'),
            environmentName: 'test2',
            isLinux: true,
            expectedCondaPath: path.join('users', 'foo', 'envs', 'test2', 'conda'),
        },
        {
            pythonPath: path.join('users', 'foo', 'envs', 'test3', 'python'),
            environmentName: 'test3',
            isLinux: false,
            expectedCondaPath: path.join('users', 'foo', 'Scripts', 'conda.exe'),
        },
        {
            pythonPath: path.join('users', 'foo', 'envs', 'test4', 'python'),
            environmentName: 'test4',
            isLinux: false,
            expectedCondaPath: path.join('users', 'foo', 'conda.exe'),
        },
    ];

    testsForInterpreter.forEach((t) => {
        test(`Finds conda.exe for subenvironment ${t.environmentName}`, async () => {
            platformService.setup((p) => p.isLinux).returns(() => t.isLinux);
            platformService.setup((p) => p.isWindows).returns(() => !t.isLinux);
            platformService.setup((p) => p.isMac).returns(() => false);
            fileSystem
                .setup((f) =>
                    f.fileExists(
                        TypeMoq.It.is((p) => {
                            if (p === t.expectedCondaPath) {
                                return true;
                            }
                            return false;
                        }),
                    ),
                )
                .returns(() => Promise.resolve(true));

            const condaFile = await condaService.getCondaFileFromInterpreter(t.pythonPath, t.environmentName);
            assert.strictEqual(condaFile, t.expectedCondaPath);
        });
        test(`Finds conda.exe for different ${t.environmentName}`, async () => {
            platformService.setup((p) => p.isLinux).returns(() => t.isLinux);
            platformService.setup((p) => p.isWindows).returns(() => !t.isLinux);
            platformService.setup((p) => p.isMac).returns(() => false);
            fileSystem
                .setup((f) =>
                    f.fileExists(
                        TypeMoq.It.is((p) => {
                            if (p === t.expectedCondaPath) {
                                return true;
                            }
                            return false;
                        }),
                    ),
                )
                .returns(() => Promise.resolve(true));

            const condaFile = await condaService.getCondaFileFromInterpreter(t.pythonPath, undefined);

            // This should only work if the expectedConda path has the original environment name in it
            if (t.expectedCondaPath.includes(t.environmentName)) {
                assert.strictEqual(condaFile, t.expectedCondaPath);
            } else {
                assert.strictEqual(condaFile, 'conda');
            }
        });
    });
});
