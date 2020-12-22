import { CancelablePromise, createCancelablePromise, RunOnceScheduler } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { onUnexpectedError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { SignatureArgumentsLabelProviderRegistry, SignatureArgumentsLabelProvider, SignatureArgumentsSignature, SignatureArgumentsLabelList } from 'vs/editor/common/modes';
import { LanguageFeatureRequestDelays } from 'vs/editor/common/modes/languageFeatureRegistry';

export interface SignatureArgumentsLabelItem {
	signature: SignatureArgumentsSignature;
	provider: SignatureArgumentsLabelProvider;
}


class SignatureArgumentsLabelModel {
	signatures: SignatureArgumentsLabelItem[] = [];

	private readonly _disposables = new DisposableStore();

	dispose(): void {
		this._disposables.dispose();
	}

	add(list: SignatureArgumentsLabelList, provider: SignatureArgumentsLabelProvider): void {
		this._disposables.add(list);
		for (const signature of list.signatures) {
			this.signatures.push({ signature, provider });
		}
	}
}

async function getSignatureArgumentsLabelModel(model: ITextModel, token: CancellationToken) {
	const provider = SignatureArgumentsLabelProviderRegistry.ordered(model);
	const providerRanks = new Map<SignatureArgumentsLabelProvider, number>();
	const result = new SignatureArgumentsLabelModel();

	const promises = provider.map(async (provider, i) => {

		providerRanks.set(provider, i);

		try {
			const list = await Promise.resolve(provider.provideSignatureArgumentsLabels(model, token));
			if (list) {
				result.add(list, provider);
			}
		} catch (err) {
			onUnexpectedExternalError(err);
		}
	});

	await Promise.all(promises);
	return result;
}

class SignatureArgumentsLabelController implements IEditorContribution {

	public static readonly ID = 'editor.contrib.signatureArgumentsLabel';

	static get(editor: ICodeEditor): SignatureArgumentsLabelController {
		return editor.getContribution<SignatureArgumentsLabelController>(SignatureArgumentsLabelController.ID);
	}

	private readonly _disposables = new DisposableStore();

	private readonly _getSignatureArgumentsLabelModelDelays = new LanguageFeatureRequestDelays(SignatureArgumentsLabelProviderRegistry, 250, 2500);
	private _getSignatureArgumentsLabelModelPromise: CancelablePromise<SignatureArgumentsLabelModel> | undefined;
	private _oldSignatureArgumentsLabelModels = new DisposableStore();
	private _currentSignatureArgumentsLabelModel: SignatureArgumentsLabelModel | undefined;

	constructor(
		private readonly _editor: ICodeEditor
	) {
		this._disposables.add(this._editor.onDidChangeModel(() => this._onModelChange()));
		this._disposables.add(this._editor.onDidChangeModelLanguage(() => this._onModelChange()));
		this._disposables.add(this._editor.onDidChangeConfiguration((e) => {

		}));
		this._disposables.add(SignatureArgumentsLabelProviderRegistry.onDidChange(this._onModelChange, this));
		this._onModelChange();
	}

	dispose(): void {
		this._localDispose();
		this._disposables.dispose();
	}

	private _localDispose(): void {

	}

	private _onModelChange(): void {
		this._localDispose();

		const model = this._editor.getModel();
		if (!model) {
			return;
		}

		if (!this._editor.getOption(EditorOption.signatureArgumentsLabel)) {
			return;
		}

		const scheduler = new RunOnceScheduler(() => {
			const t1 = Date.now();

			this._getSignatureArgumentsLabelModelPromise?.cancel();
			this._getSignatureArgumentsLabelModelPromise = createCancelablePromise(token => getSignatureArgumentsLabelModel(model, token));

			this._getSignatureArgumentsLabelModelPromise.then(result => {
				if (this._currentSignatureArgumentsLabelModel) {
					this._oldSignatureArgumentsLabelModels.add(this._currentSignatureArgumentsLabelModel);
				}
				this._currentSignatureArgumentsLabelModel = result;

				// update moving average
				const newDelay = this._getSignatureArgumentsLabelModelDelays.update(model, Date.now() - t1);
				scheduler.delay = newDelay;

				// render lenses
				this._renderSignatureArgumentsLabels(result);
			}, onUnexpectedError);

		}, this._getSignatureArgumentsLabelModelDelays.get(model));
	}

	_renderSignatureArgumentsLabels(result: SignatureArgumentsLabelModel) {

	}
}

registerEditorContribution(SignatureArgumentsLabelController.ID, SignatureArgumentsLabelController);
