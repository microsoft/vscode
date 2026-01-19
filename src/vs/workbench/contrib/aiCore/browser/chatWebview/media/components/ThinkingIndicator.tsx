/*---------------------------------------------------------------------------------------------
 *  Thinking Indicator - 思考过程指示器
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { ThinkingIndicatorProps } from '../types.js';

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ content }) => {
	return (
		<div className="thinking-indicator">
			<div className="thinking-dots">
				<span />
				<span />
				<span />
			</div>
			<span className="thinking-text">
				{content || '思考中...'}
			</span>
		</div>
	);
};
