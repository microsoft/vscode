<?php

declare(strict_types=1);

$jsCode = '/* <![CDATA[ */ var data = {"a": 1, "b": 2} /* ]]> */;';
$jsCode = str_replace("/* <![CDATA[ */", '', $jsCode);
$jsCode = str_replace("/* ]]> */", '', $jsCode);
preg_match('/^foo.*bar$/i', $jsCode);
preg_match("/^foo.*bar$/i", $jsCode);
var_dump($jsCode);
