'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

return L.view.extend({
    // 隱藏 OpenWrt 原生的三個底部按鈕
    handleSaveApply: null,
    handleSave: null,
    handleReset: null,

    getCache: function() { return window.sessionStorage.getItem('sb_net_cache'); },
    setCache: function(val) { window.sessionStorage.setItem('sb_net_cache', val); },

    load: function() {
        return Promise.all([
            L.uci.load('sing-box'),
            L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(function(res) {
                return (res.code === 0);
            }).catch(function() { return false; })
        ]);
    },

    checkNetwork: function(isExplicit) {
        var netEl = document.getElementById('sb_net_label');
        if (!netEl) return;

        var cached = this.getCache();

        if (isExplicit && !cached) {
            netEl.textContent = _('連通性測試中...');
            netEl.style.background = '#17a2b8'; 
        }

        Promise.all([
            L.fs.exec('/bin/sh', ['-c', 'wget -q --spider --timeout=2 http://www.baidu.com && exit 0 || exit 1']),
            L.fs.exec('/bin/sh', ['-c', 'wget -q --spider --timeout=2 http://www.google.com && exit 0 || exit 1'])
        ]).then(L.bind(function(results) {
            var cnOK = (results[0].code === 0);
            var globalOK = (results[1].code === 0);
            
            var state, text, color;
            if (cnOK && globalOK) {
                state = 'all_ok'; text = _('海內外暢通'); color = '#46a546'; 
            } else if (cnOK && !globalOK) {
                state = 'cn_only'; text = _('僅國內連通'); color = '#ffc107'; 
            } else if (!cnOK && globalOK) {
                state = 'global_only'; text = _('僅國外連通'); color = '#6f42c1'; 
            } else {
                state = 'offline'; text = _('網路已斷開'); color = '#dc3545'; 
            }

            if (this.getCache() !== state) {
                netEl.textContent = text;
                netEl.style.background = color;
                this.setCache(state);
            }
        }, this)).catch(function(){});
    },

    checkStatus: function() {
        return L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(L.bind(function(res) {
            var isRunning = (res.code === 0);
            var el = document.getElementById('sb_status_label');
            if (el) {
                el.textContent = isRunning ? _('運行中') : _('已停止');
                el.style.background = isRunning ? '#46a546' : '#999';
            }
            this.checkNetwork(false);
        }, this)).catch(function(){});
    },

    doRestart: function() {
        return L.fs.exec('/etc/init.d/sing-box', ['restart']);
    },

    doStop: function() {
        return L.fs.exec('/etc/init.d/sing-box', ['stop']);
    },

    handleSwitch: function(filename, confdir, ev) {
        var btn = ev.target;
        btn.disabled = true; btn.textContent = _('正在應用...');

        return L.fs.read(confdir + '/' + filename).then(function(c) {
            return L.fs.write(confdir + '/config.json', c || '{}');
        }).then(L.bind(this.doRestart, this)).then(L.bind(function() {
            window.localStorage.setItem('sb_selected_conf', filename);
            
            var rows = document.querySelectorAll('tr[data-filename]');
            rows.forEach(function(row) {
                var isTarget = (row.getAttribute('data-filename') === filename);
                row.querySelector('.check-cell').innerHTML = isTarget ? '<span style="color:#46a546; font-weight:bold;">✔</span>' : '';
                row.querySelector('.name-cell').style.fontWeight = isTarget ? 'bold' : 'normal';
                row.querySelector('.name-cell').style.color = isTarget ? '#46a546' : '';
                row.querySelector('.cbi-button-apply').textContent = isTarget ? _('生效中') : _('選用');
            });
            btn.disabled = false;
        }, this)).catch(function(e) { 
            btn.disabled = false; btn.textContent = _('選用');
            alert(e.message); 
        });
    },

    renderList: function(container, confdir, selectedConf) {
        return L.fs.list(confdir).then(L.bind(function(files) {
            files.sort(function(a, b) {
                return (b.mtime || 0) - (a.mtime || 0);
            });

            var table = E('table', { 'class': 'table cbi-section-table' }, [
                E('tr', { 'class': 'tr cbi-section-table-titles' }, [
                    E('th', { 'class': 'th', 'style': 'width:40px; text-align:center;' }, ''), 
                    E('th', { 'class': 'th', 'style': 'width:auto;' }, _('檔案名稱')),
                    E('th', { 'class': 'th', 'style': 'width:80px;' }, _('協議')),
                    E('th', { 'class': 'th', 'style': 'width:auto;' }, _('域名 / IP')),
                    E('th', { 'class': 'th', 'style': 'width:260px; text-align:center;' }, _('管理操作'))
                ])
            ]);

            files.forEach(L.bind(function(file) {
                if (file.name.endsWith('.json') && file.name !== 'config.json') {
                    var isSelected = (file.name === selectedConf);
                    
                    var typeCell = E('td', { 'class': 'td', 'style': 'vertical-align:middle; color:#555; font-size:0.85em; font-weight:bold; text-transform:uppercase; padding-right:15px;' }, '');
                    var infoCell = E('td', { 'class': 'td', 'style': 'vertical-align:middle; color:#666; font-size:0.9em; word-break:break-word; padding-right:15px;' }, '');

                    L.fs.read(confdir + '/' + file.name).then(function(content) {
                        if (!content) return;
