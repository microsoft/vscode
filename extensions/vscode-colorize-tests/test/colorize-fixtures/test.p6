# Example taken from https://en.wikipedia.org/wiki/Raku_(programming_language)
class Point is rw {
    has $.x;
    has $.y;

    method distance( Point $p ) {
        sqrt(($!x - $p.x) ** 2 + ($!y - $p.y) ** 2)
    }

    method distance-to-center {
        self.distance: Point.new(x => 0, y => 0)
    }
}

my $point = Point.new( x => 1.2, y => -3.7 );
say "Point's location: (", $point.x, ', ', $point.y, ')';
# OUTPUT: Point's location: (1.2, -3.7)

# Changing x and y (note methods "x" and "y" used as lvalues):
$point.x = 3;
$point.y = 4;
say "Point's location: (", $point.x, ', ', $point.y, ')';
# OUTPUT: Point's location: (3, 4)

my $other-point = Point.new(x => -5, y => 10);
$point.distance($other-point); #=> 10
$point.distance-to-center;     #=> 5
