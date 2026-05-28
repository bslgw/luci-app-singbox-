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

    // --- 輔助：強健的 Base64 解碼 (處理各種訂閱與節點編碼) ---
    safeB64Decode: function(str) {
        if (!str) return "";
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        try {
            return decodeURIComponent(escape(window.atob(str)));
        } catch (e) {
            return window.atob(str); // 降級處理
        }
    },

    // --- 核心 1：全協議節點解析器 (增強版，支援 Reality Vision / uTLS / ALPN) ---
    parseNodeLink: function(link) {
        if (!link || link.trim() === "") return null;
        link = link.trim();
        
        try {
            var protocolMatch = link.match(/^([a-zA-Z0-9]+):\/\/(.*)$/);
            if (!protocolMatch) throw new Error("無法識別的協議格式");
            
            var protocol = protocolMatch[1].toLowerCase();
            var rawContent = protocolMatch[2];
            var node = null;

            // 1. VMess 協議 (Base64 JSON)
            if (protocol === 'vmess') {
                var vmessJson = JSON.parse(this.safeB64Decode(rawContent));
                node = {
                    type: "vmess",
                    tag: vmessJson.ps || "VMess-Imported",
                    server: vmessJson.add,
                    server_port: parseInt(vmessJson.port),
                    uuid: vmessJson.id,
                    alter_id: parseInt(vmessJson.aid) || 0,
                    security: vmessJson.scy || "auto"
                };
                if (vmessJson.net === 'ws') {
                    node.transport = { type: "ws", path: vmessJson.path || "/", headers: { Host: vmessJson.host || vmessJson.add } };
                }
                if (vmessJson.tls === 'tls') {
                    node.tls = { enabled: true, server_name: vmessJson.sni || vmessJson.host || vmessJson.add };
                }
                return node;
            }

            // 分離 URI 中的節點名稱
            var name = "Imported-Node";
            var parts = rawContent.split('#');
            if (parts.length > 1) {
                name = decodeURIComponent(parts.pop());
                rawContent = parts.join('#');
            }

            var query = {};
            var mainUrl = rawContent;
            if (rawContent.indexOf('?') !== -1) {
                var qParts = rawContent.split('?');
                mainUrl = qParts[0];
                qParts[1].split('&').forEach(function(item) {
                    var kv = item.split('=');
                    if (kv.length === 2) query[kv[0]] = decodeURIComponent(kv[1]);
                });
            }

            // 2. VLESS / Trojan / Hysteria2
            if (['vless', 'trojan', 'hysteria2'].indexOf(protocol) !== -1) {
                var authAddr = mainUrl.split('@');
                var uuidOrPwd = authAddr[0];
                var addrPart = authAddr[1].split(':');
                var host = addrPart[0];
                var port = parseInt(addrPart[1]);

                node = { type: protocol, tag: name, server: host, server_port: port };
                if (protocol === 'trojan' || protocol === 'hysteria2') node.password = uuidOrPwd;
                else node.uuid = uuidOrPwd;

                // [修復點 1] VLESS 專屬配置：開啟 xudp，並讀取 flow (如 xtls-rprx-vision)
                if (protocol === 'vless') {
                    node.packet_encoding = "xudp"; 
                    if (query.flow) {
                        node.flow = query.flow;
                    }
                }

                if (query.security === 'tls' || query.security === 'reality' || protocol === 'hysteria2' || protocol === 'trojan') {
                    node.tls = { enabled: true, server_name: query.sni || query.peer || host, insecure: (query.allowInsecure === '1' || query.insecure === '1') };
                    
                    // [修復點 2] 支援 ALPN (如 h3, h2)
                    if (query.alpn) {
                        node.tls.alpn = query.alpn.split(',');
                    }

                    // [修復點 3] 支援 uTLS 指紋偽裝 (Reality 必備)
                    if (query.fp) {
                        node.tls.utls = { enabled: true, fingerprint: query.fp };
                    } else if (query.security === 'reality') {
                        // 如果鏈接沒寫 fp 但開啟了 reality，給一個默認的 chrome 指紋保底
                        node.tls.utls = { enabled: true, fingerprint: "chrome" };
                    }

                    if (query.security === 'reality') {
                        node.tls.reality = { enabled: true, public_key: query.pbk, short_id: query.sid || "" };
                    }
                }
                return node;
            }

            // 3. Shadowsocks (SIP002)
            if (protocol === 'ss') {
                var ssHostPort, ssMethodPwd;
                if (mainUrl.indexOf('@') !== -1) {
                    var ssParts = mainUrl.split('@');
                    ssMethodPwd = this.safeB64Decode(ssParts[0]).split(':');
                    ssHostPort = ssParts[1].split(':');
                } else {
                    var decodedMain = this.safeB64Decode(mainUrl);
                    var ssParts2 = decodedMain.split('@');
                    ssMethodPwd = ssParts2[0].split(':');
                    ssHostPort = ssParts2[1].split(':');
                }
                node = { type: "shadowsocks", tag: name, server: ssHostPort[0], server_port: parseInt(ssHostPort[1]), method: ssMethodPwd[0], password: ssMethodPwd[1] };
                return node;
            }
            throw new Error("暫不支持該協議: " + protocol);
        } catch (e) {
            console.error("解析錯誤:", e);
            return null;
        }
    },

    // --- 核心 2：統一編輯器 (無感導入 + 手工編輯) ---
    openEditor: function(filename, initialContent, confdir) {
        var isNew = !filename;
        var currentName = filename || '';
        var content = initialContent || '{\n  "outbounds": []\n}';

        var linkInput = E('input', { 
            'class': 'cbi-input-text', 
            'style': 'flex:1; border: 2px dashed #46a546; background: #f9fff9; padding: 10px;', 
            'placeholder': _('⚡ 點擊此處粘貼節點鏈接 (Vmess/Vless/Trojan/SS/Hy2) ，將自動生成並覆蓋當前配置...') 
        });
        var nameInput = E('input', { 'class': 'cbi-input-text', 'style': 'width:250px; font-weight:bold; color:#46a546;', 'placeholder': _('文件名 (如: HK-01.json)'), 'value': currentName });
        
        var linesContainer = E('div', { 'style': 'width:40px; text-align:right; padding:10px 5px; background:#f5f5f5; color:#999; font-family:monospace; font-size:13px; overflow:hidden; border-right:1px solid #ccc; user-select:none;' }, '1');
        var ta = E('textarea', { 'style': 'flex:1; width:100%; min-height:250px; max-height:50vh; font-family:monospace; font-size:13px; padding:10px; box-sizing:border-box; border:none; outline:none; white-space:pre; overflow-x:auto; resize:vertical;' }, [ content ]);
        
        var updateLineNumbers = function() {
            var lines = ta.value.split('\n').length + 5;
            var html = '';
            for(var i = 1; i <= lines; i++) html += i + '<br>';
            linesContainer.innerHTML = html;
        };
        ta.addEventListener('scroll', function() { linesContainer.scrollTop = ta.scrollTop; });
        ta.addEventListener('input', updateLineNumbers);
        setTimeout(updateLineNumbers, 50);

        // 無感粘貼解析監聽 (嚴格執行「一文件一節點」標準)
        linkInput.addEventListener('input', L.bind(function(e) {
            var val = e.target.value.trim();
            if (!val || !/^[a-zA-Z0-9]+:\/\//.test(val)) return;

            var node = this.parseNodeLink(val);
            if (node) {
                // 1. 自動提取並填充文件名
                if (isNew && !nameInput.value.trim()) {
                    var safeName = (node.tag || 'Imported-Node').replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
                    nameInput.value = safeName + '.json';
                }

                // 2. 直接生成完美對接 daed 的標準完整配置文件
                var standardConfig = {
                    "log": {
                        "level": "info",
                        "timestamp": true
                    },
                    "inbounds": [
                        {
                            "type": "socks",
                            "tag": "socks-in",
                            "listen": "0.0.0.0",
                            "listen_port": 10811,
                            "udp_fragment": true
                        }
                    ],
                    "outbounds": [
                        node  // 將解析出的節點作為唯一的出口
                    ],
                    "route": {
                        "rules": [
                            {
                                "inbound": "socks-in",
                                "action": "route",
                                "outbound": node.tag // 自動路由指向該節點
                            }
                        ],
                        "final": node.tag // 兜底路由也指向該節點
                    }
                };
                
                // 3. 渲染到代碼框
                ta.value = JSON.stringify(standardConfig, null, 4);
                
                // 4. 視覺反饋
                var originalBg = linkInput.style.background;
                linkInput.style.background = '#d4edda';
                setTimeout(function(){ linkInput.style.background = originalBg; }, 300);

                e.target.value = ''; 
                updateLineNumbers();
            }
        }, this));

        L.ui.showModal(isNew ? _('✨ 新建/導入配置') : _('✏️ 編輯配置: ') + filename, [ 
            E('div', { 'style': 'display:flex; margin-bottom:15px; padding-bottom:15px; border-bottom:1px dashed #ccc;' }, [ linkInput ]),
            E('div', { 'style': 'display:flex; align-items:center; gap:10px; margin-bottom:10px;' }, [
                E('label', { 'style': 'font-weight:bold; width:80px;' }, _('文件名稱:')),
                nameInput,
                isNew ? E('span', { 'style': 'color:#999; font-size:0.9em;' }, _('(*粘貼鏈接可自動生成)')) : ''
            ]),
            E('div', { 'style': 'border:1px solid #ccc; display:flex; margin-bottom:15px; max-height:55vh; overflow:hidden; border-radius:4px;' }, [ linesContainer, ta ]),
            E('div', { 'class': 'right', 'style': 'display:flex; gap:10px; align-items:center;' }, [
                E('button', { 'class': 'btn cbi-button-neutral', 'click': function() { 
                    try { JSON.parse(ta.value); alert(_('JSON 格式正確 ✔')); } catch(e) { alert(_('語法錯誤: ') + e.message); }
                }}, _('檢查語法')),
                E('button', { 'class': 'btn cbi-button-neutral', 'click': function() { 
                    try { var obj = JSON.parse(ta.value); ta.value = JSON.stringify(obj, null, 4); updateLineNumbers(); } 
                    catch(e) { alert(_('格式化失敗，請先檢查語法')); }
                }}, _('格式化')),
                E('div', { 'style': 'flex-grow:1;' }), 
                E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
                E('button', { 'class': 'btn cbi-button-positive', 'click': L.bind(function() { 
                    var finalName = nameInput.value.trim();
                    if (!finalName) { alert(_('請輸入文件名稱！')); return; }
                    if (!finalName.endsWith('.json')) finalName += '.json';

                    try {
                        var obj = JSON.parse(ta.value);

                        // --- 隱形防呆校驗開始 ---
                        var validOutboundTags = [];
                        if (obj.outbounds && Array.isArray(obj.outbounds)) {
                            for (var i = 0; i < obj.outbounds.length; i++) {
                                if (obj.outbounds[i].tag) {
                                    validOutboundTags.push(obj.outbounds[i].tag);
                                }
                            }
                        }

                        if (validOutboundTags.length === 0) {
                            throw new Error("配置中必須至少包含一個有效的 outbound (出口節點)！");
                        }

                        if (obj.route) {
                            if (obj.route.final && validOutboundTags.indexOf(obj.route.final) === -1) {
                                throw new Error("路由邏輯錯誤：route.final 指向了不存在的節點 [" + obj.route.final + "]");
                            }
                            if (obj.route.rules && Array.isArray(obj.route.rules)) {
                                for (var j = 0; j < obj.route.rules.length; j++) {
                                    var rule = obj.route.rules[j];
                                    if (rule.outbound && validOutboundTags.indexOf(rule.outbound) === -1) {
                                        throw new Error("路由規則錯誤：第 " + (j + 1) + " 條規則指向了不存在的節點 [" + rule.outbound + "]");
                                    }
                                }
                            }
                        }
                        // --- 隱形防呆校驗結束 ---

                        L.fs.write(confdir + '/' + finalName, JSON.stringify(obj, null, 4)).then(L.bind(function() { 
                            L.ui.hideModal(); 
                            var container = document.getElementById('sb_file_list_container');
                            if (container) this.renderList(container, confdir, L.uci.get('sing-box', 'main', 'selected_conf'));
                        }, this));
                    } catch(e) { alert(_('JSON 錯誤，無法儲存: \n') + e.message); }
                }, this) }, _('儲存配置'))
            ])
        ]);
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
            L.uci.set('sing-box', 'main', 'selected_conf', filename);
            return L.uci.save().then(function() { return L.uci.apply(); });
        }, this)).then(L.bind(function() {
            return this.doRestart().catch(function() { throw new Error(_('重啟服務失敗')); });
        }, this)).then(L.bind(function() {
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
                        E('td', { 'class': 'td', 'style': 'text-align:center; vertical-align:middle; white-space:nowrap; width:320px;' }, [
                            E('button', { 
                                'class': 'cbi-button cbi-button-apply', 
                                'style': 'padding:7px 22px; border-radius:100px; background:#46a546 !important; color:#fff !important; border:none; font-size:1.05em; font-weight:500;',
                                'click': L.bind(this.handleSwitch, this, file.name, confdir) 
                            }, isSelected ? _('生效中') : _('選用')),
                            E('button', { 
                                'class': 'cbi-button cbi-button-neutral', 
                                'style': 'margin-left:8px; padding:7px 22px; border-radius:100px; background:#999 !important; color:#fff !important; border:none; font-size:1.05em; font-weight:500;', 
                                'click': L.bind(function() {
                                    L.fs.read(confdir + '/' + file.name).then(L.bind(function(content) {
                                        this.openEditor(file.name, content, confdir);
                                    }, this)).catch(function(){ alert(_('無法讀取文件')); });
                                }, this) 
                            }, _('編輯')),
                            E('button', { 
                                'class': 'cbi-button cbi-button-remove', 
                                'style': 'margin-left:8px; padding:7px 22px; border-radius:100px; background:#dc3545 !important; color:#fff !important; border:none; font-size:1.05em; font-weight:500;', 
                                'click': L.bind(function(ev) { 
                                if (confirm(_('確定刪除此配置嗎？'))) {
                                    L.fs.remove(confdir + '/' + file.name).then(L.bind(function(){ 
                                        ev.target.closest('tr').remove(); 
                                    }, this)).catch(function(){ alert(_('刪除失敗')); }); 
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
        var isRunning = data[1];
        var confdir = L.uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
        var selectedConf = L.uci.get('sing-box', 'main', 'selected_conf');

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
                        E('button', { 
                            'class': 'cbi-button cbi-button-add', 
                            'style': 'margin-left:10px; padding:6px 20px; border-radius:100px;', 
                            'click': L.bind(function() { 
                                this.openEditor(null, null, confdir); 
                            }, this) 
                        }, _('⚡ 快速導入 / 新建'))
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
