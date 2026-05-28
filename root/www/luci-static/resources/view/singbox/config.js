'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

return L.view.extend({
    handleSaveApply: null,
    handleSave: null,
    handleReset: null,

    parseNodeLink: function(link) {
        if (!link || link.trim() === "") { alert(_('請輸入節點鏈接')); return null; }
        try {
            var name = "Imported-Node";
            if (link.indexOf('#') !== -1) {
                var parts = link.split('#');
                name = decodeURIComponent(parts[1]);
                link = parts[0];
            }
            var protocol = link.split('://')[0];
            var main = link.split('://')[1];
            if (!main) return null;
            
            var query = {};
            if (main.indexOf('?') !== -1) {
                var qParts = main.split('?');
                main = qParts[0];
                qParts[1].split('&').forEach(function(item) {
                    var kv = item.split('=');
                    if (kv.length === 2) query[kv[0]] = kv[1];
                });
            }
            
            var auth = main.split('@');
            var addr = auth[auth.length - 1].split(':');
            var host = addr[0];
            var port = parseInt(addr[1]);
            var uuid = auth.length > 1 ? auth[0] : "";

            var node = {
                type: protocol,
                tag: name,
                server: host,
                server_port: port
            };

            if (protocol === 'hysteria2') {
                node.password = uuid;
                node.tls = {
                    enabled: true,
                    server_name: query.sni || host,
                    insecure: (query.insecure === '1')
                };
            } else {
                node.uuid = uuid;
            }
            return node;
        } catch (e) { alert(_('解析失敗: ') + e.message); return null; }
    },

    getCache: function() { return window.sessionStorage.getItem('sb_net_cache'); },
    setCache: function(val) { window.sessionStorage.setItem('sb_net_cache', val); },

    load: function() {
        return Promise.all([
            L.uci.load('sing-box'),
            L.fs.exec('/etc/init.d/sing-box', ['status']).then(function(res) { return (res.code === 0); }).catch(function() { return false; })
        ]);
    },

    checkNetwork: function(isExplicit) {
        var netDot = document.getElementById('sb_net_dot');
        var netText = document.getElementById('sb_net_text');
        if (!netDot || !netText) return;

        if (isExplicit) {
            netText.textContent = _('連通性測試中...');
            netDot.style.background = '#17a2b8'; 
        }

        var cmdCn = 'curl -I -s --connect-timeout 2 http://223.5.5.5 >/dev/null 2>&1 && exit 0 || exit 1';
        var cmdGlobal = 'curl -I -s --connect-timeout 2 http://www.google.com/generate_204 >/dev/null 2>&1 && exit 0 || exit 1';

        Promise.all([
            L.fs.exec('/bin/sh', ['-c', cmdCn]).catch(function() { return { code: 1 }; }),
            L.fs.exec('/bin/sh', ['-c', cmdGlobal]).catch(function() { return { code: 1 }; })
        ]).then(L.bind(function(results) {
            var cnOK = (results[0] && results[0].code === 0);
            var globalOK = (results[1] && results[1].code === 0);
            
            var state, text, color;
            if (cnOK && globalOK) { state = 'all_ok'; text = _('海內外暢通'); color = '#46a546'; } 
            else if (cnOK && !globalOK) { state = 'cn_only'; text = _('僅國內連通'); color = '#ffc107'; } 
            else if (!cnOK && globalOK) { state = 'global_only'; text = _('僅國外連通'); color = '#6f42c1'; } 
            else { state = 'offline'; text = _('網路已斷開'); color = '#dc3545'; }

            if (this.getCache() !== state || isExplicit) {
                netText.textContent = text;
                netDot.style.background = color;
                this.setCache(state);
            }
        }, this)).catch(function() {
            if (netText && netDot) { netText.textContent = _('狀態未知'); netDot.style.background = '#999'; }
        });
    },

    checkStatus: function() {
        return L.fs.exec('/etc/init.d/sing-box', ['status']).then(L.bind(function(res) {
            var isRunning = (res.code === 0);
            var sDot = document.getElementById('sb_status_dot');
            var sText = document.getElementById('sb_status_text');
            if (sDot && sText) {
                sText.textContent = isRunning ? _('運行中') : _('已停止');
                sDot.style.background = isRunning ? '#46a546' : '#999';
            }
            this.checkNetwork(false);
        }, this)).catch(function(){});
    },

    doRestart: function() { return L.fs.exec('/etc/init.d/sing-box', ['restart']); },
    doStop: function() { return L.fs.exec('/etc/init.d/sing-box', ['stop']); },

    handleSwitch: function(filename, confdir, ev) {
        var btn = ev.target;
        btn.disabled = true; btn.textContent = _('正在應用...');

        L.fs.read(confdir + '/' + filename).then(L.bind(function(content) {
            return L.fs.write(confdir + '/config.json', content);
        }, this)).then(L.bind(function() {
            return this.doRestart().catch(function() { throw new Error(_('重啟服務失敗')); });
        }, this)).then(L.bind(function() {
            window.localStorage.setItem('sb_selected_conf', filename);
            var rows = document.querySelectorAll('tr[data-filename]');
            rows.forEach(function(row) {
                var isTarget = (row.getAttribute('data-filename') === filename);
                row.querySelector('.check-cell').innerHTML = isTarget ? '<span style="color:#46a546; font-weight:bold; font-size:1.2em;">✔</span>' : '';
                row.querySelector('.name-cell').style.fontWeight = isTarget ? 'bold' : 'normal';
                row.querySelector('.name-cell').style.color = isTarget ? '#46a546' : '';
                row.querySelector('.cbi-button-apply').textContent = isTarget ? _('生效中') : _('選用');
            });
            btn.disabled = false;
            window.sessionStorage.removeItem('sb_net_cache');
            this.checkNetwork(true);
        }, this)).catch(function(e) { 
            btn.disabled = false; btn.textContent = _('選用');
            alert(e.message || _('操作失敗，請檢查權限')); 
        });
    },

    renderList: function(container, confdir, selectedConf) {
        return L.fs.list(confdir).then(L.bind(function(files) {
            files.sort(function(a, b) { return (b.mtime || 0) - (a.mtime || 0); });

            var table = E('table', { 'class': 'table cbi-section-table' }, [
                E('tr', { 'class': 'tr cbi-section-table-titles' }, [
                    E('th', { 'class': 'th', 'style': 'width:40px; text-align:center;' }, ''), 
                    E('th', { 'class': 'th', 'style': 'width:auto; font-size:1.05em; font-weight:bold;' }, _('檔案名稱')),
                    E('th', { 'class': 'th', 'style': 'width:120px; font-size:1.05em; font-weight:bold;' }, _('協議')),
                    E('th', { 'class': 'th', 'style': 'width:auto; font-size:1.05em; font-weight:bold;' }, _('域名 / IP')),
                    E('th', { 'class': 'th', 'style': 'width:320px; text-align:center; font-size:1.05em; font-weight:bold;' }, _('管理操作'))
                ])
            ]);

            files.forEach(L.bind(function(file) {
                if (file.name.endsWith('.json') && file.name !== 'config.json') {
                    var isSelected = (file.name === selectedConf);
                    
                    var typeCell = E('td', { 'class': 'td', 'style': 'vertical-align:middle; color:#555; font-size:1.05em; font-weight:bold; text-transform:uppercase; padding-right:15px;' }, _('讀取中...'));
                    var infoCell = E('td', { 'class': 'td', 'style': 'vertical-align:middle; color:#666; font-size:1.05em; word-break:break-word; padding-right:15px;' }, '');

                    L.fs.read(confdir + '/' + file.name).then(function(res) {
                        if (!res) { typeCell.textContent = '-'; return; }
                        try {
                            var json = JSON.parse(res);
                            var servers = [], types = [];
                            if (json.outbounds && Array.isArray(json.outbounds)) {
                                json.outbounds.forEach(function(out) {
                                    if (out.server && typeof out.server === 'string' && out.server !== '127.0.0.1' && out.server !== '::1') {
                                        servers.push(out.server);
                                        if (out.type) types.push(out.type);
                                    }
                                });
                            }
                            typeCell.textContent = types.length > 0 ? types.filter(function(v, i, a) { return a.indexOf(v) === i; }).join(', ') : '-';
                            infoCell.textContent = servers.length > 0 ? servers.filter(function(v, i, a) { return a.indexOf(v) === i; }).join(', ') : '';
                        } catch(e) {
                            typeCell.textContent = 'JSON 錯誤'; typeCell.style.color = '#dc3545';
                        }
                    });

                    table.appendChild(E('tr', { 'class': 'tr', 'data-filename': file.name }, [
                        E('td', { 'class': 'td check-cell', 'style': 'text-align:center; vertical-align:middle;' }, [ isSelected ? E('span', { 'style': 'color:#46a546; font-weight:bold; font-size:1.2em;' }, '✔') : '' ]),
                        E('td', { 'class': 'td name-cell', 'style': 'vertical-align:middle; font-size:1.05em; ' + (isSelected ? 'font-weight:bold; color:#46a546;' : '') }, file.name),
                        typeCell,
                        infoCell,
                        E('td', { 'class': 'td', 'style': 'vertical-align:middle; white-space:nowrap; width:320px;' }, [
                            E('div', { 'style': 'display:flex; justify-content:flex-end; align-items:center; gap:8px; width:100%; padding-right:20px; box-sizing:border-box;' }, [
                                E('button', { 
                                    'class': 'cbi-button cbi-button-apply', 
                                    'style': 'padding:7px 22px; border-radius:100px; background:#46a546 !important; color:#fff !important; border:none; font-size:1.05em; font-weight:500;',
                                    'click': L.bind(this.handleSwitch, this, file.name, confdir) 
                                }, isSelected ? _('生效中') : _('選用')),
                                E('button', { 
                                    'class': 'cbi-button cbi-button-neutral', 
                                    'style': 'padding:7px 22px; border-radius:100px; background:#999 !important; color:#fff !important; border:none; font-size:1.05em; font-weight:500;', 
                                    'click': L.bind(function() {
                                    L.fs.read(confdir + '/' + file.name).then(L.bind(function(content) {
                                        var linesContainer = E('div', { 'style': 'width:40px; text-align:right; padding:10px 5px; background:#f5f5f5; color:#999; font-family:monospace; font-size:13px; overflow:hidden; border-right:1px solid #ccc; user-select:none;' }, '1');
                                        var ta = E('textarea', { 'style': 'flex:1; width:100%; min-height:200px; max-height:40vh; font-family:monospace; font-size:13px; padding:10px; box-sizing:border-box; border:none; outline:none; white-space:pre; overflow-x:auto; resize:vertical;' }, [ content || '{\n\n}' ]);
                                        var linkInput = E('input', { 'class': 'cbi-input-text', 'style': 'width:70%;', 'placeholder': _('在此粘貼節點鏈接以導入...') });
                                        
                                        var updateLineNumbers = function() {
                                            var lines = ta.value.split('\n').length + 5;
                                            var html = '';
                                            for(var i = 1; i <= lines; i++) html += i + '<br>';
                                            linesContainer.innerHTML = html;
                                        };
                                        
                                        ta.addEventListener('scroll', function() { linesContainer.scrollTop = ta.scrollTop; });
                                        ta.addEventListener('input', updateLineNumbers);
                                        setTimeout(updateLineNumbers, 50);

                                        L.ui.showModal(_('編輯: ') + file.name, [ 
                                            E('div', { 'style': 'display:flex; gap:10px; margin-bottom:10px;' }, [
                                                linkInput,
                                                E('button', { 'class': 'btn cbi-button-add', 'click': L.bind(function() {
                                                    var node = this.parseNodeLink(linkInput.value);
                                                    if (node) {
                                                        try {
                                                            var obj = JSON.parse(ta.value || '{"outbounds":[]}');
                                                            if (!obj.outbounds) obj.outbounds = [];
                                                            obj.outbounds.push(node);
                                                            ta.value = JSON.stringify(obj, null, 4);
                                                            linkInput.value = '';
                                                            updateLineNumbers();
                                                        } catch(e) { alert(_('解析失敗: ') + e.message); }
                                                    }
                                                }, this) }, _('追加導入'))
                                            ]),
                                            E('div', { 'style': 'border:1px solid #ccc; display:flex; margin-bottom:10px; max-height:50vh; overflow:hidden;' }, [ linesContainer, ta ]),
                                            E('div', { 'class': 'right', 'style': 'display:flex; gap:10px;' }, [
                                                E('button', { 'class': 'btn', 'click': function() { 
                                                    try {
                                                        JSON.parse(ta.value);
                                                        alert(_('JSON 格式正確'));
                                                    } catch(e) { alert(_('語法檢查失敗: ') + e.message); }
                                                }}, _('檢查語法')),
                                                E('button', { 'class': 'btn', 'click': function() { 
                                                    try {
                                                        var obj = JSON.parse(ta.value);
                                                        ta.value = JSON.stringify(obj, null, 4);
                                                        updateLineNumbers();
                                                    } catch(e) { alert(_('格式化失敗: ') + e.message); }
                                                }}, _('格式化 JSON')),
                                                E('div', { 'style': 'flex-grow:1;' }),
                                                E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
                                                E('button', { 'class': 'btn cbi-button-positive', 'click': L.bind(function() { 
                                                    try {
                                                        var obj = JSON.parse(ta.value);
                                                        L.fs.write(confdir + '/' + file.name, JSON.stringify(obj, null, 4)).then(L.bind(function() { 
                                                            L.ui.hideModal(); 
                                                            this.renderList(container, confdir, window.localStorage.getItem('sb_selected_conf'));
                                                        }, this));
                                                    } catch(e) { alert(_('JSON 錯誤，無法儲存: ') + e.message); }
                                                }, this) }, _('儲存'))
                                            ])
                                        ]);
                                    }, this)).catch(function(){ alert(_('無法讀取文件')); });
                                }, this) }, _('編輯')),
                                E('button', { 
                                    'class': 'cbi-button cbi-button-remove', 
                                    'style': 'padding:7px 22px; border-radius:100px; background:#dc3545 !important; color:#fff !important; border:none; font-size:1.05em; font-weight:500;', 
                                    'click': L.bind(function(ev) { 
                                    if (confirm(_('確定刪除此配置嗎？'))) {
                                        L.fs.remove(confdir + '/' + file.name).then(L.bind(function(){ 
                                            ev.target.closest('tr').remove(); 
                                        }, this)).catch(function(){ alert(_('刪除失敗')); }); 
                                    }
                                }, this) }, _('刪除'))
                            ])
                        ])
                    ]));
                }
            }, this));

            container.innerHTML = '';
            container.appendChild(table);
        }, this));
    },

    render: function(data) {
        var isRunning = data[1];
        var confdir = L.uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
        var selectedConf = window.localStorage.getItem('sb_selected_conf');

        var m = new L.form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));
        var s = m.section(L.form.TypedSection, '_status', _('服務控制'));
        s.anonymous = true;

        s.render = L.bind(function() {
            if (this.statusTimer) window.clearInterval(this.statusTimer);
            this.statusTimer = window.setInterval(L.bind(this.checkStatus, this), 5000);

            var cached = this.getCache();
            var labelText = '', labelBg = 'transparent';

            if (cached === 'all_ok') { labelText = _('海內外暢通'); labelBg = '#46a546'; } 
            else if (cached === 'cn_only') { labelText = _('僅國內連通'); labelBg = '#ffc107'; } 
            else if (cached === 'global_only') { labelText = _('僅國外連通'); labelBg = '#6f42c1'; } 
            else if (cached === 'offline') { labelText = _('網路已斷開'); labelBg = '#dc3545'; } 
            else {
                labelText = _('連通性測試中...'); labelBg = '#17a2b8';
                setTimeout(L.bind(this.checkNetwork, this, true), 100);
            }

            return E('div', { 'class': 'cbi-value', 'style': 'display:flex; flex-direction:column; border-bottom:1px solid #eee; padding-bottom:10px;' }, [
                E('div', { 'style': 'display:flex; align-items:center; width:100%; margin-bottom:10px;' }, [
                    E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
                    E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
                        E('span', { 'id': 'sb_status_label', 'style': 'display:inline-flex; align-items:center; gap:8px;' }, [
                            E('span', { 'id': 'sb_status_dot', 'style': 'display:inline-block; width:12px; height:12px; border-radius:50%; background:' + (isRunning ? '#46a546' : '#999') + ';' }),
                            E('span', { 'id': 'sb_status_text', 'style': 'font-weight:bold; color:#444;' }, isRunning ? _('運行中') : _('已停止'))
                        ]),
                        E('span', { 'id': 'sb_net_label', 'style': 'display:inline-flex; align-items:center; gap:8px; margin-left:25px;' }, [
                            E('span', { 'id': 'sb_net_dot', 'style': 'display:inline-block; width:12px; height:12px; border-radius:50%; background:' + labelBg + ';' }),
                            E('span', { 'id': 'sb_net_text', 'style': 'font-weight:bold; color:#444;' }, labelText)
                        ]),
                        E('button', { 'class': 'cbi-button', 'style': 'margin-left:auto; padding:6px 20px; border-radius:100px; background:#46a546 !important; color:#fff !important; border:none;', 'click': L.bind(function(ev) {
                            ev.target.textContent = _('正在重啟...');
                            window.sessionStorage.removeItem('sb_net_cache');
                            return this.doRestart().then(L.bind(function(){
                                ev.target.textContent = _('重啟 sing-box');
                                setTimeout(L.bind(this.checkStatus, this), 1000);
                            }, this));
                        }, this) }, _('重啟 sing-box')),
                        E('button', { 'class': 'cbi-button', 'style': 'margin-left:10px; padding:6px 20px; border-radius:100px; background:#999 !important; color:#fff !important; border:none;', 'click': L.bind(function(ev) {
                            ev.target.textContent = _('正在停止...');
                            window.sessionStorage.removeItem('sb_net_cache');
                            return this.doStop().then(L.bind(function(){
                                ev.target.textContent = _('停止 sing-box');
                                setTimeout(L.bind(this.checkStatus, this), 600);
                            }, this));
                        }, this) }, _('停止 sing-box')),
                        E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-left:10px; padding:6px 20px; border-radius:100px;', 'click': L.bind(function() { 
                            var name = prompt(_('新文件名:')); 
                            if(name) {
                                var filename = name.endsWith('.json') ? name : name + '.json';
                                L.fs.write(confdir + '/' + filename, '{\n  "outbounds": []\n}').then(L.bind(function(){ 
                                    var container = document.getElementById('sb_file_list_container');
                                    if (container) this.renderList(container, confdir, window.localStorage.getItem('sb_selected_conf'));
                                }, this)).catch(function(e) { alert(_('創建失敗')); });
                            }
                        }, this) }, _('＋ 新建配置'))
                    ])
                ])
            ]);
        }, this);

        var s2 = m.section(L.form.TypedSection, '_list', _('可用配置文件'));
        s2.render = L.bind(function() {
            var container = E('div', { 'id': 'sb_file_list_container' });
            this.renderList(container, confdir, selectedConf);
            return container;
        }, this);

        return m.render();
    }
});
