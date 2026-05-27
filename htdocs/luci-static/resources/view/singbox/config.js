'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

return L.view.extend({
	lastNetStatus: null, // 用於鎖定狀態，只有為空時才強制顯示檢測中

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

		// 只有當狀態為空且是主動觸發時，才顯示「檢測中」
		if (isExplicit && this.lastNetStatus === null) {
			netEl.textContent = _('檢測中...');
			netEl.style.background = '#ffc107';
		}

		return L.fs.exec('ping', ['-c', '1', '-W', '2', '8.8.8.8']).then(L.bind(function(res) {
			var isOnline = (res.code === 0);
			var currentStatus = isOnline ? 'online' : 'offline';

			// 只有狀態改變，或者是強制初始檢測時，才更新 DOM
			if (this.lastNetStatus !== currentStatus) {
				netEl.textContent = isOnline ? _('聯網正常') : _('連接受阻');
				netEl.style.background = isOnline ? '#46a546' : '#dc3545';
				this.lastNetStatus = currentStatus;
			}
		}, this)).catch(L.bind(function() {
			if (this.lastNetStatus !== 'offline') {
				netEl.textContent = _('連接受阻');
				netEl.style.background = '#dc3545';
				this.lastNetStatus = 'offline';
			}
		}, this));
	},

	checkStatus: function() {
		L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		}).catch(function(){});

		this.checkNetwork(false); // 每5秒的檢測不強制顯示「檢測中」
	},

	doRestart: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['restart']);
	},

	handleSwitch: function(filename, confdir, ev) {
		var target = confdir + '/config.json';
		var source = confdir + '/' + filename;
		var btn = ev.target;
		var oldText = btn.textContent;
		btn.disabled = true; btn.textContent = _('正在應用...'); btn.style.background = '#ffc107';

		return L.fs.read(source).then(function(content) {
			return L.fs.write(target, content || '{}');
		}).then(L.bind(this.doRestart, this)).then(L.bind(function() {
			window.localStorage.setItem('sb_selected_conf', filename);
			btn.textContent = _('完成'); btn.style.background = '#28a745';
			setTimeout(function() { location.reload(); }, 1000);
		}, this)).catch(L.bind(function(e) {
			btn.disabled = false; btn.textContent = oldText; btn.style.background = '';
			L.ui.showModal(_('出錯'), [E('p', _('操作失敗: %s').format(e.message || e)), E('button', {'class':'btn','click':L.ui.hideModal},_('關閉'))]);
		}, this));
	},

	render: function(data) {
		var isRunning = data[1];
		var confdir = L.uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
		var selectedConf = window.localStorage.getItem('sb_selected_conf');

		this.lastNetStatus = null; // 導航進入時重置狀態為空

		var m = new L.form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));
		var s = m.section(L.form.TypedSection, '_status', _('服務控制'));
		s.anonymous = true;

		s.render = L.bind(function() {
			if (this.statusTimer) window.clearInterval(this.statusTimer);
			this.statusTimer = window.setInterval(L.bind(this.checkStatus, this), 5000);

			setTimeout(L.bind(this.checkNetwork, this, true), 100);

			return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
					E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:' + (isRunning ? '#46a546' : '#999') + ';' }, isRunning ? _('運行中') : _('已停止')),
					E('span', { 'id': 'sb_net_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; margin-left:10px; background:#999;' }, ''),
					E('strong', { 'style': 'margin-left:20px; color:#666;' }, _('目錄: ')),
					E('span', { 'style': 'font-family:monospace; margin-left:5px;' }, confdir),
					E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': L.bind(function(ev) {
						ev.target.textContent = _('正在重啟...');
						return this.doRestart().then(L.bind(function(){
							ev.target.textContent = _('重啟服務');
							this.lastNetStatus = null; // 點擊重啟後清空狀態，強制下次檢測顯示「檢測中」
							setTimeout(L.bind(this.checkStatus, this), 2000);
						}, this));
					}, this) }, _('重啟服務'))
				])
			]);
		}, this);

		// 下方列表 (同前)
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
							E('td', { 'class': 'td', 'style': 'text-align:center;' }, [ isSelected ? E('span', { 'style': 'color:#46a546; font-weight:bold;' }, '✔') : '' ]),
							E('td', { 'class': 'td', 'style': (isSelected ? 'font-weight:bold; color:#46a546;' : '') }, file.name),
							E('td', { 'class': 'td', 'style': 'text-align:center;' }, [
								E('button', { 'class': 'btn cbi-button-apply', 'click': L.bind(this.handleSwitch, this, file.name, confdir) }, isSelected ? _('生效中') : _('選用')),
								E('button', { 'class': 'btn cbi-button-neutral', 'click': L.bind(function() {
									L.fs.read(confdir + '/' + file.name).then(function(c) {
										var ta = E('textarea', { 'style': 'width:100%; height:400px;' }, [ c || '{}' ]);
										L.ui.showModal(_('編輯'), [ E('div', {}, [ ta, E('div', { 'class': 'right' }, [
											E('button', { 'class': 'btn', 'click': L.ui.hideModal }, _('取消')),
											E('button', { 'class': 'btn cbi-button-positive', 'click': function() { L.fs.write(confdir + '/' + file.name, ta.value).then(function() { location.reload(); }); }}, _('儲存'))
										]) ]) ]);
									});
								}, this) }, _('編輯')),
								E('button', { 'class': 'btn cbi-button-remove', 'click': function() { if (confirm(_('刪除？'))) L.fs.remove(confdir + '/' + file.name).then(function(){ location.reload(); }); } }, _('刪除'))
							])
						]));
					}
				}, this));
				return E('div', {}, [ table, E('button', { 'class': 'cbi-button cbi-button-add', 'click': function() { var name = prompt(_('新文件名:')); if(name) L.fs.write(confdir + '/' + (name.endsWith('.json') ? name : name + '.json'), '{}').then(function(){ location.reload(); }); }}, _('＋ 新建配置')) ]);
			}, this));
		}, this);

		return m.render();
	}
});
