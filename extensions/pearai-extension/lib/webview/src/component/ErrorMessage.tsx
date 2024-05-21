import { webviewApi } from "@pearai/common";
import React from "react";
import ReactMarkdown from "react-markdown";

export function ErrorMessage({
	error,
	onClickDismiss,
	onClickRetry,
}: {
	error: webviewApi.Error;
	onClickDismiss: () => void;
	onClickRetry: () => void;
}) {
	return typeof error === "string" ? (
		<div key="error" className="message bot error error-body">
			<span className="error-message">Error: {error}</span>
			<span className="error-retry" onClick={onClickRetry}>
				<i className="codicon codicon-debug-restart inline" />
				<span>Retry</span>
			</span>
		</div>
	) : (
		<div key="error" className={`message bot error level-${error.level}`}>
			<span className="error-title">
				<ReactMarkdown>{error.title}</ReactMarkdown>
			</span>
			<span className="error-message">
				<ReactMarkdown>{error.message}</ReactMarkdown>
			</span>
			<div className="error-buttons">
				{!error.disableDismiss && (
					<button className="error-dismiss" onClick={onClickDismiss}>
						Dismiss
					</button>
				)}
				{!error.disableRetry && (
					<button className="error-retry" onClick={onClickRetry}>
						<i className="codicon codicon-debug-restart inline" />
						<span>Retry</span>
					</button>
				)}
			</div>
		</div>
	);
}
