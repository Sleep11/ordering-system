<?php
// ========== 认证模块 ==========

function generate_salt() {
    return bin2hex(random_bytes(16));
}

function hash_password($password, $salt) {
    return hash('sha256', $salt . $password);
}

function verify_password($password, $salt, $hash) {
    return hash_password($password, $salt) === $hash;
}

function create_token($userId, $role) {
    $expiry = time() + 7 * 24 * 3600; // 7 days
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
    $userId = $parts[0];
    $role = $parts[1];
    $expiry = intval($parts[2]);
    $sig = $parts[3];
    $payload = $userId . ':' . $role . ':' . $expiry;
    $expected = hash_hmac('sha256', $payload, 'ordering_secret_key_2026');
    if ($sig !== $expected) return null;
    if (time() > $expiry) return null;
    return ['id' => $userId, 'role' => $role];
}

function get_current_user() {
    $token = $_POST['token'] ?? $_GET['token'] ?? '';
    if (!$token) return null;
    return verify_token($token);
}

function require_auth() {
    $user = get_current_user();
    if (!$user) {
        send_json(['success' => false, 'message' => '未登录'], 401);
        exit;
    }
    return $user;
}

function require_admin() {
    $user = require_auth();
    if ($user['role'] !== 'admin') {
        send_json(['success' => false, 'message' => '无权限'], 403);
        exit;
    }
    return $user;
}

function read_users() {
    $users = kv_get_json('users');
    if (!is_array($users) || empty($users)) {
        // Initialize default users
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

function get_china_date() {
    $ts = time() + 8 * 3600;
    return gmdate('Y-m-d', $ts);
}
?>
