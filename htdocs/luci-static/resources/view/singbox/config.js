'use strict';
'import ui';
'import view';
'import form';
'import fs';
'import poll';

return view.extend({
    // 取得 sing-box 運行狀態的函式
    renderStatus: function(isRunning) {
        var span = E('span', { 'class': 'label' });
        if (isRunning) {
            span.style.background = '#46a546';
            span.textContent = _('Running');
        } else {
            span.style.background = '#ccc';
            span.textContent = _('Not Running');
        }
        return E('div', { 'class': 'cbi-value' }, [
            E('label', { 'class': 'cbi-value-title' }, _('Service Status')),
            E('div', { 'class': 'cbi-value-field' }, span)
        ]);
    },

    render: function() {
        var m, s, o;

        m = new form.Map('singbox', _('Sing-box Manager'), _('輕量級的 sing-box 管理界面'));

        // 狀態顯示區域
        s = m.section(form.TypedSection, '_status');
        s.anonymous = true;
        s.render = L.bind(function() {
            var node = E('div', { 'id': 'singbox_status_bar' }, _('Checking...'));
            
            // 每 5 秒輪詢狀態
            poll.add(L.bind(function() {
                return fs.exec('/usr/bin/pgrep', ['sing-box']).then(function(res) {
                    var isRunning = (res.code === 0);
                    var bar = document.getElementById('singbox_status_bar');
                    if (bar) {
                        bar.innerHTML = '';
                        bar.appendChild(this.renderStatus(isRunning));
                    }
                }.bind(this));
            }, this), 5);

            return node;
        }, this);

        // 基本設置
        s = m.section(form.NamedSection, 'main', 'singbox', _('General Settings'));
        s.addremove = false;

        o = s.option(form.Flag, 'enabled', _('Enable'), _('啟動服務'));
        o.rmempty = false;

        o = s.option(form.Value, 'conffile', _('Config Path'), _('設定檔 JSON 路徑'));
        o.placeholder = '/etc/sing-box/config.json';
        o.datatype = 'file';

        // 訂閱功能按鈕
        o = s.option(form.Value, 'sub_url', _('Subscription URL'), _('輸入訂閱鏈接以更新設定'));
        
        // 設定檔編輯器
        s = m.section(form.TypedSection, 'config_editor', _('Config Editor'));
        s.anonymous = true;
        
        o = s.option(form.TextValue, '_data', _('JSON Content'));
        o.rows = 20;
        o.wrap = 'off';
        o.cfgvalue = function(section_id) {
            return fs.read('/etc/sing-box/config.json').catch(function(e) { return ""; });
        };
        o.write = function(section_id, value) {
            return fs.write('/etc/sing-box/config.json', value.replace(/\r\n/g, '\n'));
        };

        return m.render();
    }
});
