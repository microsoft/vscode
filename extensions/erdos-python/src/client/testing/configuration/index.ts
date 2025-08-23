'use strict';

import { inject, injectable } from 'inversify';
import { Uri } from 'vscode';
import { IApplicationShell, IWorkspaceService } from '../../common/application/types';
import { IConfigurationService, Product } from '../../common/types';
import { IServiceContainer } from '../../ioc/types';
import { traceError } from '../../logging';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { TestConfiguringTelemetry } from '../../telemetry/types';
import { BufferedTestConfigSettingsService } from '../common/bufferedTestConfigSettingService';
import {
    ITestConfigSettingsService,
    ITestConfigurationManager,
    ITestConfigurationManagerFactory,
    ITestConfigurationService,
    ITestsHelper,
    UnitTestProduct,
} from '../common/types';

export const NONE_SELECTED = Error('none selected');

@injectable()
export class UnitTestConfigurationService implements ITestConfigurationService {
    private readonly configurationService: IConfigurationService;

    private readonly appShell: IApplicationShell;

    private readonly workspaceService: IWorkspaceService;

    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {
        this.configurationService = serviceContainer.get<IConfigurationService>(IConfigurationService);
        this.appShell = serviceContainer.get<IApplicationShell>(IApplicationShell);
        this.workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    }

    public hasConfiguredTests(wkspace: Uri): boolean {
        const settings = this.configurationService.getSettings(wkspace);
        return settings.testing.pytestEnabled || settings.testing.unittestEnabled || false;
    }

    public async selectTestRunner(placeHolderMessage: string): Promise<UnitTestProduct | undefined> {
        const items = [
            {
                label: 'unittest',
                product: Product.unittest,
                description: 'Standard Python test framework',
                detail: 'https://docs.python.org/3/library/unittest.html',
            },
            {
                label: 'pytest',
                product: Product.pytest,
                description: 'pytest framework',

                detail: 'http://docs.pytest.org/',
            },
        ];
        const options = {
            ignoreFocusOut: true,
            matchOnDescription: true,
            matchOnDetail: true,
            placeHolder: placeHolderMessage,
        };
        const selectedTestRunner = await this.appShell.showQuickPick(items, options);

        return selectedTestRunner ? (selectedTestRunner.product as UnitTestProduct) : undefined;
    }

    public async enableTest(wkspace: Uri, product: UnitTestProduct): Promise<void> {
        const factory = this.serviceContainer.get<ITestConfigurationManagerFactory>(ITestConfigurationManagerFactory);
        const configMgr = factory.create(wkspace, product);
        return this._enableTest(wkspace, configMgr);
    }

    public async promptToEnableAndConfigureTestFramework(wkspace: Uri): Promise<void> {
        await this._promptToEnableAndConfigureTestFramework(wkspace, undefined, false, 'commandpalette');
    }

    private _enableTest(wkspace: Uri, configMgr: ITestConfigurationManager) {
        const pythonConfig = this.workspaceService.getConfiguration('python', wkspace);
        if (pythonConfig.get<boolean>('testing.promptToConfigure')) {
            return configMgr.enable();
        }
        return pythonConfig.update('testing.promptToConfigure', undefined).then(
            () => configMgr.enable(),
            (reason) => configMgr.enable().then(() => Promise.reject(reason)),
        );
    }

    private async _promptToEnableAndConfigureTestFramework(
        wkspace: Uri,
        messageToDisplay = 'Select a test framework/tool to enable',
        enableOnly = false,
        trigger: 'ui' | 'commandpalette' = 'ui',
    ): Promise<void> {
        const telemetryProps: TestConfiguringTelemetry = {
            trigger,
            failed: false,
        };
        try {
            const selectedTestRunner = await this.selectTestRunner(messageToDisplay);
            if (typeof selectedTestRunner !== 'number') {
                throw NONE_SELECTED;
            }
            const helper = this.serviceContainer.get<ITestsHelper>(ITestsHelper);
            telemetryProps.tool = helper.parseProviderName(selectedTestRunner);
            const delayed = new BufferedTestConfigSettingsService();
            const factory = this.serviceContainer.get<ITestConfigurationManagerFactory>(
                ITestConfigurationManagerFactory,
            );
            const configMgr = factory.create(wkspace, selectedTestRunner, delayed);
            if (enableOnly) {
                await configMgr.enable();
            } else {
                // Configure everything before enabling.
                // Cuz we don't want the test engine (in main.ts file - tests get discovered when config changes are detected)
                // to start discovering tests when tests haven't been configured properly.
                await configMgr
                    .configure(wkspace)
                    .then(() => this._enableTest(wkspace, configMgr))
                    .catch((reason) => this._enableTest(wkspace, configMgr).then(() => Promise.reject(reason)));
            }
            const cfg = this.serviceContainer.get<ITestConfigSettingsService>(ITestConfigSettingsService);
            try {
                await delayed.apply(cfg);
            } catch (exc) {
                traceError('Python Extension: applying unit test config updates', exc);
                telemetryProps.failed = true;
            }
        } finally {
            sendTelemetryEvent(EventName.UNITTEST_CONFIGURING, undefined, telemetryProps);
        }
    }
}
