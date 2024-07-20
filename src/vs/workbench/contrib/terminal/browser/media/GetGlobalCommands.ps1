function Compress-Completions($completions) {
	$completions | ForEach-Object { ,@($_.CompletionText, $_.ResultType, $_.tooltip) }
}

$commands = [System.Management.Automation.CompletionCompleters]::CompleteCommand('')
Compress-Completions($commands) | ConvertTo-Json -Compress
