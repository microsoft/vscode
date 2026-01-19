/*---------------------------------------------------------------------------------------------
 *  Tool Call Card - 工具调用卡片
 *--------------------------------------------------------------------------------------------*/

import React, { useState } from 'react';
import { ToolCall, ToolCallCardProps } from '../types.js';

export const ToolCallCard: React.FC<ToolCallCardProps> = ({ toolCall }) => {
	const [expanded, setExpanded] = useState(false);

	const getStatusIcon = () => {
		switch (toolCall.status) {
			case 'pending': return '⏳';
			case 'running': return '🔄';
			case 'success': return '✅';
			case 'error': return '❌';
			default: return '❓';
		}
	};

	const getStatusClass = () => {
		switch (toolCall.status) {
			case 'running': return 'running';
			case 'success': return 'success';
			case 'error': return 'error';
			default: return 'pending';
		}
	};

	return (
		<div className={`tool-card ${getStatusClass()}`}>
			<div className="tool-card-header" onClick={() => setExpanded(!expanded)}>
				<span className="tool-icon">🔧</span>
				<span className="tool-name">{toolCall.displayName}</span>
				<span className={`tool-status ${getStatusClass()}`}>
					{getStatusIcon()}
					{toolCall.status === 'running' && <span className="status-text">执行中</span>}
					{toolCall.status === 'success' && <span className="status-text">完成</span>}
					{toolCall.status === 'error' && <span className="status-text">失败</span>}
				</span>
				<span className="tool-expand">{expanded ? '▼' : '▶'}</span>
			</div>

			{expanded && (
				<div className="tool-card-body">
					{/* 参数 */}
					{Object.keys(toolCall.arguments).length > 0 && (
						<div className="tool-section">
							<div className="tool-section-title">参数</div>
							<pre className="tool-args">
								{JSON.stringify(toolCall.arguments, null, 2)}
							</pre>
						</div>
					)}

					{/* 结果 */}
					{toolCall.result && (
						<div className="tool-section">
							<div className="tool-section-title">结果</div>
							<pre className="tool-result">
								{toolCall.result.length > 500
									? toolCall.result.slice(0, 500) + '...'
									: toolCall.result}
							</pre>
						</div>
					)}

					{/* 错误 */}
					{toolCall.error && (
						<div className="tool-section error">
							<div className="tool-section-title">错误</div>
							<pre className="tool-error">{toolCall.error}</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
};
