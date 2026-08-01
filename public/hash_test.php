<?php
// Test FNV-1a PHP implementation matching Node.js Math.imul

function imul($a, $b) {
    $a = $a & 0xFFFFFFFF;
    $b = $b & 0xFFFFFFFF;
    if ($a >= 0x80000000) $a = $a - 0x100000000;
    if ($b >= 0x80000000) $b = $b - 0x100000000;
    $r = $a * $b;
    return $r & 0xFFFFFFFF;
}

function fnv1a($str, $seed = 0) {
    $h1 = (0x811c9dc5 ^ $seed) & 0xFFFFFFFF;
    $h2 = 0x01000193;
    $len = strlen($str);
    for ($i = 0; $i < $len; $i++) {
        $c = ord($str[$i]);
        $h1 = imul($h1 ^ $c, 0x01000193);
        $h2 = imul($h2 ^ $c, 0x811c9dc5);
    }
    return sprintf("%08x%08x", $h1, $h2);
}

function hashPassword($pw, $salt) {
    $combined = $salt . ':' . $pw;
    $parts = [];
    for ($s = 0; $s < 4; $s++) {
        $r = $combined . ':' . $s;
        for ($i = 0; $i < 10000; $i++) {
            $r = fnv1a($r, $s * 0x12345 + $i);
        }
        $parts[] = $r;
    }
    return implode('', $parts);
}

$salt = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
$hash = hashPassword('123456', $salt);
echo "PHP: $hash\n";
echo "Expected: 1710cd497fbbfdb03fd042f676e83fe232f97db8afd96781771b00f43dc1dc06\n";
echo "Match: " . ($hash === '1710cd497fbbfdb03fd042f676e83fe232f97db8afd96781771b00f43dc1dc06' ? 'YES' : 'NO') . "\n";
