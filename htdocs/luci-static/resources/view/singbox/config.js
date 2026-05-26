// 在 GridSection 中定義節點列表
s = m.section(form.GridSection, 'node', _('節點管理'));

// ... 其他欄位 (名稱, 協議等) ...

// 修改連通性顯示欄位
o = s.option(form.DummyValue, '_status', _('服務器狀態'));
o.modalonly = false;
o.render = function(section_id) {
    // 獲取該節點的 server 地址 (從 UCI 中讀取)
    var server_addr = uci.get('singbox', section_id, 'server');
    
    // 建立一個帶有 ID 的容器，方便後續更新
    var status_id = 'status_' + section_id;
    var status_el = E('span', { 'id': status_id, 'class': 'label' }, _('Checking...'));
    
    // 定義檢查連線的邏輯
    var check_status = function() {
        if (!server_addr) return;
        
        // 使用 nc (netcat) 測試 TCP 端口連通性，或使用 ping
        // 這裡建議用 fs.exec 執行一個簡單的 ping 測試
        fs.exec('/bin/ping', ['-c', '1', '-W', '1', server_addr]).then(function(res) {
            var el = document.getElementById(status_id);
            if (el) {
                if (res.code === 0) {
                    el.textContent = _('Online');
                    el.style.background = '#46a546'; // 綠色
                    el.style.color = '#fff';
                } else {
                    el.textContent = _('Offline');
                    el.style.background = '#d9534f'; // 紅色
                    el.style.color = '#fff';
                }
            }
        });
    };

    // 每 10 秒自動檢查一次
    poll.add(check_status, 10);
    
    return status_el;
};
