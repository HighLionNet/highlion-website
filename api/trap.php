<?php
declare(strict_types=1);

require_once __DIR__ . '/_lib.php';

hl_alert('PATH private-file', 'sensitive path / traversal trap', true);

http_response_code(403);
header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
echo 'Forbidden';
exit;
