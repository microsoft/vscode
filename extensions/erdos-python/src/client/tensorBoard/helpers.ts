// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// While it is uncommon for users to `import tensorboard`, TensorBoard is frequently
// included as a submodule of other packages, e.g. torch.utils.tensorboard.
// This is a modified version of the regex from src/client/telemetry/importTracker.ts
// in order to match on imported submodules as well, since the original regex only
// matches the 'main' module.

// RegEx to match `import torch.profiler` or `from torch import profiler`
export const TorchProfilerImportRegEx = /^\s*(?:import (?:(\w+, )*torch\.profiler(, \w+)*))|(?:from torch import (?:(\w+, )*profiler(, \w+)*))/;
