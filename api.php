<?php
// 多人在线点餐系统 — PHP API v3 (Auth-compatible with Node.js)

function ok($data=null, $msg='') {
    $r = ['success'=>true]; if($data!==null) $r['data']=$data; if($msg) $r['message']=$msg;
    echo json_encode($r, JSON_UNESCAPED_UNICODE); exit;
}
function err($msg, $code=400) { echo json_encode(['success'=>false, 'message'=>$msg], JSON_UNESCAPED_UNICODE); exit; }

// ---- KV ----
function kvget($k) { $d = new Database("ordering"); return $d->get($k); }
function kvset($k, $v) { $d = new Database("ordering"); $d->set($k, $v); }
function kvdel($k) { $d = new Database("ordering"); $d->delete($k); }
function kvkeys() { $d = new Database("ordering"); return $d->list_keys(); }
function kvjson($k) { $r = kvget($k); return $r ? json_decode($r, true) : null; }
function kvsetj($k, $d) { kvset($k, json_encode($d, JSON_UNESCAPED_UNICODE)); }

// ---- Auth (Node.js compatible) ----
function fnv1a_32($str, $seed=0) {
    $h1 = 0x811c9dc5 ^ ($seed & 0xFFFFFFFF);
    $h2 = 0x01000193;
    $len = strlen($str);
    for($i = 0; $i < $len; $i++) {
        $c = ord($str[$i]);
        $h1 ^= $c;
        $h1 = ($h1 * 0x01000193) & 0xFFFFFFFF;
        $h2 ^= $c;
        $h2 = ($h2 * 0x811c9dc5) & 0xFFFFFFFF;
    }
    return str_pad(dechex($h1), 8, '0', STR_PAD_LEFT) . str_pad(dechex($h2), 8, '0', STR_PAD_LEFT);
}

function hashPassword($password, $salt) {
    $combined = $salt . ':' . $password;
    $parts = [];
    for($s = 0; $s < 4; $s++) {
        $r = $combined . ':' . $s;
        for($i = 0; $i < 10000; $i++) {
            $r = fnv1a_32($r, $s * 0x12345 + $i);
        }
        $parts[] = $r;
    }
    return implode('', $parts);
}

function generateSalt() {
    $bytes = random_bytes(16);
    $parts = [];
    for($i = 0; $i < 16; $i += 4) {
        $n = unpack('V', substr($bytes, $i, 4))[1];
        $parts[] = str_pad(dechex($n & 0xFFFFFFFF), 8, '0', STR_PAD_LEFT);
    }
    return implode('', $parts);
}

function verifyPassword($password, $salt, $hash) {
    return hashPassword($password, $salt) === $hash;
}

function generateToken() {
    $bytes = random_bytes(32);
    $parts = [];
    for($i = 0; $i < 32; $i += 4) {
        $n = unpack('V', substr($bytes, $i, 4))[1];
        $parts[] = str_pad(dechex($n & 0xFFFFFFFF), 8, '0', STR_PAD_LEFT);
    }
    return implode('', $parts);
}

function hashToken($token) {
    $r = $token;
    for($i = 0; $i < 1000; $i++) { $r = fnv1a_32($r, $i); }
    return substr($r, 0, 40);
}

function createSession($userId, $role) {
    $token = generateToken();
    $tokenHash = hashToken($token);
    $session = ['userId'=>$userId, 'role'=>$role, 'createdAt'=>date('c'), 'expiresAt'=>date('c', time()+86400)];
    kvsetj('session_'.$tokenHash, $session);
    return $token;
}

function validateSession($token) {
    if(!$token) return null;
    $tokenHash = hashToken($token);
    $session = kvjson('session_'.$tokenHash);
    if(!$session) return null;
    if(strtotime($session['expiresAt']) < time()) { kvdel('session_'.$tokenHash); return null; }
    return $session;
}

function getCurrentUser() {
    $token = $_POST['token'] ?? $_GET['token'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if(strpos($token, 'Bearer ') === 0) $token = substr($token, 7);
    $session = validateSession($token);
    if(!$session) return null;
    foreach(getUsers() as $u) { if($u['id'] === $session['userId']) return ['id'=>$u['id'], 'name'=>$u['name'], 'role'=>$u['role'], 'token'=>$token]; }
    return null;
}

function needAuth() { $u = getCurrentUser(); if(!$u) err('未登录', 401); return $u; }
function needAdmin() { $u = needAuth(); if($u['role'] !== 'admin') err('无权限', 403); return $u; }

function getUsers() {
    $u = kvjson('users');
    if(!is_array($u) || empty($u)) {
        $d = [
            ['id'=>'admin_chenli', 'name'=>'陈立昊', 'role'=>'admin', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'admin_wangyux', 'name'=>'王宇翔', 'role'=>'admin', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_wanglig', 'name'=>'王里庚', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_wangchen', 'name'=>'王晨强', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_kangzi', 'name'=>'康子阔', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_liuyan', 'name'=>'刘彦宏', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_weijia', 'name'=>'卫佳旺', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_zhangxi', 'name'=>'张晓旭', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_hanzhi', 'name'=>'韩志芳', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
            ['id'=>'user_huchan', 'name'=>'胡昌雨', 'role'=>'user', 'passwordHash'=>'', 'passwordSalt'=>''],
        ];
        foreach($d as &$x) { $s = generateSalt(); $x['passwordSalt'] = $s; $x['passwordHash'] = hashPassword('123456', $s); }
        kvsetj('users', $d); return $d;
    }
    return $u;
}

function chinaDate() { return gmdate('Y-m-d', time() + 28800); }
function getMenu() {
    $m = kvjson('settings_menu');
    if(!is_array($m) || empty($m)) {
        $m = [['id'=>'m001','name'=>'炒冷面','price'=>14,'weight'=>100], ['id'=>'m047','name'=>'盲盒','price'=>12,'weight'=>100]];
        kvsetj('settings_menu', $m);
    }
    return $m;
}
function findMenuItem($id) { foreach(getMenu() as $m) if($m['id'] === $id) return $m; return null; }

// ===== ROUTER =====
$a = $_POST['action'] ?? $_GET['action'] ?? '';

if($a === 'login') {
    $un = $_POST['username'] ?? ''; $pw = $_POST['password'] ?? '';
    if(!$un || !$pw) err('用户名和密码不能为空', 400);
    $us = getUsers(); $u = null;
    foreach($us as $x) { if($x['name'] === $un) { $u = $x; break; } }
    if(!$u) err('用户名或密码错误', 401);
    if(!verifyPassword($pw, $u['passwordSalt'], $u['passwordHash'])) err('用户名或密码错误', 401);
    $token = createSession($u['id'], $u['role']);
    ok(['token'=>$token, 'user'=>['id'=>$u['id'], 'name'=>$u['name'], 'role'=>$u['role']]]);
}
elseif($a === 'logout') {
    $token = $_POST['token'] ?? $_GET['token'] ?? '';
    if($token) kvdel('session_'.hashToken($token));
    ok(null, '已退出');
}
elseif($a === 'me') {
    $u = getCurrentUser(); if(!$u) err('未登录', 401);
    ok(['user'=>['id'=>$u['id'], 'name'=>$u['name'], 'role'=>$u['role']]]);
}
elseif($a === 'change-password') {
    $u = needAuth(); $o = $_POST['oldPassword'] ?? ''; $n = $_POST['newPassword'] ?? '';
    if(!$o || !$n) err('密码不能为空', 400);
    if(strlen($n) < 6) err('新密码至少6位', 400);
    $us = getUsers();
    foreach($us as &$x) {
        if($x['id'] === $u['id']) {
            if(!verifyPassword($o, $x['passwordSalt'], $x['passwordHash'])) err('旧密码错误', 403);
            $x['passwordSalt'] = generateSalt(); $x['passwordHash'] = hashPassword($n, $x['passwordSalt']);
            kvsetj('users', $us); ok(null, '密码修改成功'); return;
        }
    }
    err('用户不存在', 404);
}
elseif($a === 'get-users') {
    needAuth(); $r = [];
    foreach(getUsers() as $x) $r[] = ['id'=>$x['id'], 'name'=>$x['name'], 'role'=>$x['role']];
    ok(['users'=>$r]);
}
elseif($a === 'create-user') {
    needAdmin(); $un = $_POST['username'] ?? ''; $rl = $_POST['role'] ?? 'user';
    if(!$un) err('用户名不能为空', 400);
    if($rl !== 'admin' && $rl !== 'user') $rl = 'user';
    $us = getUsers(); foreach($us as $x) if($x['name'] === $un) err('用户名已存在', 400);
    $s = generateSalt(); $pf = ($rl === 'admin' ? 'admin_' : 'user_');
    $us[] = ['id'=>$pf.substr(md5($un.time()), 0, 8), 'name'=>$un, 'role'=>$rl, 'passwordSalt'=>$s, 'passwordHash'=>hashPassword('123456', $s)];
    kvsetj('users', $us); ok(null, '用户创建成功');
}
elseif($a === 'delete-user') {
    needAdmin(); $id = $_POST['userId'] ?? ''; if(!$id) err('用户ID不能为空', 400);
    $us = array_values(array_filter(getUsers(), function($x) use($id) { return $x['id'] !== $id; }));
    kvsetj('users', $us); ok(null, '用户已删除');
}
elseif($a === 'reset-password') {
    needAdmin(); $id = $_POST['userId'] ?? ''; if(!$id) err('用户ID不能为空', 400);
    $us = getUsers();
    foreach($us as &$x) { if($x['id'] === $id) { $x['passwordSalt'] = generateSalt(); $x['passwordHash'] = hashPassword('123456', $x['passwordSalt']); kvsetj('users', $us); ok(null, '密码已重置为123456'); return; } }
    err('用户不存在', 404);
}
elseif($a === 'get-orders') {
    needAuth();
    $t = new DateTime('now', new DateTimeZone('Asia/Shanghai'));
    $fd = $t->format('Y-m').'-01'; $ld = date('Y-m-d', strtotime($fd.' +1 month -1 day'));
    $ds = []; $d = new DateTime($fd); $e = new DateTime($ld);
    while($d <= $e) { $ds[$d->format('Y-m-d')] = true; $d->modify('+1 day'); }
    $orders = [];
    foreach(kvkeys() as $k) { if(strpos($k, 'order_') !== 0) continue; $p = explode('_', $k); if(count($p) >= 2 && isset($ds[$p[1]])) { $o = kvjson($k); if($o) $orders[] = $o; } }
    ok(['orders'=>$orders]);
}
elseif($a === 'create-order') {
    $u = needAuth(); $b = $_POST;
    $uid = $b['userId'] ?? $u['id']; $pn = $b['personName'] ?? ''; $dt = $b['date'] ?? ''; $mt = $b['mealType'] ?? '';
    if($u['role'] !== 'admin' && $uid !== $u['id']) err('无权限为他人订餐', 403);
    if(!$dt || !$mt) err('日期和餐别不能为空', 400);
    if($mt !== 'lunch' && $mt !== 'dinner') err('餐别无效', 400);
    if($u['role'] !== 'admin') {
        if($mt === 'lunch' && kvget('settings_lunch_locked') === 'true') err('午餐点餐已被管理员锁定', 403);
        if($mt === 'dinner' && kvget('settings_dinner_locked') === 'true') err('晚餐点餐已被管理员锁定', 403);
    }
    $pr = floatval($b['price'] ?? 0); $in = ''; $mid = $b['menuId'] ?? '';
    $ri = $b['items'] ?? null; if(is_string($ri)) $ri = json_decode($ri, true);
    $its = [];
    if(is_array($ri) && !empty($ri)) {
        $tp = 0; $ins = [];
        foreach($ri as $r) { $q = max(1, intval($r['quantity'] ?? 1)); if(!empty($r['menuId'])) { $mm = findMenuItem($r['menuId']); if(!$mm) err('餐品不存在', 404); $up = floatval($mm['price']); $nm = $mm['name']; } else { $up = floatval($r['price'] ?? 0); $nm = $r['name'] ?? ''; } $its[] = ['menuId'=>$r['menuId']??'', 'name'=>$nm, 'price'=>$up, 'quantity'=>$q]; $tp += $up * $q; $ins[] = $nm.($q > 1 ? '×'.$q : ''); }
        $pr = round($tp, 2); $in = implode('、', $ins);
    } else {
        if(!empty($mid)) { $mm = findMenuItem($mid); if(!$mm) err('餐品不存在', 404); $pr = floatval($mm['price']); $in = $mm['name']; }
        else { $in = '盲盒'; $bp = kvget($mt === 'lunch' ? 'settings_blind_lunch_price' : 'settings_blind_dinner_price'); $pr = $bp ? floatval($bp) : ($mt === 'lunch' ? 11 : 12); }
        $its[] = ['menuId'=>$mid, 'name'=>$in, 'price'=>$pr, 'quantity'=>1];
    }
    if(!$pn) { foreach(getUsers() as $z) if($z['id'] === $uid) { $pn = $z['name']; break; } }
    $ok = 'order_'.$dt.'_'.$uid.'_'.$mt; $ex = kvjson($ok);
    $lsp = kvget('settings_lunch_selfpick') === 'true'; $dsp = kvget('settings_dinner_selfpick') === 'true';
    $disc = 0; if($dt === chinaDate() && $mt === 'lunch' && $lsp) $disc = 1; if($dt === chinaDate() && $mt === 'dinner' && $dsp) $disc = 1;
    $rec = max(0, $pr - $disc); $act = ($ex && $ex['paid']) ? $pr : 0; $ref = ($ex && $ex['paid']) ? $disc : 0;
    $nw = date('c'); $qty = 0; foreach($its as $it) $qty += $it['quantity'];
    $od = ['id'=>$ok, 'date'=>$dt, 'userId'=>$uid, 'personName'=>$pn, 'mealType'=>$mt, 'itemType'=>!empty($mid)?'menu':'blind', 'itemName'=>$in, 'price'=>$pr, 'items'=>$its, 'quantity'=>$qty, 'receivable'=>$rec, 'discount'=>$disc, 'actual'=>$act, 'refund'=>$ref, 'refunded'=>$ex?($ex['refunded']??false):false, 'refundedAt'=>$ex?($ex['refundedAt']??null):null, 'paid'=>$ex?($ex['paid']??false):false, 'paidAt'=>$ex?($ex['paidAt']??null):null, 'createdAt'=>$ex?($ex['createdAt']??$nw):$nw, 'updatedAt'=>$nw, 'note'=>$b['note']??($ex?($ex['note']??''):'')];
    kvsetj($ok, $od); ok(['order'=>$od], '订单提交成功');
}
elseif($a === 'delete-order') { $u = needAuth(); $oid = $_POST['orderId'] ?? ''; if(!$oid) err('订单ID不能为空', 400); $o = kvjson($oid); if(!$o) err('订单不存在', 404); if($u['role'] !== 'admin' && $o['userId'] !== $u['id']) err('无权限', 403); kvdel($oid); ok(null, '订单已删除'); }
elseif($a === 'delete-orders-by-date') { needAdmin(); $dt = $_POST['date'] ?? ''; if(!$dt) err('日期不能为空', 400); $dl = 0; $pf = 'order_'.$dt.'_'; foreach(kvkeys() as $k) { if(strpos($k, $pf) === 0) { kvdel($k); $dl++; } } ok(null, "已删除 $dl 条订单"); }
elseif($a === 'update-payment') { needAdmin(); $oid = $_POST['orderId'] ?? ''; $pd = in_array($_POST['paid'] ?? '', ['true', '1'], true); if(!$oid) err('订单ID不能为空', 400); $o = kvjson($oid); if(!$o) err('订单不存在', 404); $o['paid'] = $pd; $o['actual'] = $pd ? (floatval($o['price']) ?: 0) : 0; $o['updatedAt'] = date('c'); kvsetj($oid, $o); ok(null, $pd ? '已标记为已付' : '已取消已付'); }
elseif($a === 'refund-order') { needAdmin(); $oid = $_POST['orderId'] ?? ''; if(!$oid) err('订单ID不能为空', 400); $o = kvjson($oid); if(!$o) err('订单不存在', 404); $o['refunded'] = true; $o['refundedAt'] = date('c'); $o['updatedAt'] = date('c'); kvsetj($oid, $o); ok(null, '已退款'); }
elseif($a === 'get-settings') { $lp = kvget('settings_blind_lunch_price'); $dp = kvget('settings_blind_dinner_price'); ok(['settings'=>['orderLocked'=>kvget('settings_order_locked')==='true', 'lunchLocked'=>kvget('settings_lunch_locked')==='true', 'dinnerLocked'=>kvget('settings_dinner_locked')==='true', 'lunchSelfPick'=>kvget('settings_lunch_selfpick')==='true', 'dinnerSelfPick'=>kvget('settings_dinner_selfpick')==='true', 'blindLunchPrice'=>$lp?floatval($lp):11, 'blindDinnerPrice'=>$dp?floatval($dp):12]]); }
elseif($a === 'update-settings') { needAdmin(); $k = $_POST['key'] ?? ''; $v = $_POST['value'] ?? ''; if(!$k) err('设置项不能为空', 400); kvset($k, $v); if($k === 'settings_lunch_selfpick' || $k === 'settings_dinner_selfpick') { $mt = ($k === 'settings_lunch_selfpick') ? 'lunch' : 'dinner'; $en = ($v === 'true'); $td = chinaDate(); foreach(kvkeys() as $x) { if(strpos($x, 'order_') !== 0) continue; $p = explode('_', $x); if(count($p) < 4) continue; if($p[1] !== $td || end($p) !== $mt) continue; $o = kvjson($x); if(!$o) continue; $o['discount'] = $en ? 1 : 0; $o['receivable'] = max(0, floatval($o['price']) - $o['discount']); $o['actual'] = ($o['paid']??false) ? floatval($o['price']) : 0; $o['refund'] = ($o['paid']??false) ? $o['discount'] : 0; $o['updatedAt'] = date('c'); kvsetj($x, $o); } } ok(null, '设置已更新'); }
elseif($a === 'get-report') { needAuth(); $tp = $_POST['type'] ?? $_GET['type'] ?? 'week'; $off = intval($_POST['offset'] ?? $_GET['offset'] ?? 0); if($tp === 'week') { $nw = new DateTime('now', new DateTimeZone('Asia/Shanghai')); $dow = intval($nw->format('N')) - 1; $st = (clone $nw)->modify('-'.$dow.' days')->modify($off * 7 .' days')->setTime(0,0); $ed = (clone $st)->modify('+6 days')->setTime(23,59,59); } else { $nw = new DateTime('now', new DateTimeZone('Asia/Shanghai')); $y = intval($nw->format('Y')); $m = intval($nw->format('m')) + $off; while($m < 1) { $m += 12; $y--; } while($m > 12) { $m -= 12; $y++; } $st = new DateTime("$y-$m-01", new DateTimeZone('Asia/Shanghai')); $ed = (clone $st)->modify('+1 month -1 day'); } $df = $st->format('Y-m-d'); $dt2 = $ed->format('Y-m-d'); $to = 0; $po = 0; $ta = 0; $pa = 0; $ps = []; foreach(kvkeys() as $k) { if(strpos($k, 'order_') !== 0) continue; $p = explode('_', $k); if(count($p) < 2) continue; $d = $p[1]; if($d < $df || $d > $dt2) continue; $o = kvjson($k); if(!$o) continue; $rec = floatval($o['receivable'] ?? max(0, floatval($o['price']??0) - floatval($o['discount']??0))); $to++; $ta += $rec; if($o['paid'] ?? false) { $po++; $pa += floatval($o['actual'] ?? $o['price'] ?? 0); } $nm = $o['personName'] ?? ''; if(!isset($ps[$nm])) $ps[$nm] = ['name'=>$nm, 'count'=>0, 'amount'=>0]; $ps[$nm]['count']++; $ps[$nm]['amount'] += $rec; } ok(['dateFrom'=>$df, 'dateTo'=>$dt2, 'totalOrders'=>$to, 'paidOrders'=>$po, 'totalAmount'=>round($ta,2), 'paidAmount'=>round($pa,2), 'personStats'=>array_values($ps)]); }
elseif($a === 'get-menu') { needAuth(); $m = getMenu(); usort($m, function($a, $b) { return ($b['weight']??0) - ($a['weight']??0); }); ok(['menu'=>$m]); }
elseif($a === 'update-menu') { needAdmin(); $m = $_POST['menu'] ?? ''; $mj = $_POST['menuJson'] ?? ''; if(is_string($m)) $m = json_decode($m, true); if(!is_array($m) && is_string($mj)) $m = json_decode($mj, true); if(!is_array($m)) err('菜单数据格式错误', 400); foreach($m as $x) if(empty($x['id']) || empty($x['name']) || !isset($x['price'])) err('菜单项缺少必要字段', 400); $cm = getMenu(); foreach($m as &$x) { if(!isset($x['note'])) { foreach($cm as $c) if($c['id'] === $x['id'] && !empty($c['note'])) { $x['note'] = $c['note']; break; } } } kvsetj('settings_menu', $m); ok(null, '菜单更新成功'); }
elseif($a === 'clear-all-orders') { $ad = needAdmin(); $pw = $_POST['password'] ?? ''; if(!$pw) err('请输入管理员密码', 400); foreach(getUsers() as $z) if($z['id'] === $ad['id']) { if(!verifyPassword($pw, $z['passwordSalt'], $z['passwordHash'])) err('密码错误', 403); break; } $dl = 0; foreach(kvkeys() as $k) { if(strpos($k, 'order_') === 0) { kvdel($k); $dl++; } } ok(['count'=>$dl], "已清除 $dl 条订单"); }
elseif($a === 'restore-kv') { needAdmin(); $d = $_POST['data'] ?? ''; $ow = ($_POST['overwrite'] ?? '') === 'true'; if(!$d) err('数据不能为空', 400); $kv = json_decode($d, true); if(!is_array($kv)) err('数据格式错误', 400); $rs = 0; foreach($kv as $k=>$v) { if(!$ow && kvget($k) !== null) continue; kvset($k, is_string($v) ? $v : json_encode($v, JSON_UNESCAPED_UNICODE)); $rs++; } ok(null, "已恢复 $rs 条数据"); }
else err('未知操作: '.$a, 400);
