/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from 'vs/base/common/lifecycle';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ThemeIcon } from 'vs/base/common/themables';
import { Event } from 'vs/base/common/event';
import { ViewContainer } from 'vs/workbench/common/views';

// Define interfaces and decorators at the top of the file
export interface IBadge {
    getDescription(): string;
}

class BaseBadge implements IBadge {
    constructor(readonly descriptorFn: (arg: any) => string) {
        this.descriptorFn = descriptorFn;
    }

    getDescription(): string {
        return this.descriptorFn(null);
    }
}

export class NumberBadge extends BaseBadge {
    constructor(readonly number: number, descriptorFn: (num: number) => string) {
        super(descriptorFn);
        this.number = number;
    }

    override getDescription(): string {
        return this.descriptorFn(this.number);
    }
}

export class IconBadge extends BaseBadge {
    constructor(readonly icon: ThemeIcon, descriptorFn: () => string) {
        super(descriptorFn);
    }
}

export class ProgressBadge extends BaseBadge {}

export interface IActivity {
    readonly badge: IBadge;
    readonly priority?: number;
}

export interface IActivityService {
    readonly _serviceBrand: undefined;
    readonly onDidChangeActivity: Event<string | ViewContainer>;
    showViewContainerActivity(viewContainerId: string, badge: IActivity): IDisposable;
    getViewContainerActivities(viewContainerId: string): IActivity[];
    showViewActivity(viewId: string, badge: IActivity): IDisposable;
    showAccountsActivity(activity: IActivity): IDisposable;
    showGlobalActivity(activity: IActivity): IDisposable;
    getActivity(id: string): IActivity[];
}

export const IActivityService = createDecorator<IActivityService>('activityService');
