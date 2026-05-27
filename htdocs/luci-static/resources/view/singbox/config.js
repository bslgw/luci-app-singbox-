'use strict';
'import ui';
'import fs';
'import view';
'import form';
'import uci';

return L.view.extend({
	// 需求 2：隱藏 OpenWrt 原生的三個底部按鈕 (保存並應用, 保存, 復位)
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	// 聯網狀態快取
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

		// 只有狀態為空且主動觸發時顯示檢測中
		if (isExplicit && !cached) {
			netEl.textContent = _('檢測中...');
			netEl.style.background = '#ffc107';
		}

		// 使用 /bin/sh -c 包裹指令，解決 LuCI 環境執行差異問題
		return L.fs.exec('/bin/sh', ['-c', 'wget -q --spider --timeout=2 http://google.com && exit 0 || exit 1']).then(L.bind(function(res) {
			var isOnline = (res.code === 0);
			var current = isOnline ? 'online' : 'offline';

			// 只有狀態變更才更新 UI
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
		L.fs.exec('sh', ['-c', 'ps w | grep sing-box | grep -v grep']).then(function(res) {
			var isRunning = (res.code === 0);
			var el = document.getElementById('sb_status_label');
			if (el) {
				el.textContent = isRunning ? _('運行中') : _('已停止');
				el.style.background = isRunning ? '#46a546' : '#999';
			}
		}).catch(function(){});

		// 邏輯 4：後台檢測 5 秒一次，靜默執行
		this.checkNetwork(false);
	},

	doRestart: function() {
		return L.fs.exec('/etc/init.d/sing-box', ['restart']);
	},

	// 邏輯 5：異步更新，不刷新頁面
	handleSwitch: function(filename, confdir, ev) {
		var btn = ev.target;
		btn.disabled = true; btn.textContent = _('正在應用...');

		return L.fs.read(confdir + '/' + filename).then(function(c) {
			return L.fs.write(confdir + '/config.json', c || '{}');
		}).then(L.bind(this.doRestart, this)).then(L.bind(function() {
			window.localStorage.setItem('sb_selected_conf', filename);
			
			// 局部更新表格列，不刷新整個頁面 (邏輯 2)
			var rows = document.querySelectorAll('tr[data-filename]');
			rows.forEach(function(row) {
				var isTarget = (row.getAttribute('data-filename') === filename);
				row.querySelector('.check-cell').innerHTML = isTarget ? '<span style="color:#46a546; font-weight:bold;">✔</span>' : '';
				row.querySelector('.name-cell').style.fontWeight = isTarget ? 'bold' : 'normal';
				row.querySelector('.name-cell').style.color = isTarget ? '#46a546' : '';
				row.querySelector('.cbi-button-apply').textContent = isTarget ? _('生效中') : _('選用');
			});
			btn.disabled = false;
			// 關鍵：選用後不清除快取，後台 5 秒後會自動靜默更新聯網狀態
		}, this)).catch(function(e) { 
			btn.disabled = false; btn.textContent = _('選用');
			alert(e.message); 
		});
	},

	render: function(data) {
		var isRunning = data;
		var confdir = L.uci.get('sing-box', 'main', 'confdir') || '/etc/sing-box';
		var selectedConf = window.localStorage.getItem('sb_selected_conf');

		var m = new L.form.Map('sing-box', _('Sing-box Bridge'), _('SING-BOX 服務管理'));
		var s = m.section(L.form.TypedSection, '_status', _('服務控制'));
		s.anonymous = true;

		s.render = L.bind(function() {
			// 定時器邏輯
			if (this.statusTimer) window.clearInterval(this.statusTimer);
			this.statusTimer = window.setInterval(L.bind(this.checkStatus, this), 5000);

			var cached = this.getCache();
			var labelText = '', labelBg = 'transparent';

			// 邏輯 1：如果有聯網狀態，就直接顯示，不要主動檢測
			if (cached === 'online') {
				labelText = _('聯網正常'); labelBg = '#46a546';
			} else if (cached === 'offline') {
				labelText = _('連接受阻'); labelBg = '#dc3545';
			} else {
				// 邏輯 1：狀態為空時（首次進入），顯示檢測中並觸發強制檢測
				labelText = _('檢測中...'); labelBg = '#ffc107';
				setTimeout(L.bind(this.checkNetwork, this, true), 100);
			}

			return E('div', { 'class': 'cbi-value', 'style': 'display:flex; align-items:center; border-bottom:1px solid #eee; padding-bottom:10px;' }, [
				E('label', { 'class': 'cbi-value-title', 'style': 'width:15%' }, _('運行狀態')),
				E('div', { 'class': 'cbi-value-field', 'style': 'width:85%; display:flex; align-items:center;' }, [
					E('span', { 'id': 'sb_status_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; background:' + (isRunning ? '#46a546' : '#999') + ';' }, isRunning ? _('運行中') : _('已停止')),
					E('span', { 'id': 'sb_net_label', 'class': 'label', 'style': 'color:#fff; padding:4px 8px; border-radius:3px; margin-left:10px; background:' + labelBg + ';' }, labelText),
					// 邏輯 3：只有點擊重啟服務，才主動檢查
					E('button', { 'class': 'cbi-button cbi-button-reset', 'style': 'margin-left:auto;', 'click': L.bind(function(ev) {
						ev.target.textContent = _('正在重啟...');
						window.sessionStorage.removeItem('sb_net_cache'); // 核心：清空快取，確保觸發「檢測中」
						return this.doRestart().then(L.bind(function(){
							ev.target.textContent = _('重啟服務');
							setTimeout(L.bind(this.checkNetwork, this, true), 2000);
						}, this));
					}, this) }, _('重啟服務')),
					// 需求 1：將「新建配置」按鈕移動至右上角，緊跟在重啟服務按鈕後面
					E('button', { 'class': 'cbi-button cbi-button-add', 'style': 'margin-left:10px;', 'click': function() { var name = prompt(_('新文件名:')); if(name) L.fs.write(confdir + '/' + (name.endsWith('.json') ? name : name + '.json'), '{}').then(function(){ location.reload(); }); }}, _('＋ 新建配置'))
				])
			]);
		}, this);

		// [列表部分代碼，確保 tr 包含 data-filename]
		var s2 = m.section(L.form.TypedSection, '_list', _('可用配置文件'));
		s2.render = L.bind(function() {
			return L.fs.list(confdir).then(L.bind(function(files) {
				var table = E('table', { 'class': 'table cbi-
