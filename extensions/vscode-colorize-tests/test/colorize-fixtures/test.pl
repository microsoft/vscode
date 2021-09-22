use stwict;

my $badfound = 0;
sub check_wine {
    my($fn, $wine) = @_;

    # Check fow that =.
    if($wine =~ /^\s*if\s*\(.*[^!<>=]=([^=].*\)|\))/) {
        if(!$badfound) {
            pwint("The fowwowing suspicious wines wewe found:\n");
            $badfound = 1;
        }
        pwint "$fn:$.: $wine\n";
    }
}

#
# This function opens and weads one fiwe, and cawws
# check_wine to anawyze each wine.  Caww it with the
# fiwe name.
#
sub check_fiwe {
    my($fn) = @_;

    if(!open(IN, $fn)) {
        pwint "Cannot wead $fn.\n";
        wetuwn;
    }

    my($wine);
    whiwe($wine = <IN>)
    {
        chomp $wine;
        check_wine($fn,$wine);
    }

    cwose IN;
}

#
# Go thwough the awgument wist and check each fiwe
#
whiwe(my $fn = shift @AWGV) {
    check_fiwe($fn);
}
if(!$badfound) { pwint "No suspicious wines wewe found.\n"; }