"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGeneratorState = exports.shellContextSelector = void 0;
const scriptSuggestionsGenerator_1 = require("../generators/scriptSuggestionsGenerator");
const utils_1 = require("../../shared/utils");
const customSuggestionsGenerator_1 = require("../generators/customSuggestionsGenerator");
const shellContextSelector = ({ figState, }) => ({
    currentWorkingDirectory: figState.cwd || '',
    currentProcess: figState.processUserIsIn || '',
    environmentVariables: figState.environmentVariables,
    sshPrefix: '',
});
exports.shellContextSelector = shellContextSelector;
const getGeneratorContext = (state) => {
    const { command, parserResult } = state;
    const { currentArg, searchTerm, annotations, commandIndex } = parserResult;
    const tokens = command?.tokens ?? [];
    return {
        ...(0, exports.shellContextSelector)(state),
        annotations: annotations.slice(commandIndex),
        tokenArray: tokens.slice(commandIndex).map((token) => token.text),
        isDangerous: Boolean(currentArg?.isDangerous),
        searchTerm,
    };
};
const createGeneratorState = (
// setNamed: NamedSetState<AutocompleteState>,
state, executeExternals) => {
    // function updateGenerator(
    // 	generatorState: GeneratorState,
    // 	getUpdate: () => Partial<GeneratorState>,
    // ) {
    // 	return setNamed('updateGenerator', (state) => {
    // 		let { generatorStates } = state;
    // 		// Double check to make sure we don't update if things are stale
    // 		const index = generatorStates.findIndex((s) => s === generatorState);
    // 		if (index === -1) {
    // 			console.info('stale update', { generatorStates, generatorState });
    // 			return { generatorStates };
    // 		}
    // 		generatorStates = [...generatorStates];
    // 		// If we are still loading after update (e.g. debounced) then make sure
    // 		// we re-call this when we get a result.
    // 		generatorStates[index] = updateGeneratorOnResult({
    // 			...generatorState,
    // 			...getUpdate(),
    // 		});
    // 		console.info('updating generator', {
    // 			generatorState: generatorStates[index],
    // 		});
    // 		return { generatorStates };
    // 	});
    // }
    // function updateGeneratorOnResult(generatorState: GeneratorState) {
    // 	const { generator, loading, request } = generatorState;
    // 	if (loading && request) {
    // 		request.then((result) =>
    // 			updateGenerator(generatorState, () => ({
    // 				loading: false,
    // 				result: result?.map((suggestion) => ({ ...suggestion, generator })),
    // 			})),
    // 		);
    // 	}
    // 	return generatorState;
    // }
    const triggerGenerator = (currentState, executeExternals) => {
        const { generator, context } = currentState;
        let request;
        if (generator.template) {
            // TODO: Implement template generators
            // request = getTemplateSuggestions(generator, context);
            request = Promise.resolve(undefined);
        }
        else if (generator.script) {
            request = (0, scriptSuggestionsGenerator_1.getScriptSuggestions)(generator, context, undefined, // getSetting<number>(SETTINGS.SCRIPT_TIMEOUT, 5000),
            executeExternals);
        }
        else {
            request = (0, customSuggestionsGenerator_1.getCustomSuggestions)(generator, context, executeExternals);
            // filepaths/folders templates are now a sugar for two custom generators, we need to filter
            // the suggestion created by those two custom generators
            // if (generator.filterTemplateSuggestions) {
            // 	request = (async () => {
            // 		// TODO: use symbols to detect if the the generator fn is filepaths/folders
            // 		// If the first custom suggestion has template meta properties then all the custom
            // 		// suggestions are too
            // 		const suggestions = await request;
            // 		if (suggestions[0] && isTemplateSuggestion(suggestions[0])) {
            // 			return generator.filterTemplateSuggestions!(
            // 				suggestions as Fig.TemplateSuggestion[],
            // 			);
            // 		}
            // 		return suggestions;
            // 	})();
            // }
        }
        return { ...currentState, loading: true, request };
    };
    const triggerGenerators = (parserResult, executeExternals) => {
        const { parserResult: { currentArg: previousArg, searchTerm: previousSearchTerm }, } = state;
        const { currentArg, searchTerm } = parserResult;
        const generators = currentArg?.generators ?? [];
        const context = getGeneratorContext({ ...state, parserResult });
        return generators.map((generator, index) => {
            const { trigger } = generator;
            const previousGeneratorState = state.generatorStates[index];
            let shouldTrigger = false;
            if (!previousGeneratorState || currentArg !== previousArg) {
                shouldTrigger = true;
            }
            else if (trigger === undefined) {
                // If trigger is undefined we never trigger, unless debounced in
                // which case we always trigger.
                // TODO: move debounce to generator.
                shouldTrigger = Boolean(currentArg?.debounce);
            }
            else {
                let triggerFn;
                if (typeof trigger === 'string') {
                    triggerFn = (a, b) => a.lastIndexOf(trigger) !== b.lastIndexOf(trigger);
                }
                else if (typeof trigger === 'function') {
                    triggerFn = trigger;
                }
                else {
                    switch (trigger.on) {
                        case 'threshold': {
                            triggerFn = (a, b) => a.length > trigger.length && !(b.length > trigger.length);
                            break;
                        }
                        case 'match': {
                            const strings = typeof trigger.string === 'string'
                                ? [trigger.string]
                                : trigger.string;
                            triggerFn = (a, b) => strings.findIndex((x) => x === a) !==
                                strings.findIndex((x) => x === b);
                            break;
                        }
                        case 'change':
                        default: {
                            triggerFn = (a, b) => a !== b;
                            break;
                        }
                    }
                }
                try {
                    shouldTrigger = triggerFn(searchTerm, previousSearchTerm);
                }
                catch (_err) {
                    shouldTrigger = true;
                }
            }
            if (!shouldTrigger) {
                return previousGeneratorState;
            }
            const result = previousGeneratorState?.result || [];
            const generatorState = { generator, context, result, loading: true };
            const getTriggeredState = () => triggerGenerator(generatorState, executeExternals);
            if (currentArg?.debounce) {
                (0, utils_1.sleep)(typeof currentArg.debounce === 'number' && currentArg.debounce > 0
                    ? currentArg.debounce
                    : 200); //.then(() => updateGenerator(generatorState, getTriggeredState));
                return generatorState;
            }
            return getTriggeredState();
        });
    };
    return { triggerGenerators };
};
exports.createGeneratorState = createGeneratorState;
//# sourceMappingURL=generators.js.map