/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { importAMDNodeModule } from '../../../../amdX.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { LanguageDetectionWorkerHost } from './languageDetectionWorker.protocol.js';
import { WorkerTextModelSyncServer } from '../../../../editor/common/services/textModelSync/textModelSync.impl.js';
export function create(workerServer) {
    return new LanguageDetectionWorker(workerServer);
}
/**
 * @internal
 */
export class LanguageDetectionWorker {
    static { this.expectedRelativeConfidence = 0.2; }
    static { this.positiveConfidenceCorrectionBucket1 = 0.05; }
    static { this.positiveConfidenceCorrectionBucket2 = 0.025; }
    static { this.negativeConfidenceCorrection = 0.5; }
    constructor(workerServer) {
        this._requestHandlerBrand = undefined;
        this._workerTextModelSyncServer = new WorkerTextModelSyncServer();
        this._regexpLoadFailed = false;
        this._loadFailed = false;
        this.modelIdToCoreId = new Map();
        this._host = LanguageDetectionWorkerHost.getChannel(workerServer);
        this._workerTextModelSyncServer.bindToServer(workerServer);
    }
    async $detectLanguage(uri, langBiases, preferHistory, supportedLangs) {
        const languages = [];
        const confidences = [];
        const stopWatch = new StopWatch();
        const documentTextSample = this.getTextForDetection(uri);
        if (!documentTextSample) {
            return;
        }
        const neuralResolver = async () => {
            for await (const language of this.detectLanguagesImpl(documentTextSample)) {
                if (!this.modelIdToCoreId.has(language.languageId)) {
                    this.modelIdToCoreId.set(language.languageId, await this._host.$getLanguageId(language.languageId));
                }
                const coreId = this.modelIdToCoreId.get(language.languageId);
                if (coreId && (!supportedLangs?.length || supportedLangs.includes(coreId))) {
                    languages.push(coreId);
                    confidences.push(language.confidence);
                }
            }
            stopWatch.stop();
            if (languages.length) {
                this._host.$sendTelemetryEvent(languages, confidences, stopWatch.elapsed());
                return languages[0];
            }
            return undefined;
        };
        const historicalResolver = async () => this.runRegexpModel(documentTextSample, langBiases ?? {}, supportedLangs);
        if (preferHistory) {
            const history = await historicalResolver();
            if (history) {
                return history;
            }
            const neural = await neuralResolver();
            if (neural) {
                return neural;
            }
        }
        else {
            const neural = await neuralResolver();
            if (neural) {
                return neural;
            }
            const history = await historicalResolver();
            if (history) {
                return history;
            }
        }
        return undefined;
    }
    getTextForDetection(uri) {
        const editorModel = this._workerTextModelSyncServer.getModel(uri);
        if (!editorModel) {
            return;
        }
        const end = editorModel.positionAt(10000);
        const content = editorModel.getValueInRange({
            startColumn: 1,
            startLineNumber: 1,
            endColumn: end.column,
            endLineNumber: end.lineNumber
        });
        return content;
    }
    async getRegexpModel() {
        if (this._regexpLoadFailed) {
            return;
        }
        if (this._regexpModel) {
            return this._regexpModel;
        }
        const uri = await this._host.$getRegexpModelUri();
        try {
            this._regexpModel = await importAMDNodeModule(uri, '');
            return this._regexpModel;
        }
        catch (e) {
            this._regexpLoadFailed = true;
            // console.warn('error loading language detection model', e);
            return;
        }
    }
    async runRegexpModel(content, langBiases, supportedLangs) {
        const regexpModel = await this.getRegexpModel();
        if (!regexpModel) {
            return;
        }
        if (supportedLangs?.length) {
            // When using supportedLangs, normally computed biases are too extreme. Just use a "bitmask" of sorts.
            for (const lang of Object.keys(langBiases)) {
                if (supportedLangs.includes(lang)) {
                    langBiases[lang] = 1;
                }
                else {
                    langBiases[lang] = 0;
                }
            }
        }
        const detected = regexpModel.detect(content, langBiases, supportedLangs);
        return detected;
    }
    async getModelOperations() {
        if (this._modelOperations) {
            return this._modelOperations;
        }
        const uri = await this._host.$getIndexJsUri();
        const { ModelOperations } = await importAMDNodeModule(uri, '');
        this._modelOperations = new ModelOperations({
            modelJsonLoaderFunc: async () => {
                const response = await fetch(await this._host.$getModelJsonUri());
                try {
                    const modelJSON = await response.json();
                    return modelJSON;
                }
                catch (e) {
                    const message = `Failed to parse model JSON.`;
                    throw new Error(message);
                }
            },
            weightsLoaderFunc: async () => {
                const response = await fetch(await this._host.$getWeightsUri());
                const buffer = await response.arrayBuffer();
                return buffer;
            }
        });
        return this._modelOperations;
    }
    // This adjusts the language confidence scores to be more accurate based on:
    // * VS Code's language usage
    // * Languages with 'problematic' syntaxes that have caused incorrect language detection
    adjustLanguageConfidence(modelResult) {
        switch (modelResult.languageId) {
            // For the following languages, we increase the confidence because
            // these are commonly used languages in VS Code and supported
            // by the model.
            case 'js':
            case 'html':
            case 'json':
            case 'ts':
            case 'css':
            case 'py':
            case 'xml':
            case 'php':
                modelResult.confidence += LanguageDetectionWorker.positiveConfidenceCorrectionBucket1;
                break;
            // case 'yaml': // YAML has been know to cause incorrect language detection because the language is pretty simple. We don't want to increase the confidence for this.
            case 'cpp':
            case 'sh':
            case 'java':
            case 'cs':
            case 'c':
                modelResult.confidence += LanguageDetectionWorker.positiveConfidenceCorrectionBucket2;
                break;
            // For the following languages, we need to be extra confident that the language is correct because
            // we've had issues like #131912 that caused incorrect guesses. To enforce this, we subtract the
            // negativeConfidenceCorrection from the confidence.
            // languages that are provided by default in VS Code
            case 'bat':
            case 'ini':
            case 'makefile':
            case 'sql':
            // languages that aren't provided by default in VS Code
            case 'csv':
            case 'toml':
                // Other considerations for negativeConfidenceCorrection that
                // aren't built in but suported by the model include:
                // * Assembly, TeX - These languages didn't have clear language modes in the community
                // * Markdown, Dockerfile - These languages are simple but they embed other languages
                modelResult.confidence -= LanguageDetectionWorker.negativeConfidenceCorrection;
                break;
            default:
                break;
        }
        return modelResult;
    }
    async *detectLanguagesImpl(content) {
        if (this._loadFailed) {
            return;
        }
        let modelOperations;
        try {
            modelOperations = await this.getModelOperations();
        }
        catch (e) {
            console.log(e);
            this._loadFailed = true;
            return;
        }
        let modelResults;
        try {
            modelResults = await modelOperations.runModel(content);
        }
        catch (e) {
            console.warn(e);
        }
        if (!modelResults
            || modelResults.length === 0
            || modelResults[0].confidence < LanguageDetectionWorker.expectedRelativeConfidence) {
            return;
        }
        const firstModelResult = this.adjustLanguageConfidence(modelResults[0]);
        if (firstModelResult.confidence < LanguageDetectionWorker.expectedRelativeConfidence) {
            return;
        }
        const possibleLanguages = [firstModelResult];
        for (let current of modelResults) {
            if (current === firstModelResult) {
                continue;
            }
            current = this.adjustLanguageConfidence(current);
            const currentHighest = possibleLanguages[possibleLanguages.length - 1];
            if (currentHighest.confidence - current.confidence >= LanguageDetectionWorker.expectedRelativeConfidence) {
                while (possibleLanguages.length) {
                    yield possibleLanguages.shift();
                }
                if (current.confidence > LanguageDetectionWorker.expectedRelativeConfidence) {
                    possibleLanguages.push(current);
                    continue;
                }
                return;
            }
            else {
                if (current.confidence > LanguageDetectionWorker.expectedRelativeConfidence) {
                    possibleLanguages.push(current);
                    continue;
                }
                return;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGFuZ3VhZ2VEZXRlY3Rpb25XZWJXb3JrZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvbGFuZ3VhZ2VEZXRlY3Rpb24vYnJvd3Nlci9sYW5ndWFnZURldGVjdGlvbldlYldvcmtlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUMxRCxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakUsT0FBTyxFQUFFLDJCQUEyQixFQUE0QixNQUFNLHVDQUF1QyxDQUFDO0FBQzlHLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHdFQUF3RSxDQUFDO0FBSW5ILE1BQU0sVUFBVSxNQUFNLENBQUMsWUFBOEI7SUFDcEQsT0FBTyxJQUFJLHVCQUF1QixDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQ2xELENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sT0FBTyx1QkFBdUI7YUFHWCwrQkFBMEIsR0FBRyxHQUFHLEFBQU4sQ0FBTzthQUNqQyx3Q0FBbUMsR0FBRyxJQUFJLEFBQVAsQ0FBUTthQUMzQyx3Q0FBbUMsR0FBRyxLQUFLLEFBQVIsQ0FBUzthQUM1QyxpQ0FBNEIsR0FBRyxHQUFHLEFBQU4sQ0FBTztJQWEzRCxZQUFZLFlBQThCO1FBbEIxQyx5QkFBb0IsR0FBUyxTQUFTLENBQUM7UUFPdEIsK0JBQTBCLEdBQUcsSUFBSSx5QkFBeUIsRUFBRSxDQUFDO1FBSXRFLHNCQUFpQixHQUFZLEtBQUssQ0FBQztRQUduQyxnQkFBVyxHQUFZLEtBQUssQ0FBQztRQUU3QixvQkFBZSxHQUFHLElBQUksR0FBRyxFQUE4QixDQUFDO1FBRy9ELElBQUksQ0FBQyxLQUFLLEdBQUcsMkJBQTJCLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FB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