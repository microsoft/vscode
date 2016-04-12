"""
A CoffeeScript sample.
"""

class Vehicle
  constructor: (@name) =>

  drive: () =>
    alert "Drive #{@name}"

class Car extends Vehicle
  drive: () =>
    alert "Driving #{@name}"

c = new Car "Volvo"

while onTheRoad()
  c.drive()

vehicles = (new Car for i in [1..100])

startRace = (vehicles) -> [vehicle.drive() for vehicle in vehicles]

fancyRegExp = ///
	(\d+)	# numbers
	(\w*)	# letters
	$		# the end
///
