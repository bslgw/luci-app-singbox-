'use strict';
'import ui';
'import view';
'import form';
'import fs';
'import uci';

return view.extend({
    render: function() {
        var m, s, o;

        m = new form.Map('singbox', _('Sing-box Kernel Bridge'), 
            _('此工具用於管理外置 sing-box 實例，作為 daed 的高性能後端。'));

        // --- 1. 內核資訊與狀態 ---
        s = m.section(form.TypedSection, '_info', _('內核狀態'));
        s.anonymous = true;
        s.render = L.bind(function() {
            return Promise.all([
                fs.exec('/usr/bin/sing-box', ['version']),
                fs.exec('/usr/bin/pgrep', ['sing-box'])
            ]).then(function(res) {
                var ver = res[0].stdout ? res[0].stdout.split('\n')[0] : '未安裝';
                var isRunning = (res[1].code === 0);
                
                return E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('Version / Status')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('span', { 'class': 'label' }, ver + ' (' + L.env.arch + ')'),
                        E('span', { 
                            'class': 'label', 
                            'style': 'margin-left:10px; background:' + (isRunning ? '#46a546' : '#ccc') 
                        }, isRunning ? _('RUNNING') : _('STOPPED'))
                    ])
                ]);
            });
        }, this);

        // --- 2. 服務控制 ---
        s = m.section(form.NamedSection, 'main', 'singbox', _('服務開關'));
        s.addremove = false;
        o = s.option(form.Flag, 'enabled', _('啟用外置內核'));
        o.rmempty = false;

        // --- 3. 節點配置文件管理 ---
        // 這裡不再分欄位填寫地址，直接提供全量 JSON 編輯，這最符合 daed 用戶的操作習慣
        s = m.section(form.GridSection, 'node', _('節點配置庫'), _('直接編輯或刪除 Outbound JSON 配置'));
        s.addremove = true;
        s.nodescriptions = true;

        o = s.option(form.Value, 'name', _('節點標籤'));
        o.placeholder = 'Proxy-Group-01';

        // 核心功能：直接編輯 JSON
        o = s.option(form.TextValue, 'config_json', _('JSON 配置'));
        o.rows = 20;
        o.wrap = 'off';
        o.modalonly = true; // 點擊按鈕彈窗編輯，不佔用列表空間
        o.description = _('請粘貼完整或片段的 sing-box Outbound 配置');

        return m.render();
    }
});
