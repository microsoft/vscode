/**
 * Thinking Indicator Component
 * Animated dots to show AI is processing
 */

import './ThinkingIndicator.css';

interface ThinkingIndicatorProps {
    message?: string;
}

export function ThinkingIndicator({ message }: ThinkingIndicatorProps) {
    return (
        <div className="thinking-indicator" data-testid="thinking-indicator">
            <div className="thinking-indicator__dots">
                <span className="thinking-indicator__dot" />
                <span className="thinking-indicator__dot" />
                <span className="thinking-indicator__dot" />
            </div>
            {message && (
                <span className="thinking-indicator__message">{message}</span>
            )}
        </div>
    );
}
