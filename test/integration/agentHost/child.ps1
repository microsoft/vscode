# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.

param(
	[Parameter(Mandatory = $true)]
	[string]$TestScript,

	[Parameter(ValueFromRemainingArguments = $true)]
	[string[]]$TestArguments
)

& $TestScript @TestArguments
exit $LASTEXITCODE
