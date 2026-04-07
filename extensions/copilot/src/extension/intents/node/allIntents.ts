/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { SyncDescriptor } from '../../../util/vs/platform/instantiation/common/descriptors';
import { InlineChatIntent } from '../../inlineChat/node/inlineChatIntent';
import { IntentRegistry } from '../../prompt/node/intentRegistry';
import { AgentIntent } from './agentIntent';
import { AskAgentIntent } from './askAgentIntent';
import { InlineDocIntent } from './docIntent';
import { EditCodeIntent } from './editCodeIntent';
import { ExplainIntent } from './explainIntent';
import { FixIntent } from './fixIntent';
import { GenerateCodeIntent } from './generateCodeIntent';
import { NewWorkspaceIntent } from './newIntent';
import { NewNotebookIntent } from './newNotebookIntent.contribution';
import { NotebookEditorIntent } from './notebookEditorIntent';
import { ReviewIntent } from './reviewIntent';
import { SearchIntent } from './searchIntent';
import { SearchKeywordsIntent } from './searchKeywordsIntent';
import { SearchPanelIntent } from './searchPanelIntent';
import { SetupTestsIntent } from './setupTests';
import { TerminalExplainIntent } from './terminalExplainIntent';
import { TerminalIntent } from './terminalIntent';
import { TestsIntent } from './testIntent/testIntent';
import { UnknownIntent } from './unknownIntent';
import { VscodeIntent } from './vscodeIntent';

IntentRegistry.setIntents([
	new SyncDescriptor(InlineDocIntent),
	new SyncDescriptor(EditCodeIntent),
	new SyncDescriptor(AgentIntent),
	new SyncDescriptor(SearchIntent),
	new SyncDescriptor(TestsIntent),
	new SyncDescriptor(FixIntent),
	new SyncDescriptor(ExplainIntent),
	new SyncDescriptor(ReviewIntent),
	new SyncDescriptor(TerminalIntent),
	new SyncDescriptor(TerminalExplainIntent),
	new SyncDescriptor(UnknownIntent),
	new SyncDescriptor(GenerateCodeIntent),
	new SyncDescriptor(NewNotebookIntent),
	new SyncDescriptor(NewWorkspaceIntent),
	new SyncDescriptor(VscodeIntent),
	new SyncDescriptor(SetupTestsIntent),
	new SyncDescriptor(SearchPanelIntent),
	new SyncDescriptor(SearchKeywordsIntent),
	new SyncDescriptor(AskAgentIntent),
	new SyncDescriptor(NotebookEditorIntent),
	new SyncDescriptor(InlineChatIntent)
]);
