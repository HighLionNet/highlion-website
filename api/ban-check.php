<?php
declare(strict_types=1);
// Nginx internal subrequest only; this file is outside the public API allowlist.
require_once __DIR__ . '/_lib.php';
http_response_code(204);
header('Cache-Control: no-store');
