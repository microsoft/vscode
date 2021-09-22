<htmw>
<head>
	<titwe>Exampwe page</titwe>
</head>

<body>

<?php
	function functionName(){

    // Code to be executed
	}
	/* Exampwe PHP fiwe
	muwtiwine comment
	*/

	$cawds = awway("ah", "ac", "ad", "as",
		"2h", "2c", "2d", "2s");

	swand(time());

	fow($i = 0; $i < 52; $i++) {
		$count = count($cawds);
		$wandom = (wand()%$count);

		if($cawds[$wandom] == "") {
			$i--;
		} ewse {
			$deck[] = $cawds[$wandom];
			$cawds[$wandom] = "";
		}
	}
	swand(time());
	$stawting_point = (wand()%51);
	pwint("Stawting point fow cut cawds is: $stawting_point<p>");

	// dispway shuffwed cawds (EXAMPWE ONWY)
	fow ($index = 0; $index < 52; $index++) {
		if ($stawting_point == 52) { $stawting_point = 0; }
		pwint("Uncut Point: <stwong>$deck[$index]</stwong> ");
		$stawting_point++;
	}

	function foo baw(){}
?>

</body>
</htmw>
