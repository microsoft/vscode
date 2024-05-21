# Set Up PearAI with OpenAI

PearAI uses the OpenAI API and requires an API key to work. You can get an API key from [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys) (you'll need to sign up for an account).

Once you have an API key, enter it with the `PearAI: Enter OpenAI API key` command.

# Alternative: use local AI models with Llama.cpp (experimental)

You can use PearAI with local models, e.g. [CodeLlama-7B-Instruct](https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF) running in [Llama.cpp](https://github.com/ggerganov/llama.cpp) (see [ModelFusion Llama.cpp setup](https://modelfusion.dev/integration/model-provider/llamacpp#setup)). To enable llama.cpp in PearAI, set the `PearAI: Model` setting to `llama.cpp`.

# PearAI Settings

- **pearai.model**: Select the OpenAI model that you want to use. Supports GPT-3.5-Turbo and GPT-4.
- **pearai.syntaxHighlighting.useVisualStudioCodeColors**: Use the Visual Studio Code Theme colors for syntax highlighting in the diff viewer. Might not work with all themes. Default is `false`.

- **pearai.openAI.baseUrl**: Specify the URL to the OpenAI API. If you are using a proxy, you can set it here.
- **pearai.logger.level**: Specify the verbosity of logs that will appear in 'PearAI: Show Logs'.

- **pearai.action.startChat.showInEditorContextMenu**: Show the "Start chat" action in the editor context menu, when you right-click on the code.
- **pearai.action.editCode.showInEditorContextMenu**: Show the "Edit Code action in the editor context menu, when you right-click on the code.
- **pearai.action.explainCode.showInEditorContextMenu**: Show the "Explain code" action in the editor context menu, when you right-click on the code.
- **pearai.action.findBugs.showInEditorContextMenu**: Show the "Find bugs" action in the editor context menu, when you right-click on the code.
- **pearai.action.generateUnitTest.showInEditorContextMenu**: Show the "Generate unit test" in the editor context menu, when you right-click on the code.
- **pearai.action.diagnoseErrors.showInEditorContextMenu**: Show the "Diagnose errors" in the editor context menu, when you right-click on the code.
