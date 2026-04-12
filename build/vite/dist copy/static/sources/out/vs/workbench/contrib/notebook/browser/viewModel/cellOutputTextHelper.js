/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isTextStreamMime } from '../../../../../base/common/mime.js';
export function getAllOutputsText(notebook, viewCell, shortErrors = false) {
    const outputText = [];
    for (let i = 0; i < viewCell.outputsViewModels.length; i++) {
        const outputViewModel = viewCell.outputsViewModels[i];
        const outputTextModel = viewCell.model.outputs[i];
        const [mimeTypes, pick] = outputViewModel.resolveMimeTypes(notebook, undefined);
        const mimeType = mimeTypes[pick].mimeType;
        let buffer = outputTextModel.outputs.find(output => output.mime === mimeType);
        if (!buffer || mimeType.startsWith('image')) {
            buffer = outputTextModel.outputs.find(output => !output.mime.startsWith('image'));
        }
        if (!buffer) {
            continue;
        }
        let text = '';
        if (isTextStreamMime(mimeType)) {
            const { text: stream, count } = getOutputStreamText(outputViewModel);
            text = stream;
            if (count > 1) {
                i += count - 1;
            }
        }
        else {
            text = getOutputText(mimeType, buffer, shortErrors);
        }
        outputText.push(text);
    }
    let outputContent;
    if (outputText.length > 1) {
        outputContent = outputText.map((output, i) => {
            return `Cell output ${i + 1} of ${outputText.length}\n${output}`;
        }).join('\n');
    }
    else {
        outputContent = outputText[0] ?? '';
    }
    return outputContent;
}
export function getOutputStreamText(output) {
    let text = '';
    const cellViewModel = output.cellViewModel;
    let index = cellViewModel.outputsViewModels.indexOf(output);
    let count = 0;
    while (index < cellViewModel.model.outputs.length) {
        const nextCellOutput = cellViewModel.model.outputs[index];
        const nextOutput = nextCellOutput.outputs.find(output => isTextStreamMime(output.mime));
        if (!nextOutput) {
            break;
        }
        text = text + decoder.decode(nextOutput.data.buffer);
        index = index + 1;
        count++;
    }
    return { text: text.trim(), count };
}
const decoder = new TextDecoder();
export function getOutputText(mimeType, buffer, shortError = false) {
    let text = `${mimeType}`; // default in case we can't get the text value for some reason.
    const charLimit = 100000;
    text = decoder.decode(buffer.data.slice(0, charLimit).buffer);
    if (buffer.data.byteLength > charLimit) {
        text = text + '...(truncated)';
    }
    else if (mimeType === 'application/vnd.code.notebook.error') {
        text = text.replace(/\\u001b\[[0-9;]*m/gi, '');
        try {
            const error = JSON.parse(text);
            if (!error.stack || shortError) {
                text = `${error.name}: ${error.message}`;
            }
            else {
                text = error.stack;
            }
        }
        catch {
            // just use raw text
        }
    }
    return text.trim();
}
export async function copyCellOutput(mimeType, outputViewModel, clipboardService, logService) {
    const cellOutput = outputViewModel.model;
    const output = mimeType && TEXT_BASED_MIMETYPES.includes(mimeType) ?
        cellOutput.outputs.find(output => output.mime === mimeType) :
        cellOutput.outputs.find(output => TEXT_BASED_MIMETYPES.includes(output.mime));
    mimeType = output?.mime;
    if (!mimeType || !output) {
        return;
    }
    const text = isTextStreamMime(mimeType) ? getOutputStreamText(outputViewModel).text : getOutputText(mimeType, output);
    try {
        await clipboardService.writeText(text);
    }
    catch (e) {
        logService.error(`Failed to copy content: ${e}`);
    }
}
export const TEXT_BASED_MIMETYPES = [
    'text/latex',
    'text/html',
    'application/vnd.code.notebook.error',
    'application/vnd.code.notebook.stdout',
    'application/x.notebook.stdout',
    'application/x.notebook.stream',
    'application/vnd.code.notebook.stderr',
    'application/x.notebook.stderr',
    'text/plain',
    'text/markdown',
    'application/json'
];
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2VsbE91dHB1dFRleHRIZWxwZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9ub3RlYm9vay9icm93c2VyL3ZpZXdNb2RlbC9jZWxsT3V0cHV0VGV4dEhlbHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQU1oRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQVN0RSxNQUFNLFVBQVUsaUJBQWlCLENBQUMsUUFBMkIsRUFBRSxRQUF3QixFQUFFLGNBQXVCLEtBQUs7SUFDcEgsTUFBTSxVQUFVLEdBQWEsRUFBRSxDQUFDO0lBQ2hDLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxRQUFRLENBQUMsaUJBQWlCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDNUQsTUFBTSxlQUFlLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3RELE1BQU0sZUFBZSxHQUFHLFFBQVEsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xELE1BQU0sQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsZUFBZSxDQUFDLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRixNQUFNLFFBQVEsR0FBRyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsUUFBUSxDQUFDO1FBQzFDLElBQUksTUFBTSxHQUFHLGVBQWUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsQ0FBQztRQUU5RSxJQUFJLENBQUMsTUFBTSxJQUFJLFFBQVEsQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZ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