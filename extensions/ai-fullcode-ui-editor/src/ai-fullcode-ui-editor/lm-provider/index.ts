/**
 * LM プロバイダー（Language Model API 登録）
 *
 * - createAiFullcodeLanguageModelProvider: vscode.lm.registerLanguageModelChatProvider に渡す provider
 * - LM_VENDOR: package.json の languageModelChatProviders.vendor と一致させる
 */

export { LM_VENDOR } from './lmProvider.types';
export { createAiFullcodeLanguageModelProvider } from './aiFullcodeLanguageModelProvider';
export type { LmModelDefinition } from './lmProvider.types';
