/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import {IStringDictionary} from 'vs/base/common/collections';
import {createDecorator} from 'vs/platform/instantiation/common/instantiation';

export const IConfigurationResolverService = createDecorator<IConfigurationResolverService>('configurationResolverService');

export interface IConfigurationResolverService {
	_serviceBrand: any;

	resolve(value: string): string;
	resolve(value: string[]): string[];
	resolve(value: IStringDictionary<string>): IStringDictionary<string>;
	resolve(value: IStringDictionary<string[]>): IStringDictionary<string[]>;
	resolve(value: IStringDictionary<IStringDictionary<string>>): IStringDictionary<IStringDictionary<string>>;
	resolveAny<T>(value: T): T;
	resolveInteractiveVariables(configuration: any, interactiveVariablesMap: { [key: string]: string }): TPromise<any>;
}
