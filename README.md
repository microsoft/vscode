# Pear: The Best AI-Powered Code Editor

Supercharge your development in an editor designed for less coding, with AI. This repository is a fork of VSCode.

This is the main app for PearAI. The bulk of the functionality is within `extension/pearai`. We recommend simply working within that submodule, by cloning https://github.com/trypear/pearai-app/.

# PearAI Extension Directory

This is the directory with the bulk of PearAI's functionality. Founded by [nang](https://youtube.com/nang88) and [FryingPan](https://youtube.com/@FryingPan)

To download the full product: visit https://trypear.ai

<!-- prettier-ignore-start -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[Discord](https://discord.gg/dYEy3pma)
[Contributors](#contributors)
<!-- prettier-ignore-end -->

PearAI currently only supports OpenAI (more to come soon). It requires an OpenAI API key. You can get an OpenAI API key from [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys).

## Features

[AI Chat](#ai-chat) | [Generate Code](#generate-code) | [Explain Code](#explain-code) | [Generate Tests](#generate-tests) | [Find Bugs](#find-bugs) | [Diagnose Errors](#diagnose-errors)

### AI Chat

Chat with PearAI about your code and software development topics. PearAI knows the editor selection at the time of conversation start.

### Generate Code

Instruct PearAI to generate code for you.

### Edit Code

Change the selected code by instructing PearAI to create an edit.

### Explain Code

Ask PearAI to explain the selected code.

### Generate Tests

Generate test cases for the selected code.

### Find Bugs

Find potential defects in your code.

### Diagnose Errors

Let PearAI identify error causes and suggest fixes to fix compiler and linter errors faster.

## Running it Locally & Contributing

### [Contributing Guide](CONTRIBUTING.md)

Read our [contributing guide](CONTRIBUTING.md) to learn about our development process, how to propose bugfixes and improvements, and how to build and test your changes.

To help you get your feet wet and become familiar with our contribution process, we have a list of [good first issues](https://github.com/trypear/pearai-app/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22) that contains things with a relatively limited scope. This is a great place to get started!

### Common errors

#### No main.js found
```
[Error: ENOENT: no such file or directory, open 'fryingpan/pearai/out/vs/code/electron-main/main.js'] {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: 'fryingpan/code/pearai/out/vs/code/electron-main/main.js',
  phase: 'loading',
  moduleId: 'vs/code/electron-main/main',
  neededBy: [ '===anonymous1===' ]
}
```
- Remove the build and re-ran script `rm -rf out`
- `./scripts/code.sh`

