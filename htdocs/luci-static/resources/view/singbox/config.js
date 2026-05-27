'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

return L.view.extend({
    isChecking: false,
    statusTimer: null,

    getCache: function() { return window.sessionStorage.getItem('sb_net_cache'); },
    setCache: function(val) { window.sessionStorage.setItem('sb_net_cache', val); },

    load: function() {
        return Promise.all([
            L.uci.load('sing-box'),
            L.fs.exec('pgrep', ['-f', 'sing-box']).then(res => res.code === 0).catch(() => false)
        ]);
    },

    updateNetworkUI: function(isOnline) {
        var netEl = document.getElementById('sb_net_label');
        if (!netEl) return;
        netEl.textContent = isOnline ? _('聯網正常') : _('連接受阻');
        netEl.style.background = isOnline ? '#46a546' : '#dc3545';
        this.setCache(isOnline ? 'online' : 'offline');
    },

    checkNetwork: function(isExplicit) {
        if (this.isChecking) return;
        var netEl = document.getElementById('sb_net_label');
        if (isExplicit && netEl) {
            netEl.textContent = _('檢測中...');
            netEl.style.background = '#ffc107';
        }

        this.isChecking = true;
        return L.fs.exec('wget', ['-q', '--spider', '--timeout=3', 'http://connectivitycheck.gstatic.com/generate_204'])
            .then(res => this.updateNetworkUI(res.code === 0))
            .catch(() => this.updateNetworkUI(false))
            .finally(() => { this.isChecking = false; });
    },

    checkStatus: function() {
        L.fs.exec('pgrep', ['-f', 'sing-box']).then(res => {
            var isRunning = (res.code === 0);
            var el = document.getElementById('sb_status_label');
            if (el) {
                el.textContent = isRunning ? _('運行中') : _('已停止');
                el.style.background = isRunning ? '#46a546' : '#999';
            }
        });
        this.checkNetwork(false);
    },

    handleSwitch: function(filename, confdir, ev) {
        var btn = ev.target;
        btn.disabled = true; btn.textContent = _('正在應用...');

        return L.fs.read(confdir + '/' + filename).then(c => {
            return L.fs.write(confdir + '/config.json', c || '{}');
        }).then(() => L.fs.exec('/etc/init.d/sing-box', ['restart']))
        .then(() => {
            window.localStorage.setItem('sb_selected_conf', filename);
            document.querySelectorAll('tr[data-filename]').forEach(row => {
                var isTarget = (row.getAttribute('data-filename') === filename);
                row.querySelector('.check-cell').innerHTML = isTarget ? '<span style="color:#46a546; font-weight:bold;">✔</span>' : '';
                row.querySelector('.name-cell').style.cssText = isTarget ? 'font-weight:bold; color:#46a546;' : '';
                row.querySelector('.cbi-button-apply').textContent = isTarget ? _('生效中') : _('選用');
            });
            btn.disabled = false;
        }).catch(e => { btn.disabled = false; btn.textContent = _('選用'); alert(e.message); });
    },

    render: function(data) {
        var isRunning = data[1];
        var confdir = L.uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
        var selectedConf = window.localStorage.getItem('sb_selected_conf');

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) clearInterval(this.statusTimer);
            else this.statusTimer = setInterval(() => this.checkStatus(), 5000);
        });

        var m = new L.form.Map('sing-box', _('Sing-box Bridge'));
        var s = m.section(L.form.TypedSection, '_status');
        s.anonymous = true;

        s.render = L.bind(function() {
            this.statusTimer = setInterval(() => this.checkStatus(), 5000);
            var cached = this.getCache();
            if (!cached) setTimeout(() => this.checkNetwork(true), 100);

            return E('div', { 'class': 'cbi-value' }, [
                E('label', { 'class': 'cbi-value-title' }, _('運行狀態')),
                E('div', { 'class': 'cbi-value-field' }, [
                    E('span', { id: 'sb_status_label', style: 'color:#fff; padding:4px 8px; border-radius:3px; background:' + (isRunning ? '#46a546' : '#999') }, isRunning ? _('運行中') : _('已停止')),
                    E('span', { id: 'sb_net_label', style: 'color:#fff; padding:4px 8px; border-radius:3px; margin-left:10px; background:' + (cached === 'online' ? '#46a546' : (cached === 'offline' ? '#dc3545' : '#ffc107')) }, cached === 'online' ? _('聯網正常') : (cached === 'offline' ? _('連接受阻') : _('檢測中...'))),
                    E('button', { 'class': 'cbi-button', style: 'margin-left:10px;', click: ev => {
                        window.sessionStorage.removeItem('sb_net_cache');
                        L.fs.exec('/etc/init.d/sing-box', ['restart']).then(() => setTimeout(() => this.checkNetwork(true), 2000));
                    }}, _('重啟服務'))
                ])
            ]);
        }, this);

        var s2 = m.section(L.form.TypedSection, '_list');
        s2.render = () => L.fs.list(confdir).then(files => {
            var table = E('table', { 'class': 'table cbi-section-table' }, [
                E('tr', { 'class': 'tr cbi-section-table-titles' }, [ E('th', {class:'th'}, ''), E('th', {class:'th'}, _('檔案名稱')), E('th', {class:'th'}, _('管理')) ])
            ]);
            files.forEach(file => {
                if (file.name.endsWith('.json') && file.name !== 'config.json') {
                    var isSelected = (file.name === selectedConf);
                    table.appendChild(E('tr', { 'class': 'tr', 'data-filename': file.name }, [
                        E('td', { 'class': 'td check-cell' }, [ isSelected ? '✔' : '' ]),
                        E('td', { 'class': 'td name-cell', style: isSelected ? 'font-weight:bold; color:#46a546;' : '' }, file.name),
                        E('td', { 'class': 'td' }, [
                            E('button', { 'class': 'btn cbi-button-apply', click: ev => this.handleSwitch(file.name, confdir, ev) }, isSelected ? _('生效中') : _('選用')),
                            E('button', { 'class': 'btn', style: 'margin-left:4px;', click: () => {
                                L.fs.read(confdir + '/' + file.name).then(c => {
                                    var ta = E('textarea', { style: 'width:100%; height:400px;' }, [ c ]);
                                    L.ui.showModal(_('編輯'), [ ta, E('div', { class: 'right' }, [
                                        E('button', { class: 'btn', click: L.ui.hideModal }, _('取消')),
                                        E('button', { class: 'btn cbi-button-positive', click: () => {
                                            L.fs.write(confdir + '/' + file.name, ta.value).then(L.ui.hideModal);
                                        }}, _('儲存'))
                                    ]) ]);
                                });
                            }}, _('編輯'))
                        ])
                    ]));
                }
            });
            return table;
        });

        return m.render();
    }
});
