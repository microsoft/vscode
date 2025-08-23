// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable max-classes-per-file */

import {
    CancellationToken,
    MessageItem,
    MessageOptions,
    Progress,
    ProgressOptions,
    QuickPick,
    QuickInputButtons,
    QuickPickItem,
    QuickPickOptions,
    TextEditor,
    window,
    Disposable,
    QuickPickItemButtonEvent,
    Uri,
    TerminalShellExecutionStartEvent,
    LogOutputChannel,
    OutputChannel,
    TerminalLinkProvider,
    NotebookDocument,
    NotebookEditor,
    NotebookDocumentShowOptions,
} from 'vscode';
import { createDeferred, Deferred } from '../utils/async';
import { Resource } from '../types';
import { getWorkspaceFolders } from './workspaceApis';

export function showTextDocument(uri: Uri): Thenable<TextEditor> {
    return window.showTextDocument(uri);
}

export function showNotebookDocument(
    document: NotebookDocument,
    options?: NotebookDocumentShowOptions,
): Thenable<NotebookEditor> {
    return window.showNotebookDocument(document, options);
}

export function showQuickPick<T extends QuickPickItem>(
    items: readonly T[] | Thenable<readonly T[]>,
    options?: QuickPickOptions,
    token?: CancellationToken,
): Thenable<T | undefined> {
    return window.showQuickPick(items, options, token);
}

export function createQuickPick<T extends QuickPickItem>(): QuickPick<T> {
    return window.createQuickPick<T>();
}

export function showErrorMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;
export function showErrorMessage<T extends string>(
    message: string,
    options: MessageOptions,
    ...items: T[]
): Thenable<T | undefined>;
export function showErrorMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;
export function showErrorMessage<T extends MessageItem>(
    message: string,
    options: MessageOptions,
    ...items: T[]
): Thenable<T | undefined>;

export function showErrorMessage<T>(message: string, ...items: any[]): Thenable<T | undefined> {
    return window.showErrorMessage(message, ...items);
}

export function showWarningMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;
export function showWarningMessage<T extends string>(
    message: string,
    options: MessageOptions,
    ...items: T[]
): Thenable<T | undefined>;
export function showWarningMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;
export function showWarningMessage<T extends MessageItem>(
    message: string,
    options: MessageOptions,
    ...items: T[]
): Thenable<T | undefined>;

export function showWarningMessage<T>(message: string, ...items: any[]): Thenable<T | undefined> {
    return window.showWarningMessage(message, ...items);
}

export function showInformationMessage<T extends string>(message: string, ...items: T[]): Thenable<T | undefined>;
export function showInformationMessage<T extends string>(
    message: string,
    options: MessageOptions,
    ...items: T[]
): Thenable<T | undefined>;
export function showInformationMessage<T extends MessageItem>(message: string, ...items: T[]): Thenable<T | undefined>;
export function showInformationMessage<T extends MessageItem>(
    message: string,
    options: MessageOptions,
    ...items: T[]
): Thenable<T | undefined>;

export function showInformationMessage<T>(message: string, ...items: any[]): Thenable<T | undefined> {
    return window.showInformationMessage(message, ...items);
}

export function withProgress<R>(
    options: ProgressOptions,
    task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => Thenable<R>,
): Thenable<R> {
    return window.withProgress(options, task);
}

export function getActiveTextEditor(): TextEditor | undefined {
    const { activeTextEditor } = window;
    return activeTextEditor;
}

export function onDidChangeActiveTextEditor(handler: (e: TextEditor | undefined) => void): Disposable {
    return window.onDidChangeActiveTextEditor(handler);
}

export function onDidStartTerminalShellExecution(handler: (e: TerminalShellExecutionStartEvent) => void): Disposable {
    return window.onDidStartTerminalShellExecution(handler);
}

export enum MultiStepAction {
    Back = 'Back',
    Cancel = 'Cancel',
    Continue = 'Continue',
}

export async function showQuickPickWithBack<T extends QuickPickItem>(
    items: readonly T[],
    options?: QuickPickOptions,
    token?: CancellationToken,
    itemButtonHandler?: (e: QuickPickItemButtonEvent<T>) => void,
): Promise<T | T[] | undefined> {
    const quickPick: QuickPick<T> = window.createQuickPick<T>();
    const disposables: Disposable[] = [quickPick];

    quickPick.items = items;
    quickPick.buttons = [QuickInputButtons.Back];
    quickPick.canSelectMany = options?.canPickMany ?? false;
    quickPick.ignoreFocusOut = options?.ignoreFocusOut ?? false;
    quickPick.matchOnDescription = options?.matchOnDescription ?? false;
    quickPick.matchOnDetail = options?.matchOnDetail ?? false;
    quickPick.placeholder = options?.placeHolder;
    quickPick.title = options?.title;

    const deferred = createDeferred<T | T[] | undefined>();

    disposables.push(
        quickPick,
        quickPick.onDidTriggerButton((item) => {
            if (item === QuickInputButtons.Back) {
                deferred.reject(MultiStepAction.Back);
                quickPick.hide();
            }
        }),
        quickPick.onDidAccept(() => {
            if (!deferred.completed) {
                if (quickPick.canSelectMany) {
                    deferred.resolve(quickPick.selectedItems.map((item) => item));
                } else {
                    deferred.resolve(quickPick.selectedItems[0]);
                }

                quickPick.hide();
            }
        }),
        quickPick.onDidHide(() => {
            if (!deferred.completed) {
                deferred.resolve(undefined);
            }
        }),
        quickPick.onDidTriggerItemButton((e) => {
            if (itemButtonHandler) {
                itemButtonHandler(e);
            }
        }),
    );
    if (token) {
        disposables.push(
            token.onCancellationRequested(() => {
                quickPick.hide();
            }),
        );
    }
    quickPick.show();

    try {
        return await deferred.promise;
    } finally {
        disposables.forEach((d) => d.dispose());
    }
}

export class MultiStepNode {
    constructor(
        public previous: MultiStepNode | undefined,
        public readonly current: (context?: MultiStepAction) => Promise<MultiStepAction>,
        public next: MultiStepNode | undefined,
    ) {}

    public static async run(step: MultiStepNode, context?: MultiStepAction): Promise<MultiStepAction> {
        let nextStep: MultiStepNode | undefined = step;
        let flowAction = await nextStep.current(context);
        while (nextStep !== undefined) {
            if (flowAction === MultiStepAction.Cancel) {
                return flowAction;
            }
            if (flowAction === MultiStepAction.Back) {
                nextStep = nextStep?.previous;
            }
            if (flowAction === MultiStepAction.Continue) {
                nextStep = nextStep?.next;
            }

            if (nextStep) {
                flowAction = await nextStep?.current(flowAction);
            }
        }

        return flowAction;
    }
}

export function createStepBackEndNode<T>(deferred?: Deferred<T>): MultiStepNode {
    return new MultiStepNode(
        undefined,
        async () => {
            if (deferred) {
                // This is to ensure we don't leave behind any pending promises.
                deferred.reject(MultiStepAction.Back);
            }
            return Promise.resolve(MultiStepAction.Back);
        },
        undefined,
    );
}

export function createStepForwardEndNode<T>(deferred?: Deferred<T>, result?: T): MultiStepNode {
    return new MultiStepNode(
        undefined,
        async () => {
            if (deferred) {
                // This is to ensure we don't leave behind any pending promises.
                deferred.resolve(result);
            }
            return Promise.resolve(MultiStepAction.Back);
        },
        undefined,
    );
}

export function getActiveResource(): Resource {
    const editor = window.activeTextEditor;
    if (editor && !editor.document.isUntitled) {
        return editor.document.uri;
    }
    const workspaces = getWorkspaceFolders();
    return Array.isArray(workspaces) && workspaces.length > 0 ? workspaces[0].uri : undefined;
}

export function createOutputChannel(name: string, languageId?: string): OutputChannel {
    return window.createOutputChannel(name, languageId);
}
export function createLogOutputChannel(name: string, options: { log: true }): LogOutputChannel {
    return window.createOutputChannel(name, options);
}

export function registerTerminalLinkProvider(provider: TerminalLinkProvider): Disposable {
    return window.registerTerminalLinkProvider(provider);
}
