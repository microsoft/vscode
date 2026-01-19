# IAICoreService 接口草案（v0）

本接口作为“Cursor 内核”统一出口，负责模型调用、上下文构建与工具执行。

## 类型草案
```ts
export interface IAICoreService {
	_serviceBrand: undefined;

	sendRequest(req: AICoreRequest, options?: AICoreRequestOptions): Promise<AICoreResponse>;
	buildContext(req: AICoreRequest, options?: AICoreContextOptions): Promise<AICoreContext>;
	runTools(plan: AICoreToolPlan, options?: AICoreToolOptions): Promise<AICoreToolResult>;
	applyEdits(edits: AICoreEdits, options?: AICoreEditOptions): Promise<AICoreEditResult>;
}

export interface AICoreRequest {
	sessionId: string;
	message: string;
	mode?: 'chat' | 'inline' | 'edit' | 'agent';
	agentId?: string;
	modelId?: string;
	userContext?: AICoreContextHint;
}

export interface AICoreResponse {
	content: string;
	parts?: AICoreResponsePart[];
	toolPlan?: AICoreToolPlan;
	edits?: AICoreEdits;
	meta?: AICoreResponseMeta;
}
```

## 响应分段建议
```ts
export type AICoreResponsePart =
	| { kind: 'markdown'; value: string }
	| { kind: 'code'; value: string; language?: string }
	| { kind: 'progress'; value: string }
	| { kind: 'tool'; value: AICoreToolInvocation }
	| { kind: 'edits'; value: AICoreEdits };
```

## 上下文结构建议
```ts
export interface AICoreContext {
	files: Array<{ uri: string; content: string; ranges?: Array<[number, number]> }>;
	snippets?: Array<{ uri: string; snippet: string }>;
	search?: Array<{ uri: string; score: number; excerpt: string }>;
}
```

## 工具执行草案
```ts
export interface AICoreToolPlan {
	steps: AICoreToolInvocation[];
}

export interface AICoreToolInvocation {
	id: string;
	toolId: string;
	input: unknown;
	requireConfirmation?: boolean;
}
```

## 编辑应用草案
```ts
export interface AICoreEdits {
	changes: Array<{
		uri: string;
		edits: Array<{ range: [number, number, number, number]; text: string }>;
	}>;
}
```

