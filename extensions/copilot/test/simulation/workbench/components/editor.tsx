/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as monaco from 'monaco-editor';
import * as React from 'react';
import { IDiagnostic, IRange } from '../../shared/sharedTypes';
import { monacoModule } from '../utils/utils';
import { DraggableBottomBorder } from './draggableBottomBorder';
import { rangeToMonacoRange } from './monacoUtils';

type Props = {
	contents: string;
	languageId: string;
	lineNumbers?: boolean;
	range?: IRange;
	selection?: IRange;
	diagnostics?: IDiagnostic[];
};

const LINE_HEIGHT = 19;
const MAX_LINES_DUE_TO_CONTENT = 20;
const MAX_LINES_DUE_TO_RANGE = 20;
const VERTICAL_PADDING = 5;

export const Editor = (({ contents, languageId, lineNumbers, range, selection, diagnostics }: Props) => {
	if (typeof lineNumbers === 'undefined') {
		lineNumbers = true;
	}

	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const [editor, setEditor] = React.useState<monaco.editor.IStandaloneCodeEditor | null>(null);
	const [altPressed, setAltPressed] = React.useState(false);

	const rangeLineCount = range ? range.end.line - range.start.line + 3 : 0;
	const fileLineCount = contents.split(/\n/g).length;
	const lineCount = Math.max(
		Math.min(MAX_LINES_DUE_TO_RANGE, rangeLineCount),
		Math.min(MAX_LINES_DUE_TO_CONTENT, fileLineCount)
	);
	const [height, setHeight] = React.useState<number>(LINE_HEIGHT * lineCount + 2 * VERTICAL_PADDING);

	const monaco = monacoModule.value;

	React.useEffect(() => {
		if (!containerRef.current) {
			return;
		}
		const myEditor = monaco.editor.create(containerRef.current, {
			automaticLayout: true,
			lineHeight: LINE_HEIGHT,
			model: null,
			minimap: { enabled: false },
			readOnly: true,
			scrollBeyondLastLine: false,
			cursorBlinking: 'solid',
			overviewRulerLanes: 0,
			scrollbar: {
				alwaysConsumeMouseWheel: true, // setting to false allows scrolling in window when scroll reaches end of the editor
			},
			lineNumbers: lineNumbers ? 'on' : 'off',
			folding: lineNumbers ? true : false,
			padding: { top: VERTICAL_PADDING, bottom: VERTICAL_PADDING }
		});
		setEditor(myEditor);

		return () => {
			const model = myEditor.getModel();
			if (model) {
				model.dispose();
			}
			myEditor.dispose();
		};
	}, []);

	React.useEffect(() => {
		if (editor) {
			let model = editor.getModel();
			if (model) {
				monaco.editor.setModelLanguage(model, languageId);
				model.setValue(contents);
			} else {
				model = monaco.editor.createModel(contents, languageId);
				editor.setModel(model);
			}

			if (selection) {
				const mselection = rangeToMonacoRange(selection);
				editor.setSelection(mselection);
				editor.revealRangeInCenterIfOutsideViewport(mselection, monaco.editor.ScrollType.Immediate);
			}

			if (range) {
				const mrange = rangeToMonacoRange(range);

				const decorations = editor.createDecorationsCollection();
				decorations.set([{
					range: mrange,
					options: {
						className: 'step-range-highlight',
						showIfCollapsed: true,
						isWholeLine: true
					}
				}]);
				editor.revealRangeInCenter(mrange, monaco.editor.ScrollType.Immediate);
			}

			if (diagnostics && diagnostics.length > 0) {
				editor.createDecorationsCollection().set(createDiagnosticDecorations(diagnostics, model));
			}
		}
	}, [editor, contents, languageId, lineNumbers, range, selection, diagnostics]);

	React.useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.altKey) {
				setAltPressed(true);
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			if (!e.altKey) {
				setAltPressed(false);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	}, []);

	const handleWheel = (e: React.WheelEvent) => {
		if (altPressed) {
			e.preventDefault();
			e.stopPropagation();
		}
	};

	return (
		<div>
			<div className='file-editor-container' style={{ height: `${height}px`, position: 'relative' }} ref={containerRef}>
				<div
					className='overlay'
					style={{
						position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
						pointerEvents: altPressed ? 'auto' : 'none',
						backgroundColor: 'transparent',
						zIndex: 1000
					}}
					onWheel={handleWheel}
				/>
			</div>
			<DraggableBottomBorder height={height} setHeight={setHeight} />
		</div>
	);
});

export function createDiagnosticDecorations(diagnostics: IDiagnostic[], model: monaco.editor.ITextModel): monaco.editor.IModelDeltaDecoration[] {
	const monaco = monacoModule.value;
	const decs: monaco.editor.IModelDeltaDecoration[] = [];
	for (const diagnostic of diagnostics) {
		const mrange = rangeToMonacoRange(diagnostic.range);
		const validRange = isValidRange(mrange, model);
		decs.push({
			range: mrange,
			options: {
				className: validRange ? 'dec-diagnostic' : 'dec-diagnostic-invalid-range',
				overviewRuler: { color: '#000000', position: monaco.editor.OverviewRulerLane.Full },
				showIfCollapsed: true,
				hoverMessage: [
					{ value: `${validRange ? 'Range' : 'Invalid range'}: (${diagnostic.range.start.line},${diagnostic.range.start.character} - ${diagnostic.range.end.line},${diagnostic.range.end.character})` },
					{ value: diagnostic.message }],
			}
		});
	}
	return decs;
}

function isValidRange(range: monaco.Range, model: monaco.editor.ITextModel) {
	if (!model.validateRange(range).equalsRange(range)) {
		return false;
	}
	const positionInsideWord = (pos: monaco.Position) => {
		const word = model.getWordAtPosition(pos);
		return word && word.startColumn < pos.column && word.endColumn > pos.column;
	};
	return !positionInsideWord(range.getStartPosition()) && !positionInsideWord(range.getEndPosition());
}
