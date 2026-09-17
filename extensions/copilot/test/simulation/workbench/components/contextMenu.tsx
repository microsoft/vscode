/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { makeStyles, MenuItem, MenuList, tokens } from '@fluentui/react-components';
import React, { createContext, MouseEvent, ReactNode, useContext, useEffect, useRef, useState } from 'react';

type MenuEntry = {
	label: string;
	onClick: () => void;
};

type ContextMenuContextProps = {
	showMenu: (event: MouseEvent, entries: MenuEntry[]) => void;
	hideMenu: () => void;
	menuEntries: MenuEntry[];
	menuPosition: { x: number; y: number };
	isVisible: boolean;
};

const ContextMenuContext = createContext<ContextMenuContextProps | undefined>(undefined);

export const ContextMenuProvider: React.FC<{ children: ReactNode }> = ({ children }) => {

	const [menuEntries, setMenuEntries] = useState<MenuEntry[]>([]);
	const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const [isVisible, setIsVisible] = useState(false);

	const showMenu = (event: MouseEvent, entries: MenuEntry[]) => {
		event.preventDefault();
		setMenuEntries(entries);
		setMenuPosition({ x: event.pageX, y: event.pageY });
		setIsVisible(true);
	};

	const hideMenu = () => {
		setIsVisible(false);
	};

	return (
		<ContextMenuContext.Provider value={{ showMenu, hideMenu, menuEntries, menuPosition, isVisible }}>
			{children}
		</ContextMenuContext.Provider>
	);
};

export const useContextMenu = () => {
	const context = useContext(ContextMenuContext);
	if (!context) {
		throw new Error('useContextMenu must be used within a ContextMenuProvider');
	}
	return context;
};

const useMenuListContainerStyles = makeStyles({
	container: {
		backgroundColor: tokens.colorNeutralBackground1,
		minWidth: '128px',
		minHeight: '48px',
		maxWidth: '300px',
		width: 'max-content',
		boxShadow: `${tokens.shadow16}`,
		paddingTop: '4px',
		paddingBottom: '4px',
	},
});

export const ContextMenu: React.FC = () => {
	const { menuEntries, menuPosition, isVisible, hideMenu } = useContextMenu();

	const handleEntryClick = (e: React.MouseEvent, entry: MenuEntry) => {
		hideMenu();
		entry.onClick();
	};

	const menuListRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuListRef.current) {
			return;
		}
		const handleClickOutside = (e: globalThis.MouseEvent) => {
			if (menuListRef.current && e.target instanceof Node && !menuListRef.current.contains(e.target)) {
				hideMenu();
			}
		};

		document.addEventListener('click', handleClickOutside);

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	const styles = useMenuListContainerStyles();

	if (!isVisible) {
		return null;
	}

	return (
		<div
			className={styles.container}
			style={{
				position: 'absolute',
				top: menuPosition.y,
				left: menuPosition.x,
				// border: '1px solid gray',
				zIndex: 1000,
			}}
		>
			<MenuList
				ref={menuListRef}
				onClick={hideMenu}
			>
				{menuEntries.map((entry, index) => (
					<MenuItem
						key={index}
						onClick={(e) => handleEntryClick(e, entry)}
					>
						{entry.label}
					</MenuItem>
				))}
			</MenuList>
		</div>
	);
};
