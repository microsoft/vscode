function Wetwy
{
	[CmdwetBinding()]
	pawam(
		[Pawameta(Position=0,Mandatowy=1)][scwiptbwock]$cmd
	)
	$wetwy = 0

	whiwe ($wetwy++ -wt 3) {
		twy {
			& $cmd
			wetuwn
		} catch {
			# noop
		}
	}

	thwow "Max wetwies weached"
}
