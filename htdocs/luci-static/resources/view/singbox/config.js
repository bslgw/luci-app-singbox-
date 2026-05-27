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
        var netDot = document.getElementById('sb_net_dot');
        var netText = document.getElementById('sb_net_text');
        if (!netDot || !netText) return;

        if (isExplicit) {
            netText.textContent = _('連通性測試中...');
            netDot.style.background = '#17a2b8'; 
        }

        // v6.8 终极立体探测脚本：ubus原生提取 -> 智能路由过滤 -> 物理网关兜底
        var cmdCn = 'I=$(jsonfilter -s "$(ubus call network.interface.wan status 2>/dev/null)" -e "@.l3_device"); ' +
                    '[ -z "$I" ] && I=$(jsonfilter -s "$(ubus call network.interface.wan6 status 2>/dev/null)" -e "@.l3_device"); ' +
                    '[ -z "$I" ] && I=$(ip route show default | grep -oE \'dev [^ ]+\' | awk \'{print $2}\' | grep -vE \'^(tun|br-|lo|link|docker)\' | head -n 1); ' +
                    'G=$(ip route show default | grep -vE \'tun\' | grep -oE \'via [^ ]+\' | awk \'{print $2}\' | head -n 1); ' +
                    'R=1; if [ -n "$I" ]; then ping -c 1 -w 2 -I "$I" 223.5.5.5 >/dev/null 2>&1 && R=0; else ping -c 1 -w 2 223.5.5.5 >/dev/null 2>&1 && R=0; fi; ' +
                    '[ $R -ne 0 ] && [ -n "$G" ] && ping -c 1 -w 2 "$G" >/dev/null 2>&1 && R=0; exit $R';

        var checkCn = L.fs.exec('/bin/sh', ['-c', cmdCn]).catch(function() { return { code: 1 }; });
        var checkGlobal = L.fs.exec('/bin/sh', ['-c', 'wget -q --spider --timeout=2 http://www.google.com && exit 0 || exit 1']).catch(function() { return { code: 1 }; });

        Promise.all([checkCn, checkGlobal]).then(L.bind(function(results) {
            var cnOK = (results[0] && results[0].code === 0);
            var globalOK = (results[1] && results[1].code === 0);
            
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

            if (this.getCache() !== state || isExplicit) {
                netText.textContent = text;
                netDot.style.background = color;
                this.setCache(state);
            }
        }, this)).catch(function(e) {
            if (netText && netDot) {
                netText.textContent = _('狀態未知');
                netDot.style.background = '#999';
            }
        });
    },

    checkStatus: function() {
        return L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(L.bind(function(res) {
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

            window.sessionStorage.removeItem('sb_net_cache');
            this.checkNetwork(true);
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
                        try {
                            var json = JSON.parse(content);
                            var servers = [];
                            var types = [];
                            
                            if (json.outbounds && Array.isArray(json.outbounds)) {
                                json.outbounds.forEach(function(out) {
                                    if (out.server && typeof out.server === 'string' && out.server !== '127.0.0.1' && out.server !== '::1') {
                                        servers.push(out.server);
                                        if (out.type) types.push(out.type);
                                    }
                                });
                            }
                            
                            if (types.length > 0) {
                                var uniqueTypes = types.filter(function(v, i, a) { return a.indexOf(v) === i; });
                                typeCell.textContent = uniqueTypes.join(', ');
                            }
                            
                            if (servers.length > 0) {
                                var uniqueServers = servers.filter(function(v, i, a) { return a.indexOf(v) === i; });
                                infoCell.textContent = uniqueServers.join(', ');
                            }
                        } catch(e) {}
                    });

                    table.appendChild(E('tr', { 'class': 'tr', 'data-filename': file.name }, [
                        E('td', { 'class': 'td check-cell', 'style': 'text-align:center; vertical-align:middle;' }, [ isSelected ? E('span', { 'style': 'color:#46a546; font-weight:bold;' }, '✔') : '' ]),
                        E('td', { 'class': 'td name-cell', 'style': 'vertical-align:middle; ' + (isSelected ? 'font-weight:bold; color:#46a546;' : '') }, file.name),
                        typeCell,
                        infoCell,
                        E('td', { 'class': 'td', 'style': 'text-align:center; vertical-align:middle; white-space:nowrap; width:260px;' }, [
                            E('button', { 'class': 'btn cbi-button-apply', 'click': L.bind(this.handleSwitch, this, file.name, confdir) }, isSelected ? _('生效中') : _('選用')),
                            E('button', { 'class': 'btn cbi-button-neutral', 'style': 'margin-left:4px;', 'click': L.bind(function() {
                                L.fs.read(confdir + '/' + file.name).then(function(c) {
                                    var ta = E('textarea', { 'style': 'width:100%; height:400px;' }, [ c || '{}' ]);
                                    L.ui.showModal(_('編輯'), [ E('div', {}, [ ta, E('div', { 'class': 'right' }, [
                                        E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
                                        E('button', { 'class': 'btn cbi-button-positive', 'click': function() { L.fs.write(confdir + '/' + file.name, ta.value).then(function() { L.ui.hideModal(); }); }}, _('儲存'))
                                    ]) ]) ]);
                                });
                            }, this) }, _('編輯')),
                            E('button', { 'class': 'btn cbi-button-remove', 'style': 'margin-left:4px;', 'click': L.bind(function(ev) { 
                                if (confirm(_('刪除？'))) {
                                    L.fs.remove(confdir + '/' + file.name).then(L.bind(function(){ 
                                        ev.target.closest('tr').remove(); 
                                    }, this)); 
                                }
                            }, this) }, _('刪除'))
                        ])
                    ]));
                }
            }, this));

            container.innerHTML = '';
            container.appendChild(table);
        }, this));
    },

    render: function(data) {
        var isRunning = data;
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
                        
                        E('span', { 'id': 'sb_status_label', 'style': 'display:inline-flex; align-items:center; gap:6px;' }, [
                            E('span', { 'id': 'sb_status_dot', 'style': 'display:inline-block; width:8px; height:8px; border-radius:50%; background:' + (isRunning ? '#46a546' : '#999') + ';' }),
                            E('span', { 'id': 'sb_status_text', 'style': 'font-weight:bold; color:#444;' }, isRunning ? _('運行中') : _('已停止'))
                        ]),

                        E('span', { 'id': 'sb_net_label', 'style': 'display:inline-flex; align-items:center; gap:6px; margin-left:20px;' }, [
                            E('span', { 'id': 'sb_net_dot', 'style': 'display:inline-block; width:8px; height:8px; border-radius:50%; background:' + labelBg + ';' }),
                            E('span', { 'id': 'sb_net_text', 'style': 'font-weight:bold; color:#444;' }, labelText)
                        ]),
                        
                        E('button', { 'class': 'cbi-button', 'style': 'margin-left:auto; display:inline-flex; align-items:center; justify-content:center; padding:6px 20px; border-radius:100px; box-sizing:border-box; background:#46a546 !important; color:#fff !important; border:none;', 'click': L.bind(function(ev) {
                            ev.target.textContent = _('正在重啟...');
                            window.sessionStorage.removeItem('sb_net_cache');
                            
                            var sDot = document.getElementById('sb_status_dot'); var sText = document.getElementById('sb_status_text');
                            if(sDot && sText) { sText.textContent = _('運行中'); sDot.style.background = '#46a546'; }
                            var nDot = document.getElementById('sb_net_dot'); var nText = document.getElementById('sb_net_text');
                            if(nDot && nText) { nText.textContent = _('連通性測試中...'); nDot.style.background = '#17a2b8'; }

                            return this.doRestart().then(L.bind(function(){
                                ev.target.textContent = _('重啟 sing-box');
                                setTimeout(L.bind(this.checkStatus, this), 1000);
                            }, this));
                        }, this) }, _('重啟 sing-box')),

                        E('button', { 'class': 'cbi-button', 'style': 'margin-left:10px; display:inline-flex; align-items:center; justify-content:center; padding:6px 20px; border-radius:100px; box-sizing:border-box; background:#999 !important; color:#fff !important; border:none;', 'click': L.bind(function(ev) {
                            ev.target.textContent = _('正在停止...');
                            window.sessionStorage.removeItem('sb_net_cache');
                            
                            var sDot = document.getElementById('sb_status_dot'); var sText = document.getElementById('sb_status_text');
                            if(sDot && sText) { sText.textContent = _('已停止'); sDot.style.background = '#999'; }
                            var nDot = document.getElementById('sb_net_dot'); var nText = document.getElementById('sb_net_text');
                            if(nDot && nText) { nText.textContent = _('連通性測試中...'); nDot.style.background = '#17a2b8'; }

                            return this.doStop().then(L.bind(function(){
                                ev.target.textContent = _('停止 sing-box');
                                setTimeout(L.bind(this.checkStatus, this), 600);
                            }, this));
                        }, this) }, _('停止 sing-box')),

                        E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-left:10px; display:inline-flex; align-items:center; justify-content:center; padding:6px 20px; border-radius:100px; box-sizing:border-box;', 'click': L.bind(function() { 
                            var name = prompt(_('新文件名:')); 
                            if(name) {
                                var filename = name.endsWith('.json') ? name : name + '.json';
                                L.fs.write(confdir + '/' + filename, '{}').then(L.bind(function(){ 
                                    var container = document.getElementById('sb_file_list_container');
                                    if (container) {
                                        this.renderList(container, confdir, window.localStorage.getItem('sb_selected_conf'));
                                    }
                                }, this));
                            }
                        }, this) }, _('＋ 新建配置'))
                    ])
                ]),
                
                E('div', { 'style': 'display:flex; align-items:center; width:100%;' }, [
                    E('div', { 'style': 'width:15%' }, ''), 
                    E('div', { 'style': 'width:85%; display:flex; gap:16px; font-size:12px; color:#666; user-select:none;' }, [
                        E('span', { 'style': 'display:flex; align-items:center; gap:4px;' }, [ E('span', { 'style': 'width:8px; height:8px; border-radius:50%; background:#46a546;' }), _('暢通') ]),
                        E('span', { 'style': 'display:flex; align-items:center; gap:4px;' }, [ E('span', { 'style': 'width:8px; height:8px; border-radius:50%; background:#ffc107;' }), _('僅國內 - 代理失效') ]),
                        E('span', { 'style': 'display:flex; align-items:center; gap:4px;' }, [ E('span', { 'style': 'width:8px; height:8px; border-radius:50%; background:#6f42c1;' }), _('僅國外 - 路由異常') ]),
                        E('span', { 'style': 'display:flex; align-items:center; gap:4px;' }, [ E('span', { 'style': 'width:8px; height:8px; border-radius:50%; background:#dc3545;' }), _('斷網') ]),
                        E('span', { 'style': 'display:flex; align-items:center; gap:4px;' }, [ E('span', { 'style': 'width:8px; height:8px; border-radius:50%; background:#17a2b8;' }), _('檢測中') ])
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
