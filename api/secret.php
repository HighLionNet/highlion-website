<?php
declare(strict_types=1);
require_once __DIR__ . '/_session.php';
hl_session();
header('X-Robots-Tag: noindex, nofollow');
if (!hl_claims()) { http_response_code(404); exit; }
if (!in_array($_SERVER['REQUEST_METHOD'] ?? '', ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    hl_json(['ok' => false], 405);
}
$pages = [
    'notes' => ['Operator notes', 'The handoff is open.', 'Osprey & Hale remains isolated. The gateway is quiet, the transfer queue is reconciled, and the letterbox is accepting human correspondence. Keep the evidence; question the timestamps.'],
];
$key = isset($_GET['page']) && is_string($_GET['page']) ? $_GET['page'] : 'notes';
if (!isset($pages[$key])) { http_response_code(404); exit; }
[$title, $lead, $body] = $pages[$key];
header('Content-Type: text/html; charset=utf-8');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'HEAD') exit;
?>
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= htmlspecialchars($title) ?> — HighLion</title>
<link rel="icon" href="/assets/icons/HighLion.ico?v=hl8t"><link rel="stylesheet" href="/css/style.css?v=hl8t"></head>
<body><div data-include="/components/header.html?v=hl8t"></div>
<main class="container challenge-page"><section class="xdr-console"><div class="xdr-top"><span>HIGHLION / LAB</span><span>HLv8</span></div>
<div class="challenge-content"><p class="kicker">FIELD NOTES</p><h1><?= htmlspecialchars($title) ?></h1>
<p><?= htmlspecialchars($lead) ?></p><p><?= htmlspecialchars($body) ?></p><a class="btn" href="/ctf.html">Return to challenges</a></div></section></main>
<div data-include="/components/footer.html?v=hl8t"></div>
<script src="/js/fix-include.js?v=hl8t" defer></script><script src="/js/flags.js?v=hl8t" defer></script>
<script src="/js/session-meta.js?v=hl8t" defer></script><script src="/js/station-toggles.js?v=hl8t" defer></script>
</body></html>
