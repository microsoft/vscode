/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';
import { IDataGridFindController } from './dataGridFindTypes.js';
import './dataGridFindWidget.css';

export interface DataGridFindWidgetProps {
	controller: IDataGridFindController;
	isVisible: boolean;
	onClose: () => void;
}

export const DataGridFindWidget: React.FC<DataGridFindWidgetProps> = ({
	controller,
	isVisible,
	onClose
}) => {
	const [searchValue, setSearchValue] = useState('');
	const [replaceValue, setReplaceValue] = useState('');
	const [isReplaceVisible, setIsReplaceVisible] = useState(false);
	const [isRegex, setIsRegex] = useState(false);
	const [matchCase, setMatchCase] = useState(false);
	const [wholeWord, setWholeWord] = useState(false);
	const [matchCount, setMatchCount] = useState('');

	const searchInputRef = useRef<HTMLInputElement>(null);
	const replaceInputRef = useRef<HTMLInputElement>(null);
	const findInputBoxRef = useRef<HTMLDivElement>(null);
	const replaceInputBoxRef = useRef<HTMLDivElement>(null);

	const state = controller.getState();

	useEffect(() => {
		const updateFromState = () => {
			setSearchValue(state.searchString);
			setReplaceValue(state.replaceString);
			setIsReplaceVisible(state.isReplaceRevealed);
			setIsRegex(state.isRegex);
			setMatchCase(state.matchCase);
			setWholeWord(state.wholeWord);

						const results = state.searchResults;
			if (results) {
				if (results.totalMatches === 0) {
					setMatchCount('No results');
			} else {
					setMatchCount(`${results.currentMatchIndex + 1} of ${results.totalMatches}`);
				}
			} else {
				setMatchCount('No results');
			}
		};

		const disposable = state.onFindReplaceStateChange(updateFromState);
		updateFromState();

		return () => disposable.dispose();
	}, [state]);

	useEffect(() => {
		if (isVisible && searchInputRef.current) {
			searchInputRef.current.focus();
			searchInputRef.current.select();
		}
	}, [isVisible]);

	// Set replace input width to match find input width when replace is visible
	useEffect(() => {
		if (isReplaceVisible && findInputBoxRef.current && replaceInputBoxRef.current) {
			const findInputWidth = findInputBoxRef.current.offsetWidth;
			replaceInputBoxRef.current.style.width = `${findInputWidth}px`;
		}
	}, [isReplaceVisible]);

	const handleSearchChange = useCallback((value: string) => {
		setSearchValue(value);
		state.changeSearchString(value);
	}, [state]);

	const handleReplaceChange = useCallback((value: string) => {
		setReplaceValue(value);
		state.changeReplaceString(value);
	}, [state]);

	const handleSearchKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.shiftKey) {
				controller.findPrevious();
			} else {
				controller.findNext();
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
		}
	}, [controller, onClose]);

	const handleReplaceKeyDown = useCallback((e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			if (e.ctrlKey || e.metaKey) {
				controller.replaceAll();
			} else {
				controller.replace();
			}
		}
	}, [controller]);

	const toggleReplace = useCallback(() => {
		const newVisible = !isReplaceVisible;
		setIsReplaceVisible(newVisible);
		state.changeIsReplaceRevealed(newVisible);
	}, [isReplaceVisible, state]);

	const toggleRegex = useCallback(() => {
		const newValue = !isRegex;
		setIsRegex(newValue);
		state.changeIsRegex(newValue);
	}, [isRegex, state]);

	const toggleMatchCase = useCallback(() => {
		const newValue = !matchCase;
		setMatchCase(newValue);
		state.changeMatchCase(newValue);
	}, [matchCase, state]);

	const toggleWholeWord = useCallback(() => {
		const newValue = !wholeWord;
		setWholeWord(newValue);
		state.changeWholeWord(newValue);
	}, [wholeWord, state]);

	if (!isVisible) {
						return null;
	}

	return (
		<div className={`editor-widget find-widget visible${isReplaceVisible ? ' replaceToggled' : ''}`}>
			{/* Toggle Replace Button */}
			<button 
				className={`codicon toggle left${isReplaceVisible ? ' codicon-chevron-down expanded' : ' codicon-chevron-right'}`}
				title="Toggle Replace"
				onClick={toggleReplace}
			/>
			
			{/* Find Part */}
			<div className="find-part">
				<div className="monaco-inputbox" ref={findInputBoxRef}>
					<div className="ibwrapper">
						<input
							ref={searchInputRef}
							className="input"
							type="text"
							value={searchValue}
							placeholder="Find"
							onChange={(e) => handleSearchChange(e.target.value)}
							onKeyDown={handleSearchKeyDown}
						/>
						<div className="mirror"></div>
					</div>
					<div className="controls">
						<button 
							className={`codicon codicon-case-sensitive${matchCase ? ' active' : ''}`}
							title="Match Case"
							onClick={toggleMatchCase}
						/>
						<button 
							className={`codicon codicon-whole-word${wholeWord ? ' active' : ''}`}
							title="Match Whole Word"
							onClick={toggleWholeWord}
						/>
						<button 
							className={`codicon codicon-regex${isRegex ? ' active' : ''}`}
							title="Use Regular Expression"
							onClick={toggleRegex}
						/>
					</div>
				</div>
				<div className="find-actions">
					<div className="matchesCount">{matchCount}</div>
					<button 
						className={`codicon codicon-arrow-up${searchValue ? '' : ' disabled'}`}
						title="Previous Match"
						disabled={!searchValue}
						onClick={() => controller.findPrevious()}
					/>
					<button 
						className={`codicon codicon-arrow-down${searchValue ? '' : ' disabled'}`}
						title="Next Match"
						disabled={!searchValue}
						onClick={() => controller.findNext()}
					/>
				</div>
			</div>
			
			{/* Close Button */}
			<button 
				className="codicon codicon-close"
				title="Close"
				onClick={onClose}
			/>
			
			{/* Replace Part */}
			<div className="replace-part">
				<div className="monaco-findInput" ref={replaceInputBoxRef}>
					<div className="monaco-inputbox">
						<div className="ibwrapper">
							<input
								ref={replaceInputRef}
								className="input"
								type="text"
								value={replaceValue}
								placeholder="Replace"
								onChange={(e) => handleReplaceChange(e.target.value)}
								onKeyDown={handleReplaceKeyDown}
							/>
							<div className="mirror"></div>
						</div>
					</div>
				</div>
				<div className="replace-actions">
					<button 
						className={`codicon codicon-replace${searchValue && replaceValue !== undefined ? '' : ' disabled'}`}
						title="Replace"
						disabled={!searchValue}
						onClick={() => controller.replace()}
					/>
					<button 
						className={`codicon codicon-replace-all${searchValue && replaceValue !== undefined ? '' : ' disabled'}`}
						title="Replace All"
						disabled={!searchValue}
						onClick={() => controller.replaceAll()}
					/>
				</div>
			</div>
		</div>
	);
};
