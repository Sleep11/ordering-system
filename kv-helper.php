<?php
<?php
// ========== KV 数据库辅助函数 ==========

function kv_get($key) {
    $db = new Database("ordering");
    return $db->get($key);
}

function kv_set($key, $value) {
    $db = new Database("ordering");
    $db->set($key, $value);
}

function kv_delete($key) {
    $db = new Database("ordering");
    $db->delete($key);
}

function kv_list_keys() {
    $db = new Database("ordering");
    return $db->list_keys();
}

function kv_get_json($key) {
    $raw = kv_get($key);
    if (!$raw) return null;
    $data = json_decode($raw, true);
    return $data;
}

function kv_set_json($key, $data) {
    kv_set($key, json_encode($data, JSON_UNESCAPED_UNICODE));
}
?>
