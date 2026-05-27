'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

return L.view.extend({
	load: function() {
		return Promise.all([
			L.uci.load('sing-box'),
			L.fs.exec('/bin/sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(function(res) {
				return (res.code === 0);
			}).catch(function() { return false; })
		]);
	},

	checkStatus: function() {
		return L.fs.exec('/bin/sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		}).catch(function(){});
	},

	// 語法檢查函數：僅用於選用時的最後檢查
	doCheck: function(path) {
		return L.fs.exec('/usr/bin/sing-box', ['check', '-c', path]).then(function(res) {
			if (res.code !== 0) {
				var err = res.stderr || res.stdout || _('未知語法錯誤');
				throw new Error(err);
			}
			return true;
		});
	},

	doRestart: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['restart']);
	},

	handleSwitch: function(filename, confdir, ev) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		var btn = ev.target;
		var oldText = btn.textContent;
		
		btn.disabled = true; btn.textContent = _('正在檢查...'); btn.style.background = '#ffc107';

		// 選用時保留強制校驗，防止斷網
		return this.doCheck(source).then(L.bind(function() {
			btn.textContent = _('正在應用...');
			return L.fs.read(source).then(function(content) {
				return L.fs.write(target, content || '{}');
			}).then(L.bind(this.doRestart, this)).then(L.bind(function() {
				window.localStorage.setItem('sb_selected_conf', filename);
				btn.textContent = _('完成'); btn.style.background = '#28a745';
				setTimeout(function() { location.reload(); }, 1000);
			}, this));
		}, this)).catch(L.bind(function(e) {
			btn.disabled = false; btn.textContent = oldText; btn.style.background = '';
			L.ui.showModal(_('該配置語法有誤，無法選用'), [
				E('pre', { 'style': 'background:#f8d7da; color:#721c24; padding:10px; border-radius:3px; white-space:pre-wrap; font-family:monospace; max-height:300px; overflow:auto;' }, e.message || e),
				E('div', { 'class': 'right' }, E('button', {'class':'btn','click':L.ui.hideModal}, _('關閉')))
			]);
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
			if (!this.statusTimer) {
				this.statusTimer = window.setInterval(L.bind(this.checkStatus, this), 5000);
			}

			return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
					E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:' + (isRunning ? '#46a546' : '#999') + ';' }, isRunning ? _('運行中') : _('已停止')),
					E('strong', { 'style': 'margin-left:20px; color:#666;' }, _('目錄: ')),
					E('span', { 'style': 'font-family:monospace; margin-left:5px;' }, confdir),
					E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': L.bind(function(ev) {
						ev.target.textContent = _('正在重啟...');
						return this.doRestart().then(L.bind(function(){
							ev.target.textContent = _('重啟服務'); this.checkStatus();
						}, this));
					}, this) }, _('重啟服務'))
				])
			]);
		}, this);

		var s2 = m.section(L.form.TypedSection, '_list', _('可用配置文件'));
		s2.anonymous = true;
		s2.render = L.bind(function() {
			return L.fs.list(confdir).then(L.bind(function(files) {
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
						table.appendChild(E('tr', { 'class': 'tr' }, [
							E('td', { 'class': 'td', 'style': 'vertical-align:middle; text-align:center;' }, [
								isSelected ? E('span', { 'style': 'color:#46a546; font-weight:bold; font-size:1.2em;' }, '✔') : ''
							]),
							E('td', { 'class': 'td', 'style': 'vertical-align:middle;' + (isSelected ? 'font-weight:bold; color:#46a546;' : '') }, file.name),
							E('td', { 'class': 'td', 'style': 'white-space:nowrap; text-align:center;' }, [
								E('button', { 'class': 'btn cbi-button-apply', 'style': 'margin:0 2px;', 'click': L.bind(this.handleSwitch, this, file.name, confdir) }, isSelected ? _('生效中') : _('選用')),
								E('button', { 'class': 'btn cbi-button-neutral', 'style': 'margin:0 2px;', 'click': L.bind(function() {
									L.fs.read(confdir + '/' + file.name).catch(function(){ return ''; }).then(L.bind(function(c) {
										var ta = E('textarea', { 'style': 'width:100%; height:400px; font-family:monospace;' }, [ c || '{}' ]);
										L.ui.showModal(_('編輯: %s').format(file.name), [ E('div', { 'style': 'padding:10px' }, [ ta, E('div', { 'class': 'right', 'style': 'margin-top:10px' }, [
											E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
											E('button', { 'class': 'btn cbi-button-positive', 'style': 'margin-left:10px', 'click': L.bind(function(ev) {
												// 儲存邏輯：直接寫入，不進行校驗，方便用戶慢慢修改
												return L.fs.write(confdir + '/' + file.name, ta.value).then(function() { 
													L.ui.hideModal(); 
													// 使用 LuCI 標准通知
													L.ui.addNotification(null, E('p', _('配置已儲存')), 'info');
												}).catch(function(e) { alert(e.message); });
											}, this)}, _('儲存'))
										]) ]) ]);
									}, this));
								}, this) }, _('編輯')),
								E('button', { 'class': 'btn cbi-button-remove', 'style': 'margin:0 2px;', 'click': function() {
									if (confirm(_('刪除 %s？').format(file.name))) {
										if (file.name === selectedConf) window.localStorage.removeItem('sb_selected_conf');
										L.fs.remove(confdir + '/' + file.name).then(function(){ location.reload(); });
									}
								} }, _('刪除'))
							])
						]));
					}
				}, this));
				
				return E('div', {}, [ 
					table, 
					E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-top:10px;', 'click': function() {
						var name = prompt(_('請輸入新檔名:'));
						if (name) {
							var fname = name.endsWith('.json') ? name : name + '.json';
							L.fs.write(confdir + '/' + fname, '{}').then(function() { location.reload(); });
						}
					} }, _('＋ 新建配置')) 
				]);
			}, this));
		}, this);

		return m.render();
	}
});
