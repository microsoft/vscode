// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Disposable } from 'vscode';
import { IApplicationShell } from '../../../common/application/types';
import { getIcon } from '../../../common/utils/icons';
import { AttachProcess } from '../../../common/utils/localize';
import { IAttachItem, IAttachPicker, IAttachProcessProvider, REFRESH_BUTTON_ICON } from './types';

@injectable()
export class AttachPicker implements IAttachPicker {
    constructor(
        @inject(IApplicationShell) private readonly applicationShell: IApplicationShell,
        private readonly attachItemsProvider: IAttachProcessProvider,
    ) {}

    public showQuickPick(): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            const processEntries = await this.attachItemsProvider.getAttachItems();

            const refreshButton = {
                iconPath: getIcon(REFRESH_BUTTON_ICON),
                tooltip: AttachProcess.refreshList,
            };

            const quickPick = this.applicationShell.createQuickPick<IAttachItem>();
            quickPick.title = AttachProcess.attachTitle;
            quickPick.placeholder = AttachProcess.selectProcessPlaceholder;
            quickPick.canSelectMany = false;
            quickPick.matchOnDescription = true;
            quickPick.matchOnDetail = true;
            quickPick.items = processEntries;
            quickPick.buttons = [refreshButton];

            const disposables: Disposable[] = [];

            quickPick.onDidTriggerButton(
                async () => {
                    quickPick.busy = true;
                    const attachItems = await this.attachItemsProvider.getAttachItems();
                    quickPick.items = attachItems;
                    quickPick.busy = false;
                },
                this,
                disposables,
            );

            quickPick.onDidAccept(
                () => {
                    if (quickPick.selectedItems.length !== 1) {
                        reject(new Error(AttachProcess.noProcessSelected));
                    }

                    const selectedId = quickPick.selectedItems[0].id;

                    disposables.forEach((item) => item.dispose());
                    quickPick.dispose();

                    resolve(selectedId);
                },
                undefined,
                disposables,
            );

            quickPick.onDidHide(
                () => {
                    disposables.forEach((item) => item.dispose());
                    quickPick.dispose();

                    reject(new Error(AttachProcess.noProcessSelected));
                },
                undefined,
                disposables,
            );

            quickPick.show();
        });
    }
}
