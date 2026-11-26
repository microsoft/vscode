// Copyright 2025 OpenAI

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//        http://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Based on the Codex implementation https://github.com/openai/codex/blob/b73426c1c40187ca13c74c03912a681072c2884f/codex-cli/src/parse-apply-patch.ts#L1

/* eslint-disable header/header */
export const PATCH_PREFIX = '*** Begin Patch\n';
export const PATCH_SUFFIX = '\n*** End Patch';
export const ADD_FILE_PREFIX = '*** Add File: ';
export const DELETE_FILE_PREFIX = '*** Delete File: ';
export const UPDATE_FILE_PREFIX = '*** Update File: ';
export const MOVE_FILE_TO_PREFIX = '*** Move to: ';
export const END_OF_FILE_PREFIX = '*** End of File';
export const HUNK_ADD_LINE_PREFIX = '+';
export const HUNK_DELETE_LINE_PREFIX = '-';
