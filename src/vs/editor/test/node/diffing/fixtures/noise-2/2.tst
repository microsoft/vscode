
const maxPersistedSessions = 25;

export class ChatService extends Disposable implements IChatService {

	private async _sendRequestAsync(model: ChatModel, provider: IChatProvider, message: string | IChatReplyFollowup, usedSlashCommand?: ISlashCommand): Promise<void> {
		const request = model.addRequest(message);

		const resolvedCommand = typeof message === 'string' && message.startsWith('/') ? await this.handleSlashCommand(model.sessionId, message) : message;

		let gotProgress = false;
		const requestType = typeof message === 'string' ?
			(message.startsWith('/') ? 'slashCommand' : 'string') :
			'followup';

		const rawResponsePromise = createCancelablePromise<void>(async token => {
			const progressCallback = (progress: IChatProgress) => {
				if (token.isCancellationRequested) {
					return;
				}

				gotProgress = true;
				if ('content' in progress) {
					this.trace('sendRequest', `Provider returned progress for session ${model.sessionId}, ${progress.content.length} chars`);
				} else {
					this.trace('sendRequest', `Provider returned id for session ${model.sessionId}, ${progress.requestId}`);
				}

				model.acceptResponseProgress(request, progress);
			};

			const stopWatch = new StopWatch(false);
			token.onCancellationRequested(() => {
				this.trace('sendRequest', `Request for session ${model.sessionId} was cancelled`);
				this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					providerId: provider.id,
					timeToFirstProgress: -1,
					// Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
					totalTime: stopWatch.elapsed(),
					result: 'cancelled',
					requestType,
					slashCommand: usedSlashCommand?.command
				});

				model.cancelRequest(request);
			});
			if (usedSlashCommand?.command) {
				this._onDidSubmitSlashCommand.fire({ slashCommand: usedSlashCommand.command, sessionId: model.sessionId });
			}

			let rawResponse: IChatResponse | null | undefined;

			if ((typeof resolvedCommand === 'string' && typeof message === 'string' && this.chatSlashCommandService.hasCommand(resolvedCommand))) {
				// contributed slash commands
				// TODO: spell this out in the UI
				const history: IChatMessage[] = [];
				for (const request of model.getRequests()) {
					if (typeof request.message !== 'string' || !request.response) {
						continue;
					}
					history.push({ role: ChatMessageRole.User, content: request.message });
					history.push({ role: ChatMessageRole.Assistant, content: request.response?.response.value });
				}
				await this.chatSlashCommandService.executeCommand(resolvedCommand, message.substring(resolvedCommand.length + 1).trimStart(), new Progress<IChatSlashFragment>(p => progressCallback(p)), history, token);
				rawResponse = { session: model.session! };

			} else {
				rawResponse = await provider.provideReply({ session: model.session!, message: resolvedCommand }, progressCallback, token);
			}

			if (token.isCancellationRequested) {
				return;
			} else {
				if (!rawResponse) {
					this.trace('sendRequest', `Provider returned no response for session ${model.sessionId}`);
					rawResponse = { session: model.session!, errorDetails: { message: localize('emptyResponse', "Provider returned null response") } };
				}

				const result = rawResponse.errorDetails?.responseIsFiltered ? 'filtered' :
					rawResponse.errorDetails && gotProgress ? 'errorWithOutput' :
						rawResponse.errorDetails ? 'error' :
							'success';
				this.telemetryService.publicLog2<ChatProviderInvokedEvent, ChatProviderInvokedClassification>('interactiveSessionProviderInvoked', {
					providerId: provider.id,
					timeToFirstProgress: rawResponse.timings?.firstProgress ?? 0,
					totalTime: rawResponse.timings?.totalElapsed ?? 0,
					result,
					requestType,
					slashCommand: usedSlashCommand?.command
				});
				model.setResponse(request, rawResponse);
				this.trace('sendRequest', `Provider returned response for session ${model.sessionId}`);

				// TODO refactor this or rethink the API https://github.com/microsoft/vscode-copilot/issues/593
				if (provider.provideFollowups) {
					Promise.resolve(provider.provideFollowups(model.session!, CancellationToken.None)).then(followups => {
						model.setFollowups(request, withNullAsUndefined(followups));
						model.completeResponse(request);
					});
				} else {
					model.completeResponse(request);
				}
			}
		});
		this._pendingRequests.set(model.sessionId, rawResponsePromise);
		rawResponsePromise.finally(() => {
			this._pendingRequests.delete(model.sessionId);
		});
		return rawResponsePromise;
	}
}
