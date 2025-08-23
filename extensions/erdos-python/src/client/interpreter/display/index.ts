import { inject, injectable } from 'inversify';
import {
    Disposable,
    l10n,
    LanguageStatusItem,
    LanguageStatusSeverity,
    StatusBarAlignment,
    StatusBarItem,
    ThemeColor,
    Uri,
} from 'vscode';
import { IExtensionSingleActivationService } from '../../activation/types';
import { IApplicationShell, IWorkspaceService } from '../../common/application/types';
import { Commands, PYTHON_LANGUAGE } from '../../common/constants';
import '../../common/extensions';
import { IDisposableRegistry, IPathUtils, Resource } from '../../common/types';
import { InterpreterQuickPickList, Interpreters } from '../../common/utils/localize';
import { IServiceContainer } from '../../ioc/types';
import { traceLog } from '../../logging';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import {
    IInterpreterDisplay,
    IInterpreterHelper,
    IInterpreterService,
    IInterpreterStatusbarVisibilityFilter,
} from '../contracts';
import { useEnvExtension } from '../../envExt/api.internal';

/**
 * Based on https://github.com/microsoft/vscode-python/issues/18040#issuecomment-992567670.
 * This is to ensure the item appears right after the Python language status item.
 */
const STATUS_BAR_ITEM_PRIORITY = 100.09999;

@injectable()
export class InterpreterDisplay implements IInterpreterDisplay, IExtensionSingleActivationService {
    public supportedWorkspaceTypes: { untrustedWorkspace: boolean; virtualWorkspace: boolean } = {
        untrustedWorkspace: false,
        virtualWorkspace: true,
    };
    private statusBar: StatusBarItem | undefined;
    private useLanguageStatus = false;
    private languageStatus: LanguageStatusItem | undefined;
    private readonly helper: IInterpreterHelper;
    private readonly workspaceService: IWorkspaceService;
    private readonly pathUtils: IPathUtils;
    private readonly interpreterService: IInterpreterService;
    private currentlySelectedInterpreterDisplay?: string;
    private currentlySelectedInterpreterPath?: string;
    private currentlySelectedWorkspaceFolder: Resource;
    private statusBarCanBeDisplayed?: boolean;
    private visibilityFilters: IInterpreterStatusbarVisibilityFilter[] = [];
    private disposableRegistry: Disposable[];

    constructor(@inject(IServiceContainer) private readonly serviceContainer: IServiceContainer) {
        this.helper = serviceContainer.get<IInterpreterHelper>(IInterpreterHelper);
        this.workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        this.pathUtils = serviceContainer.get<IPathUtils>(IPathUtils);
        this.interpreterService = serviceContainer.get<IInterpreterService>(IInterpreterService);

        this.disposableRegistry = serviceContainer.get<Disposable[]>(IDisposableRegistry);

        this.interpreterService.onDidChangeInterpreterInformation(
            this.onDidChangeInterpreterInformation,
            this,
            this.disposableRegistry,
        );
    }

    public async activate(): Promise<void> {
        if (useEnvExtension()) {
            return;
        }
        const application = this.serviceContainer.get<IApplicationShell>(IApplicationShell);
        if (this.useLanguageStatus) {
            this.languageStatus = application.createLanguageStatusItem('python.selectedInterpreter', {
                language: PYTHON_LANGUAGE,
            });
            this.languageStatus.severity = LanguageStatusSeverity.Information;
            this.languageStatus.command = {
                title: InterpreterQuickPickList.browsePath.openButtonLabel,
                command: Commands.Set_Interpreter,
            };
            this.disposableRegistry.push(this.languageStatus);
        } else {
            const [alignment, priority] = [StatusBarAlignment.Right, STATUS_BAR_ITEM_PRIORITY];
            this.statusBar = application.createStatusBarItem(alignment, priority, 'python.selectedInterpreterDisplay');
            this.statusBar.command = Commands.Set_Interpreter;
            this.disposableRegistry.push(this.statusBar);
            this.statusBar.name = Interpreters.selectedPythonInterpreter;
        }
    }

    public async refresh(resource?: Uri) {
        // Use the workspace Uri if available
        if (resource && this.workspaceService.getWorkspaceFolder(resource)) {
            resource = this.workspaceService.getWorkspaceFolder(resource)!.uri;
        }
        if (!resource) {
            const wkspc = this.helper.getActiveWorkspaceUri(resource);
            resource = wkspc ? wkspc.folderUri : undefined;
        }
        await this.updateDisplay(resource);
    }
    public registerVisibilityFilter(filter: IInterpreterStatusbarVisibilityFilter) {
        const disposableRegistry = this.serviceContainer.get<Disposable[]>(IDisposableRegistry);
        this.visibilityFilters.push(filter);
        if (filter.changed) {
            filter.changed(this.updateVisibility, this, disposableRegistry);
        }
    }
    private onDidChangeInterpreterInformation(info: PythonEnvironment) {
        if (this.currentlySelectedInterpreterPath === info.path) {
            this.updateDisplay(this.currentlySelectedWorkspaceFolder).ignoreErrors();
        }
    }
    private async updateDisplay(workspaceFolder?: Uri) {
        if (useEnvExtension()) {
            this.statusBar?.hide();
            this.languageStatus?.dispose();
            this.languageStatus = undefined;
            return;
        }
        const interpreter = await this.interpreterService.getActiveInterpreter(workspaceFolder);
        if (
            this.currentlySelectedInterpreterDisplay &&
            this.currentlySelectedInterpreterDisplay === interpreter?.detailedDisplayName &&
            this.currentlySelectedInterpreterPath === interpreter.path
        ) {
            return;
        }
        this.currentlySelectedWorkspaceFolder = workspaceFolder;
        if (this.statusBar) {
            if (interpreter) {
                this.statusBar.color = '';
                this.statusBar.tooltip = this.pathUtils.getDisplayName(interpreter.path, workspaceFolder?.fsPath);
                if (this.currentlySelectedInterpreterPath !== interpreter.path) {
                    traceLog(
                        l10n.t(
                            'Python interpreter path: {0}',
                            this.pathUtils.getDisplayName(interpreter.path, workspaceFolder?.fsPath),
                        ),
                    );
                    this.currentlySelectedInterpreterPath = interpreter.path;
                }
                let text = interpreter.detailedDisplayName;
                text = text?.startsWith('Python') ? text?.substring('Python'.length)?.trim() : text;
                this.statusBar.text = text ?? '';
                this.statusBar.backgroundColor = undefined;
                this.currentlySelectedInterpreterDisplay = interpreter.detailedDisplayName;
            } else {
                this.statusBar.tooltip = '';
                this.statusBar.color = '';
                this.statusBar.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
                this.statusBar.text = `$(alert) ${InterpreterQuickPickList.browsePath.openButtonLabel}`;
                this.currentlySelectedInterpreterDisplay = undefined;
            }
        } else if (this.languageStatus) {
            if (interpreter) {
                this.languageStatus.detail = this.pathUtils.getDisplayName(interpreter.path, workspaceFolder?.fsPath);
                if (this.currentlySelectedInterpreterPath !== interpreter.path) {
                    traceLog(
                        l10n.t(
                            'Python interpreter path: {0}',
                            this.pathUtils.getDisplayName(interpreter.path, workspaceFolder?.fsPath),
                        ),
                    );
                    this.currentlySelectedInterpreterPath = interpreter.path;
                }
                let text = interpreter.detailedDisplayName!;
                text = text.startsWith('Python') ? text.substring('Python'.length).trim() : text;
                this.languageStatus.text = text;
                this.currentlySelectedInterpreterDisplay = interpreter.detailedDisplayName;
                this.languageStatus.severity = LanguageStatusSeverity.Information;
            } else {
                this.languageStatus.severity = LanguageStatusSeverity.Warning;
                this.languageStatus.text = `$(alert) ${InterpreterQuickPickList.browsePath.openButtonLabel}`;
                this.languageStatus.detail = undefined;
                this.currentlySelectedInterpreterDisplay = undefined;
            }
        }
        this.statusBarCanBeDisplayed = true;
        this.updateVisibility();
    }
    private updateVisibility() {
        if (!this.statusBar || !this.statusBarCanBeDisplayed) {
            return;
        }
        if (this.visibilityFilters.length === 0 || this.visibilityFilters.every((filter) => !filter.hidden)) {
            this.statusBar.show();
        } else {
            this.statusBar.hide();
        }
    }
}
