/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { renderMarkdown } from 'vs/base/browser/markdownRenderer';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { DefaultEndOfLine, EndOfLinePreference, ITextBuffer } from 'vs/editor/common/model';
import { PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { handleANSIOutput } from 'vs/workbench/contrib/debug/browser/debugANSIHandling';
import { LinkDetector } from 'vs/workbench/contrib/debug/browser/linkDetector';
import { IGenericCellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellUri } from 'vs/workbench/contrib/notebook/common/notebookCommon';

const SIZE_LIMIT = 65535;

function generateViewMoreElement(notebookUri: URI, cellViewModel: IGenericCellViewModel, disposables: DisposableStore, openerService: IOpenerService): HTMLElement {
	const md: IMarkdownString = {
		value: '[show more (open the raw output data in a text editor) ...](command:workbench.action.openLargeOutput)',
		isTrusted: true,
		supportThemeIcons: true
	};

	const rendered = disposables.add(renderMarkdown(md, {
		actionHandler: {
			callback: (content) => {
				if (content === 'command:workbench.action.openLargeOutput') {
					openerService.open(CellUri.generateCellUri(notebookUri, cellViewModel.handle, Schemas.vscodeNotebookCellOutput));
				}

				return;
			},
			disposables: disposables
		}
	}));

	rendered.element.classList.add('output-show-more');
	return rendered.element;
}

export function truncatedArrayOfString(notebookUri: URI, cellViewModel: IGenericCellViewModel, linesLimit: number, container: HTMLElement, outputs: string[], disposables: DisposableStore, linkDetector: LinkDetector, openerService: IOpenerService, themeService: IThemeService) {
	const fullLen = outputs.reduce((p, c) => {
		return p + c.length;
	}, 0);

	let buffer: ITextBuffer | undefined = undefined;

	if (fullLen > SIZE_LIMIT) {
		// it's too large and we should find min(maxSizeLimit, maxLineLimit)
		const bufferBuilder = new PieceTreeTextBufferBuilder();
		outputs.forEach(output => bufferBuilder.acceptChunk(output));
		const factory = bufferBuilder.finish();
		buffer = factory.create(DefaultEndOfLine.LF).textBuffer;
		const sizeBufferLimitPosition = buffer.getPositionAt(SIZE_LIMIT);
		if (sizeBufferLimitPosition.lineNumber < linesLimit) {
			const truncatedText = buffer.getValueInRange(new Range(1, 1, sizeBufferLimitPosition.lineNumber, sizeBufferLimitPosition.column), EndOfLinePreference.TextDefined);
			container.appendChild(handleANSIOutput(truncatedText, linkDetector, themeService, undefined));
			// view more ...
			container.appendChild(generateViewMoreElement(notebookUri, cellViewModel, disposables, openerService));
			return;
		}
	}

	if (!buffer) {
		const bufferBuilder = new PieceTreeTextBufferBuilder();
		outputs.forEach(output => bufferBuilder.acceptChunk(output));
		const factory = bufferBuilder.finish();
		buffer = factory.create(DefaultEndOfLine.LF).textBuffer;
	}

	if (buffer.getLineCount() < linesLimit) {
		const lineCount = buffer.getLineCount();
		const fullRange = new Range(1, 1, lineCount, Math.max(1, buffer.getLineLastNonWhitespaceColumn(lineCount)));
		container.appendChild(handleANSIOutput(buffer.getValueInRange(fullRange, EndOfLinePreference.TextDefined), linkDetector, themeService, undefined));
		return;
	}

	const pre = DOM.$('pre');
	container.appendChild(pre);
	pre.appendChild(handleANSIOutput(buffer.getValueInRange(new Range(1, 1, linesLimit - 5, buffer.getLineLastNonWhitespaceColumn(linesLimit - 5)), EndOfLinePreference.TextDefined), linkDetector, themeService, undefined));

	// view more ...
	container.appendChild(generateViewMoreElement(notebookUri, cellViewModel, disposables, openerService));

	const lineCount = buffer.getLineCount();
	const pre2 = DOM.$('div');
	container.appendChild(pre2);
	pre2.appendChild(handleANSIOutput(buffer.getValueInRange(new Range(lineCount - 5, 1, lineCount, buffer.getLineLastNonWhitespaceColumn(lineCount)), EndOfLinePreference.TextDefined), linkDetector, themeService, undefined));
}
