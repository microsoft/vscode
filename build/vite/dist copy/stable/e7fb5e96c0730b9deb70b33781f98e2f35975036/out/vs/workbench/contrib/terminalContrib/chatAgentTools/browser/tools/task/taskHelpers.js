/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../../../nls.js';
import { OutputMonitorState } from '../monitoring/types.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
export function toolResultDetailsFromResponse(terminalResults) {
    return Array.from(new Map(terminalResults
        .flatMap(r => r.resources?.filter(res => res.uri).map(res => {
        const range = res.range;
        const item = range !== undefined ? { uri: res.uri, range } : res.uri;
        const key = range !== undefined
            ? `${res.uri.toString()}-${range.toString()}`
            : `${res.uri.toString()}`;
        return [key, item];
    }) ?? [])).values());
}
export function toolResultMessageFromResponse(result, taskLabel, toolResultDetails, terminalResults, getOutputTool, isBackground) {
    let resultSummary = '';
    if (result?.exitCode) {
        resultSummary = localize('copilotChat.taskFailedWithExitCode', 'Task `{0}` failed with exit code {1}.', taskLabel, result.exitCode);
    }
    else {
        resultSummary += `\`${taskLabel}\` task `;
        const problemCount = toolResultDetails.length;
        if (getOutputTool) {
            return problemCount ? new MarkdownString(`Got output for ${resultSummary} with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`) : new MarkdownString(`Got output for ${resultSummary}`);
        }
        else {
            const problemCount = toolResultDetails.length;
            resultSummary += terminalResults.every(r => r.state === OutputMonitorState.Idle)
                ? (problemCount
                    ? `finished with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`
                    : 'finished')
                : (isBackground
                    ? (problemCount
                        ? `started and will continue to run in the background with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`
                        : 'started and will continue to run in the background')
                    : (problemCount
                        ? `started with \`${problemCount}\` problem${problemCount === 1 ? '' : 's'}`
                        : 'started'));
        }
    }
    return new MarkdownString(resultSummary);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGFza0hlbHBlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90b29scy90YXNrL3Rhc2tIZWxwZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBTWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUM1RCxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFFakYsTUFBTSxVQUFVLDZCQUE2QixDQUFDLGVBQWtFO0lBQy9HLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FDeEIsZUFBZTtTQUNiLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUNaLENBQUMsQ0FBQyxTQUFTLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsRUFBRTtRQUM3QyxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDO1FBQ3hCLE1BQU0sSUFBSSxHQUFHLEtBQUssS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsR0FBRyxFQUFFLEdBQUcsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUM7UUFDckUsTUFBTSxHQUFHLEdBQUcsS0FBSyxLQUFLLFNBQVM7WUFDOUIsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUU7WUFDN0MsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLEVBQUUsRUFBRSxDQUFDO1FBQzNCLE9BQU8sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUE2QixDQUFDO0lBQ2hELENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FDUixDQUNGLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztBQUNiLENBQUM7QUFFRCxNQUFNLFVBQVUsNkJBQTZCLENBQUMsTUFBZ0MsRUFBRSxTQUFpQixFQUFFLGlCQUFxQyxFQUFFLGVBQTZGLEVBQUUsYUFBdUIsRUFBRSxZQUFzQjtJQUN2UixJQUFJLGFBQWEsR0FBRyxFQUFFLENBQUM7SUFDdkIsSUFBSSxNQUFNLEVBQUUsUUFBUSxFQUFFLENBQUM7UUFDdEIsYUFBYSxHQUFHLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSx1Q0FBdUMsRUFBRSxTQUFTLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JJLENBQUM7U0FBTSxDQUFDO1FBQ1AsYUFBYSxJQUFJLEtBQUssU0FBUyxVQUFVLENBQUM7UUFDMUMsTUFBTSxZQUFZLEdBQUcsaUJBQWlCLENBQUMsTUFBTSxDQUFDO1FBQzlDLElBQUksYUFBYSxFQUFFLENBQUM7WUFDbkIsT0FBTyxZQUFZLENBQUMsQ0FBQyxDQUFDLElBQUksY0FBYyxDQUFDLGtCQUFrQixhQUFhLFdBQVcsWUFBWSxhQUFhLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxjQUFjLENBQUMsa0JBQWtCLGFBQWEsRUFBRSxDQUFDLENBQUM7UUFDdE0sQ0FBQzthQUFNLENBQUM7WUFDUCxNQUFNLFlBQVksR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLENBQUM7WUFDOUMsYUFBYSxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsS0FBSyxLQUFLLGtCQUFrQixDQUFDLElBQUksQ0FBQztnQkFDL0UsQ0FBQyxDQUFDLENBQUMsWUFBWTtvQkFDZCxDQUFDLENBQUMsbUJBQW1CLFlBQVksYUFBYSxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRTtvQkFDN0UsQ0FBQyxDQUFDLFVBQVUsQ0FBQztnQkFDZCxDQUFDLENBQUMsQ0FBQyxZQUFZO29CQUNkLENBQUMsQ0FBQyxDQUFDLFlBQVk7d0JBQ2QsQ0FBQyxDQUFDLDZEQUE2RCxZQUFZLGFBQWEsWUFBWSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUU7d0JBQ3ZILENBQUMsQ0FBQyxvREFBb0QsQ0FBQztvQkFDeEQsQ0FBQyxDQUFDLENBQUMsWUFBWTt3QkFDZCxDQUFDLENBQUMsa0JBQWtCLFlBQVksYUFBYSxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLEdBQUcsRUFBRTt3QkFDNUUsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUM7UUFDbEIsQ0FBQztJQUNGLENBQUM7SUFDRCxPQUFPLElBQUksY0FBYyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQzFDLENBQUMifQ==