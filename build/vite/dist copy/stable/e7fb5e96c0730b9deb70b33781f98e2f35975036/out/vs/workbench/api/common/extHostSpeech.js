/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CancellationTokenSource } from '../../../base/common/cancellation.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { MainContext } from './extHost.protocol.js';
export class ExtHostSpeech {
    static { this.ID_POOL = 1; }
    constructor(mainContext) {
        this.providers = new Map();
        this.sessions = new Map();
        this.synthesizers = new Map();
        this.proxy = mainContext.getProxy(MainContext.MainThreadSpeech);
    }
    async $createSpeechToTextSession(handle, session, language) {
        const provider = this.providers.get(handle);
        if (!provider) {
            return;
        }
        const disposables = new DisposableStore();
        const cts = new CancellationTokenSource();
        this.sessions.set(session, cts);
        const speechToTextSession = await provider.provideSpeechToTextSession(cts.token, language ? { language } : undefined);
        if (!speechToTextSession) {
            return;
        }
        disposables.add(speechToTextSession.onDidChange(e => {
            if (cts.token.isCancellationRequested) {
                return;
            }
            this.proxy.$emitSpeechToTextEvent(session, e);
        }));
        disposables.add(cts.token.onCancellationRequested(() => disposables.dispose()));
    }
    async $cancelSpeechToTextSession(session) {
        this.sessions.get(session)?.dispose(true);
        this.sessions.delete(session);
    }
    async $createTextToSpeechSession(handle, session, language) {
        const provider = this.providers.get(handle);
        if (!provider) {
            return;
        }
        const disposables = new DisposableStore();
        const cts = new CancellationTokenSource();
        this.sessions.set(session, cts);
        const textToSpeech = await provider.provideTextToSpeechSession(cts.token, language ? { language } : undefined);
        if (!textToSpeech) {
            return;
        }
        this.synthesizers.set(session, textToSpeech);
        disposables.add(textToSpeech.onDidChange(e => {
            if (cts.token.isCancellationRequested) {
                return;
            }
            this.proxy.$emitTextToSpeechEvent(session, e);
        }));
        disposables.add(cts.token.onCancellationRequested(() => disposables.dispose()));
    }
    async $synthesizeSpeech(session, text) {
        this.synthesizers.get(session)?.synthesize(text);
    }
    async $cancelTextToSpeechSession(session) {
        this.sessions.get(session)?.dispose(true);
        this.sessions.delete(session);
        this.synthesizers.delete(session);
    }
    async $createKeywordRecognitionSession(handle, session) {
        const provider = this.providers.get(handle);
        if (!provider) {
            return;
        }
        const disposables = new DisposableStore();
        const cts = new CancellationTokenSource();
        this.sessions.set(session, cts);
        const keywordRecognitionSession = await provider.provideKeywordRecognitionSession(cts.token);
        if (!keywordRecognitionSession) {
            return;
        }
        disposables.add(keywordRecognitionSession.onDidChange(e => {
            if (cts.token.isCancellationRequested) {
                return;
            }
            this.proxy.$emitKeywordRecognitionEvent(session, e);
        }));
        disposables.add(cts.token.onCancellationRequested(() => disposables.dispose()));
    }
    async $cancelKeywordRecognitionSession(session) {
        this.sessions.get(session)?.dispose(true);
        this.sessions.delete(session);
    }
    registerProvider(extension, identifier, provider) {
        const handle = ExtHostSpeech.ID_POOL++;
        this.providers.set(handle, provider);
        this.proxy.$registerProvider(handle, identifier, { extension, displayName: extension.value });
        return toDisposable(() => {
            this.proxy.$unregisterProvider(handle);
            this.providers.delete(handle);
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFNwZWVjaC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RTcGVlY2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDL0UsT0FBTyxFQUFFLGVBQWUsRUFBZSxZQUFZLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRixPQUFPLEVBQW9DLFdBQVcsRUFBeUIsTUFBTSx1QkFBdUIsQ0FBQztBQUk3RyxNQUFNLE9BQU8sYUFBYTthQUVWLFlBQU8sR0FBRyxDQUFDLEFBQUosQ0FBSztJQVEzQixZQUNDLFdBQXlCO1FBTFQsY0FBUyxHQUFHLElBQUksR0FBRyxFQUFpQyxDQUFDO1FBQ3JELGFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBbUMsQ0FBQztRQUN0RCxpQkFBWSxHQUFHLElBQUksR0FBRyxFQUFzQyxDQUFDO1FBSzdFLElBQUksQ0FBQyxLQUFLLEdBQUcsV0FBVyxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztJQUNqRSxDQUFDO0lBRUQsS0FBSyxDQUFDLDBCQUEwQixDQUFDLE1BQWMsRUFBRSxPQUFlLEVBQUUsUUFBaUI7UUFDbEYsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDNUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ2YsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBRTFDLE1BQU0sR0FBRyxHQUFHLElBQUksdUJBQXVCLEVBQUUsQ0FBQztRQUMxQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxPQUFPLEVBQUUsR0FBRyxDQUFD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