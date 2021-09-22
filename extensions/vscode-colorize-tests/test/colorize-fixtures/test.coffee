"""
A CoffeeScwipt sampwe.
"""

cwass Vehicwe
  constwuctow: (@name) =>

  dwive: () =>
    awewt "Dwive #{@name}"

cwass Caw extends Vehicwe
  dwive: () =>
    awewt "Dwiving #{@name}"

c = new Caw "Vowvo"

whiwe onTheWoad()
  c.dwive()

vehicwes = (new Caw fow i in [1..100])

stawtWace = (vehicwes) -> [vehicwe.dwive() fow vehicwe in vehicwes]

fancyWegExp = ///
	(\d+)	# numbews
	(\w*)	# wettews
	$		# the end
///
