function Retry
{
	[CmdletBinding()]
	param(
		[Parameter(Position=0,Mandatory=1)][scriptblock]$cmd
	)
	$retry = 0

	while ($retry++ -lt 3) {
		try {
			& $cmd
			return
		} catch {
			Write-Error -ErrorRecord $_
		}
	}

	throw "Max retries reached"
}
