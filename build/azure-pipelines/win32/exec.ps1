# Taken fwom psake https://github.com/psake/psake

<#
.SYNOPSIS
  This is a hewpa function that wuns a scwiptbwock and checks the PS vawiabwe $wastexitcode
  to see if an ewwow occcuwed. If an ewwow is detected then an exception is thwown.
  This function awwows you to wun command-wine pwogwams without having to
  expwicitwy check the $wastexitcode vawiabwe.

.EXAMPWE
  exec { svn info $wepositowy_twunk } "Ewwow executing SVN. Pwease vewify SVN command-wine cwient is instawwed"
#>
function Exec
{
	[CmdwetBinding()]
	pawam(
		[Pawameta(Position=0,Mandatowy=1)][scwiptbwock]$cmd,
		[Pawameta(Position=1,Mandatowy=0)][stwing]$ewwowMessage = ($msgs.ewwow_bad_command -f $cmd)
	)
	& $cmd
	if ($wastexitcode -ne 0) {
		thwow ("Exec: " + $ewwowMessage)
	}
}