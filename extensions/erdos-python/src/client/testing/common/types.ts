import { CancellationToken, DebugSessionOptions, OutputChannel, Uri } from 'vscode';
import { Product } from '../../common/types';
import { TestSettingsPropertyNames } from '../configuration/types';
import { TestProvider } from '../types';

export type UnitTestProduct = Product.pytest | Product.unittest;

// ****************
// test args/options

export type TestDiscoveryOptions = {
    workspaceFolder: Uri;
    cwd: string;
    args: string[];
    token?: CancellationToken;
    ignoreCache: boolean;
    outChannel?: OutputChannel;
};

export type LaunchOptions = {
    cwd: string;
    args: string[];
    testProvider: TestProvider;
    token?: CancellationToken;
    outChannel?: OutputChannel;
    pytestPort?: string;
    pytestUUID?: string;
    runTestIdsPort?: string;
};

export enum TestFilter {
    removeTests = 'removeTests',
    discovery = 'discovery',
    runAll = 'runAll',
    runSpecific = 'runSpecific',
    debugAll = 'debugAll',
    debugSpecific = 'debugSpecific',
}

// ****************
// interfaces

export const ITestsHelper = Symbol('ITestsHelper');
export interface ITestsHelper {
    parseProviderName(product: UnitTestProduct): TestProvider;
    parseProduct(provider: TestProvider): UnitTestProduct;
    getSettingsPropertyNames(product: Product): TestSettingsPropertyNames;
}

export const ITestConfigurationService = Symbol('ITestConfigurationService');
export interface ITestConfigurationService {
    hasConfiguredTests(wkspace: Uri): boolean;
    selectTestRunner(placeHolderMessage: string): Promise<UnitTestProduct | undefined>;
    enableTest(wkspace: Uri, product: UnitTestProduct): Promise<void>;
    promptToEnableAndConfigureTestFramework(wkspace: Uri): Promise<void>;
}

export const ITestConfigSettingsService = Symbol('ITestConfigSettingsService');
export interface ITestConfigSettingsService {
    updateTestArgs(testDirectory: string | Uri, product: UnitTestProduct, args: string[]): Promise<void>;
    enable(testDirectory: string | Uri, product: UnitTestProduct): Promise<void>;
    disable(testDirectory: string | Uri, product: UnitTestProduct): Promise<void>;
    getTestEnablingSetting(product: UnitTestProduct): string;
}

export interface ITestConfigurationManager {
    requiresUserToConfigure(wkspace: Uri): Promise<boolean>;
    configure(wkspace: Uri): Promise<void>;
    enable(): Promise<void>;
    disable(): Promise<void>;
}

export const ITestConfigurationManagerFactory = Symbol('ITestConfigurationManagerFactory');
export interface ITestConfigurationManagerFactory {
    create(wkspace: Uri, product: Product, cfg?: ITestConfigSettingsService): ITestConfigurationManager;
}
export const ITestDebugLauncher = Symbol('ITestDebugLauncher');
export interface ITestDebugLauncher {
    launchDebugger(options: LaunchOptions, callback?: () => void, sessionOptions?: DebugSessionOptions): Promise<void>;
}
