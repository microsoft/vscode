/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './dropDownListBox.css';

import React, { forwardRef, JSX, ReactElement, Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';

import * as DOM from '../../../../base/browser/dom.js';
import { DropDownListBoxItem } from './dropDownListBoxItem.js';
import { DropDownListBoxSeparator } from './dropDownListBoxSeparator.js';
import { ErdosModalPopup } from '../erdosModalPopup/erdosModalPopup.js';
import { erdosClassNames } from '../../../../base/common/erdosUtilities.js';
import { Button } from '../../../../base/browser/ui/erdosComponents/button/button.js';
import { ErdosModalReactRenderer } from '../../../../base/browser/erdosModalReactRenderer.js';
import { useErdosReactServicesContext } from '../../../../base/browser/erdosReactRendererContext.js';

export type DropDownListBoxEntry<T extends NonNullable<any>, V extends NonNullable<any>> = DropDownListBoxItem<T, V> | DropDownListBoxSeparator;

interface DropDownListBoxProps<T extends NonNullable<any>, V extends NonNullable<any>> {
	className?: string;
	createItem?: (dropDownListBoxItem: DropDownListBoxItem<T, V>) => JSX.Element;
	disabled?: boolean;
	entries: DropDownListBoxEntry<T, V>[];
	selectedIdentifier?: T;
	title: string;
	onSelectionChanged: (dropDownListBoxItem: DropDownListBoxItem<T, V>) => void;
}

const findDropDownListBoxItem = <T extends NonNullable<any>, V extends NonNullable<any>>(
	entries: DropDownListBoxEntry<T, V>[],
	identifier?: T | undefined
) => {
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (entry instanceof DropDownListBoxItem && entry.options.identifier === identifier) {
			return entry;
		}
	}

	return undefined;
};

const DropDownListBoxActual = <T extends NonNullable<any>, V extends NonNullable<any>,>(
	props: DropDownListBoxProps<T, V>,
	ref: React.Ref<HTMLButtonElement>
) => {
	const services = useErdosReactServicesContext();

	const buttonRef = useRef<HTMLButtonElement>(undefined!);

	useImperativeHandle(ref, () => buttonRef.current);

	const [selectedDropDownListBoxItem, setSelectedDropDownListBoxItem] =
		useState<DropDownListBoxItem<T, V> | undefined>(
			findDropDownListBoxItem(props.entries, props.selectedIdentifier)
		);
	const [highlightedDropDownListBoxItem, setHighlightedDropDownListBoxItem] =
		useState<DropDownListBoxItem<T, V> | undefined>(undefined);

	useEffect(() => {
		setSelectedDropDownListBoxItem(findDropDownListBoxItem(
			props.entries,
			props.selectedIdentifier,
		));
	}, [props.entries, props.selectedIdentifier]);

	const Title = () => {
		if (!props.createItem) {
			if (highlightedDropDownListBoxItem) {
				return <span>{highlightedDropDownListBoxItem.options.title}</span>;
			} else if (selectedDropDownListBoxItem) {
				return <span>{selectedDropDownListBoxItem.options.title}</span>;
			}
		} else {
			if (highlightedDropDownListBoxItem) {
				return props.createItem(highlightedDropDownListBoxItem);
			} else if (selectedDropDownListBoxItem) {
				return props.createItem(selectedDropDownListBoxItem);
			}
		}

		return <span>{props.title}</span>;
	};

	return (
		<Button
			ref={buttonRef}
			className={erdosClassNames('drop-down-list-box', props.className)}
			disabled={props.disabled}
			onPressed={() => {
				const renderer = new ErdosModalReactRenderer({
					container: services.workbenchLayoutService.getContainer(DOM.getWindow(buttonRef.current)),
					onDisposed: () => {
						setHighlightedDropDownListBoxItem(undefined);
						buttonRef.current.focus();
					}
				});

				renderer.render(
					<DropDownListBoxModalPopup<T, V>
						anchorElement={buttonRef.current}
						createItem={props.createItem}
						entries={props.entries}
						renderer={renderer}
						onItemHighlighted={dropDownListBoxItem =>
							setHighlightedDropDownListBoxItem(dropDownListBoxItem)
						}
						onItemSelected={dropDownListBoxItem => {
							setSelectedDropDownListBoxItem(dropDownListBoxItem);
							props.onSelectionChanged(dropDownListBoxItem);
						}}
					/>
				);
			}}
		>
			<div className='title'>
				<Title />
			</div>
			<div aria-hidden='true' className='chevron'>
				<div className='codicon codicon-chevron-down' />
			</div>
		</Button>
	);
};

interface DropDownListBoxModalPopupProps<T, V> {
	renderer: ErdosModalReactRenderer;
	anchorElement: HTMLElement;
	entries: DropDownListBoxEntry<T, V>[];
	createItem?: (dropDownListBoxItem: DropDownListBoxItem<T, V>) => JSX.Element;
	onItemHighlighted: (dropdownListBoxItem: DropDownListBoxItem<T, V>) => void;
	onItemSelected: (dropdownListBoxItem: DropDownListBoxItem<T, V>) => void;
}

const DropDownListBoxModalPopup = <T, V,>(props: DropDownListBoxModalPopupProps<T, V>) => {
	return (
		<ErdosModalPopup
			anchorElement={props.anchorElement}
			height={'auto'}
			keyboardNavigationStyle='menu'
			minWidth={props.anchorElement.offsetWidth}
			popupAlignment='left'
			popupPosition='auto'
			renderer={props.renderer}
			width={props.anchorElement.offsetWidth}
		>
			<div className='drop-down-list-box-items'>
				{props.entries.map((entry, index) => {
					if (entry instanceof DropDownListBoxItem) {
						return (
							<Button
								key={index}
								className='item'
								disabled={entry.options.disabled}
								onFocus={() => props.onItemHighlighted(entry)}
								onPressed={e => {
									props.renderer.dispose();
									props.onItemSelected(entry);
								}}
							>
								{props.createItem && props.createItem(entry)}
								{!props.createItem && (
									<>
										<div
											className={erdosClassNames(
												'title',
												{ 'disabled': entry.options.disabled }
											)}
										>
											{entry.options.title}
										</div>
										{entry.options.icon &&
											<div
												className={erdosClassNames(
													'icon',
													'codicon',
													`codicon-${entry.options.icon}`,
													{ 'disabled': entry.options.disabled }
												)}
												title={entry.options.title}
											/>
										}
									</>
								)
								}
							</Button>
						);
					} else if (entry instanceof DropDownListBoxSeparator) {
						return <div key={index} className='separator' />;
					} else {
						return null;
					}
				})}
			</div>
		</ErdosModalPopup>
	);
};

export const DropDownListBox = forwardRef(DropDownListBoxActual) as <T extends NonNullable<any>, V extends NonNullable<any>>
	(props: DropDownListBoxProps<T, V> & { ref?: Ref<HTMLButtonElement> }) => ReactElement;
