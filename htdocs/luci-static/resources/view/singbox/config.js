'use strict';
'import ui';
'import view';
'import form';
'import fs';

return view.extend({
    render: function() {
        var m, s, o;

        // 對接官方 /etc/config/sing-box
        m = new form.Map('sing-box', _('Sing-box Bridge'), _('此 UI 用於管理官方 sing-box 核心，作為 daed 的高效能後端。'));

        // 1. 顯示版本資訊 (真功夫：讓用戶知道內核跑在哪個架構)
        s = m.section(form.TypedSection, '_info', _('內核資訊'));
        s.anonymous = true;
        s.render = L.bind(function() {
            return fs.exec('/usr/bin/sing-box', ['version']).then(function(res) {
                var ver = res.stdout ? res.stdout.split('\n')[0] : '未安裝';
                return E('div', { 'class': 'cbi-value' }, [
                    E('label', { 'class': 'cbi-value-title' }, _('版本 / 架構')),
                    E('div', { 'class': 'cbi-value-field' }, [
                        E('span', { 'class': 'label' }, ver),
                        E('span', { 'class': 'label', 'style': 'margin-left:5px' }, L.env.arch)
                    ])
                ]);
            });
        }, this);

        // 2. 基礎控制 (對應官方腳本的 enabled 選項)
        s = m.section(form.NamedSection, 'main', 'singbox', _('服務開關'));
        o = s.option(form.Flag, 'enabled', _('啟用'));
        o.rmempty = false;

        // 3. 配置路徑 (讓用戶知道 sing-box 讀哪個檔)
        o = s.option(form.Value, 'conffile', _('設定檔路徑'));
        o.placeholder = '/etc/sing-box/config.json';

        // 4. 節點配置管理 (這就是你要的：直接編輯、保存、刪除)
        s = m.section(form.GridSection, 'node', _('節點配置庫'), _('在這裡手動貼入 Outbound JSON 片段。'));
        s.addremove = true; 
        s.nodescriptions = true;

        o = s.option(form.Value, 'name', _('節點標籤'));
        o.rmempty = false;

        o = s.option(form.TextValue, 'config_json', _('JSON 配置'));
        o.rows = 15;
        o.wrap = 'off';
        o.modalonly = true; // 彈窗編輯，保持頁面清爽

        return m.render();
    }
});
