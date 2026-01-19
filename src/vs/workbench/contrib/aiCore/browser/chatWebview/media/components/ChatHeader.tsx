/*---------------------------------------------------------------------------------------------
 *  Chat Header - 模式切换和设置
 *--------------------------------------------------------------------------------------------*/

import React from 'react';
import { ChatMode, ChatHeaderProps } from '../types.js';

export const ChatHeader: React.FC<ChatHeaderProps> = ({ mode, onModeChange }) => {
	return (
		<header className="chat-header">
			<div className="chat-header-left">
				<span className="chat-header-title">
					<span className="chat-icon">💬</span>
					AI Chat
				</span>
			</div>

			<div className="mode-switch">
				<button
					className={`mode-btn ${mode === 'vibe' ? 'active' : ''}`}
					onClick={() => onModeChange('vibe')}
					title="Vibe 模式 - 快速迭代，边聊边做"
				>
					<span className="mode-icon">⚡</span>
					<span className="mode-label">Vibe</span>
				</button>
				<button
					className={`mode-btn ${mode === 'spec' ? 'active' : ''}`}
					onClick={() => onModeChange('spec')}
					title="Spec 模式 - 先规划，后执行"
				>
					<span className="mode-icon">📋</span>
					<span className="mode-label">Spec</span>
				</button>
			</div>

			<div className="chat-header-right">
				<button className="header-btn" title="设置">
					⚙️
				</button>
				<button className="header-btn" title="清除历史">
					🗑️
				</button>
			</div>
		</header>
	);
};
