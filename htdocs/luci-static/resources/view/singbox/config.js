'use strict';
'import ui';
'import view';
'import form';
'import fs';
'import poll';
'import uci';

return view.extend({
    // 監測服務器連通性 (TCP/Ping)
    checkOnline: function(server_addr, status_id) {
        if (!server_addr) return;
        return fs.exec('/bin/ping', ['-c', '1', '-W', '1', server_addr]).then(function(res) {
            var el = document.getElementById(status_id);
            if (el) {
                if (res.code === 0) {
                    el.textContent = _('Online');
                    el.style.background = '#46a546';
                } else {
                    el.textContent = _('Offline');
                    el.style.background = '#d9534f';
                }
            }
        });
    },

    render: function() {
        var m, s, o;

        m = new form.Map('singbox', _('Sing-box Manager'), _('輕量級節點管理工具'));

        // --- 1. 系統資訊區域 ---
        s = m.section(form.TypedSection, '_info');
        s.anonymous = true;
        s.render = L.bind(function() {
            return fs.exec('/usr/bin/sing-box', ['version']).then(function(res) {
                var ver = res.stdout ? res.stdout.split('\n')[0] : 'Not Installed';
                return E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('版本 / 架構')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('span', { 'class': 'label' }, ver),
                        E('span', { 'class': 'label', 'style': 'margin-left:5px' }, L.env.arch)
                    ])
                ]);
            });
        }, this);

        // --- 2. 服務狀態控制 ---
        s = m.section(form.NamedSection, 'main', 'singbox', _('服務狀態'));
        o = s.option(form.Flag, 'enabled', _('啟用服務'));
        o.rmempty = false;

        // --- 3. 節點管理列表 ---
        s = m.section(form.GridSection, 'node', _('節點列表'), _('手動添加或編輯節點配置'));
        s.addremove = true;
        s.nodescriptions = true;
        s.sortable = true;

        // 切換開關 (當前選中)
        o = s.option(form.Flag, 'is_current', _('選中'));
        o.rmempty = false;

        // 節點名稱
        o = s.option(form.Value, 'name', _('名稱'));
        o.placeholder = '香港高倍率';

        // 服務器地址 (用於在線檢測)
        o = s.option(form.Value, 'server', _('服務器地址'));
        o.placeholder = '1.2.3.4';

        // 協議類型
        o = s.option(form.ListValue, 'type', _('協議'));
        o.value('ss', 'Shadowsocks');
        o.value('vless', 'VLESS');
        o.value('vmess', 'VMess');
        o.value('hysteria2', 'Hysteria2');

        // 在線狀態 (自動刷新)
        o = s.option(form.DummyValue, '_status', _('狀態'));
        o.render = L.bind(function(section_id) {
            var server = uci.get('singbox', section_id, 'server');
            var status_id = 'status_' + section_id;
            var el = E('span', { 'id': status_id, 'class': 'label', 'style': 'background:#ccc' }, _('Checking...'));
            
            poll.add(L.bind(this.checkOnline, this, server, status_id), 10);
            return el;
        }, this);

        // 節點配置內容 (點擊「編輯」按鈕時在 Modal 顯示)
        o = s.option(form.TextValue, 'config_json', _('配置 JSON'));
        o.rows = 15;
        o.modalonly = true; 
        o.description = _('請填入該節點在 sing-box 中的 Outbound JSON 片段');

        return m.render();
    }
});
