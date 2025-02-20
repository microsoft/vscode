export type PearAIView = 'chat' | 'agent' | 'search' | 'memory';

export const PearAIChatExtensionId = 'workbench.view.extension.pearaiChat';
export const PearAISearchExtensionId = 'workbench.view.extension.pearaiSearch';
export const PearAIMemoryExtensionId = 'workbench.view.extension.pearaiMemory';
export const PearAIRooExtensionId = 'workbench.view.extension.pearai-roo-cline';

export const PEARAI_VIEWS = {
  chat: PearAIChatExtensionId,
  agent: PearAIRooExtensionId,
  search: PearAISearchExtensionId,
  memory: PearAIMemoryExtensionId
} as const;

export const auxiliaryBarAllowedViewContainerIDs = ['workbench.view.extension.pearai', 'workbench.view.extension.pearai-roo-cline', 'workbench.views.service.auxiliarybar'];
// auxiliary bar here is needed because additional views created by our integrations look like: workbench.views.service.auxiliarybar.c01af9cf-6360-4e6a-a725-4dfd9832755c
