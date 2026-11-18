/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as monaco from 'monaco-editor';
import * as React from 'react';
import { IDiagnosticComparison, IRange } from '../../shared/sharedTypes';
import { monacoModule } from '../utils/utils';
import { DraggableBottomBorder } from './draggableBottomBorder';
import { createDiagnosticDecorations } from './editor';
import { rangeToMonacoRange } from './monacoUtils';

type Props = {
	original: string;
	modified: string;
	languageId: string;
	diagnostics?: IDiagnosticComparison;
	selections?: {
		before: IRange | undefined;
		after: IRange | undefined;
	};
};

const LINE_HEIGHT = 19;

export const DiffEditor = (({ original, modified, languageId, diagnostics, selections }: Props) => {

	const containerRef = React.useRef<HTMLDivElement | null>(null);
	const [diffEditor, setDiffEditor] = React.useState<monaco.editor.IStandaloneDiffEditor | null>(null);
	const [height, setHeight] = React.useState<number>(300);
	const [altPressed, setAltPressed] = React.useState(false);

	const monaco = monacoModule.value;

	React.useEffect(() => {
		if (!containerRef.current) {
			return;
		}

		const myEditor = monaco.editor.createDiffEditor(containerRef.current, {
			automaticLayout: true,
			lineHeight: LINE_HEIGHT,
			minimap: { enabled: false },
			readOnly: true,
			renderLineHighlight: 'none',
			scrollBeyondLastLine: false,
			overviewRulerLanes: 0,
			ignoreTrimWhitespace: false,
			diffWordWrap: 'off',
			scrollbar: {
				alwaysConsumeMouseWheel: true, // setting to false allows scrolling in window when scroll reaches end of the editor
			}
		});
		setDiffEditor(myEditor);

		return () => {
			const model = myEditor.getModel();
			if (model) {
				const { original, modified } = model;
				original.dispose();
				modified.dispose();
			}
			myEditor.dispose();
		};
	}, []);

	React.useEffect(() => {
		if (diffEditor) {
			let model = diffEditor.getModel();
			if (model) {
				const { original: originalModel, modified: modifiedModel } = model;
				originalModel.setValue(original);
				monaco.editor.setModelLanguage(originalModel, languageId);
				modifiedModel.setValue(modified);
				monaco.editor.setModelLanguage(modifiedModel, languageId);
			} else {
				const model1 = monaco.editor.createModel(original, languageId);
				const model2 = monaco.editor.createModel(modified, languageId);
				model = { original: model1, modified: model2 };
				diffEditor.setModel(model);
			}

			if (diagnostics) {
				diffEditor.getModifiedEditor().createDecorationsCollection().set(createDiagnosticDecorations(diagnostics.after, model.modified));
				diffEditor.getOriginalEditor().createDecorationsCollection().set(createDiagnosticDecorations(diagnostics.before, model.original));
			}

			if (selections) {
				if (selections.before) {
					const mselection = rangeToMonacoRange(selections.before);
					diffEditor.getOriginalEditor().setSelection(mselection);
				}
				if (selections.after) {
					const mselection = rangeToMonacoRange(selections.after);
					diffEditor.getModifiedEditor().setSelection(mselection);
				}
			}

			// Navigate to first diff
			diffEditor.onDidUpdateDiff(() => {
				if (diffEditor === null) { return; }

				const changes = diffEditor.getLineChanges();
				if (changes === null || changes.length === 0) {
					return;
				}

				const change = changes[0];
				diffEditor.getModifiedEditor().revealLinesInCenter(change.modifiedStartLineNumber, change.modifiedEndLineNumber);
			});
		}
	}, [diffEditor, original, modified, languageId, diagnostics, selections]);

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
