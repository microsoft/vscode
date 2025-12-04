/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InputBox } from '../../../../base/browser/ui/inputbox/inputBox.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { SettingValueType } from '../../../services/preferences/common/preferences.js';

export type EditKey = 'none' | 'create' | number;

export type RowElementGroup = {
	rowElement: HTMLElement;
	keyElement: HTMLElement;
	valueElement?: HTMLElement;
};

export type IListViewItem<TDataItem extends object> = TDataItem & {
	editing?: boolean;
	selected?: boolean;
};

export interface ISettingListChangeEvent<TDataItem extends object> {
	type: 'change';
	originalItem: TDataItem;
	newItem: TDataItem;
	targetIndex: number;
}

export interface ISettingListAddEvent<TDataItem extends object> {
	type: 'add';
	newItem: TDataItem;
	targetIndex: number;
}

export interface ISettingListMoveEvent<TDataItem extends object> {
	type: 'move';
	originalItem: TDataItem;
	newItem: TDataItem;
	targetIndex: number;
	sourceIndex: number;
}

export interface ISettingListRemoveEvent<TDataItem extends object> {
	type: 'remove';
	originalItem: TDataItem;
	targetIndex: number;
}

export interface ISettingListResetEvent<TDataItem extends object> {
	type: 'reset';
	originalItem: TDataItem;
	targetIndex: number;
}

export type SettingListEvent<TDataItem extends object> = ISettingListChangeEvent<TDataItem> | ISettingListAddEvent<TDataItem> | ISettingListMoveEvent<TDataItem> | ISettingListRemoveEvent<TDataItem> | ISettingListResetEvent<TDataItem>;

export interface IListSetValueOptions {
	showAddButton?: boolean;
	keySuggester?: IObjectKeySuggester;
	isReadOnly?: boolean;
}

export interface IListDataItem {
	value: ObjectKey;
	sibling?: string;
}

export interface ListSettingWidgetDragDetails<TListDataItem extends IListDataItem> {
	element: HTMLElement;
	item: TListDataItem;
	itemIndex: number;
}

export interface IObjectStringData {
	type: 'string';
	data: string;
}

export interface IObjectEnumOption {
	value: string;
	description?: string;
}

export interface IObjectEnumData {
	type: 'enum';
	data: string;
	options: IObjectEnumOption[];
}

export interface IObjectBoolData {
	type: 'boolean';
	data: boolean;
}

export type ObjectKey = IObjectStringData | IObjectEnumData;
export type ObjectValue = IObjectStringData | IObjectEnumData | IObjectBoolData;
export type ObjectWidget = InputBox | SelectBox;

export interface IObjectDataItem {
	key: ObjectKey;
	value: ObjectValue;
	keyDescription?: string;
	source?: string;
	removable: boolean;
	resetable: boolean;
}

export interface IIncludeExcludeDataItem {
	value: ObjectKey;
	elementType: SettingValueType;
	sibling?: string;
	source?: string;
}

export interface IObjectValueSuggester {
	(key: string): ObjectValue | undefined;
}

export interface IObjectKeySuggester {
	(existingKeys: string[], idx?: number): IObjectEnumData | undefined;
}

export interface IObjectSetValueOptions {
	settingKey: string;
	showAddButton: boolean;
	isReadOnly?: boolean;
	keySuggester?: IObjectKeySuggester;
	valueSuggester?: IObjectValueSuggester;
}

export interface IObjectRenderEditWidgetOptions {
	isKey: boolean;
	idx: number;
	readonly originalItem: IObjectDataItem;
	readonly changedItem: IObjectDataItem;
	update(keyOrValue: ObjectKey | ObjectValue): void;
}

export interface IBoolObjectSetValueOptions {
	settingKey: string;
}

export interface IBoolObjectDataItem {
	key: IObjectStringData;
	value: IObjectBoolData;
	keyDescription?: string;
	source?: string;
	removable: false;
	resetable: boolean;
}
