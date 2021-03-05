die("[$sheet->{label}] Unexpected sheet format.") unless (
        $sheet->{"$date_col$row"} =~ /CALL_DATE/i &&
        $sheet->{"$pixel_cols[4]$row"} =~ /Home_Bind_Count/i 
    );

    $row++;
    while ($row < $sheet->{maxrow}) {
        $row++;
        $total_lines++;

        my $date = $sheet->{"$date_col$row"};
        next unless $date;
        (warning "Unexpected date format: '$date'"), next unless ($date =~ /^2\d\d\d-\d\d-\d\d$/);

        my $phone = trim($sheet->{"$phone_col$row"});
        (warning "Unexpected phone format: '$phone'."), next unless ($phone =~ /^\d{10}$/);

        info $phone;
        next if ($date gt $date_to || $date lt $date_from);

        my @pixels = (0) x 5;
        for (1..4) {
            $pixels[$_] = trim($sheet->{"$pixel_cols[4]$row"});
            (warning "Pixel $_ is not a number in the row # $row."), next unless looks_like_number($pixels[$_]);
        };

        for (1..4) {
            add_phone_activity($date, $phone, "pixel-$_", $pixels[$_]) if $pixels[$_];
        };
        $parsed_lines++;
    };