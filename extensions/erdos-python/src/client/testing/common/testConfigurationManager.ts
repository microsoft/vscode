import * as path from 'path';
import { QuickPickItem, QuickPickOptions, Uri } from 'vscode';
import { IApplicationShell } from '../../common/application/types';
import { IFileSystem } from '../../common/platform/types';
import { IInstaller } from '../../common/types';
import { createDeferred } from '../../common/utils/async';
import { IServiceContainer } from '../../ioc/types';
import { traceVerbose } from '../../logging';
import { UNIT_TEST_PRODUCTS } from './constants';
import { ITestConfigSettingsService, ITestConfigurationManager, UnitTestProduct } from './types';

function handleCancelled(): void {
    traceVerbose('testing configuration (in UI) cancelled');
    throw Error('cancelled');
}

export abstract class TestConfigurationManager implements ITestConfigurationManager {
    protected readonly installer: IInstaller;

    protected readonly testConfigSettingsService: ITestConfigSettingsService;

    private readonly handleCancelled = handleCancelled;

    constructor(
        protected workspace: Uri,
        protected product: UnitTestProduct,
        protected readonly serviceContainer: IServiceContainer,
        cfg?: ITestConfigSettingsService,
    ) {
        this.installer = serviceContainer.get<IInstaller>(IInstaller);
        this.testConfigSettingsService =
            cfg || serviceContainer.get<ITestConfigSettingsService>(ITestConfigSettingsService);
    }

    public abstract configure(wkspace: Uri): Promise<void>;

    public abstract requiresUserToConfigure(wkspace: Uri): Promise<boolean>;

    public async enable(): Promise<void> {
        // Disable other test frameworks.
        await Promise.all(
            UNIT_TEST_PRODUCTS.filter((prod) => prod !== this.product).map((prod) =>
                this.testConfigSettingsService.disable(this.workspace, prod),
            ),
        );
        await this.testConfigSettingsService.enable(this.workspace, this.product);
    }

    public async disable(): Promise<void> {
        return this.testConfigSettingsService.enable(this.workspace, this.product);
    }

    protected selectTestDir(rootDir: string, subDirs: string[], customOptions: QuickPickItem[] = []): Promise<string> {
        const options = {
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: 'Select the directory containing the tests',
        };
        let items: QuickPickItem[] = subDirs
            .map((dir) => {
                const dirName = path.relative(rootDir, dir);
                if (dirName.indexOf('.') === 0) {
                    return undefined;
                }
                return {
                    label: dirName,
                    description: '',
                };
            })
            .filter((item) => item !== undefined)
            .map((item) => item!);

        items = [{ label: '.', description: 'Root directory' }, ...items];
        items = customOptions.concat(items);
        return this.showQuickPick(items, options);
    }

    protected selectTestFilePattern(): Promise<string> {
        const options = {
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: 'Select the pattern to identify test files',
        };
        const items: QuickPickItem[] = [
            { label: '*test.py', description: "Python files ending with 'test'" },
            { label: '*_test.py', description: "Python files ending with '_test'" },
            { label: 'test*.py', description: "Python files beginning with 'test'" },
            { label: 'test_*.py', description: "Python files beginning with 'test_'" },
            { label: '*test*.py', description: "Python files containing the word 'test'" },
        ];

        return this.showQuickPick(items, options);
    }

    protected getTestDirs(rootDir: string): Promise<string[]> {
        const fs = this.serviceContainer.get<IFileSystem>(IFileSystem);
        return fs.getSubDirectories(rootDir).then((subDirs) => {
            subDirs.sort();

            // Find out if there are any dirs with the name test and place them on the top.
            const possibleTestDirs = subDirs.filter((dir) => dir.match(/test/i));
            const nonTestDirs = subDirs.filter((dir) => possibleTestDirs.indexOf(dir) === -1);
            possibleTestDirs.push(...nonTestDirs);

            // The test dirs are now on top.
            return possibleTestDirs;
        });
    }

    private showQuickPick(items: QuickPickItem[], options: QuickPickOptions): Promise<string> {
        const def = createDeferred<string>();
        const appShell = this.serviceContainer.get<IApplicationShell>(IApplicationShell);
        appShell.showQuickPick(items, options).then((item) => {
            if (!item) {
                this.handleCancelled(); // This will throw an exception.
                return;
            }

            def.resolve(item.label);
        });
        return def.promise;
    }
}
