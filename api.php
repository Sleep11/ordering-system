<?php
// ========== 多人在线点餐系统 — PHP API (All-in-One) ==========

// ---- KV Helper ----
function kv_get($key) { $db = new Database("ordering"); return $db->get($key); }
function kv_set($key, $value) { $db = new Database("ordering"); $db->set($key, $value); }
function kv_delete($key) { $db = new Database("ordering"); $db->delete($key); }
function kv_list_keys() { $db = new Database("ordering"); return $db->list_keys(); }
function kv_get_json($key) { $raw = kv_get($key); return $raw ? json_decode($raw, true) : null; }
function kv_set_json($key, $data) { kv_set($key, json_encode($data, JSON_UNESCAPED_UNICODE)); }

// ---- Auth Module ----
function generate_salt() { return bin2hex(random_bytes(16)); }
function hash_password($password, $salt) { return hash('sha256', $salt . $password); }
function verify_password($password, $salt, $hash) { return hash_password($password, $salt) === $hash; }
function create_token($userId, $role) {
    $expiry = time() + 7 * 24 * 3600;
    $payload = $userId . ':' . $role . ':' . $expiry;
    $sig = hash_hmac('sha256', $payload, 'ordering_secret_key_2026');
    return base64_encode($payload . ':' . $sig);
}
function verify_token($token) {
    if (!$token) return null;
    $decoded = base64_decode($token);
    if (!$decoded) return null;
    $parts = explode(':', $decoded);
    if (count($parts) < 4) return null;
    $userId = $parts[0]; $role = $parts[1]; $expiry = intval($parts[2]); $sig = $parts[3];
    $payload = $userId . ':' . $role . ':' . $expiry;
    if ($sig !== hash_hmac('sha256', $payload, 'ordering_secret_key_2026')) return null;
    if (time() > $expiry) return null;
    return ['id' => $userId, 'role' => $role];
}
function get_current_user() {
    $token = $_POST['token'] ?? $_GET['token'] ?? '';
    return $token ? verify_token($token) : null;
}
function require_auth() {
    $user = get_current_user();
    if (!$user) { send_json(['success' => false, 'message' => '未登录'], 401); exit; }
    return $user;
}
function require_admin() {
    $user = require_auth();
    if ($user['role'] !== 'admin') { send_json(['success' => false, 'message' => '无权限'], 403); exit; }
    return $user;
}
function read_users() {
    $users = kv_get_json('users');
    if (!is_array($users) || empty($users)) {
        $defaults = [
            ['id' => 'admin_chenli', 'name' => '陈立昊', 'role' => 'admin', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'admin_wangyux', 'name' => '王宇翔', 'role' => 'admin', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_wanglig', 'name' => '王里庚', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_wangchen', 'name' => '王晨强', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_kangzi', 'name' => '康子阔', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_liuyan', 'name' => '刘彦宏', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_weijia', 'name' => '卫佳旺', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_zhangxi', 'name' => '张晓旭', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_hanzhi', 'name' => '韩志芳', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
            ['id' => 'user_huchan', 'name' => '胡昌雨', 'role' => 'user', 'passwordHash' => '', 'passwordSalt' => ''],
        ];
        foreach ($defaults as &$u) {
            $salt = generate_salt();
            $u['passwordSalt'] = $salt;
            $u['passwordHash'] = hash_password('123456', $salt);
        }
        kv_set_json('users', $defaults);
        return $defaults;
    }
    return $users;
}
function get_china_date() { return gmdate('Y-m-d', time() + 8 * 3600); }
function get_menu() {
    $menu = kv_get_json('settings_menu');
    if (!is_array($menu) || empty($menu)) {
        $defaults = [
            ['id' => 'm001', 'name' => '炒冷面', 'price' => 14, 'weight' => 100],
            ['id' => 'm047', 'name' => '盲盒', 'price' => 12, 'weight' => 100]
        ];
        kv_set_json('settings_menu', $defaults);
        return $defaults;
    }
    return $menu;
}
function get_menu_item($menuId) {
    foreach (get_menu() as $m) { if ($m['id'] === $menuId) return $m; }
    return null;
}

function send_json($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ---- Main Router ----
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

$action = $_POST['action'] ?? $_GET['action'] ?? '';

try {
    if ($action === 'login')               handle_login();
    elseif ($action === 'logout')           send_json(['success' => true]);
    elseif ($action === 'me')               handle_me();
    elseif ($action === 'change-password')  handle_change_password();
    elseif ($action === 'get-users')        handle_get_users();
    elseif ($action === 'create-user')      handle_create_user();
    elseif ($action === 'delete-user')      handle_delete_user();
    elseif ($action === 'reset-password')   handle_reset_password();
    elseif ($action === 'get-orders')       handle_get_orders();
    elseif ($action === 'create-order')     handle_create_order();
    elseif ($action === 'delete-order')     handle_delete_order();
    elseif ($action === 'delete-orders-by-date') handle_delete_orders_by_date();
    elseif ($action === 'update-payment')   handle_update_payment();
    elseif ($action === 'refund-order')     handle_refund_order();
    elseif ($action === 'get-settings')     handle_get_settings();
    elseif ($action === 'update-settings')  handle_update_settings();
    elseif ($action === 'get-report')       handle_get_report();
    elseif ($action === 'get-menu')         handle_get_menu();
    elseif ($action === 'update-menu')      handle_update_menu();
    elseif ($action === 'clear-all-orders') handle_clear_all_orders();
    elseif ($action === 'restore-kv')       handle_restore_kv();
    else send_json(['success' => false, 'message' => '未知操作: ' . $action], 400);
} catch (Exception $e) {
    send_json(['success' => false, 'message' => '服务器错误: ' . $e->getMessage()], 500);
}

// ========== HANDLERS ==========

function handle_login() {
    $username = $_POST['username'] ?? ''; $password = $_POST['password'] ?? '';
    if (!$username || !$password) send_json(['success' => false, 'message' => '用户名和密码不能为空'], 400);
    $users = read_users(); $user = null;
    foreach ($users as $u) { if ($u['name'] === $username) { $user = $u; break; } }
    if (!$user) send_json(['success' => false, 'message' => '用户名或密码错误'], 401);
    if (!verify_password($password, $user['passwordSalt'], $user['passwordHash']))
        send_json(['success' => false, 'message' => '用户名或密码错误'], 401);
    send_json(['success' => true, 'data' => [
        'token' => create_token($user['id'], $user['role']),
        'user' => ['id' => $user['id'], 'name' => $user['name'], 'role' => $user['role']]
    ]]);
}

function handle_me() {
    $user = get_current_user();
    if (!$user) send_json(['success' => false, 'message' => '未登录'], 401);
    $users = read_users();
    foreach ($users as $u) { if ($u['id'] === $user['id']) { send_json(['success' => true, 'data' => ['user' => ['id' => $u['id'], 'name' => $u['name'], 'role' => $u['role']]]]); return; } }
    send_json(['success' => false, 'message' => '用户不存在'], 404);
}

function handle_change_password() {
    $user = require_auth();
    $oldPw = $_POST['oldPassword'] ?? ''; $newPw = $_POST['newPassword'] ?? '';
    if (!$oldPw || !$newPw) send_json(['success' => false, 'message' => '密码不能为空'], 400);
    if (strlen($newPw) < 6) send_json(['success' => false, 'message' => '新密码至少6位'], 400);
    $users = read_users();
    foreach ($users as &$u) {
        if ($u['id'] === $user['id']) {
            if (!verify_password($oldPw, $u['passwordSalt'], $u['passwordHash']))
                send_json(['success' => false, 'message' => '旧密码错误'], 403);
            $salt = generate_salt(); $u['passwordSalt'] = $salt;
            $u['passwordHash'] = hash_password($newPw, $salt);
            kv_set_json('users', $users);
            send_json(['success' => true, 'message' => '密码修改成功']); return;
        }
    }
    send_json(['success' => false, 'message' => '用户不存在'], 404);
}

function handle_get_users() {
    require_auth();
    $result = [];
    foreach (read_users() as $u) $result[] = ['id' => $u['id'], 'name' => $u['name'], 'role' => $u['role']];
    send_json(['success' => true, 'data' => ['users' => $result]]);
}

function handle_create_user() {
    require_admin();
    $username = $_POST['username'] ?? ''; $role = $_POST['role'] ?? 'user';
    if (!$username) send_json(['success' => false, 'message' => '用户名不能为空'], 400);
    if ($role !== 'admin' && $role !== 'user') $role = 'user';
    $users = read_users();
    foreach ($users as $u) { if ($u['name'] === $username) send_json(['success' => false, 'message' => '用户名已存在'], 400); }
    $salt = generate_salt();
    $users[] = ['id' => ($role === 'admin' ? 'admin_' : 'user_') . substr(md5($username . time()), 0, 8),
        'name' => $username, 'role' => $role, 'passwordSalt' => $salt, 'passwordHash' => hash_password('123456', $salt)];
    kv_set_json('users', $users);
    send_json(['success' => true, 'message' => '用户创建成功']);
}

function handle_delete_user() {
    require_admin();
    $userId = $_POST['userId'] ?? '';
    if (!$userId) send_json(['success' => false, 'message' => '用户ID不能为空'], 400);
    $users = array_values(array_filter(read_users(), function($u) use ($userId) { return $u['id'] !== $userId; }));
    kv_set_json('users', $users);
    send_json(['success' => true, 'message' => '用户已删除']);
}

function handle_reset_password() {
    require_admin();
    $userId = $_POST['userId'] ?? '';
    if (!$userId) send_json(['success' => false, 'message' => '用户ID不能为空'], 400);
    $users = read_users();
    foreach ($users as &$u) {
        if ($u['id'] === $userId) {
            $salt = generate_salt(); $u['passwordSalt'] = $salt;
            $u['passwordHash'] = hash_password('123456', $salt);
            kv_set_json('users', $users);
            send_json(['success' => true, 'message' => '密码已重置为 123456']); return;
        }
    }
    send_json(['success' => false, 'message' => '用户不存在'], 404);
}

function handle_get_orders() {
    require_auth();
    $today = new DateTime('now', new DateTimeZone('Asia/Shanghai'));
    $firstDay = $today->format('Y-m') . '-01';
    $lastDay = date('Y-m-d', strtotime($firstDay . ' +1 month -1 day'));
    $dateSet = []; $d = new DateTime($firstDay); $end = new DateTime($lastDay);
    while ($d <= $end) { $dateSet[$d->format('Y-m-d')] = true; $d->modify('+1 day'); }
    $orders = [];
    foreach (kv_list_keys() as $key) {
        if (strpos($key, 'order_') !== 0) continue;
        $parts = explode('_', $key);
        if (count($parts) >= 2 && isset($dateSet[$parts[1]])) {
            $order = kv_get_json($key);
            if ($order) $orders[] = $order;
        }
    }
    send_json(['success' => true, 'data' => ['orders' => $orders]]);
}

function handle_create_order() {
    $user = require_auth();
    $body = $_POST;
    $userId = $body['userId'] ?? $user['id'];
    $personName = $body['personName'] ?? '';
    $date = $body['date'] ?? ''; $mealType = $body['mealType'] ?? '';
    if ($user['role'] !== 'admin' && $userId !== $user['id']) send_json(['success' => false, 'message' => '无权限为他人订餐'], 403);
    if (!$date || !$mealType) send_json(['success' => false, 'message' => '日期和餐别不能为空'], 400);
    if ($mealType !== 'lunch' && $mealType !== 'dinner') send_json(['success' => false, 'message' => '餐别无效'], 400);

    if ($user['role'] !== 'admin') {
        if ($mealType === 'lunch' && kv_get('settings_lunch_locked') === 'true') send_json(['success' => false, 'message' => '午餐点餐已被管理员锁定'], 403);
        if ($mealType === 'dinner' && kv_get('settings_dinner_locked') === 'true') send_json(['success' => false, 'message' => '晚餐点餐已被管理员锁定'], 403);
    }

    $price = floatval($body['price'] ?? 0); $itemName = ''; $menuId = $body['menuId'] ?? '';
    $rawItems = $body['items'] ?? null;
    if (is_string($rawItems)) $rawItems = json_decode($rawItems, true);

    $items = [];
    if (is_array($rawItems) && !empty($rawItems)) {
        $totalPrice = 0; $itemNames = [];
        foreach ($rawItems as $ri) {
            $qty = max(1, intval($ri['quantity'] ?? 1));
            if (!empty($ri['menuId'])) {
                $menu = get_menu_item($ri['menuId']);
                if (!$menu) send_json(['success' => false, 'message' => '餐品不存在'], 404);
                $unitPrice = floatval($menu['price']); $name = $menu['name'];
            } else { $unitPrice = floatval($ri['price'] ?? 0); $name = $ri['name'] ?? ''; }
            $items[] = ['menuId' => $ri['menuId'] ?? '', 'name' => $name, 'price' => $unitPrice, 'quantity' => $qty];
            $totalPrice += $unitPrice * $qty;
            $itemNames[] = $name . ($qty > 1 ? '×' . $qty : '');
        }
        $price = round($totalPrice, 2); $itemName = implode('、', $itemNames);
    } else {
        if (!empty($menuId)) {
            $menu = get_menu_item($menuId);
            if (!$menu) send_json(['success' => false, 'message' => '餐品不存在'], 404);
            $price = floatval($menu['price']); $itemName = $menu['name'];
        } else {
            $itemName = '盲盒';
            $bp = kv_get($mealType === 'lunch' ? 'settings_blind_lunch_price' : 'settings_blind_dinner_price');
            $price = $bp ? floatval($bp) : ($mealType === 'lunch' ? 11 : 12);
        }
        $items[] = ['menuId' => $menuId, 'name' => $itemName, 'price' => $price, 'quantity' => 1];
    }

    if (!$personName) {
        foreach (read_users() as $u) { if ($u['id'] === $userId) { $personName = $u['name']; break; } }
    }

    $orderKey = 'order_' . $date . '_' . $userId . '_' . $mealType;
    $existing = kv_get_json($orderKey);

    $lunchSP = kv_get('settings_lunch_selfpick') === 'true';
    $dinnerSP = kv_get('settings_dinner_selfpick') === 'true';
    $discount = 0;
    if ($date === get_china_date() && $mealType === 'lunch' && $lunchSP) $discount = 1;
    if ($date === get_china_date() && $mealType === 'dinner' && $dinnerSP) $discount = 1;
    $receivable = max(0, $price - $discount);
    $actual = ($existing && $existing['paid']) ? $price : 0;
    $refund = ($existing && $existing['paid']) ? $discount : 0;

    $now = date('c');
    $order = [
        'id' => $orderKey, 'date' => $date, 'userId' => $userId, 'personName' => $personName,
        'mealType' => $mealType, 'itemType' => !empty($menuId) ? 'menu' : 'blind',
        'itemName' => $itemName, 'price' => $price, 'items' => $items,
        'quantity' => array_sum(array_column($items, 'quantity')),
        'receivable' => $receivable, 'discount' => $discount, 'actual' => $actual,
        'refund' => $refund, 'refunded' => $existing ? ($existing['refunded'] ?? false) : false,
        'refundedAt' => $existing ? ($existing['refundedAt'] ?? null) : null,
        'paid' => $existing ? ($existing['paid'] ?? false) : false,
        'paidAt' => $existing ? ($existing['paidAt'] ?? null) : null,
        'createdAt' => $existing ? ($existing['createdAt'] ?? $now) : $now, 'updatedAt' => $now,
        'note' => $body['note'] ?? ($existing ? ($existing['note'] ?? '') : '')
    ];
    kv_set_json($orderKey, $order);
    send_json(['success' => true, 'data' => ['order' => $order], 'message' => '订单提交成功']);
}

function handle_delete_order() {
    $user = require_auth();
    $orderId = $_POST['orderId'] ?? '';
    if (!$orderId) send_json(['success' => false, 'message' => '订单ID不能为空'], 400);
    $order = kv_get_json($orderId);
    if (!$order) send_json(['success' => false, 'message' => '订单不存在'], 404);
    if ($user['role'] !== 'admin' && $order['userId'] !== $user['id']) send_json(['success' => false, 'message' => '无权限'], 403);
    kv_delete($orderId);
    send_json(['success' => true, 'message' => '订单已删除']);
}

function handle_delete_orders_by_date() {
    require_admin();
    $date = $_POST['date'] ?? '';
    if (!$date) send_json(['success' => false, 'message' => '日期不能为空'], 400);
    $deleted = 0;
    foreach (kv_list_keys() as $k) { if (strpos($k, 'order_' . $date . '_') === 0) { kv_delete($k); $deleted++; } }
    send_json(['success' => true, 'message' => "已删除 $deleted 条订单"]);
}

function handle_update_payment() {
    require_admin();
    $orderId = $_POST['orderId'] ?? '';
    $paid = in_array($_POST['paid'] ?? '', ['true', '1'], true) || ($_POST['paid'] ?? false) === true;
    if (!$orderId) send_json(['success' => false, 'message' => '订单ID不能为空'], 400);
    $order = kv_get_json($orderId);
    if (!$order) send_json(['success' => false, 'message' => '订单不存在'], 404);
    $order['paid'] = $paid;
    $order['actual'] = $paid ? (floatval($order['price']) ?: 0) : 0;
    $order['updatedAt'] = date('c');
    kv_set_json($orderId, $order);
    send_json(['success' => true, 'message' => $paid ? '已标记为已付' : '已取消已付']);
}

function handle_refund_order() {
    require_admin();
    $orderId = $_POST['orderId'] ?? '';
    if (!$orderId) send_json(['success' => false, 'message' => '订单ID不能为空'], 400);
    $order = kv_get_json($orderId);
    if (!$order) send_json(['success' => false, 'message' => '订单不存在'], 404);
    $order['refunded'] = true; $order['refundedAt'] = date('c'); $order['updatedAt'] = date('c');
    kv_set_json($orderId, $order);
    send_json(['success' => true, 'message' => '已退款']);
}

function handle_get_settings() {
    $lunchPrice = kv_get('settings_blind_lunch_price');
    $dinnerPrice = kv_get('settings_blind_dinner_price');
    send_json(['success' => true, 'data' => ['settings' => [
        'orderLocked' => kv_get('settings_order_locked') === 'true',
        'lunchLocked' => kv_get('settings_lunch_locked') === 'true',
        'dinnerLocked' => kv_get('settings_dinner_locked') === 'true',
        'lunchSelfPick' => kv_get('settings_lunch_selfpick') === 'true',
        'dinnerSelfPick' => kv_get('settings_dinner_selfpick') === 'true',
        'blindLunchPrice' => $lunchPrice ? floatval($lunchPrice) : 11,
        'blindDinnerPrice' => $dinnerPrice ? floatval($dinnerPrice) : 12,
    ]]]);
}

function handle_update_settings() {
    require_admin();
    $key = $_POST['key'] ?? ''; $value = $_POST['value'] ?? '';
    if (!$key) send_json(['success' => false, 'message' => '设置项不能为空'], 400);
    kv_set($key, $value);
    if ($key === 'settings_lunch_selfpick' || $key === 'settings_dinner_selfpick') {
        $mealType = $key === 'settings_lunch_selfpick' ? 'lunch' : 'dinner';
        $enabled = $value === 'true'; $today = get_china_date();
        foreach (kv_list_keys() as $k) {
            if (strpos($k, 'order_') !== 0) continue;
            $parts = explode('_', $k); if (count($parts) < 4) continue;
            if ($parts[1] !== $today || end($parts) !== $mealType) continue;
            $order = kv_get_json($k); if (!$order) continue;
            $order['discount'] = $enabled ? 1 : 0;
            $order['receivable'] = max(0, floatval($order['price']) - $order['discount']);
            $order['actual'] = ($order['paid'] ?? false) ? floatval($order['price']) : 0;
            $order['refund'] = ($order['paid'] ?? false) ? $order['discount'] : 0;
            $order['updatedAt'] = date('c');
            kv_set_json($k, $order);
        }
    }
    send_json(['success' => true, 'message' => '设置已更新']);
}

function handle_get_report() {
    require_auth();
    $type = $_POST['type'] ?? $_GET['type'] ?? 'week';
    $offset = intval($_POST['offset'] ?? $_GET['offset'] ?? 0);
    if ($type === 'week') {
        $now = new DateTime('now', new DateTimeZone('Asia/Shanghai'));
        $dayOfWeek = intval($now->format('N')) - 1;
        $start = (clone $now)->modify('-' . $dayOfWeek . ' days')->modify($offset * 7 . ' days')->setTime(0, 0);
        $end = (clone $start)->modify('+6 days')->setTime(23, 59, 59);
    } else {
        $now = new DateTime('now', new DateTimeZone('Asia/Shanghai'));
        $y = intval($now->format('Y')); $m = intval($now->format('m')) + $offset;
        while ($m < 1) { $m += 12; $y--; } while ($m > 12) { $m -= 12; $y++; }
        $start = new DateTime("$y-$m-01", new DateTimeZone('Asia/Shanghai'));
        $end = (clone $start)->modify('+1 month -1 day');
    }
    $dateFrom = $start->format('Y-m-d'); $dateTo = $end->format('Y-m-d');

    $orders = []; $totalOrders = 0; $paidOrders = 0; $totalAmount = 0; $paidAmount = 0; $personStats = [];
    foreach (kv_list_keys() as $k) {
        if (strpos($k, 'order_') !== 0) continue;
        $parts = explode('_', $k); if (count($parts) < 2) continue;
        $d = $parts[1]; if ($d < $dateFrom || $d > $dateTo) continue;
        $order = kv_get_json($k); if (!$order) continue;
        $orders[] = $order;
        $receivable = floatval($order['receivable'] ?? max(0, floatval($order['price'] ?? 0) - floatval($order['discount'] ?? 0)));
        $totalOrders++; $totalAmount += $receivable;
        if ($order['paid'] ?? false) { $paidOrders++; $paidAmount += floatval($order['actual'] ?? $order['price'] ?? 0); }
        $name = $order['personName'] ?? ''; if (!isset($personStats[$name])) $personStats[$name] = ['name' => $name, 'count' => 0, 'amount' => 0];
        $personStats[$name]['count']++; $personStats[$name]['amount'] += $receivable;
    }
    send_json(['success' => true, 'data' => [
        'dateFrom' => $dateFrom, 'dateTo' => $dateTo,
        'totalOrders' => $totalOrders, 'paidOrders' => $paidOrders,
        'totalAmount' => round($totalAmount, 2), 'paidAmount' => round($paidAmount, 2),
        'personStats' => array_values($personStats)
    ]]);
}

function handle_get_menu() {
    require_auth();
    $menu = get_menu();
    usort($menu, function($a, $b) { return ($b['weight'] ?? 0) - ($a['weight'] ?? 0); });
    send_json(['success' => true, 'data' => ['menu' => $menu]]);
}

function handle_update_menu() {
    require_admin();
    $menu = $_POST['menu'] ?? ''; $menuJson = $_POST['menuJson'] ?? '';
    if (is_string($menu)) $menu = json_decode($menu, true);
    if (!is_array($menu) && is_string($menuJson)) $menu = json_decode($menuJson, true);
    if (!is_array($menu)) send_json(['success' => false, 'message' => '菜单数据格式错误'], 400);
    foreach ($menu as $m) { if (empty($m['id']) || empty($m['name']) || !isset($m['price'])) send_json(['success' => false, 'message' => '菜单项缺少必要字段'], 400); }
    $current = get_menu();
    foreach ($menu as &$m) {
        if (!isset($m['note'])) {
            foreach ($current as $c) { if ($c['id'] === $m['id'] && !empty($c['note'])) { $m['note'] = $c['note']; break; } }
        }
    }
    kv_set_json('settings_menu', $menu);
    send_json(['success' => true, 'message' => '菜单更新成功']);
}

function handle_clear_all_orders() {
    $admin = require_admin();
    $password = $_POST['password'] ?? '';
    if (!$password) send_json(['success' => false, 'message' => '请输入管理员密码'], 400);
    foreach (read_users() as $u) { if ($u['id'] === $admin['id']) { if (!verify_password($password, $u['passwordSalt'], $u['passwordHash'])) send_json(['success' => false, 'message' => '密码错误'], 403); break; } }
    $deleted = 0;
    foreach (kv_list_keys() as $k) { if (strpos($k, 'order_') === 0) { kv_delete($k); $deleted++; } }
    send_json(['success' => true, 'message' => "已清除 $deleted 条订单", 'data' => ['count' => $deleted]]);
}

function handle_restore_kv() {
    require_admin();
    $data = $_POST['data'] ?? ''; $overwrite = ($_POST['overwrite'] ?? '') === 'true';
    if (!$data) send_json(['success' => false, 'message' => '数据不能为空'], 400);
    $kv = json_decode($data, true);
    if (!is_array($kv)) send_json(['success' => false, 'message' => '数据格式错误'], 400);
    $restored = 0;
    foreach ($kv as $key => $value) {
        if (!$overwrite && kv_get($key) !== null) continue;
        kv_set($key, is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_UNICODE));
        $restored++;
    }
    send_json(['success' => true, 'message' => "已恢复 $restored 条数据"]);
}
