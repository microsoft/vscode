export enum TensorBoardPromptSelection {
    Yes = 'yes',
    No = 'no',
    DoNotAskAgain = 'doNotAskAgain',
    None = 'none',
}

export enum TensorBoardEntrypointTrigger {
    tfeventfiles = 'tfeventfiles',
    fileimport = 'fileimport',
    nbextension = 'nbextension',
    palette = 'palette',
}

export enum TensorBoardSessionStartResult {
    cancel = 'canceled',
    success = 'success',
    error = 'error',
}

export enum TensorBoardEntrypoint {
    prompt = 'prompt',
    codelens = 'codelens',
    palette = 'palette',
}
