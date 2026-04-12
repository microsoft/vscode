/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { BugIndicatingError, ErrorNoTelemetry } from '../../../../../base/common/errors.js';
import { Lazy } from '../../../../../base/common/lazy.js';
import { Disposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ITreeSitterLibraryService } from '../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { SedFileWriteParser } from './commandParsers/sedFileWriteParser.js';
export var TreeSitterCommandParserLanguage;
(function (TreeSitterCommandParserLanguage) {
    TreeSitterCommandParserLanguage["Bash"] = "bash";
    TreeSitterCommandParserLanguage["PowerShell"] = "powershell";
})(TreeSitterCommandParserLanguage || (TreeSitterCommandParserLanguage = {}));
let TreeSitterCommandParser = class TreeSitterCommandParser extends Disposable {
    constructor(_treeSitterLibraryService) {
        super();
        this._treeSitterLibraryService = _treeSitterLibraryService;
        this._treeCache = this._register(new TreeCache());
        this._commandFileWriteParsers = [
            new SedFileWriteParser(),
        ];
        this._parser = new Lazy(() => this._treeSitterLibraryService.getParserClass().then(ParserCtor => new ParserCtor()));
    }
    async extractSubCommands(languageId, commandLine) {
        const captures = await this._queryTree(languageId, commandLine, '(command) @command');
        return captures.map(e => e.node.text);
    }
    async extractPwshDoubleAmpersandChainOperators(commandLine) {
        const captures = await this._queryTree("powershell" /* TreeSitterCommandParserLanguage.PowerShell */, commandLine, [
            '(',
            '  (pipeline',
            '    (pipeline_chain_tail) @double.ampersand)',
            ')',
        ].join('\n'));
        return captures;
    }
    async getFileWrites(languageId, commandLine) {
        let query;
        switch (languageId) {
            case "bash" /* TreeSitterCommandParserLanguage.Bash */:
                query = [
                    '(file_redirect',
                    '  destination: [(word) (string (string_content)) (raw_string) (concatenation)] @file)',
                ].join('\n');
                break;
            case "powershell" /* TreeSitterCommandParserLanguage.PowerShell */:
                query = [
                    '(redirection',
                    '  (redirected_file_name) @file)',
                ].join('\n');
                break;
        }
        const captures = await this._queryTree(languageId, commandLine, query);
        return captures.map(e => e.node.text.trim());
    }
    /**
     * Extracts file targets from commands that perform file writes beyond shell redirections.
     * Uses registered command parsers (e.g., for `sed -i`) to detect command-specific file writes.
     * Returns an array of file paths that would be modified.
     */
    async getCommandFileWrites(languageId, commandLine) {
        // Currently only bash-like shells are supported for command-specific parsing
        if (languageId !== "bash" /* TreeSitterCommandParserLanguage.Bash */) {
            return [];
        }
        // Query for all commands
        const query = '(command) @command';
        const captures = await this._queryTree(languageId, commandLine, query);
        const result = [];
        for (const capture of captures) {
            const commandText = capture.node.text;
            for (const parser of this._commandFileWriteParsers) {
                if (parser.canHandle(commandText)) {
                    result.push(...parser.extractFileWrites(commandText));
                }
            }
        }
        return result;
    }
    async _queryTree(languageId, commandLine, querySource) {
        const { tree, query } = await this._doQuery(languageId, commandLine, querySource);
        return query.captures(tree.rootNode);
    }
    async _doQuery(languageId, commandLine, querySource) {
        const language = await this._treeSitterLibraryService.getLanguagePromise(languageId);
        if (!language) {
            throw new BugIndicatingError('Failed to fetch language grammar');
        }
        let tree = this._treeCache.get(languageId, commandLine);
        if (!tree) {
            const parser = await this._parser.value;
            parser.setLanguage(language);
            const parsedTree = parser.parse(commandLine);
            if (!parsedTree) {
                throw new ErrorNoTelemetry('Failed to parse tree');
            }
            tree = parsedTree;
            this._treeCache.set(languageId, commandLine, tree);
        }
        const query = await this._treeSitterLibraryService.createQuery(language, querySource);
        if (!query) {
            throw new BugIndicatingError('Failed to create tree sitter query');
        }
        return { tree, query };
    }
};
TreeSitterCommandParser = __decorate([
    __param(0, ITreeSitterLibraryService)
], TreeSitterCommandParser);
export { TreeSitterCommandParser };
/**
 * Caches trees temporarily to avoid reparsing the same command line multiple
 * times in quick succession.
 */
class TreeCache extends Disposable {
    constructor() {
        super();
        this._cache = new Map();
        this._clearScheduler = this._register(new MutableDisposable());
        this._register(toDisposable(() => this._cache.clear()));
    }
    get(languageId, commandLine) {
        this._resetClearTimer();
        return this._cache.get(this._getCacheKey(languageId, commandLine));
    }
    set(languageId, commandLine, tree) {
        this._resetClearTimer();
        this._cache.set(this._getCacheKey(languageId, commandLine), tree);
    }
    _getCacheKey(languageId, commandLine) {
        return `${languageId}:${commandLine}`;
    }
    _resetClearTimer() {
        this._clearScheduler.value = new RunOnceScheduler(() => {
            this._cache.clear();
        }, 10000);
        this._clearScheduler.value.schedule();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJlZVNpdHRlckNvbW1hbmRQYXJzZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi90ZXJtaW5hbENvbnRyaWIvY2hhdEFnZW50VG9vbHMvYnJvd3Nlci90cmVlU2l0dGVyQ29tbWFuZFBhcnNlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUN2RSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUM1RixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDMUQsT0FBTyxFQUFFLFVBQVUsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN0RyxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw4RUFBOEUsQ0FBQztBQUV6SCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUU1RSxNQUFNLENBQU4sSUFBa0IsK0JBR2pCO0FBSEQsV0FBa0IsK0JBQStCO0lBQ2hELGdEQUFhLENBQUE7SUFDYiw0REFBeUIsQ0FBQTtBQUMxQixDQUFDLEVBSGlCLCtCQUErQixLQUEvQiwrQkFBK0IsUUFHaEQ7QUFFTSxJQUFNLHVCQUF1QixHQUE3QixNQUFNLHVCQUF3QixTQUFRLFVBQVU7SUFPdEQsWUFDNEIseUJBQXFFO1FBRWhHLEtBQUssRUFBRSxDQUFDO1FBRm9DLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBMkI7UUFOaEYsZUFBVSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLDZCQUF3QixHQUE4QjtZQUN0RSxJQUFJLGtCQUFrQixFQUFFO1NBQ3hC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