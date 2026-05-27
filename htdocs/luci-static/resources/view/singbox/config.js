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
            netEl.textContent = _('檢測中...');
            netEl.style.background = '#ffc107';
        }

        return L.fs.exec('/bin/sh', ['-c', 'wget -q --spider --timeout=2 http://google.com && exit 0 || exit 1']).then(L.bind(function(res) {
            var isOnline = (res.code === 0);
            var current = isOnline ? 'online' : 'offline';

            if (this.getCache() !== current) {
                netEl.textContent = isOnline ? _('聯網正常') : _('連接受阻');
                netEl.style.background = isOnline ? '#46a546' : '#dc3545';
                this.setCache(current);
            }
        }, this)).catch(L.bind(function() {
            if (this.getCache() !== 'offline') {
                netEl.textContent = _('連接受阻');
                netEl.style.background = '#dc3545';
                this.setCache('offline');
            }
        }, this));
    },

    checkStatus: function() {
        return L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(L.bind(function(res) {
            var isRunning = (res.code === 0);
            var el = document.getElementById('sb_status_label');
            if (el) {
                el.textContent = isRunning ? _('運行中') : _('已停止');
                el.style.background = isRunning ? '#46a546' : '#999';
            }
            // 状态检测完成后紧接着触发网络检测，保持时间轴完全一致
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
                    E('th', { 'class': 'th' }, _('檔案名稱')),
                    E('th', { 'class': 'th', 'style': 'width:240px; text-align:center;' }, _('管理操作'))
                ])
            ]);

            files.forEach(L.bind(function(file) {
                if (file.name.endsWith('.json') && file.name !== 'config.json') {
                    var isSelected = (file.name === selectedConf);
                    table.appendChild(E('tr', { 'class': 'tr', 'data-filename': file.name }, [
                        E('td', { 'class': 'td check-cell', 'style': 'text-align:center;' }, [ isSelected ? E('span', { 'style': 'color:#46a546; font-weight:bold;' }, '✔') : '' ]),
                        E('td', { 'class': 'td name-cell', 'style': (isSelected ? 'font-weight:bold; color:#46a546;' : '') }, file.name),
                        E('td', { 'class': 'td', 'style': 'text-align:center;' }, [
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

            if (cached === 'online') {
                labelText = _('聯網正常'); labelBg = '#46a546';
            } else if (cached === 'offline') {
                labelText = _('連接受阻'); labelBg = '#dc3545';
            } else {
                labelText = _('檢測中...'); labelBg = '#ffc107';
                setTimeout(L.bind(this.checkNetwork, this, true), 100);
            }

            return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px;' }, [
                E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
                E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
                    E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:' + (isRunning ? '#46a546' : '#999') + ';' }, isRunning ? _('運行中') : _('已停止')),
                    E('span', { 'id': 'sb_net_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; margin-left:10px; background:' + labelBg + ';' }, labelText),
                    
                    // 1. 重啟 sing-box 按鈕（已重塑为：完美原力绿、毫秒级状态同步更新）
                    E('button', { 'class': 'cbi-button', 'style': 'margin-left:auto; display:inline-flex; align-items:center; justify-content:center; padding:6px 20px; border-radius:100px; box-sizing:border-box; background:#46a546 !important; color:#fff !important; border:none;', 'click': L.bind(function(ev) {
                        ev.target.textContent = _('正在重啟...');
                        window.sessionStorage.removeItem('sb_net_cache');
                        
                        // 【瞬间同步反馈】拒绝等待，立刻在前端假定成功更新 UI
                        var sEl = document.getElementById('sb_status_label'); if(sEl) { sEl.textContent = _('運行中'); sEl.style.background = '#46a546'; }
                        var nEl = document.getElementById('sb_net_label'); if(nEl) { nEl.textContent = _('檢測中...'); nEl.style.background = '#ffc107'; }

                        return this.doRestart().then(L.bind(function(){
                            ev.target.textContent = _('重啟 sing-box');
                            // 后台 1 秒后进行真实状态校验校准
                            setTimeout(L.bind(this.checkStatus, this), 1000);
                        }, this));
                    }, this) }, _('重啟 sing-box')),

                    // 2. 停止 sing-box 按鈕（已重塑为：高级优雅灰、毫秒级零延迟双状态同步更新）
                    E('button', { 'class': 'cbi-button', 'style': 'margin-left:10px; display:inline-flex; align-items:center; justify-content:center; padding:6px 20px; border-radius:100px; box-sizing:border-box; background:#999 !important; color:#fff !important; border:none;', 'click': L.bind(function(ev) {
                        ev.target.textContent = _('正在停止...');
                        window.sessionStorage.removeItem('sb_net_cache');
                        
                        // 【瞬间同步反馈】拒绝等待，立刻在前端同步切为停止和检测状态，解决视差和断层感
                        var sEl = document.getElementById('sb_status_label'); if(sEl) { sEl.textContent = _('已停止'); sEl.style.background = '#999'; }
                        var nEl = document.getElementById('sb_net_label'); if(nEl) { nEl.textContent = _('檢測中...'); nEl.style.background = '#ffc107'; }

                        return this.doStop().then(L.bind(function(){
                            ev.target.textContent = _('停止 sing-box');
                            // 后台 600毫秒后执行一次真实硬件状态对齐
                            setTimeout(L.bind(this.checkStatus, this), 600);
                        }, this));
                    }, this) }, _('停止 sing-box')),

                    // 3. 新建配置按鈕（保持胶囊形、继承 LuCI 基础高度样式）
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
