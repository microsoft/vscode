import { injectable } from 'inversify';
import { Uri, workspace } from 'vscode';
import { IApplicationShell } from '../../common/application/types';
import { Product } from '../../common/types';
import { ITestingSettings, TestSettingsPropertyNames } from '../configuration/types';
import { TestProvider } from '../types';
import { ITestsHelper, UnitTestProduct } from './types';

export async function selectTestWorkspace(appShell: IApplicationShell): Promise<Uri | undefined> {
    if (!Array.isArray(workspace.workspaceFolders) || workspace.workspaceFolders.length === 0) {
        return undefined;
    } else if (workspace.workspaceFolders.length === 1) {
        return workspace.workspaceFolders[0].uri;
    } else {
        const workspaceFolder = await appShell.showWorkspaceFolderPick({ placeHolder: 'Select a workspace' });
        return workspaceFolder ? workspaceFolder.uri : undefined;
    }
}

@injectable()
export class TestsHelper implements ITestsHelper {
    public parseProviderName(product: UnitTestProduct): TestProvider {
        switch (product) {
            case Product.pytest:
                return 'pytest';
            case Product.unittest:
                return 'unittest';
            default: {
                throw new Error(`Unknown Test Product ${product}`);
            }
        }
    }
    public parseProduct(provider: TestProvider): UnitTestProduct {
        switch (provider) {
            case 'pytest':
                return Product.pytest;
            case 'unittest':
                return Product.unittest;
            default: {
                throw new Error(`Unknown Test Provider ${provider}`);
            }
        }
    }
    public getSettingsPropertyNames(product: UnitTestProduct): TestSettingsPropertyNames {
        const id = this.parseProviderName(product);
        switch (id) {
            case 'pytest': {
                return {
                    argsName: 'pytestArgs' as keyof ITestingSettings,
                    pathName: 'pytestPath' as keyof ITestingSettings,
                    enabledName: 'pytestEnabled' as keyof ITestingSettings,
                };
            }
            case 'unittest': {
                return {
                    argsName: 'unittestArgs' as keyof ITestingSettings,
                    enabledName: 'unittestEnabled' as keyof ITestingSettings,
                };
            }
            default: {
                throw new Error(`Unknown Test Provider '${product}'`);
            }
        }
    }
}
