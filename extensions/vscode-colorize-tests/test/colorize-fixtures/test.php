<html>
<head>
	<title>Example page</title>
</head>

<body>

<?php
	function functionName(){

    // Code to be executed
	}
	/* Example PHP file
	multiline comment
	*/

	$cards = array("ah", "ac", "ad", "as",
		"2h", "2c", "2d", "2s");

	srand(time());

	for($i = 0; $i < 52; $i++) {
		$count = count($cards);
		$random = (rand()%$count);

		if($cards[$random] == "") {
			$i--;
		} else {
			$deck[] = $cards[$random];
			$cards[$random] = "";
		}
	}
	srand(time());
	$starting_point = (rand()%51);
	print("Starting point for cut cards is: $starting_point<p>");

	// display shuffled cards (EXAMPLE ONLY)
	for ($index = 0; $index < 52; $index++) {
		if ($starting_point == 52) { $starting_point = 0; }
		print("Uncut Point: <strong>$deck[$index]</strong> ");
		$starting_point++;
	}

	function foo bar(){}
?>

</body>
</html>
