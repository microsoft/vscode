// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/* eslint-disable max-classes-per-file */

'use strict';

import { inject, injectable } from 'inversify';
import { Disposable, QuickInput, QuickInputButton, QuickInputButtons, QuickPick, QuickPickItem, Event } from 'vscode';
import { IApplicationShell } from '../application/types';
import { createDeferred } from './async';

// Borrowed from https://github.com/Microsoft/vscode-extension-samples/blob/master/quickinput-sample/src/multiStepInput.ts
// Why re-invent the wheel :)

export class InputFlowAction {
    public static back = new InputFlowAction();

    public static cancel = new InputFlowAction();

    public static resume = new InputFlowAction();

    private constructor() {
        /** No body. */
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InputStep<T> = (input: MultiStepInput<T>, state: T) => Promise<InputStep<T> | void>;

type buttonCallbackType<T extends QuickPickItem> = (quickPick: QuickPick<T>) => void;

export type QuickInputButtonSetup = {
    /**
     * Button for an action in a QuickPick.
     */
    button: QuickInputButton;
    /**
     * Callback to be invoked when button is clicked.
     */
    callback: buttonCallbackType<QuickPickItem>;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IQuickPickParameters<T extends QuickPickItem, E = any> {
    title?: string;
    step?: number;
    totalSteps?: number;
    canGoBack?: boolean;
    items: T[];
    activeItem?: T | ((quickPick: QuickPick<T>) => Promise<T>);
    placeholder: string | undefined;
    customButtonSetups?: QuickInputButtonSetup[];
    matchOnDescription?: boolean;
    matchOnDetail?: boolean;
    keepScrollPosition?: boolean;
    sortByLabel?: boolean;
    acceptFilterBoxTextAsSelection?: boolean;
    /**
     * A method called only after quickpick has been created and all handlers are registered.
     */
    initialize?: (quickPick: QuickPick<T>) => void;
    onChangeItem?: {
        callback: (event: E, quickPick: QuickPick<T>) => void;
        event: Event<E>;
    };
}

interface InputBoxParameters {
    title: string;
    password?: boolean;
    step?: number;
    totalSteps?: number;
    value: string;
    prompt: string;
    buttons?: QuickInputButton[];
    validate(value: string): Promise<string | undefined>;
}

type MultiStepInputQuickPickResponseType<T, P> = T | (P extends { buttons: (infer I)[] } ? I : never) | undefined;
type MultiStepInputInputBoxResponseType<P> = string | (P extends { buttons: (infer I)[] } ? I : never) | undefined;
export interface IMultiStepInput<S> {
    run(start: InputStep<S>, state: S): Promise<void>;
    showQuickPick<T extends QuickPickItem, P extends IQuickPickParameters<T>>({
        title,
        step,
        totalSteps,
        items,
        activeItem,
        placeholder,
        customButtonSetups,
    }: P): Promise<MultiStepInputQuickPickResponseType<T, P>>;
    showInputBox<P extends InputBoxParameters>({
        title,
        step,
        totalSteps,
        value,
        prompt,
        validate,
        buttons,
    }: P): Promise<MultiStepInputInputBoxResponseType<P>>;
}

export class MultiStepInput<S> implements IMultiStepInput<S> {
    private current?: QuickInput;

    private steps: InputStep<S>[] = [];

    constructor(private readonly shell: IApplicationShell) {}

    public run(start: InputStep<S>, state: S): Promise<void> {
        return this.stepThrough(start, state);
    }

    public async showQuickPick<T extends QuickPickItem, P extends IQuickPickParameters<T>>({
        title,
        step,
        totalSteps,
        items,
        activeItem,
        placeholder,
        customButtonSetups,
        matchOnDescription,
        matchOnDetail,
        acceptFilterBoxTextAsSelection,
        onChangeItem,
        keepScrollPosition,
        sortByLabel,
        initialize,
    }: P): Promise<MultiStepInputQuickPickResponseType<T, P>> {
        const disposables: Disposable[] = [];
        const input = this.shell.createQuickPick<T>();
        input.title = title;
        input.step = step;
        input.sortByLabel = sortByLabel || false;
        input.totalSteps = totalSteps;
        input.placeholder = placeholder;
        input.ignoreFocusOut = true;
        input.items = items;
        input.matchOnDescription = matchOnDescription || false;
        input.matchOnDetail = matchOnDetail || false;
        input.buttons = this.steps.length > 1 ? [QuickInputButtons.Back] : [];
        if (customButtonSetups) {
            for (const customButtonSetup of customButtonSetups) {
                input.buttons = [...input.buttons, customButtonSetup.button];
            }
        }
        if (this.current) {
            this.current.dispose();
        }
        this.current = input;
        if (onChangeItem) {
            disposables.push(onChangeItem.event((e) => onChangeItem.callback(e, input)));
        }
        // Quickpick should be initialized synchronously and on changed item handlers are registered synchronously.
        if (initialize) {
            initialize(input);
        }
        if (activeItem) {
            if (typeof activeItem === 'function') {
                activeItem(input).then((item) => {
                    if (input.activeItems.length === 0) {
                        input.activeItems = [item];
                    }
                });
            }
        } else {
            input.activeItems = [];
        }
        this.current.show();
        // Keep scroll position is only meant to keep scroll position when updating items,
        // so do it after initialization. This ensures quickpick starts with the active
        // item in focus when this is true, instead of having scroll position at top.
        input.keepScrollPosition = keepScrollPosition;

        const deferred = createDeferred<T>();

        disposables.push(
            input.onDidTriggerButton(async (item) => {
                if (item === QuickInputButtons.Back) {
                    deferred.reject(InputFlowAction.back);
                    input.hide();
                }
                if (customButtonSetups) {
                    for (const customButtonSetup of customButtonSetups) {
                        if (JSON.stringify(item) === JSON.stringify(customButtonSetup?.button)) {
                            await customButtonSetup?.callback(input);
                        }
                    }
                }
            }),
            input.onDidChangeSelection((selectedItems) => deferred.resolve(selectedItems[0])),
            input.onDidHide(() => {
                if (!deferred.completed) {
                    deferred.resolve(undefined);
                }
            }),
        );
        if (acceptFilterBoxTextAsSelection) {
            disposables.push(
                input.onDidAccept(() => {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    deferred.resolve(input.value as any);
                }),
            );
        }

        try {
            return await deferred.promise;
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    public async showInputBox<P extends InputBoxParameters>({
        title,
        step,
        totalSteps,
        value,
        prompt,
        validate,
        password,
        buttons,
    }: P): Promise<MultiStepInputInputBoxResponseType<P>> {
        const disposables: Disposable[] = [];
        try {
            return await new Promise<MultiStepInputInputBoxResponseType<P>>((resolve, reject) => {
                const input = this.shell.createInputBox();
                input.title = title;
                input.step = step;
                input.totalSteps = totalSteps;
                input.password = !!password;
                input.value = value || '';
                input.prompt = prompt;
                input.ignoreFocusOut = true;
                input.buttons = [...(this.steps.length > 1 ? [QuickInputButtons.Back] : []), ...(buttons || [])];
                let validating = validate('');
                disposables.push(
                    input.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            reject(InputFlowAction.back);
                        } else {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            resolve(item as any);
                        }
                    }),
                    input.onDidAccept(async () => {
                        const inputValue = input.value;
                        input.enabled = false;
                        input.busy = true;
                        if (!(await validate(inputValue))) {
                            resolve(inputValue);
                        }
                        input.enabled = true;
                        input.busy = false;
                    }),
                    input.onDidChangeValue(async (text) => {
                        const current = validate(text);
                        validating = current;
                        const validationMessage = await current;
                        if (current === validating) {
                            input.validationMessage = validationMessage;
                        }
                    }),
                    input.onDidHide(() => {
                        resolve(undefined);
                    }),
                );
                if (this.current) {
                    this.current.dispose();
                }
                this.current = input;
                this.current.show();
            });
        } finally {
            disposables.forEach((d) => d.dispose());
        }
    }

    private async stepThrough(start: InputStep<S>, state: S) {
        let step: InputStep<S> | void = start;
        while (step) {
            this.steps.push(step);
            if (this.current) {
                this.current.enabled = false;
                this.current.busy = true;
            }
            try {
                step = await step(this, state);
            } catch (err) {
                if (err === InputFlowAction.back) {
                    this.steps.pop();
                    step = this.steps.pop();
                    if (step === undefined) {
                        throw err;
                    }
                } else if (err === InputFlowAction.resume) {
                    step = this.steps.pop();
                } else if (err === InputFlowAction.cancel) {
                    step = undefined;
                } else {
                    throw err;
                }
            }
        }
        if (this.current) {
            this.current.dispose();
        }
    }
}
export const IMultiStepInputFactory = Symbol('IMultiStepInputFactory');
export interface IMultiStepInputFactory {
    create<S>(): IMultiStepInput<S>;
}
@injectable()
export class MultiStepInputFactory {
    constructor(@inject(IApplicationShell) private readonly shell: IApplicationShell) {}

    public create<S>(): IMultiStepInput<S> {
        return new MultiStepInput<S>(this.shell);
    }
}
