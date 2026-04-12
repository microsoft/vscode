/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../../../../base/common/lifecycle.js';
import { isPowerShell } from '../../runInTerminalHelpers.js';
export class CommandLinePwshChainOperatorRewriter extends Disposable {
    constructor(_treeSitterCommandParser) {
        super();
        this._treeSitterCommandParser = _treeSitterCommandParser;
    }
    async rewrite(options) {
        // TODO: This should just be Windows PowerShell in the future when the powershell grammar
        // supports chain operators https://github.com/airbus-cert/tree-sitter-powershell/issues/27
        if (isPowerShell(options.shell, options.os)) {
            let doubleAmpersandCaptures;
            try {
                doubleAmpersandCaptures = await this._treeSitterCommandParser.extractPwshDoubleAmpersandChainOperators(options.commandLine);
            }
            catch {
                // Swallow tree sitter failures
            }
            if (doubleAmpersandCaptures && doubleAmpersandCaptures.length > 0) {
                let rewritten = options.commandLine;
                for (const capture of doubleAmpersandCaptures.reverse()) {
                    rewritten = `${rewritten.substring(0, capture.node.startIndex)};${rewritten.substring(capture.node.endIndex)}`;
                }
                return {
                    rewritten,
                    reasoning: '&& re-written to ;'
                };
            }
        }
        return undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZExpbmVQd3NoQ2hhaW5PcGVyYXRvclJld3JpdGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVSZXdyaXRlci9jb21tYW5kTGluZVB3c2hDaGFpbk9wZXJhdG9yUmV3cml0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBQzNFLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUk3RCxNQUFNLE9BQU8sb0NBQXFDLFNBQVEsVUFBVTtJQUNuRSxZQUNrQix3QkFBaUQ7UUFFbEUsS0FBSyxFQUFFLENBQUM7UUFGUyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQXlCO0lBR25FLENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLE9BQW9DO1FBQ2pELHlGQUF5RjtRQUN6RiwyRkFBMkY7UUFDM0YsSUFBSSxZQUFZLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUM3QyxJQUFJLHVCQUFtRCxDQUFDO1lBQ3hELElBQUksQ0FBQztnQkFDSix1QkFBdUIsR0FBRyxNQUFNLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyx3Q0FBd0MsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDN0gsQ0FBQztZQUFDLE1BQU0sQ0FBQztnQkFDUiwrQkFBK0I7WUFDaEMsQ0FBQztZQUVELElBQUksdUJBQXVCLElBQUksdUJBQXVCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNuRSxJQUFJLFNBQVMsR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDO2dCQUNwQyxLQUFLLE1BQU0sT0FBTyxJQUFJLHVCQUF1QixDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUM7b0JBQ3pELFNBQVMsR0FBRyxHQUFHLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUM7Z0JBQ2hILENBQUM7Z0JBQ0QsT0FBTztvQkFDTixTQUFTO29CQUNULFNBQVMsRUFBRSxvQkFBb0I7aUJBQy9CLENBQUM7WUFDSCxDQUFDO1FBQ0YsQ0FBQztRQUVELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7Q0FDRCJ9