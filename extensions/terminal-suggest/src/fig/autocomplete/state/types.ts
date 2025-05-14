/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GeneratorState } from '../generators/helpers';
import type { ArgumentParserResult } from '../../autocomplete-parser/parseArguments';
import type { Suggestion } from '../../shared/internal';
import type { Command } from '../../shell-parser';
import type { FigState } from '../fig/hooks';

export enum Visibility {
	VISIBLE = 'visible',
	// Can happen in several cases:
	// 1. We've just inserted text
	// 2. User has backspaced to new token
	// 3. A large buffer change (scrolling through history, or pasting text)
	// 4. An error occurs
	HIDDEN_UNTIL_KEYPRESS = 'hidden_until_keypress',
	// Hide until explicitly shown (or we enter a new line), can happen when:
	// 1. The escape key is pressed
	// 2. A keybinding to hide autocomplete is pressed
	// 3. User enters a new token with onlyShowOnTab set
	HIDDEN_UNTIL_SHOWN = 'hidden_until_shown',
	// User inserted full suggestion. Wait until text is rendered, then hide
	// until keypress (2 state updates).
	HIDDEN_BY_INSERTION = 'insertion',
}

// type AutocompleteActions = {
// 	setParserResult: (
// 		parserResult: ArgumentParserResult,
// 		hasBackspacedToNewToken: boolean,
// 		largeBufferChange: boolean,
// 	) => void;
// 	error: (error: string) => void;
// 	setVisibleState: (visibleState: Visibility) => void;
// 	scroll: (index: number, visibleState: Visibility) => void;
// 	// setFigState: React.Dispatch<React.SetStateAction<FigState>>;
// 	updateVisibilityPostInsert: (
// 		suggestion: Suggestion,
// 		isFullCompletion: boolean,
// 	) => void;
// 	insertTextForItem: (item: Suggestion, execute?: boolean) => void;
// 	insertCommonPrefix: () => void;
// 	// setHistoryModeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
// 	// setUserFuzzySearchEnabled: React.Dispatch<React.SetStateAction<boolean>>;
// 	// setSettings: React.Dispatch<React.SetStateAction<SettingsMap>>;
// };

export type AutocompleteState = {
	figState: FigState;
	parserResult: ArgumentParserResult;
	generatorStates: GeneratorState[];
	command: Command | null;

	visibleState: Visibility;
	lastInsertedSuggestion: Suggestion | null;
	justInserted: boolean;

	suggestions: Suggestion[];
	selectedIndex: number;
	hasChangedIndex: boolean;

	historyModeEnabled: boolean;
	/**
	 * Store the user preference about fuzzy search
	 */
	userFuzzySearchEnabled: boolean;
	/**
	 * Sometimes we override fuzzy search user
	 * preference so we also store the "real" current state of fuzzy search
	 */
	fuzzySearchEnabled: boolean;
	// settings: SettingsMap;
}; // & AutocompleteActions;

export declare type NamedSetState<T> = {
	(
		name: string,
		partial: Partial<T> | ((s: T) => Partial<T>),
		replace?: boolean,
	): void;
};
