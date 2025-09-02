/*---------------------------------------------------------------------------------------------
 *  Copyright (c) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IThinkingProcessor } from '../common/thinkingProcessor.js';

export class ThinkingProcessor extends Disposable implements IThinkingProcessor {
	readonly _serviceBrand: undefined;

	private streamingBuffer: string = '';

	constructor() {
		super();
	}

	processThinkingTagsWithBuffer(delta: string): string {
		this.streamingBuffer += delta;
		
		let processed = this.streamingBuffer.replace(
			/<thinking>([\s\S]*?)<\/thinking>/g,
			'<em class="erdos-ai-thinking">$1</em>'
		);
		
		const incompleteOpenMatch = processed.match(/<thinking(?:\s[^>]*)?$/);
		if (incompleteOpenMatch) {
			const incompleteTag = incompleteOpenMatch[0];
			const output = processed.substring(0, processed.length - incompleteTag.length);
			this.streamingBuffer = incompleteTag;
			return output;
		}
		
		const incompleteCloseMatch = processed.match(/<\/thinking?(?:\s[^>]*)?$/);
		if (incompleteCloseMatch) {
			const incompleteTag = incompleteCloseMatch[0];
			const output = processed.substring(0, processed.length - incompleteTag.length);
			this.streamingBuffer = incompleteTag;
			return output;
		}
		
		processed = processed.replace(/<thinking>/g, '<em class="erdos-ai-thinking">');
		processed = processed.replace(/<\/thinking>/g, '</em>');
		
		const result = processed;
		this.streamingBuffer = '';
		return result;
	}

	resetThinkingBuffer(): void {
		this.streamingBuffer = '';
	}

	processThinkingTagsComplete(content: string): string {
		let processed = content.replace(
			/<thinking>([\s\S]*?)<\/thinking>/g,
			'<em class="erdos-ai-thinking">$1</em>'
		);
		
		processed = processed.replace(/<thinking>/g, '<em class="erdos-ai-thinking">');
		processed = processed.replace(/<\/thinking>/g, '</em>');
		
		return processed;
	}

	shouldAutoShowThinkingMessage(): boolean {
		return false;
	}
}
